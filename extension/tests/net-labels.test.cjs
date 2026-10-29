const test=require('node:test'),assert=require('node:assert/strict');
const {Camera,netLabels}=require('../owned-canvas.js');
const camera=()=>{const c=new Camera(800,600);c.center.set(0,0);c.zoom=30;return c;};
const track=(y=0,width=.5)=>({kind:'track',type:'line',layer:'F.Cu',width,points:[{x:-10,y},{x:10,y}]});
test('net names fit saved copper, suppress unreadable thin traces and never change geometry',()=>{
 const c=camera(),p=track(),before=JSON.stringify(p);
 const labels=netLabels([[p,'VCC'],[track(2,.1),'TOO_THIN']],c);
 assert.equal(labels.length,1);assert.equal(labels[0].text,'VCC');assert.equal(labels[0].size,11);
 assert.equal(JSON.stringify(p),before);
 assert.equal(netLabels([[p,'']],c).length,0);assert.equal(netLabels([[p,'a'.repeat(161)]],c).length,0);
});
test('net names clip long crossing traces to the view and stay upright on flipped boards',()=>{
 const c=camera(),p=track();p.points=[{x:-100,y:-30},{x:100,y:30}];
 for(const flip of [false,true]){c.flipped=flip;const labels=netLabels([[p,'DATA']],c);assert.equal(labels.length,1);assert.equal(labels[0].x,400);assert.equal(labels[0].y,300);assert.ok(Math.abs(labels[0].angle)<=90);}
 p.points=[{x:100,y:100},{x:120,y:110}];assert.equal(netLabels([[p,'OFFSCREEN']],c).length,0);
});
test('label collisions and output budget bound clutter while unnamed/noncopper are omitted',()=>{
 const c=camera();assert.equal(netLabels([[track(),'A'],[track(),'B']],c).length,1);
 assert.equal(netLabels([[track(-4),'A'],[track(4),'B']],c,1).length,1);
 assert.equal(netLabels([[{...track(),layer:'F.SilkS'},'A']],c).length,0);
});
test('zone labels require saved fill and sit within the visible copper polygon',()=>{
 const c=camera(),p={kind:'zone',type:'polygon',layer:'F.Cu',fill:true,points:[{x:-8,y:-5},{x:8,y:-5},{x:8,y:5},{x:-8,y:5}]};
 const labels=netLabels([[p,'GND']],c);assert.equal(labels.length,1);assert.equal(labels[0].x,400);assert.equal(labels[0].y,300);
 assert.equal(netLabels([[{...p,fill:false},'GND']],c).length,0);
 const thin={...p,points:p.points.map(q=>({...q,y:q.y/100}))};assert.equal(netLabels([[thin,'GND']],c).length,0);
});


test('pad numbers take priority over crossing trace and zone net labels',()=>{
 const c=camera(),pad={kind:'pad',type:'pad',uuid:'pad-13',ownerUuid:'U1',layer:'F.Cu',pinNumber:'13',padCenter:{x:0,y:0},padWidth:5,padHeight:1.2};
 const labels=netLabels([[track(),'GND'],[pad,'GND']],c);
 assert.equal(labels[0].primitive,pad);assert.match(labels[0].text,/^13(?:\n|$)/);
 assert.equal(labels.filter(label=>label.primitive!==pad).length,0);
});

test('long hierarchical net names cannot remove a readable pad number',()=>{
 const c=camera(),pad={kind:'pad',type:'pad',uuid:'pad-29',ownerUuid:'J1',layer:'F.Cu',pinNumber:'29',padCenter:{x:0,y:0},padWidth:4,padHeight:1};
 const name='/FPGA/Very_Long_Hierarchical_Sheet/QSFP2_VccTx',before=JSON.stringify(pad);
 const labels=netLabels([[pad,name]],c);assert.equal(labels.length,1);assert.equal(labels[0].text.split('\n')[0],'29');assert.ok(labels[0].text.includes('…')||labels[0].text==='29');assert.equal(JSON.stringify(pad),before);
});

test('unconnected pads show their number without needing a net name',()=>{
 const c=camera(),pad={kind:'pad',type:'pad',uuid:'unconnected',ownerUuid:'J1',layer:'F.Cu',pinNumber:'A12',padCenter:{x:0,y:0},padWidth:2,padHeight:1};
 assert.equal(netLabels([[pad,'']],c)[0].text,'A12');
});
