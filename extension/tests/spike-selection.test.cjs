const test = require('node:test');
const assert = require('node:assert/strict');
const helpers = import('../spike/selectionState.mjs');
test('perspective fit contains the board sphere on portrait phones and tablets', async () => {
  const {sphereFitDistance} = await import('../spike/fitPolicy.mjs');
  for (const aspect of [400/700, 900/650, 1600/800]) {
    const radius = 80, distance = sphereFitDistance(radius,45,aspect);
    const angularRadius = Math.asin(radius/distance);
    assert.ok(angularRadius < 45*Math.PI/360);
    assert.ok(angularRadius < Math.atan(Math.tan(45*Math.PI/360)*aspect));
  }
  assert.ok(sphereFitDistance(80,45,400/700) > sphereFitDistance(80,45,900/650));
  assert.equal(sphereFitDistance(80,45,0),null);
});
test('3D selection resolves net codes, connected bodies, groups and UUID primitives', async () => {
  const {selectionMatcher} = await helpers;
  const board = {nets:{0:'', 1:'GND', 2:'VCC'}, pads:[{ref:'U1',net:'GND'}]};
  const match = selectionMatcher({references:['R1','R2'],uuids:['zone-id'],netCodes:[1]},board);
  assert.equal(match({ref:'R2'}),true);
  assert.equal(match({net:'GND'}),true);
  assert.equal(match({ref:'U1',library:'Device:IC'}),true);
  assert.equal(match({ref:'U1',net:'VCC',name:'2'}),false);
  assert.equal(match({id:'zone-id:3'}),true);
  assert.equal(match({net:'VCC'}),false);
  assert.equal(selectionMatcher({netCodes:[0]},board)({net:''}),false);
  assert.equal(selectionMatcher({netCodes:['VCC']},board)({net:'VCC'}),true);
  assert.equal(selectionMatcher({},board)({ref:'R1'}),false);
});
test('3D tap selection ignores pinch, drag and cancelled gestures', async () => {
  const {tapGesture} = await helpers;
  const gesture = tapGesture();
  const point = (id,x,y)=>({pointerId:id,clientX:x,clientY:y});
  gesture.down(point(1,10,10)); assert.equal(gesture.up(point(1,11,11)),true);
  gesture.down(point(1,10,10)); gesture.down(point(2,20,20));
  assert.equal(gesture.up(point(2,20,20)),false); assert.equal(gesture.up(point(1,10,10)),false);
  gesture.down(point(1,10,10)); gesture.move(point(1,30,30));
  assert.equal(gesture.up(point(1,10,10)),false);
  gesture.down(point(1,10,10)); gesture.cancel(point(1,10,10)); assert.equal(gesture.up(point(1,10,10)),false);
});

test('pin-only picking excludes component bodies and unrelated copper',async()=>{
 const {selectableRecord,selectionMatcher}=await helpers;
 const pad={type:'Pad',id:'pad',uuid:'pad',name:'1',ref:'U1',net:'GND',at:[1,2],width:1,height:2};
 assert.equal(selectableRecord(pad,'pin'),true);
 for(const record of [{type:'Board'},{type:'Component',ref:'U1',library:'IC'},{type:'Track',net:'GND'},null])assert.equal(selectableRecord(record,'pin'),false);
 assert.equal(selectableRecord(pad,'part'),false);
 const precise=selectionMatcher({uuids:['pad']},{pads:[pad]});assert.equal(precise(pad),true);assert.equal(precise({...pad,id:'other',uuid:'other',name:'2'}),false);assert.equal(precise({type:'Component',ref:'U1'}),false);
});
