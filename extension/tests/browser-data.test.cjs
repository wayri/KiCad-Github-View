const test = require('node:test');
const assert = require('node:assert/strict');
const data = require('../browser-data.js');

test('resolves a schematic hierarchy within the repository', async () => {
  const files = new Map([
    ['boards/root.kicad_sch', '(kicad_sch (sheet (property "Sheetfile" "sub/power.kicad_sch")))'],
    ['boards/sub/power.kicad_sch', '(kicad_sch (sheet (property "Sheetfile" "../root.kicad_sch")))']
  ]);
  const seen = [];
  const result = await data.loadProject('wayri/demo', 'abc123', 'boards/root.kicad_sch',
    async (_repo, _ref, path) => { seen.push(path); return files.get(path) ?? null; });
  assert.deepEqual(seen, ['boards/root.kicad_sch', 'boards/sub/power.kicad_sch']);
  assert.equal(result.length, 2);
});

test('rejects paths that escape the repository and invalid input', async () => {
  assert.equal(data.childPath('root.kicad_sch', '../secret.kicad_sch'), null);
  assert.equal(data.childPath('boards/root.kicad_sch', 'C:\\secret.kicad_sch'), null);
  await assert.rejects(data.loadProject('wayri/demo', 'main', '../bad.kicad_pcb', async () => ''),
    /Invalid GitHub project location/);
});

test('reports a missing root revision', async () => {
  await assert.rejects(data.loadProject('wayri/demo', 'abc123', 'board.kicad_pcb', async () => null),
    /absent at this revision/);
});

test('opening a leaf discovers its ancestor root and descendants, excluding unrelated siblings', async () => {
  const files = new Map([
    ['boards/root.kicad_sch', '(kicad_sch (sheet (property "Sheetfile" "sub/power.kicad_sch")) (sheet (property "Sheetfile" "display.kicad_sch")))'],
    ['boards/sub/power.kicad_sch', '(kicad_sch)'],
    ['boards/display.kicad_sch', '(kicad_sch)'],
    ['boards/unrelated.kicad_sch', '(kicad_sch)']
  ]);
  const directories = { 'boards/sub': ['boards/sub/power.kicad_sch'],
    boards: ['boards/root.kicad_sch', 'boards/display.kicad_sch', 'boards/unrelated.kicad_sch'],
    '': [] };
  const read = [], listed = [];
  const result = await data.loadProject('owner/board', 'main', 'boards/sub/power.kicad_sch',
    async (_repo, _ref, path) => { read.push(path); return files.get(path) ?? null; },
    async (_repo, _ref, directory) => { listed.push(directory); return directories[directory]; });
  assert.deepEqual(listed, ['boards/sub', 'boards', '']);
  assert.deepEqual(result.map((entry) => entry.path),
    ['boards/root.kicad_sch', 'boards/sub/power.kicad_sch', 'boards/display.kicad_sch']);
  assert.ok(read.includes('boards/unrelated.kicad_sch'), 'candidate must be inspected to exclude it');
  assert.equal(result.some((entry) => entry.path === 'boards/unrelated.kicad_sch'), false);
});

test('leaf discovery follows transitive parents and retains selected sheet without a parent', async () => {
  const files = new Map([
    ['root.kicad_sch', '(kicad_sch (sheet (property "Sheetfile" "boards/middle.kicad_sch")))'],
    ['boards/middle.kicad_sch', '(kicad_sch (sheet (property "Sheetfile" "sub/leaf.kicad_sch")))'],
    ['boards/sub/leaf.kicad_sch', '(kicad_sch)'],
    ['boards/unrelated.kicad_sch', '(kicad_sch)']
  ]);
  const listing = { 'boards/sub': ['boards/sub/leaf.kicad_sch'],
    boards: ['boards/middle.kicad_sch', 'boards/unrelated.kicad_sch'], '': ['root.kicad_sch'] };
  const read = async (_repo, _ref, path) => files.get(path) ?? null;
  const list = async (_repo, _ref, dir) => listing[dir];
  const result = await data.loadProject('owner/board', 'main', 'boards/sub/leaf.kicad_sch', read, list);
  assert.deepEqual(result.map((entry) => entry.path),
    ['root.kicad_sch', 'boards/middle.kicad_sch', 'boards/sub/leaf.kicad_sch']);
  files.set('root.kicad_sch', '(kicad_sch)');
  files.set('boards/middle.kicad_sch', '(kicad_sch)');
  const orphan = await data.loadProject('owner/board', 'main', 'boards/sub/leaf.kicad_sch', read, list);
  assert.deepEqual(orphan.map((entry) => entry.path), ['boards/sub/leaf.kicad_sch']);
});

test('leaf discovery falls back with a visible warning for unsafe or excessive listings', async () => {
  const read = async () => '(kicad_sch)';
  const unsafe = await data.loadProject('owner/board', 'main', 'boards/sub/leaf.kicad_sch', read,
    async () => ['../escape.kicad_sch']);
  assert.deepEqual(unsafe.map((entry) => entry.path), ['boards/sub/leaf.kicad_sch']);
  assert.match(unsafe[0].discoveryWarning, /unsafe schematic directory listing/);
  const crowded = await data.loadProject('owner/board', 'main', 'boards/sub/leaf.kicad_sch', read,
    async (_repo, _ref, directory) => directory === 'boards/sub' ?
      Array.from({ length: 25 }, (_, index) => `boards/sub/file${index}.kicad_sch`) : []);
  assert.match(crowded[0].discoveryWarning, /More than 24 parent-sheet candidates/);
  const deep = await data.loadProject('owner/board', 'main', 'a/b/c/d/e/f/g/h/i/leaf.kicad_sch', read,
    async () => []);
  assert.match(deep[0].discoveryWarning, /too deep/);
});

test('discovery API failure preserves the requested sheet and its child tree', async () => {
  const files = new Map([
    ['root.kicad_sch', '(kicad_sch (sheet (property "Sheetfile" "child.kicad_sch")))'],
    ['child.kicad_sch', '(kicad_sch)']
  ]);
  const result = await data.loadProject('owner/board', 'main', 'root.kicad_sch',
    async (_repo, _ref, path) => files.get(path) ?? null,
    async () => { throw new Error('GitHub directory unavailable'); });
  assert.deepEqual(result.map((entry) => entry.path), ['root.kicad_sch', 'child.kicad_sch']);
  assert.match(result[0].discoveryWarning, /directory unavailable/);
});

test('required schematic bytes still enforce the preview size limit', async () => {
  await assert.rejects(data.loadProject('owner/board', 'main', 'root.kicad_sch',
    async () => 'x'.repeat(8 * 1024 * 1024 + 1), async () => []), /size limit/);
});


test('sheet discovery ignores library properties, comments and text lookalikes',()=>{
 const source='(kicad_sch (lib_symbols (symbol "X" (property "Sheetfile" "fake.kicad_sch"))) ; (sheet (property "Sheetfile" "comment.kicad_sch"))\n (text "not a sheet") (sheet (property "Sheetfile" "real.kicad_sch")))';
 assert.deepEqual(data.sheetFiles(source),['real.kicad_sch']);
 assert.throws(()=>data.sheetFiles('(kicad_sch (sheet'),/Incomplete/);
});
