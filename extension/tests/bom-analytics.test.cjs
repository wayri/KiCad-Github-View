const test=require('node:test'),assert=require('node:assert/strict');
const api=require('../bom-analytics.js');
const part=(ref,extra={})=>({kind:'symbol',path:'main.kicad_sch',id:ref,reference:ref,populated:true,properties:{Value:'10k',Footprint:'0603'},...extra});
test('BOM counts multiunit symbols once and keeps per-file identities and excluded totals',()=>{
const bom=api.bom([part('U1'),part('U1',{id:'U1b'}),part('U1',{path:'sub.kicad_sch',populated:false}),part('R1',{excludeFromBom:true})]);assert.equal(bom.total,3);assert.equal(bom.fitted,2);assert.equal(bom.dnp,1);assert.equal(bom.excluded,1);assert.equal(bom.groups.length,2);assert.equal(api.bom(bom.parts,'main.kicad_sch').total,2);
});
test('separate board footprints preserve UUID identity even with duplicate references',()=>{
assert.equal(api.bom([part('R1',{kind:'footprint',uuid:'one'}),part('R1',{kind:'footprint',uuid:'two'})]).total,2);
});
test('BOM CSV quotes cells, preserves source identity and neutralizes spreadsheet formulas',()=>{
const csv=api.csv(api.bom([part('=cmd',{properties:{Value:'a,"b\nc',Footprint:'@x'}})]));assert.match(csv,/"'=cmd"/);assert.match(csv,/"'@x"/);assert.match(csv,/"a,""b\nc"/);assert.match(csv,/main.kicad_sch/);
});
test('zone sums are orientation independent and deliberately sum overlapping saved fills',()=>{
const board=api.board('(kicad_pcb (zone (uuid z) (polygon (pts(xy 0 0)(xy 10 0)(xy 10 10)(xy 0 10))) (filled_polygon (layer "F.Cu") (pts(xy 0 0)(xy 5 0)(xy 5 5)(xy 0 5))) (filled_polygon (layer "F.Cu") (pts(xy 0 5)(xy 5 5)(xy 5 0)(xy 0 0)))))');assert.equal(board.zones[0].outlineAreaMm2,100);assert.equal(board.zones[0].fillAreaMm2,50);assert.deepEqual(board.layerFill,[{layer:'F.Cu',areaMm2:50}]);assert.match(board.limits,/overlaps/);
});
test('board fabrication counts and straight length use saved source only',()=>{
const b=api.board('(kicad_pcb (general(thickness 1.6))(footprint "x"(pad "1" smd rect)(pad "2" thru_hole circle(drill 1)))(segment(start 0 0)(end 3 4))(arc(start 0 0)(mid 1 1)(end 2 0))(via(at 2 2)))');assert.equal(b.pads,2);assert.equal(b.drilledPads,1);assert.equal(b.smdPads,1);assert.equal(b.throughHolePads,1);assert.equal(b.straightTrackLengthMm,5);assert.equal(b.arcs,1);assert.equal(b.vias,1);assert.equal(b.boardThicknessMm,1.6);
});
test('unsupported and malformed data are bounded or explicitly omitted',()=>{
assert.throws(()=>api.board('x'.repeat(8*1024*1024+1)),/8 MiB/);assert.throws(()=>api.board('(kicad_sch)'),/saved PCB/);assert.equal(api.polygonArea([{x:Infinity,y:0},{x:1,y:0},{x:0,y:1}]),null);assert.equal(api.polygonArea([{x:0,y:0}]),null);const b=api.board('(kicad_pcb(zone(polygon(pts(xy 0 0)(xy 1 1)))))');assert.equal(b.zones[0].valid,false);assert.match(b.warnings.join(' '),/invalid polygon.*no saved filled/);
});
