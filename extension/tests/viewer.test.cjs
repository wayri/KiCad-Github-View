const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const data = require('../browser-data.js');
const diff = require('../design-diff.js');
const viewState = require('../view-state.js');
const pairedReview = require('../paired-review.js');
const source = fs.readFileSync(path.join(__dirname, '../browser-viewer.js'), 'utf8');
const tick = () => new Promise((resolve) => setImmediate(resolve));

function viewer(parameters, read) {
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag.toUpperCase(); this.children = []; this.attributes = {}; this.listeners = {};
      this.dataset = {}; this.hidden = false; this.value = ''; this.textContent = '';
      this.classList = { toggle: () => {} }; this.messages = [];
      this.contentWindow = { postMessage: (message, origin) => this.messages.push({message, origin}) };
    }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    addEventListener(type, handler) { this.listeners[type] = handler; }
    setAttribute(key, value) { this.attributes[key] = value; }
    querySelectorAll() { return this.children.filter((node) => node.dataset.mode); }
    click() { this.listeners.click?.({}); }
  }
  const elements = new Map();
  const get = (id) => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  get('changesPanel').hidden = true; get('changeFilter').value = 'all';
  const calls = [], listeners = new Map();
  vm.runInNewContext(source, { URL, URLSearchParams, Number, Map, Set, Promise,
    KiCadBrowserData: data, KiCadDesignDiff: diff, KiCadViewState: viewState, KiCadPairedReview:pairedReview,
    location: { search: '?'+new URLSearchParams(parameters) },
    matchMedia: () => ({ matches: true }), addEventListener: (name, callback) => {const all=listeners.get(name)||[];all.push(callback);listeners.set(name,all);},
    chrome: { runtime: { getURL: (name) => 'chrome-extension://test-id/'+name,
      sendMessage: async (message) => { calls.push(message); return read(message); } } },
    document: { getElementById: get, createElement: (tag) => new Element(tag) } });
  return { get, calls, message: (event) => listeners.get('message').forEach(callback=>callback(event)), click: (text) => get('toolbar').children.find((node) => node.textContent === text).click() };
}
const parameters = {repository:'wayri/board', headRepository:'fork/board', file:'new.kicad_sch',
  oldFile:'old.kicad_sch', base:'a'.repeat(40), head:'b'.repeat(40)};
const sch = (value) => `(kicad_sch (symbol (lib_id "Device:R") (uuid "one") (at 10 20 0) (property "Reference" "R1") (property "Value" "${value}")))`;

test('renamed designs compare properties and focus inside extension frames', async () => {
  const view = viewer(parameters, ({ref,file}) => ({ok:true, result:[{path:file,content:sch(ref[0] === 'a' ? '1k' : '2k')}]}));
  view.click('Changes'); await tick();
  assert.equal(view.get('changesPanel').hidden, false);
  assert.equal(view.get('changeCount').textContent, '0 added · 0 removed · 1 modified');
  assert.equal(view.calls[0].file, 'old.kicad_sch');
  assert.equal(view.calls[1].repository, 'fork/board');
  const row = view.get('changeList').children[0]; row.click();
  const table = view.get('changeProperties').children.find((node) => node.tagName === 'TABLE');
  const value = table.children.find((row) => row.children[0]?.textContent === 'Value');
  assert.deepEqual(value.children.map((node) => node.textContent), ['Value','1k','2k']);
  const frame = view.get('headDrawing').children[0];
  assert.equal(frame.messages[0].origin, 'chrome-extension://test-id');
  assert.equal(frame.messages[0].message.command, 'focus');
  view.get('changeSearch').value = 'no-match'; view.get('changeSearch').listeners.input();
  assert.equal(view.get('changeList').children[0].textContent, 'No changes match this filter.');
});

test('added and removed designs never request the absent revision', async () => {
  for (const status of ['added','removed']) {
    const view = viewer({...parameters, status}, ({file}) => ({ok:true,result:[{path:file,content:sch('1k')}]}));
    const absent = view.get(status === 'added' ? 'baseDrawing' : 'headDrawing');
    assert.equal(absent.children.length, 0);
    assert.match(absent.textContent, /absent/);
    view.click('Changes'); await tick();
    assert.equal(view.calls.length, 1);
    assert.equal(view.calls[0].ref, status === 'added' ? parameters.head : parameters.base);
    assert.match(view.get('changeCount').textContent, status === 'added' ? /1 added/ : /1 removed/);
  }
});

