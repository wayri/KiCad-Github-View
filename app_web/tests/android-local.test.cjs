const test=require('node:test'),assert=require('node:assert/strict');
const local=require('../../android-app/web/local-project.js');
globalThis.KiCadBrowserData=require('../../extension/browser-data.js');globalThis.KiCadReviewComments=require('../../extension/review-comments.js');
const store=()=>{const map=new Map();return{getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};};
const project=()=>local.validate({id:'fixture',files:[{path:'design/main.kicad_sch',content:'(kicad_sch (sheet (property "Sheetfile" "../shared/power.kicad_sch")))'},{path:'shared/power.kicad_sch',content:'(kicad_sch)'},{path:'design/main.kicad_pcb',content:'(kicad_pcb)'},{path:'design/main.kicad_pro',content:'{}'}],assets:[{path:'models/header.step',base64:'QUJD'}]});
test('Android imported source transport discovers scattered schematic hierarchy and inventory',async()=>{
 const api=local.transport(project(),store()),reply=await api.send({type:'project',repository:api.scope,ref:api.ref,file:'design/main.kicad_sch'});assert.equal(reply.ok,true);assert.ok(reply.result.some(f=>f.path==='shared/power.kicad_sch'));
 const inventory=await api.send({type:'project-inventory'});assert.equal(inventory.result.files.length,4);
 const asset=await api.send({type:'repo-asset',file:'models/header.step'});assert.equal(asset.result.base64,'QUJD');
 assert.equal((await api.send({type:'project-file',file:'../private.kicad_sch'})).ok,false);assert.equal((await api.send({type:'project-file',file:'design/main.kicad_pro',repository:'other/repo'})).ok,false);
});
test('Android imports reject traversal, active content, duplicates, invalid binaries and missing drawings',()=>{
 for(const path of ['../x.kicad_sch','/x.kicad_sch','x\\evil.kicad_sch','x:kicad_sch','index.html'])assert.throws(()=>local.validate({files:[{path,content:''}]}));
 assert.throws(()=>local.validate({files:[{path:'a.kicad_sch',content:''},{path:'a.kicad_sch',content:''}]}));
 assert.throws(()=>local.validate({files:[{path:'a.json',content:'{}'}]}));
 assert.throws(()=>local.validate({...project(),assets:[{path:'models/x.step',base64:'<script>'}]}));
});
test('Android notes persist, enforce update conflicts and remain separate between imports',async()=>{
 const storage=store(),api=local.transport(project(),storage),note={id:'note',text:'Check connector',severity:'minor',state:'open',createdAt:'2026-10-06T00:00:00Z',updatedAt:'2026-10-06T00:00:00Z',anchor:{repository:api.scope,ref:api.ref,file:'design/main.kicad_pcb'}};
 assert.equal((await api.send({type:'comment-save',comment:note})).ok,true);
 const reopened=local.transport(project(),storage);assert.equal((await reopened.send({type:'comment-list',file:note.anchor.file})).result.length,1);
 assert.equal((await api.send({type:'comment-save',comment:note,expectedUpdatedAt:'2026-10-05T00:00:00Z'})).ok,false);
 const other=local.transport({...project(),id:'other'},storage);assert.equal((await other.send({type:'comment-list',file:note.anchor.file})).result.length,0);
 assert.equal((await api.send({type:'github-publish-comment',comment:note})).ok,false);
});
test('Android touch camera pans and pinches without selecting after a drag, and cancels safely',()=>{
 globalThis.MouseEvent=class{constructor(type,init){Object.assign(this,{type},init);}};const touch=require('../../android-app/web/touch.js'),listeners=new Map(),clicks=[],camera=new (require('../../extension/owned-canvas.js').Camera)(800,600);camera.zoom=4;
 const node={classList:{contains:()=>false},addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n),getBoundingClientRect:()=>({left:0,top:0}),setPointerCapture(){},releasePointerCapture(){},dispatchEvent:e=>clicks.push(e)};
 const view={canvas:node,viewport:{camera},requestDraw(){},prepareMotion(){},finishMotion(){}},detach=touch.attach(view);
 const emit=(type,id,x,y)=>listeners.get(type)({type,pointerType:'touch',pointerId:id,clientX:x,clientY:y,preventDefault(){},stopImmediatePropagation(){}});
 const before=camera.center.x;emit('pointerdown',1,100,100);emit('pointermove',1,140,100);assert.equal(camera.center.x,before-10);emit('pointerup',1,140,100);assert.equal(clicks.length,0);
 emit('pointerdown',1,100,100);emit('pointerdown',2,200,100);emit('pointermove',2,300,100);assert.equal(camera.zoom,8);emit('pointercancel',1,100,100);emit('pointercancel',2,300,100);assert.equal(clicks.length,0);emit('pointerdown',1,100,100);emit('pointerup',1,100,100);emit('pointerdown',1,100,100);emit('pointerup',1,100,100);assert.deepEqual(clicks.map(e=>e.type),['click','click','dblclick']);detach();assert.equal(listeners.size,0);delete globalThis.MouseEvent;
});

 test('Android hold opens contextual comment actions without a selection, and movement cancels it',()=>{
 const timers=new Map();let serial=0;const originalSet=globalThis.setTimeout,originalClear=globalThis.clearTimeout;globalThis.setTimeout=fn=>{const id=++serial;timers.set(id,()=>{timers.delete(id);fn();});return id;};globalThis.clearTimeout=id=>timers.delete(id);globalThis.MouseEvent=class{constructor(type,init){Object.assign(this,{type},init);}};
 try{const touch=require('../../android-app/web/touch.js'),listeners=new Map(),events=[];const camera=new (require('../../extension/owned-canvas.js').Camera)(400,600),node={classList:{contains:()=>false},addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n),getBoundingClientRect:()=>({left:0,top:0}),dispatchEvent:e=>events.push(e)};const detach=touch.attach({canvas:node,viewport:{camera},requestDraw(){}});const emit=(type,x,y)=>listeners.get(type)({type,pointerType:'touch',pointerId:1,clientX:x,clientY:y,preventDefault(){},stopImmediatePropagation(){}});
 emit('pointerdown',20,30);[...timers.values()][0]();emit('pointerup',20,30);assert.deepEqual(events.map(e=>[e.type,e.clientX,e.clientY]),[['contextmenu',20,30]]);
 emit('pointerdown',20,30);emit('pointermove',50,30);assert.equal(timers.size,0);emit('pointerup',50,30);assert.equal(events.length,1);emit('pointerdown',20,30);detach();assert.equal(timers.size,0);
 }finally{globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;delete globalThis.MouseEvent;}
 });


