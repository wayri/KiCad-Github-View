const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const script = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const data = require("../public-data.js");
const tick = () => new Promise((resolve) => setImmediate(resolve));

function viewer(search, fetch) {
  class Element {
    constructor() {
      this.children = []; this.listeners = {}; this.className = ""; this.hidden = false;
      this.disabled = false; this.value = ""; this.textContent = ""; this.attributes = {};
      this.classList = { toggle: () => {} };
    }
    addEventListener(name, listener) { this.listeners[name] = listener; }
    replaceChildren(...children) { this.children = children; }
    append(...children) { this.children.push(...children); }
    add(child) { this.children.push(child); }
    setAttribute(name, value) { this.attributes[name] = value; }
  }
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const location = { search, origin: "https://viewer.example", pathname: "/app/",
    href: `https://viewer.example/app/${search}` };
  vm.runInNewContext(script, { PublicKiCadData: data, document: { getElementById: get,
    createElement: () => new Element() }, location, history: { replaceState() {} }, fetch,
    Option: class { constructor(text, value) { this.text = text; this.value = value; } },
    URL, URLSearchParams, Promise });
  return get;
}

test("direct repository/ref/file link opens without requesting a design listing", async () => {
  const calls = [];
  const get = viewer("?repository=wayri/boards&ref=main&file=pcb/main.kicad_pcb", async (url) => {
    calls.push(String(url)); return { ok: true, json: async () => ({}) };
  });
  await tick();
  assert.equal(get("designName").textContent, "pcb/main.kicad_pcb");
  assert.match(get("headDrawing").children[0].src, /revision\.html\?repository=wayri%2Fboards&ref=main&file=pcb%2Fmain\.kicad_pcb/);
  assert.deepEqual(calls, ["/api/config"]);
});

test("stale browse response cannot replace the latest view and empty result removes prior frame", async () => {
  const pending = new Map();
  const get = viewer("", (url) => {
    if (url === "/api/config") return Promise.resolve({ ok: true, json: async () => ({}) });
    const repo = new URL(url).searchParams.get("repository");
    return new Promise((resolve) => pending.set(repo, resolve));
  });
  const submit = (repository) => {
    get("repository").value = repository;
    get("ref").value = "main";
    get("branchForm").listeners.submit({ preventDefault() {} });
  };
  const complete = async (repository, files) => {
    pending.get(repository)({ ok: true, json: async () => ({ ref: "abcdef123", files }) });
    await tick();
  };
  submit("wayri/old"); await tick();
  submit("wayri/new"); await tick();
  await complete("wayri/new", ["new.kicad_pcb"]);
  await complete("wayri/old", ["old.kicad_pcb"]);
  assert.equal(get("designName").textContent, "new.kicad_pcb");
  assert.match(get("headDrawing").children[0].src, /wayri%2Fnew/);
  submit("wayri/empty"); await tick();
  await complete("wayri/empty", []);
  assert.equal(get("designName").textContent, "No KiCad design selected");
  assert.equal(get("headDrawing").children.some((child) => child && child.src), false);
  assert.equal(get("fileSelect").disabled, true);
});
