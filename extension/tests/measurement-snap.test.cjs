const test=require('node:test'),assert=require('node:assert/strict');
const tools=require('../review-tools.js'),{arcThrough}=require('../owned-canvas.js');
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);

test('explicit corner and edge modes distinguish rotated pad corners, closed boundaries and centers',()=>{
 const pad={kind:'pad',type:'pad',padCenter:{x:10,y:10},points:[{x:10,y:8},{x:12,y:10},{x:10,y:12},{x:8,y:10}]},before=JSON.stringify(pad);
 const corner=tools.snap({x:10.05,y:8.04},[pad],{mode:'corners',zoom:50});assert.equal(corner.kind,'corner');assert.deepEqual(corner.point,{x:10,y:8});
 const edge=tools.snap({x:9.02,y:9.05},[pad],{mode:'edges',zoom:50});assert.equal(edge.kind,'edge');close(edge.point.x+edge.point.y,18);
 assert.equal(tools.snap({x:10,y:10},[pad],{mode:'corners',zoom:50}).kind,'free');assert.equal(tools.snap({x:10,y:10},[pad],{mode:'geometry',zoom:50}).kind,'pad center');assert.equal(JSON.stringify(pad),before);
});

test('curved pad samples do not masquerade as sharp corners and circles expose real edges',()=>{
 const oval={type:'pad',kind:'pad',points:Array.from({length:24},(_,i)=>({x:2*Math.cos(i*Math.PI/12),y:Math.sin(i*Math.PI/12)}))};
 assert.equal(tools.snap(oval.points[0],[oval],{mode:'corners',zoom:100}).kind,'free');assert.equal(tools.snap(oval.points[0],[oval],{mode:'edges',zoom:100}).kind,'edge');
 const round={kind:'pad',type:'pad',x:0,y:0,r:2};assert.equal(tools.snap({x:2.02,y:0},[round],{mode:'corners',zoom:100}).kind,'free');close(tools.snap({x:2.02,y:0},[round],{mode:'edges',zoom:100}).point.x,2);
});

test('measurement filters isolate outline, pads, vias, tracks, graphics and symbols without accidental fallback',()=>{
 const primitives=[{type:'line',layer:'Edge.Cuts',points:[{x:0,y:1},{x:20,y:1}]},{type:'line',kind:'track',points:[{x:0,y:2},{x:20,y:2}]},{type:'circle',kind:'via',x:8,y:8,r:1},{type:'line',kind:'symbol',points:[{x:0,y:3},{x:20,y:3}]},{type:'line',points:[{x:0,y:4},{x:20,y:4}]}];
 for(const [filter,y]of [['outline',1],['tracks',2],['symbols',3],['graphics',4]])close(tools.snap({x:10,y:2.5},primitives,{mode:'edges',filter,zoom:2}).point.y,y);
 assert.equal(tools.snap({x:10,y:2},primitives,{mode:'edges',filter:'pads',zoom:2}).kind,'free');
 assert.equal(tools.snap({x:9.01,y:8},primitives,{mode:'edges',filters:['vias'],zoom:100}).kind,'circle edge');
 assert.equal(tools.snap({x:10,y:2},primitives,{mode:'edges',filters:[],zoom:2}).kind,'free');
});

test('constrained snapping finds axis intersections with segments and curved edges',()=>{
 const line={type:'line',points:[{x:0,y:0},{x:10,y:10}]},options={mode:'edges',zoom:1,origin:{x:0,y:5},constrain:true};
 const result=tools.snap({x:7,y:5.2},[line],options);assert.deepEqual(result.point,{x:5,y:5});assert.equal(result.constrained,true);
 const circle={type:'circle',x:0,y:0,r:5};const curved=tools.snap({x:4.1,y:3.1},[circle],{mode:'edges',zoom:10,origin:{x:0,y:3},constrain:true});close(curved.point.x,4);close(curved.point.y,3);
 const arc={type:'arc',start:{x:-5,y:0},mid:{x:0,y:5},end:{x:5,y:0}};
 assert.equal(tools.snap({x:4,y:-3},[arc],{mode:'edges',zoom:20,arcThrough}).kind,'free');
 assert.equal(tools.snap(arc.mid,[arc],{mode:'corners',zoom:100,arcThrough}).kind,'free');
});

test('touch tolerance is screen-scaled and bounded, while bypass and grid behavior remain explicit',()=>{
 const line={type:'line',points:[{x:0,y:0},{x:10,y:0}]};
 assert.equal(tools.snap({x:5,y:1},[line],{mode:'edges',zoom:10}).kind,'free');assert.equal(tools.snap({x:5,y:1},[line],{mode:'edges',zoom:10,tolerancePixels:20}).kind,'edge');
 assert.equal(tools.snap({x:5,y:4},[line],{mode:'edges',zoom:10,tolerancePixels:1000}).kind,'free');
 assert.equal(tools.snap({x:5,y:.1},[line],{mode:'edges-grid',zoom:10,bypass:true}).kind,'free');
 assert.deepEqual(tools.snap({x:5.1,y:3.9},[line],{mode:'corners-grid',zoom:10,pitch:1}).point,{x:5,y:4});
 assert.equal(tools.snap({x:5,y:0},[{...line,hidden:true}],{mode:'edges',zoom:10}).kind,'free');
});
