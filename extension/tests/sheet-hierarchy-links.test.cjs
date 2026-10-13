const test = require('node:test');
const assert = require('node:assert/strict');
const {build} = require('../sheet-hierarchy-links.js');
const {sheetOverviewEntries, composeSheetOverview} = require('../review-workspace.js');

const design = {page: {width: 100, height: 80}, primitives: [], layers: []};
function pages(sheets, links) {
  const entries = sheetOverviewEntries(sheets.map(path => ({path, label: path, kind: 'schematic'})), links);
  return composeSheetOverview(entries.filter(e => e.sheet).map(e => ({path: e.sheet.path, label: e.sheet.label,
    placements: e.placements, instanceCount: e.instanceCount, design, groups: []}))).pages;
}
const link = (path, target, uuid, label = uuid) => ({path, uuid, label, properties: {Sheetfile: target}});

test('saved ancestry draws directional page-edge links with exact parent and child instance identities', () => {
  const graph = build(pages(['root.kicad_sch', 'child.kicad_sch', 'leaf.kicad_sch'], [
    link('root.kicad_sch', 'child.kicad_sch', 'child', 'Controller'),
    link('child.kicad_sch', 'leaf.kicad_sch', 'leaf', 'Power')]));
  assert.equal(graph.links.length, 2);
  assert.deepEqual(graph.links.map(e => [e.parentPath, e.childPath, e.label]), [
    ['root.kicad_sch', 'child.kicad_sch', 'Controller'],
    ['child.kicad_sch', 'leaf.kicad_sch', 'Power']]);
  const first = graph.links[0];
  assert.ok(first.from.x < first.to.x);
  assert.equal(first.count, 1);
  assert.deepEqual(first.parentIds, [JSON.stringify(['root.kicad_sch'])]);
  assert.equal(first.childIds.length, 1);
  assert.equal(graph.unresolved, 0);
});

test('repeated source placements group by saved parent source and keep placement labels', () => {
  const graph = build(pages(['root.kicad_sch', 'channel.kicad_sch'], [
    link('root.kicad_sch', 'channel.kicad_sch', 'left', 'Left'),
    link('root.kicad_sch', 'channel.kicad_sch', 'right', 'Right')]));
  assert.equal(graph.links.length, 1);
  assert.equal(graph.links[0].count, 2);
  assert.equal(graph.links[0].label, 'Left, Right');
  assert.equal(new Set(graph.links[0].childIds).size, 2);
});

test('unloaded, cyclic, and absent parent placements cannot become visual hierarchy links', () => {
  const onlyRoot = pages(['root.kicad_sch'], [link('root.kicad_sch', 'missing.kicad_sch', 'missing')]);
  assert.deepEqual(build(onlyRoot).links, []);
  const a = {path: 'a', x: 0, y: 0, w: 100, h: 80, placements: [{id: 'a', path: 'a', parentId: 'b', label: 'A'}]};
  const b = {path: 'b', x: 140, y: 0, w: 100, h: 80, placements: [{id: 'b', path: 'b', parentId: 'a', label: 'B'}]};
  const cyclic = build([a, b]);
  assert.deepEqual(cyclic.links, []);
  assert.equal(cyclic.unresolved, 2);
  b.placements[0].parentId = 'not-loaded';
  const absent = build([a, b]);
  assert.deepEqual(absent.links, []);
  assert.equal(absent.unresolved, 2);
});

test('visible net-filter subset cannot route a child arrow to an unrelated front copy', () => {
  const all = pages(['root.kicad_sch', 'channel.kicad_sch'], [
    link('root.kicad_sch', 'channel.kicad_sch', 'left', 'Left'),
    link('root.kicad_sch', 'channel.kicad_sch', 'right', 'Right')]);
  const filtered = structuredClone(all);
  filtered[1].placements = filtered[1].placements.filter(p => p.sheetId === 'right');
  const graph = build(filtered);
  assert.equal(graph.links.length, 1);
  assert.equal(graph.links[0].label, 'Right');
  assert.equal(graph.links[0].count, 1);
  assert.equal(graph.links[0].childIds.length, 1);
});

test('many instances of the same saved source link produce one bounded visual edge', () => {
  const root = {path: 'root', x: 0, y: 0, w: 100, h: 80, placements: [{id: 'root', path: 'root', parentId: null}]};
  const child = {path: 'child', x: 140, y: 0, w: 100, h: 80, placements: Array.from({length: 4095}, (_, i) =>
    ({id: `child-${i}`, path: 'child', parentId: 'root', sheetId: `s-${i}`, label: `Branch ${i}`}))};
  const graph = build([root, child]);
  assert.equal(graph.links.length, 1);
  assert.equal(graph.links[0].count, 4095);
  assert.equal(graph.links[0].label, '4095 placements');
  assert.equal(graph.omitted, 0);
});
