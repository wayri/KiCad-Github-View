import test from 'node:test';import assert from 'node:assert/strict';import {createRequire}from'node:module';
import{sourceZoneGeometry,drillLoopInsideBoard}from'../extension/spike/sourceGeometry.mjs';
const{parse}=createRequire(import.meta.url)('../extension/design-diff.js');
const triangle='(pts (xy 0 0) (xy 2 0) (xy 0 2))';
test('drill holes must be strictly inside the saved outline without crossing cutouts',()=>{
 const outer=[[0,0],[10,0],[10,10],[0,10]],hole=[[4,4],[6,4],[6,6],[4,6]];
 assert.equal(drillLoopInsideBoard([[1,1],[2,1],[2,2],[1,2]],outer,[hole]),true);
 assert.equal(drillLoopInsideBoard([[0,1],[2,1],[2,2],[0,2]],outer),false);
 assert.equal(drillLoopInsideBoard([[-1,1],[2,1],[2,2],[-1,2]],outer),false);
 assert.equal(drillLoopInsideBoard([[3,5],[7,5],[7,5.5],[3,5.5]],outer,[hole]),false);
 assert.equal(drillLoopInsideBoard([[4.5,4.5],[5,4.5],[5,5],[4.5,5]],outer,[hole]),false);
});
test('a saved zone boundary never becomes invented copper fill',()=>{
 const ast=parse(`(kicad_pcb (net 1 "GND") (zone (uuid "zone-a") (net 1) (layer "F.Cu") (polygon ${triangle})))`),result=sourceZoneGeometry(ast);
 assert.equal(result.unfilled,1);assert.equal(result.records.length,1);assert.equal(result.records[0].filled,false);assert.equal(result.records[0].net,'GND');assert.equal(result.records[0].id,'zone-a');
});
test('saved fill regions retain their exact source layer and coordinates',()=>{
 const result=sourceZoneGeometry(parse(`(kicad_pcb (zone (layers "F.Cu" "B.Cu") (polygon ${triangle}) (filled_polygon (layer "B.Cu") ${triangle})))`));
 assert.equal(result.unfilled,0);assert.equal(result.records.length,1);assert.equal(result.records[0].layer,'B.Cu');assert.equal(result.records[0].filled,true);assert.deepEqual(result.records[0].points,[[0,0],[2,0],[0,2]]);
});
test('source polygon and point budgets disclose omitted geometry',()=>{
 const ast=parse(`(kicad_pcb (zone (layers "F.Cu" "B.Cu") (polygon ${triangle})))`);
 const result=sourceZoneGeometry(ast,1,3);assert.equal(result.records.length,1);assert.equal(result.truncated,true);
 assert.equal(sourceZoneGeometry(ast,100,2).records.length,0);
});
