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
    /HTTP 404.*wayri\/demo.*abc123.*board\.kicad_pcb.*access.*Contents read/);
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
      Array.from({ length: 129 }, (_, index) => `boards/sub/file${index}.kicad_sch`) : []);
  assert.match(crowded[0].discoveryWarning, /More than 128 parent-sheet candidates/);
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


test('nested GitLab namespaces remain provider scoped in project discovery', async () => {
  assert.equal(data.validRepository('group/subgroup/board'), false);
  assert.equal(data.validRepository('group/subgroup/board', 'gitlab'), true);
  for (const value of ['group/../board','group//board','group/board?token=secret','group/board\\file']) {
    assert.equal(data.validRepository(value, 'gitlab'), false);
  }
  assert.equal(data.validRepository('group/board', 'untrusted'), false);
  const result = await data.loadProject('group/subgroup/board','main','root.kicad_sch',
    async () => '(kicad_sch)', null, 'gitlab');
  assert.equal(result.length, 1);
});


test('PCB discovery permits large bounded boards without scanning them as schematic hierarchy', async () => {
  const board = '(kicad_pcb ' + ' '.repeat(9 * 1024 * 1024) + ')';
  const files = await data.loadProject('owner/board', 'main', 'large.kicad_pcb', async () => board);
  assert.equal(files.length, 1); assert.equal(files[0].content, board);
});