test('selecting an object removed from a schematic reveals its base drawing', async () => {
  const view = viewer(parameters, ({ref,file}) => ({ok:true,result:[{path:file,
    content:ref[0] === 'a' ? sch('1k') : '(kicad_sch)'}]}));
  assert.equal(view.get('basePanel').hidden, true, 'schematic starts in head mode');
  view.click('Changes'); await tick();
  view.get('changeList').children[0].click();
  assert.equal(view.get('basePanel').hidden, false);
  assert.equal(view.get('headPanel').hidden, true);
  assert.equal(view.get('baseDrawing').children[0].messages[0].message.command, 'focus');
});

test('invalid locations create no frames or data requests; empty action page explains inline use', () => {
  const invalid = viewer({...parameters, file:'../unsafe.kicad_sch'}, () => assert.fail('unexpected request'));
  assert.match(invalid.get('status').textContent, /invalid/);
  assert.equal(invalid.get('headDrawing').children.length, 0);
  const empty = viewer({}, () => assert.fail('unexpected request'));
  assert.match(empty.get('status').textContent, /view it inline/);
  assert.equal(empty.get('comparison').hidden, true);
});

test('lookup failure can be retried and fit controls send only to extension frames', async () => {
  let failures = true;
  const view = viewer(parameters, ({file}) => failures ? {ok:false,error:'GitHub rate limit'} : {ok:true,result:[{path:file,content:sch('1k')}]} );
  view.click('Changes'); await tick();
  assert.equal(view.get('changeCount').textContent, 'GitHub rate limit');
  failures = false; view.click('Changes'); view.click('Changes'); await tick();
  assert.equal(view.get('changeCount').textContent, '0 added · 0 removed · 0 modified');
  view.click('Fit drawings');
  for (const side of ['base','head']) {
    const message = view.get(side+'Drawing').children[0].messages[0];
    assert.equal(message.origin, 'chrome-extension://test-id');
    assert.equal(message.message.command, 'fit-drawing');
  }
});


test('linked views relay only trusted matching sheets and preserve world zoom', () => {
  const view = viewer(parameters, () => assert.fail('unexpected data request'));
  const base = view.get('baseDrawing').children[0], head = view.get('headDrawing').children[0];
  const publish = (frame, file, camera, phase = 'change', origin = 'chrome-extension://test-id') =>
    view.message({source: frame.contentWindow, origin, data: {type: 'kicad-review:view', file, phase, view: camera}});
  const camera = {x: 100, y: 80, zoom: 2.5};
  publish(base, 'old.kicad_sch', {x: 10, y: 20, zoom: 1}, 'ready');
  assert.equal(head.messages.length, 0, 'wait for both initial views');
  publish(head, 'new.kicad_sch', camera, 'ready');
  assert.deepEqual(JSON.parse(JSON.stringify(base.messages[0].message)), {
    type: 'kicad-review:command', command: 'set-view', file: 'old.kicad_sch', view: camera
  });
  const count = base.messages.length;
  publish(head, 'new.kicad_sch', {...camera, x: 500}, 'change', 'https://github.com');
  publish({contentWindow: {}}, 'new.kicad_sch', camera);
  publish(head, 'new.kicad_sch', {...camera, zoom: NaN});
  assert.equal(base.messages.length, count, 'untrusted or invalid reports cannot relay');
  publish(head, 'sheets/child.kicad_sch', camera, 'ready');
  publish(head, 'sheets/child.kicad_sch', {...camera, x: 300});
  assert.equal(base.messages.length, count, 'different active sheets stay independent');
  publish(base, 'sheets/child.kicad_sch', camera, 'ready');
  assert.equal(base.messages.at(-1).message.file, 'sheets/child.kicad_sch');
  view.click('Link views');
  const stopped = base.messages.length;
  publish(head, 'sheets/child.kicad_sch', {...camera, x: 400});
  assert.equal(base.messages.length, stopped, 'user can unlink cameras');
});

test('linked change focus uses one shared location so a moved object remains visible', async () => {
  const view = viewer(parameters, ({ref,file}) => ({ok:true,result:[{path:file,
    content:sch('1k').replace('(at 10 20 0)', ref[0] === 'a' ? '(at 10 20 0)' : '(at 40 50 0)')}]}));
  view.click('Changes'); await tick();
  view.get('changeList').children[0].click();
  for (const side of ['base','head']) {
    assert.deepEqual(JSON.parse(JSON.stringify(view.get(side+'Drawing').children[0].messages[0].message.position)), {x:40,y:50});
  }
  view.click('Link views');
  view.get('changeList').children[0].click();
  assert.deepEqual(JSON.parse(JSON.stringify(view.get('baseDrawing').children[0].messages.at(-1).message.position)), {x:10,y:20});
});


