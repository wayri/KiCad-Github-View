const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const script = fs.readFileSync(path.join(__dirname, "../setup.js"), "utf8");
const page = fs.readFileSync(path.join(__dirname, "../setup.html"), "utf8");
const data = require("../public-data.js");
const tick = () => new Promise((resolve) => setImmediate(resolve));

function setup(search, config = {}) {
  const elements = new Map();
  const destinations = [];
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, {
      value: "", textContent: "", hidden: true, listeners: {},
      addEventListener(name, callback) { this.listeners[name] = callback; },
    });
    return elements.get(id);
  };
  const location = { search, href: `https://viewer.example/app/setup.html${search}`,
    assign(url) { destinations.push(url); } };
  vm.runInNewContext(script, { PublicKiCadData: data, document: { getElementById: get },
    location, URL, URLSearchParams, Promise,
    fetch: async () => ({ ok: true, json: async () => config }) });
  const submit = (action) => get("openForm").listeners.submit({ preventDefault() {}, submitter: { dataset: { action } } });
  return { get, destinations, submit };
}

test("installation handoff ID is not treated as verified access", async () => {
  const { get, destinations, submit } = setup("?installation_id=123456&setup_action=install");
  await tick();
  assert.equal(get("repository").value, "");
  assert.deepEqual(destinations, []);
  submit("browse");
  assert.deepEqual(destinations, []);
  assert.match(get("status").textContent, /public repository/);
  assert.match(page, /does not verify an App installation/);
});

test("form validates locations and opens repository or PR in hosted viewer", () => {
  const { get, destinations, submit } = setup("?repository=wayri/boards&ref=main");
  assert.equal(get("repository").value, "wayri/boards");
  get("repository").value = "../boards";
  submit("browse");
  assert.equal(destinations.length, 0);
  get("repository").value = "wayri/boards";
  get("ref").value = "feature/layout";
  submit("browse");
  assert.equal(destinations[0], "https://viewer.example/app/?repository=wayri%2Fboards&ref=feature%2Flayout");
  get("pull").value = "0";
  submit("review");
  assert.equal(destinations.length, 1);
  get("pull").value = "42";
  submit("review");
  assert.equal(destinations[1], "https://viewer.example/app/?repository=wayri%2Fboards&pull=42");
});

test("only a GitHub HTTPS install link is exposed", async () => {
  const unsafe = setup("", { installUrl: "https://example.com/not-an-app" });
  await tick();
  assert.equal(unsafe.get("installLink").href, undefined);
  const safe = setup("", { installUrl: "https://github.com/apps/kicad-visual-review/installations/new" });
  await tick();
  assert.match(safe.get("installLink").href, /^https:\/\/github\.com\/apps\//);
  assert.equal(safe.get("installLink").hidden, false);
});
