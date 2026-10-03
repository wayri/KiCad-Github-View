const test=require('node:test'),assert=require('node:assert/strict');
const tools=require('../review-tools.js'),{Camera}=require('../owned-canvas.js'),comments=require('../review-comments.js');
test('review areas normalize all drag directions and reject zero or excessive geometry',()=>{
 assert.deepEqual(tools.area({x:8,y:7},{x:2,y:3}),{x:2,y:3,width:6,height:4});assert.throws(()=>tools.area({x:1,y:1},{x:1,y:5}));assert.throws(()=>tools.area({x:999999,y:1},{x:1000001,y:5}));
});
test('page setup retains title metadata, nine comments, paper orientation and bounded custom sizes',()=>{
 const input={format:'A3',portrait:true,title:'Power board',company:'Lab',date:'2026-10-04',rev:'B',comments:Array(9).fill('review')};
 const page=tools.page(input);assert.equal(page.width,297);assert.equal(page.height,420);assert.equal(page.titleBlock.comments.length,9);assert.equal(page.titleBlock.rev,'B');assert.throws(()=>tools.page({...input,format:'User',width:0,height:210}));assert.throws(()=>tools.page({...input,title:'x\n'}));
});
test('ruler reports correct mm, mils and signed angle',()=>{assert.match(tools.ruler({x:0,y:0},{x:25.4,y:0},'mil').text,/1000.000 mil/);assert.equal(tools.ruler({x:0,y:0},{x:3,y:4}).distance,5);assert.equal(tools.ruler({x:0,y:0},{x:0,y:-1}).angle,-90);});
test('evidence crop respects camera flip, device pixel ratio and visible clipping',()=>{
 const camera=new Camera(800,600);camera.center.set(0,0);camera.zoom=10;const canvas={width:1600,height:1200,getBoundingClientRect:()=>({width:800,height:600})};
 const a=tools.crop(canvas,camera,{x:1,y:2,width:3,height:4});camera.flipped=true;const b=tools.crop(canvas,camera,{x:1,y:2,width:3,height:4});assert.equal(a.width,60);assert.equal(a.height,80);assert.equal(b.width,60);assert.notEqual(a.x,b.x);assert.throws(()=>tools.crop(canvas,camera,{x:10000,y:2,width:3,height:4}),/outside/);
});
test('captured PNG persists in sidecar without inflating a GitHub marker or injecting URLs',()=>{
 const note={id:'capture',text:'Check this region',createdAt:'2026-10-04T00:00:00Z',anchor:{repository:'wayri/board',ref:'main',file:'board.kicad_pcb',area:{x:0,y:0,width:10,height:5}},capture:{mime:'image/png',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',width:10,height:5}};
 assert.deepEqual(comments.parseSidecar(comments.serializeSidecar([note]))[0].capture,note.capture);
 const markdown=comments.toMarkdown(note);assert.match(markdown,/Area \(mm\)/);assert.ok(!markdown.includes(note.capture.dataUrl));assert.equal(comments.fromMarkdown(markdown)[0].capture,undefined);
 assert.throws(()=>comments.validateComment({...note,capture:{...note.capture,dataUrl:'javascript:alert(1)'}}));assert.throws(()=>comments.validateComment({...note,anchor:{...note.anchor,area:{x:0,y:0,width:-1,height:2}}}));
});

 test('ruler snapping uses geometry before grid and a screen-space tolerance',()=>{
 const pads=[{kind:'pad',type:'pad',x:10,y:10},{kind:'pad',type:'pad',x:30,y:30,hidden:true},{type:'line',points:[{x:0,y:0},{x:20,y:0}]},{type:'line',frame:true,points:[{x:99,y:99},{x:100,y:100}]}];
 assert.deepEqual(tools.snap({x:10.2,y:10.1},pads,{zoom:10}).point,{x:10,y:10});assert.equal(tools.snap({x:10.2,y:10.1},pads,{zoom:100,mode:'geometry'}).kind,'free');assert.equal(tools.snap({x:30,y:30},pads,{zoom:10,mode:'geometry'}).kind,'free');
 assert.equal(tools.snap({x:7,y:.2},pads,{zoom:10}).kind,'edge');assert.deepEqual(tools.snap({x:6.6,y:8.2},pads,{mode:'grid',pitch:.5}).point,{x:6.5,y:8});assert.equal(tools.snap({x:99,y:99},pads,{mode:'geometry'}).kind,'free');
 });
 test('temporary free cursor and horizontal/vertical constraints preserve exact axis origin',()=>{
 assert.deepEqual(tools.snap({x:1.2,y:3.4},[],{mode:'grid',pitch:1,bypass:true}).point,{x:1.2,y:3.4});assert.deepEqual(tools.snap({x:10.3,y:1.2},[],{mode:'grid',pitch:1,origin:{x:.2,y:.3},constrain:true}).point,{x:10,y:.3});assert.deepEqual(tools.snap({x:1.2,y:10.4},[],{mode:'off',origin:{x:.2,y:.3},constrain:true}).point,{x:.2,y:10.4});assert.throws(()=>tools.snap({x:NaN,y:2},[]));
 });
 test('arc snapping stays on saved sweep and board extents include curved extrema without stroke width',()=>{
 const {arcThrough}=require('../owned-canvas.js'),arc={type:'arc',layer:'Edge.Cuts',width:2,start:{x:-1,y:0},mid:{x:0,y:1},end:{x:1,y:0}};
 const p=tools.snap({x:.3,y:1.03},[arc],{mode:'geometry',zoom:100,arcThrough});assert.equal(p.kind,'arc edge');assert.ok(Math.abs(Math.hypot(p.point.x,p.point.y)-1)<1e-10);
 assert.deepEqual(tools.boardExtents([arc],arcThrough),{x:-1,y:0,width:2,height:1});assert.deepEqual(tools.boardExtents([{type:'circle',layer:'Edge.Cuts',x:10,y:20,r:5,width:2},{...arc,layer:'F.Cu'}],arcThrough),{x:5,y:15,width:10,height:10});assert.equal(tools.boardExtents([{...arc,hidden:true}],arcThrough),null);
 });
