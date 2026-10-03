const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const web = path.join(__dirname, '../app_web');

class Element {
  constructor(tag = 'div') {
    this.tag = tag; this.children = []; this.hidden = false; this.textContent = '';
    this.value = ''; this.attributes = {}; this.classList = { add: () => {} };
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
  setAttribute(name, value) { this.attributes[name] = value; }
}

function fixture(file) {
  const ids = ['status', 'frameControls', 'viewportRow', 'drawingHost', 'properties',
    'sheetPanel', 'sheetSelect', 'warning', 'layerPanel', 'layerList', 'fitDrawing',
    'fitPage', 'themeButton', 'mode3d', 'threePane'];
  const nodes = Object.fromEntries(ids.map((id) => [id, new Element()]));
  nodes.frameControls.hidden = nodes.viewportRow.hidden = true;
  const events = {};
  const files = file.endsWith('.kicad_pcb')
    ? [{ path: file, content: 'pcb-source' }]
    : [{ path: file, content: 'root-source' }, { path: 'design/child.kicad_sch', content: 'child-source' }];
  const calls = { mount: 0, opened: [], drawn: 0, fitted: 0, paged: 0 };
  const canvas = {
    visibleLayers: new Set(), viewport: { camera: { bbox: null } }, selected: null,
    addEventListener(type, handler) { events[type] = handler; },
    setDocument(design, filename) {
      this.document = { filename }; this.design = design;
      this.visibleLayers = new Set(design.layers); calls.opened.push(filename);
    },
    draw() { calls.drawn++; }, zoom_to_board() { calls.fitted++; },
    zoom_to_page() { calls.paged++; }, resize() {}, dispose() { calls.disposed = true; }
  };
  const document = {
    getElementById: (id) => nodes[id], createElement: (tag) => new Element(tag),
    head: new Element('head')
  };
  const context = {
    document, location: { search: `?repository=owner%2Fboard&ref=${'a'.repeat(40)}&file=${encodeURIComponent(file)}` },
    URLSearchParams, addEventListener: (type, handler) => { events[type] = handler; },
    PublicKiCadData: {
      validRepository: () => true, validRef: () => true, validPath: () => true,
      loadProject: async () => files
    },
    KiCadDesignDiff: { parse: (source) => source },
    KiCadSchematicRenderer: { build: (source) => ({ primitives: [
      { kind: 'page', type: 'polygon' }, { kind: 'symbol', type: 'line', uuid: source }
    ], page: { width: 297, height: 210 }, layers: [], warnings: [] }) },
    KiCadPCBRenderer: { build: () => ({ primitives: [], page: { width: 297, height: 210 },
      layers: ['F.Cu', 'B.Cu'], warnings: [] }) },
    KiCadOwnedCanvas: {
      mount: (_host, options) => {
        calls.mount++; calls.options = options;
        calls.visibleAtMount = !nodes.frameControls.hidden && !nodes.viewportRow.hidden;
        return canvas;
      },
      bounds: () => ({ x: 10, y: 20, w: 30, h: 40 })
    }
  };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(path.join(web, 'revision.js'), 'utf8'), context);
  return { nodes, events, calls, canvas };
}

test('hosted entrypoint loads the owned engine and excludes KiCanvas assets', () => {
  const html = fs.readFileSync(path.join(web, 'revision.html'), 'utf8');
  for (const source of ['design-diff.js', 'owned-canvas.js', 'schematic-renderer.js', 'pcb-renderer.js']) {
    assert.ok(html.includes(`<script src="${source}"></script>`));
  }
  assert.doesNotMatch(html, /kicanvas/i);
});

test('hosted schematic mounts Canvas2D and navigates loaded subsheets', async () => {
  const ui = fixture('design/root.kicad_sch');
  await new Promise(setImmediate);
  assert.equal(ui.calls.mount, 1);
  assert.equal(ui.calls.visibleAtMount, true, 'layout is visible before first camera fit');
  assert.equal(ui.calls.options.pcb, false);
  assert.equal(ui.canvas.document.filename, 'design/root.kicad_sch');
  assert.equal(ui.nodes.sheetSelect.children.length, 2);
  assert.equal(ui.nodes.viewportRow.hidden, false);
  ui.nodes.sheetSelect.value = 'design/child.kicad_sch';
  ui.nodes.sheetSelect.onchange();
  assert.equal(ui.canvas.document.filename, 'design/child.kicad_sch');
  assert.ok(ui.calls.opened.includes('design/child.kicad_sch'));
  ui.canvas.selected = { kind: 'symbol', reference: 'U1', uuid: 'abc' };
  ui.events['kicad:select']();
  assert.ok(ui.nodes.properties.children.some((node) => node.textContent === 'U1'));
  ui.nodes.fitPage.onclick();
  assert.equal(ui.calls.paged, 1);
});

test('hosted PCB defaults dark and exposes layer visibility and fit controls', async () => {
  const ui = fixture('design/board.kicad_pcb');
  await new Promise(setImmediate);
  assert.equal(ui.calls.options.dark, true);
  assert.equal(ui.nodes.sheetPanel.hidden, true);
  assert.equal(ui.nodes.layerList.children.length, 2);
  const first = ui.nodes.layerList.children[0].children[0];
  first.checked = false; first.onchange();
  assert.equal(ui.canvas.visibleLayers.has('F.Cu'), false);
  ui.nodes.fitDrawing.onclick();
  assert.ok(ui.calls.fitted > 0);
  ui.nodes.themeButton.onclick();
  assert.equal(ui.canvas.dark, false);
});
