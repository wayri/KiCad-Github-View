const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const api=require('../draftsman-snap.js'),tools=require('../review-tools.js'),owned=require('../owned-canvas.js');
const near=(a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);
const quarter={type:'arc',layer:'Edge.Cuts',start:{x:10,y:0},mid:{x:Math.sqrt(50),y:Math.sqrt(50)},end:{x:0,y:10}};
test('plain circle and offset mounting/drill holes snap to their saved centres or circumference',()=>{
 const circle={type:'circle',x:12,y:8,r:3},hole={type:'circle',kind:'drill',hole:true,x:21.4,y:7.2,r:1,objectCategory:'pads'};
 const snap=api.create([circle,hole]);assert.deepEqual(snap.snap({x:12.05,y:8.03},{zoom:100}).point,{x:12,y:8});assert.equal(snap.snap({x:12,y:8},{zoom:100}).kind,'circle center');assert.equal(snap.snap({x:21.43,y:7.22},{zoom:100}).kind,'hole center');assert.deepEqual(snap.snap({x:21.43,y:7.22},{zoom:100}).point,{x:21.4,y:7.2});
 const edge=snap.snap({x:15.04,y:8},{zoom:100});assert.equal(edge.kind,'circle edge');near(edge.point.x,15);near(edge.point.y,8);
 assert.equal(tools.snap({x:21.4,y:7.2},[hole],{mode:'geometry',zoom:100}).kind,'free','shared old callers do not opt into drill geometry');assert.equal(tools.snap({x:12,y:8},[circle],{mode:'geometry',zoom:100}).kind,'free');
});
test('nearby real corners and endpoints take priority, while tessellated curved pad vertices are not invented corners',()=>{
 const square={type:'polygon',points:[{x:0,y:0},{x:5,y:0},{x:5,y:5},{x:0,y:5}]},line={type:'line',points:[{x:10,y:0},{x:20,y:0}]};const snap=api.create([square,line]);
 assert.deepEqual(snap.snap({x:.06,y:.05},{zoom:100}).point,{x:0,y:0});assert.equal(snap.snap({x:.06,y:.05},{zoom:100}).kind,'corner');assert.equal(snap.snap({x:15,y:.05},{zoom:100}).kind,'edge');assert.equal(snap.snap({x:10.01,y:.01},{zoom:100}).kind,'endpoint');assert.equal(snap.snap({x:.2,y:.2},{zoom:100}).kind,'free');
 const rounded={kind:'pad',type:'polygon',points:Array.from({length:12},(_,i)=>({x:30+Math.cos(i*Math.PI/6)*2,y:30+Math.sin(i*Math.PI/6)*2}))};assert.equal(api.create([rounded]).snap({x:32,y:30},{zoom:100}).kind,'edge');
});
test('saved rounded arc edges snap analytically and never to the circle outside their saved sweep',()=>{
 const snap=api.create([quarter]),p=snap.snap({x:Math.sqrt(50)+.04,y:Math.sqrt(50)+.04},{zoom:100});assert.equal(p.kind,'arc edge');near(Math.hypot(p.point.x,p.point.y),10);assert.equal(snap.snap({x:-Math.sqrt(50),y:-Math.sqrt(50)},{zoom:100}).kind,'free');assert.equal(snap.snap({x:10.03,y:.02},{zoom:100}).kind,'endpoint');
 const large={...quarter,mid:{x:-10,y:0},end:{x:0,y:-10}};const result=api.create([large]).snap({x:-7.1,y:7.1},{zoom:100});assert.equal(result.kind,'arc edge');near(Math.hypot(result.point.x,result.point.y),10);assert.equal(api.create([large]).snap({x:7.1,y:-7.1},{zoom:100}).kind,'free');
});
test('zoom tolerance, filters, constraints and temporary bypass retain source-space semantics',()=>{
 const hole={type:'circle',hole:true,kind:'drill',x:5,y:6,r:2,objectCategory:'pads'},edge={type:'line',layer:'Edge.Cuts',points:[{x:0,y:0},{x:10,y:0}]},snap=api.create([hole,edge]);assert.equal(snap.snap({x:5.2,y:6.1},{zoom:10}).kind,'hole center');assert.equal(snap.snap({x:5.2,y:6.1},{zoom:100}).kind,'free');assert.equal(snap.snap({x:5,y:6},{zoom:10,filters:['outline']}).kind,'free');assert.equal(snap.snap({x:5,y:6},{zoom:10,filters:['pads']}).kind,'hole center');
 assert.deepEqual(snap.snap({x:5.02,y:6.02},{zoom:100,bypass:true}).point,{x:5.02,y:6.02});assert.deepEqual(snap.snap({x:6,y:.04},{zoom:100,origin:{x:2,y:0},constrain:true}).point,{x:6,y:0});
 for(const at of [{x:NaN,y:0},{x:0,y:Infinity},{x:2e6,y:0}])assert.throws(()=>snap.snap(at));for(const options of [{zoom:0},{zoom:NaN},{tolerancePixels:NaN}])assert.throws(()=>snap.snap({x:1,y:1},options));
});
test('retained PCB renderer primitives provide NPTH hole centres, saved corners and rounded copper edges',()=>{
 const file='inspection.kicad_pcb',diff=require('../design-diff.js'),renderer=require('../pcb-renderer.js'),design=renderer.build(diff.parse(fs.readFileSync(path.join(__dirname,'fixtures/net3d',file),'utf8')),file);const hole=design.primitives.find(p=>p.hole&&p.reference==='H1');assert.ok(hole);const snap=api.create(design.primitives),result=snap.snap({x:hole.x+.01,y:hole.y+.01},{zoom:100,filters:['pads']});near(result.point.x,hole.x);near(result.point.y,hole.y);assert.equal(result.kind,'hole center');
 const hidden=api.create([{type:'circle',x:1,y:1,r:1,hidden:true},{type:'line',points:[{x:1,y:1},{x:2,y:2}],frame:true},{type:'text',x:1,y:1}]);assert.equal(hidden.stats().indexed,0);assert.equal(hidden.snap({x:1,y:1}).kind,'free');
});
test('dense-board broadphase tests only nearby source primitives without an event-time full scan',()=>{
 const primitives=Array.from({length:40000},(_,i)=>({type:'circle',kind:'drill',hole:true,x:(i%200)*4,y:Math.floor(i/200)*4,r:.2})),snap=api.create(primitives);assert.equal(snap.stats().indexed,40000);assert.equal(snap.snap({x:400.02,y:400.02},{zoom:100}).kind,'hole center');assert.ok(snap.stats().lastCandidates<20,JSON.stringify(snap.stats()));assert.ok(snap.stats().lastVisitedNodes<200,JSON.stringify(snap.stats()));assert.equal(snap.snap({x:-100,y:-100},{zoom:100}).kind,'free');assert.equal(snap.stats().lastCandidates,0);assert.throws(()=>api.create(new Array(1000001)),/1,000,000/);
});
test('browser script resolves geometry dependencies at create time after the owned canvas loads',()=>{
 const scope={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../draftsman-snap.js'),'utf8'),scope);scope.KiCadReviewTools=tools;scope.KiCadOwnedCanvas=owned;assert.equal(scope.KiCadDraftsmanSnap.create([{type:'circle',x:1,y:1,r:1}]).snap({x:1,y:1}).kind,'circle center');
});
