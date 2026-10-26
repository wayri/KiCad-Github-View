import test from'node:test';import assert from'node:assert/strict';import{surfaceDistance,distanceLabel,MeasurementSession}from'../extension/spike/measurement3d.mjs';
test('surface distance preserves source XYZ deltas in millimetres',()=>{
 const record=surfaceDistance({x:10,y:20,z:-1},{x:13,y:24,z:11});assert.deepEqual(record.delta,{x:3,y:4,z:12});assert.equal(record.distance,13);assert.equal(record.approximate,false);
 assert.equal(surfaceDistance({x:0,y:0,z:0,approximate:true},{x:0,y:0,z:0}).approximate,true);
 for(const point of [null,{x:0,y:0},{x:Infinity,y:0,z:0},{x:'0',y:0,z:0}])assert.equal(surfaceDistance(point,{x:0,y:0,z:0}),null);
});
test('millimetres and mils use the exact conversion and readable precision',()=>{
 assert.equal(distanceLabel(25.4),'25.400 mm');assert.equal(distanceLabel(25.4,'mil'),'1000.00 mil');assert.equal(distanceLabel(-1),'—');assert.equal(distanceLabel(NaN),'—');
});
test('two clicks complete a measurement, history stays bounded and replay never changes endpoints',()=>{
 const session=new MeasurementSession(),point={x:0,y:0,z:0};session.add(point);point.x=99;assert.equal(session.pending.x,0);
 const first=session.add({x:3,y:4,z:0});assert.equal(first.distance,5);assert.equal(session.pending,null);assert.equal(session.replay(first.id),first);
 for(let i=0;i<8;i++){session.add({x:i,y:0,z:0});session.add({x:i+1,y:0,z:0});}assert.equal(session.records.length,5);assert.equal(session.replay(first.id),null);
 const state=session.snapshot();state.records[0].from.x=-100;assert.notEqual(session.records[0].from.x,-100);session.clear();assert.deepEqual(session.snapshot(),{pending:null,records:[],selected:null});
});