test('nested project hierarchy retains exact case and ignores asset folders for board retrieval', async () => {
  const files = new Map([
    ['Hardware/HPBM-SMALL.kicad_sch','(kicad_sch (sheet (property "Sheetfile" "SubSheets/Power.kicad_sch")))'],
    ['Hardware/SubSheets/Power.kicad_sch','(kicad_sch)'],
    ['Hardware/HPBM-SMALL.kicad_pcb','(kicad_pcb ' + ' '.repeat(2*1024*1024) + ')']
  ]);
  const reads = [];
  const reader = async (repo,ref,path) => {assert.equal(ref,'private-review');reads.push(path);return files.get(path) ?? null;};
  const board = await data.loadProject('owner/private','private-review','Hardware/HPBM-SMALL.kicad_pcb',reader);
  assert.deepEqual(board.map(file=>file.path),['Hardware/HPBM-SMALL.kicad_pcb']);
  const schematic = await data.loadProject('owner/private','private-review','Hardware/HPBM-SMALL.kicad_sch',reader);
  assert.deepEqual(schematic.map(file=>file.path),['Hardware/HPBM-SMALL.kicad_sch','Hardware/SubSheets/Power.kicad_sch']);
  assert.ok(reads.every(path=>!path.includes('packages3D')&&!path.includes('assets')));
});
test('KiCad 6 Sheet file properties load the hierarchy and exclude library lookalikes', async () => {
  const root = '(kicad_sch (version 20211123) (lib_symbols (symbol "Ignore" (property "Sheet file" "fake.kicad_sch"))) (sheet (property "Sheet name" "Power") (property "Sheet file" "SubSheets/Power.kicad_sch")) (sheet (property "Sheetfile" "USB.kicad_sch")))';
  assert.deepEqual(data.sheetFiles(root), ['SubSheets/Power.kicad_sch', 'USB.kicad_sch']);
  const files = new Map([['design/Marble.kicad_sch', root], ['design/SubSheets/Power.kicad_sch', '(kicad_sch)'], ['design/USB.kicad_sch', '(kicad_sch)']]);
  const loaded = await data.loadProject('wayri/Marble', 'main', 'design/Marble.kicad_sch', async (_repo, _ref, file) => files.get(file) ?? null);
  assert.deepEqual(loaded.map(file => file.path), [...files.keys()]);
});
test('hierarchy over 32 files uses bounded parallel reads and deduplicates reused sheets', async () => {
  const children = Array.from({ length: 40 }, (_, i) => `sheet${i}.kicad_sch`);
  const root = '(kicad_sch ' + [...children, children[0]].map(file => `(sheet (property "Sheet file" "${file}"))`).join(' ') + ')';
  let active = 0, peak = 0; const reads = [];
  const loaded = await data.loadProject('wayri/board', 'main', 'root.kicad_sch', async (_repo, _ref, file) => {
    reads.push(file); active++; peak = Math.max(peak, active); await new Promise(resolve => setImmediate(resolve)); active--;
    return file === 'root.kicad_sch' ? root : '(kicad_sch)';
  });
  assert.equal(peak, data.READ_CONCURRENCY); assert.equal(loaded.length, 41); assert.equal(reads.length, 41);
  assert.deepEqual(loaded.map(file => file.path), ['root.kicad_sch', ...children]);
});
test('hierarchy enforces its file cap independently of parent discovery', async () => {
  const root = '(kicad_sch ' + Array.from({ length: data.PROJECT_MAX_FILES }, (_, i) => `(sheet (property "Sheetfile" "sheet${i}.kicad_sch"))`).join(' ') + ')';
  await assert.rejects(data.loadProject('wayri/board', 'main', 'root.kicad_sch', async (_repo, _ref, file) => file === 'root.kicad_sch' ? root : '(kicad_sch)'), /128 files/);
});
test('repository model transport cache deduplicates loads, retries failures and bounds memory', async () => {
  let requests = 0;
  const cache = data.createModelAssetCache(async path => { requests++; await new Promise(resolve => setImmediate(resolve)); if (path === 'missing.wrl') throw new Error('missing'); return { base64: 'AAAA' }; }, 8);
  await Promise.all([cache.load('part.wrl'), cache.load('part.wrl')]); await cache.load('part.wrl'); assert.equal(requests, 1);
  await cache.load('other.wrl'); await cache.load('other.wrl'); assert.equal(requests, 3, 'assets beyond the cache budget are loaded without retaining them');
  await assert.rejects(cache.load('missing.wrl')); await assert.rejects(cache.load('missing.wrl')); assert.equal(requests, 5);
  cache.clear(); await cache.load('part.wrl'); assert.equal(requests, 6);
});
test('clearing the model cache prevents in-flight responses from repopulating it', async () => {
  let requests = 0, release;
  const cache = data.createModelAssetCache(async () => { requests++; if (requests === 1) await new Promise(resolve => { release = resolve; }); return { base64: 'AAAA' }; });
  const pending = cache.load('part.wrl'); cache.clear(); release(); await pending; await cache.load('part.wrl'); assert.equal(requests, 2);
});
test('unrelated discovery candidates cannot consume the requested hierarchy byte budget', async () => {
  const large = '(kicad_sch' + ' '.repeat(8 * 1024 * 1024 - 11) + ')';
  const root = '(kicad_sch (sheet (property "Sheet file" "sub/child.kicad_sch")))';
  const unrelated = Array.from({ length: 13 }, (_, i) => `unrelated${i}.kicad_sch`);
  const loaded = await data.loadProject('wayri/board', 'main', 'root.kicad_sch', async (_repo, _ref, file) => file === 'root.kicad_sch' ? root : large,
    async () => ['root.kicad_sch', ...unrelated]);
  assert.deepEqual(loaded.map(file => file.path), ['root.kicad_sch', 'sub/child.kicad_sch']);
  assert.match(loaded[0].discoveryWarning, /size limit/);
});


test('opening a leaf in a directory with more than 24 sheets retains its root and siblings',async()=>{
 const names=Array.from({length:30},(_,i)=>`design/child${i}.kicad_sch`),root='design/main.kicad_sch';const sources=new Map(names.map(p=>[p,'(kicad_sch)']));sources.set(root,'(kicad_sch '+names.map(p=>`(sheet (property "Sheetfile" "${p.split('/').at(-1)}"))`).join(' ')+')');
 const result=await data.loadProject('owner/board','main',names[0],async(_r,_ref,p)=>sources.get(p)??null,async(_r,_ref,d)=>d==='design'?[root,...names]:[]);assert.equal(result.length,31);assert.equal(result[0].path,root);assert.equal(result[0].discoveryWarning,undefined);
});
