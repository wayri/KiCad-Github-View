const test = require("node:test");
const assert = require("node:assert/strict");
const data = require("../public-data.js");

test("GitHub location validation rejects traversal and non-designs", () => {
  assert.equal(data.validRepository("wayri/board-repo"), true);
  assert.equal(data.validRepository("wayri/board-repo/extra"), false);
  assert.equal(data.validRepository("../board-repo"), false);
  assert.equal(data.validRepository("wayri/.."), false);
  assert.equal(data.validRepository("./board-repo"), false);
  assert.equal(data.validPath("Hardware/Board.kicad_pcb"), true);
  assert.equal(data.validPath("Hardware/../secret.kicad_sch"), false);
  assert.equal(data.validPath("README.md"), false);
  assert.equal(data.childPath("Hardware/root.kicad_sch", "../shared/child.kicad_sch"), "shared/child.kicad_sch");
  assert.equal(data.childPath("root.kicad_sch", "../outside.kicad_sch"), null);
});

test("loads subsheets once and keeps their source paths", async () => {
  const sources = new Map([
    ["Hardware/root.kicad_sch", '(kicad_sch (sheet (property "Sheetfile" "child.kicad_sch")) (sheet (property "Sheetfile" "child.kicad_sch")))'],
    ["Hardware/child.kicad_sch", "(kicad_sch)"],
  ]);
  const calls = [];
  const files = await data.loadProject("wayri/repo", "main", "Hardware/root.kicad_sch", async (_repo, _ref, path) => {
    calls.push(path);
    return sources.get(path) ?? null;
  });
  assert.deepEqual(calls, ["Hardware/root.kicad_sch", "Hardware/child.kicad_sch"]);
  assert.deepEqual(files.map((file) => file.path), calls);
});

test("missing root is an error and a missing child is tolerated", async () => {
  await assert.rejects(data.loadProject("wayri/repo", "main", "root.kicad_sch", async () => null), /absent/);
  const files = await data.loadProject("wayri/repo", "main", "root.kicad_sch", async (_repo, _ref, path) =>
    path === "root.kicad_sch" ? '(property "Sheetfile" "missing.kicad_sch")' : null);
  assert.equal(files.length, 1);
});