test('touch net chooser intercepts taps without double selection, dragging or holding',()=>{
 globalThis.MouseEvent=class{constructor(type,init){Object.assign(this,{type},init);}};
 const touch=require('../../android-app/web/touch.js'),listeners=new Map(),events=[],picks=[];
 const camera=new (require('../../extension/owned-canvas.js').Camera)(400,600);
 const node={classList:{contains:()=>false},addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n),getBoundingClientRect:()=>({left:0,top:0}),dispatchEvent:e=>events.push(e)};
 const detach=touch.attach({canvas:node,viewport:{camera},requestDraw(){},touchNetPick:e=>{picks.push([e.clientX,e.clientY]);return true;}});
 const emit=(type,x,y)=>listeners.get(type)({type,pointerType:'touch',pointerId:1,clientX:x,clientY:y,preventDefault(){},stopImmediatePropagation(){}});
 emit('pointerdown',20,30);emit('pointerup',20,30);assert.deepEqual(picks,[[20,30]]);assert.equal(events.length,0);
 emit('pointerdown',20,30);emit('pointermove',60,30);emit('pointerup',60,30);assert.equal(picks.length,1);
 emit('pointerdown',20,30);emit('pointercancel',20,30);assert.equal(picks.length,1);detach();delete globalThis.MouseEvent;
});
