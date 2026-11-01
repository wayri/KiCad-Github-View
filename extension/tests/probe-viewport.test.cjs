const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const project=path.resolve(__dirname,'../..'),roots=[project];
const gitFile=path.join(project,'.git');if(fs.existsSync(gitFile)&&fs.statSync(gitFile).isFile()){const value=/^gitdir:\s*(.+)/.exec(fs.readFileSync(gitFile,'utf8'))?.[1];if(value)roots.push(path.resolve(project,value,'../../..'));}
const threePath=roots.flatMap(root=>[path.join(root,'extension/node_modules/three/build/three.module.js'),path.join(root,'.vizdiff/build-deps/node_modules/three/build/three.module.js')]).find(fs.existsSync);
const helper=()=>import('../spike/probeViewport.mjs');
test('probe registry budgets one extra context and releases before parent resources',async()=>{
 const {createProbeRegistry}=await helper(),registry=createProbeRegistry(1),events=[];
 const first=registry.create(()=>({dispose(){events.push('probe');},sourceAdded(node){events.push(node);}}));
 assert.equal(registry.size(),1);assert.throws(()=>registry.create(()=>{throw Error('Factory must not run');}),/3D probe limit/);registry.sourceAdded('model');first.dispose();first.dispose();assert.equal(registry.size(),0);
 assert.throws(()=>registry.create(()=>{throw Error('GPU unavailable');}),/GPU unavailable/);assert.equal(registry.size(),0);
 registry.create(()=>({dispose(){events.push('second');}}));registry.dispose();events.push('parent');assert.deepEqual(events,['model','probe','second','parent']);assert.throws(()=>registry.create(()=>({})),/closed/);
});
test('probe hierarchy shares source buffers and records without mutating main selection materials', {skip:!threePath},async()=>{
 const THREE=await import(pathToFileURL(threePath).href),{cloneProbeTree}=await helper(),source=new THREE.Group(),geometry=new THREE.BoxGeometry(),base=new THREE.MeshBasicMaterial({color:'red'}),dimmed=new THREE.MeshBasicMaterial({color:'grey'}),mesh=new THREE.InstancedMesh(geometry,dimmed,2),originalColors=new THREE.InstancedBufferAttribute(new Float32Array([1,0,0,0,1,0]),3),records=[{uuid:'p1',net:'GND'},{uuid:'p2',net:'VCC'}];
 mesh.setMatrixAt(0,new THREE.Matrix4().makeTranslation(3,4,0));mesh.setMatrixAt(1,new THREE.Matrix4().makeTranslation(5,6,0));mesh.userData.records=records;mesh.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(6),3);source.add(mesh);
 let disposed=0;geometry.addEventListener('dispose',()=>disposed++);base.addEventListener('dispose',()=>disposed++);
 const tree=cloneProbeTree(THREE,source,{materialFor:()=>base,instanceColorFor:()=>originalColors}),copy=tree.copyOf(mesh);
 assert.equal(copy.geometry,geometry);assert.equal(copy.material,base);assert.equal(copy.instanceMatrix,mesh.instanceMatrix);assert.equal(copy.instanceColor,originalColors);assert.equal(copy.userData.records,records);assert.equal(mesh.material,dimmed);
 copy.position.x=99;assert.equal(mesh.position.x,0);const modelParent=new THREE.Group(),model=new THREE.Mesh(geometry,base);model.userData.record={type:'Component',ref:'U1'};modelParent.add(model);source.add(modelParent);assert.equal(tree.sourceAdded(model),true);assert.equal(tree.copyOf(model).geometry,geometry);assert.equal(tree.sourceAdded(model),false);
 tree.release();assert.equal(disposed,0);assert.equal(source.children.length,2);geometry.dispose();base.dispose();dimmed.dispose();
});
function viewportHarness(THREE){
 const rendered=[],queue=new Map();let seq=0,disposed=0,loss=0;
 class Canvas{constructor(){this.style={};this.events=new Map();this.parentNode=null;}setAttribute(){}addEventListener(name,fn){this.events.set(name,fn);}removeEventListener(name){this.events.delete(name);}getBoundingClientRect(){return {left:0,top:0,width:320,height:240};}remove(){this.parentNode=null;}}
 class Renderer{constructor(){this.domElement=new Canvas();this.shadowMap={};this.renderLists={dispose(){}};}setPixelRatio(value){this.ratio=value;}setSize(w,h){this.w=w;this.h=h;}render(scene,camera){rendered.push({scene,camera});}dispose(){disposed++;}forceContextLoss(){loss++;}}
 class Controls{constructor(camera){this.camera=camera;this.target=new THREE.Vector3();}addEventListener(){}removeEventListener(){}update(){this.camera.lookAt(this.target);this.camera.updateMatrixWorld();}dispose(){}}
 const host={clientWidth:320,clientHeight:240,children:[],append(canvas){this.children.push(canvas);canvas.parentNode=this;}},source=new THREE.Group(),sourceScene=new THREE.Scene(),geometry=new THREE.BoxGeometry(8,6,1),material=new THREE.MeshBasicMaterial({color:'green'}),mesh=new THREE.Mesh(geometry,material);mesh.userData.record={type:'Component',ref:'U1',uuid:'u1'};source.add(mesh);sourceScene.add(source,new THREE.AmbientLight(0xffffff,1));
 return {args:{THREE:{...THREE,WebGLRenderer:Renderer},OrbitControls:Controls,host,source,sourceScene,sourceRenderer:{outputColorSpace:THREE.SRGBColorSpace,toneMapping:THREE.NoToneMapping,toneMappingExposure:1},board:{},raf:fn=>{queue.set(++seq,fn);return seq;},caf:id=>queue.delete(id),Observer:class{observe(){}disconnect(){}}},source,mesh,geometry,material,host,rendered,disposed:()=>disposed,loss:()=>loss,flush(){const pending=[...queue.values()];queue.clear();for(const fn of pending)fn();}};
}
test('probe camera, selection and lifecycle stay independent while using real source geometry', {skip:!threePath},async()=>{
 const THREE=await import(pathToFileURL(threePath).href),{createSharedProbeViewport}=await helper(),h=viewportHarness(THREE);let sharedDisposals=0;h.geometry.addEventListener('dispose',()=>sharedDisposals++);h.material.addEventListener('dispose',()=>sharedDisposals++);
 const probe=createSharedProbeViewport({...h.args,selection:{references:['U1']}});h.flush();assert.equal(probe.getStats().selection.matched,1);assert.equal(h.rendered.length,1);const first=h.rendered[0],position=first.camera.position.clone();assert.ok(first.camera.position.toArray().every(Number.isFinite));
 probe.rotate(45);probe.zoom(2);h.flush();assert.notDeepEqual(first.camera.position.toArray(),position.toArray());assert.equal(h.mesh.position.x,0);assert.equal(h.source.children.length,1);
 probe.setSelection({uuids:['missing']});h.flush();assert.equal(probe.getStats().selection.matched,0);probe.setTheme(false);h.flush();assert.equal(first.scene.background.getHex(),0xe7ebf1);assert.equal(h.args.sourceScene.background,null);
 const addition=new THREE.Mesh(h.geometry,h.material);addition.userData.record={type:'Component',ref:'U2',uuid:'u2'};h.source.add(addition);probe.sourceAdded(addition);probe.setSelection({references:['U2']});assert.equal(probe.getStats().selection.matched,1);assert.equal(probe.getStats().sourceParses,0);assert.equal(probe.getStats().modelRequests,0);
 probe.dispose();probe.dispose();h.flush();assert.equal(sharedDisposals,0);assert.equal(h.disposed(),1);assert.equal(h.loss(),1);assert.equal(probe.getStats().active,false);assert.equal(h.source.children.length,2);
 h.geometry.dispose();h.material.dispose();
});