test('selecting a root change after subsheet navigation returns each drawing to the root', async () => {
  const view = viewer(parameters, ({ref,file}) => ({ok:true,result:[{path:file,content:sch(ref[0] === 'a' ? '1k' : '2k')}]}));
  view.click('Changes'); await tick();
  const original = {};
  for (const side of ['base','head']) {
    original[side] = view.get(side+'Drawing').children[0];
    view.message({source: original[side].contentWindow, origin: 'chrome-extension://test-id',
      data: {type:'kicad-review:view',phase:'ready',file:'sheets/child.kicad_sch',view:{x:200,y:300,zoom:2}}});
  }
  view.get('changeList').children[0].click();
  for (const side of ['base','head']) {
    const frame = view.get(side+'Drawing').children[0];
    assert.notEqual(frame, original[side]);
    assert.equal(new URL(frame.src).searchParams.get('file'), side === 'base' ? 'old.kicad_sch' : 'new.kicad_sch');
  }
});


test('paired review keeps same repository revision and relays only trusted selections',async()=>{
 const view=viewer({repository:'wayri/board',file:'board.kicad_pcb',head:'main',pairedFile:'root.kicad_sch'},()=>({ok:true,result:[]}));
 const main=view.get('headDrawing').children[0],pair=view.get('pairDrawing').children[0];
 assert.equal(new URL(pair.src).searchParams.get('repository'),'wayri/board');
 assert.equal(new URL(pair.src).searchParams.get('ref'),'main');
 assert.equal(view.get('pairPanel').hidden,false);
 view.message({origin:'chrome-extension://test-id',source:pair.contentWindow,data:{type:'kicad-review:view',phase:'ready',file:'root.kicad_sch',view:{x:0,y:0,zoom:1}}});
 const selection={kind:'part',reference:'R1',path:'board.kicad_pcb',uuid:'fp'};
 view.message({origin:'chrome-extension://test-id',source:main.contentWindow,data:{type:'kicad-review:selection',selection}});
 assert.equal(pair.messages.at(-1).message.command,'highlight-related');
 const count=pair.messages.length;
 for(const [source,origin] of [[{},'chrome-extension://test-id'],[main.contentWindow,'https://github.com']])view.message({source,origin,data:{type:'kicad-review:selection',selection}});
 assert.equal(pair.messages.length,count);
 view.message({origin:'chrome-extension://test-id',source:main.contentWindow,data:{type:'kicad-review:comments-changed'}});
 assert.equal(pair.messages.at(-1).message.command,'refresh-comments');
});
test('paired cross-highlight waits for the companion to finish loading and retains the latest selection',()=>{
 const view=viewer({repository:'wayri/board',file:'board.kicad_pcb',head:'main',pairedFile:'root.kicad_sch'},()=>({ok:true,result:[]}));
 const main=view.get('headDrawing').children[0],pair=view.get('pairDrawing').children[0];
 for(const reference of ['R1','R2'])view.message({origin:'chrome-extension://test-id',source:main.contentWindow,data:{type:'kicad-review:selection',selection:{kind:'part',reference,path:'board.kicad_pcb'}}});
 assert.equal(pair.messages.length,0);
 view.message({origin:'chrome-extension://test-id',source:pair.contentWindow,data:{type:'kicad-review:view',phase:'ready',file:'root.kicad_sch',view:{x:0,y:0,zoom:1}}});
 assert.equal(pair.messages.length,1);assert.equal(pair.messages[0].message.selection.reference,'R2');
});
test('invalid same-kind companion is rejected without making a frame',()=>{
 const view=viewer({repository:'wayri/board',file:'board.kicad_pcb',head:'main',pairedFile:'other.kicad_pcb'},()=>({ok:true,result:[]}));
 assert.equal(view.get('pairDrawing').children.length,0);
 assert.match(view.get('status').textContent,/Invalid companion/);
});


test('GitLab inline shell resolves branch commits before creating provider-bound drawing frames',async()=>{
 const sha='c'.repeat(40),view=viewer({provider:'gitlab',repository:'group/sub/board',head:'feature/pcb',file:'board.kicad_pcb'},message=>({ok:true,result:{repository:message.repository,sha}}));
 assert.equal(view.get('headDrawing').children.length,0);await tick();
 assert.equal(view.calls[0].provider,'gitlab');assert.equal(view.calls[0].type,'revision-resolve');assert.equal(view.calls[0].ref,'feature/pcb');
 const frame=view.get('headDrawing').children[0],query=new URL(frame.src).searchParams;
 assert.equal(query.get('provider'),'gitlab');assert.equal(query.get('ref'),sha);assert.equal(query.get('repository'),'group/sub/board');
 assert.equal(view.get('sourceLink').textContent,'GitLab source');assert.match(view.get('sourceLink').href,/gitlab.com\/group\/sub\/board\/-\/blob/);
});