test('probe picking keeps authoritative part, net and pin records separate', {skip:!threePath},async()=>{
 const THREE=await import(pathToFileURL(threePath).href),{createSharedProbeViewport}=await helper(),h=viewportHarness(THREE),pad=new THREE.Mesh(h.geometry,h.material),record={type:'Pad',ref:'U1',name:'1',uuid:'pad-one',net:'GND',at:[0,0],width:1,height:1};
 pad.scale.set(.1,.1,.1);pad.position.z=1;pad.userData.record=record;h.source.add(pad);const selected=[],probe=createSharedProbeViewport({...h.args,onSelect:value=>selected.push(value)});h.flush();
 const pick=mode=>{probe.setSelectionMode(mode);const camera=h.rendered.at(-1).camera;camera.updateMatrixWorld();const point=new THREE.Vector3(0,0,1).project(camera),event={pointerId:1,button:0,clientX:(point.x+1)*160,clientY:(1-point.y)*120},canvas=h.host.children[0];canvas.events.get('pointerdown')(event);canvas.events.get('pointerup')(event);h.flush();};
 pick('pin');assert.equal(selected.at(-1),record);assert.equal(probe.getStats().selection.matched,1);
 pick('net');assert.equal(selected.at(-1).net,'GND');pick('part');assert.equal(selected.at(-1),h.mesh.userData.record);
 assert.equal(h.mesh.material,h.material);assert.equal(pad.userData.record,record);probe.dispose();h.geometry.dispose();h.material.dispose();
});

test('default GPU budget permits popupfrompopup in3D and rejects a third extra context',async()=>{const {createProbeRegistry}=await helper(),registry=createProbeRegistry();let released=0;const factory=()=>({dispose(){released++;},sourceAdded(){}});registry.create(factory);registry.create(factory);assert.equal(registry.size(),2);assert.throws(()=>registry.create(factory),/limit \(2\)/);registry.dispose();assert.equal(released,2);});
