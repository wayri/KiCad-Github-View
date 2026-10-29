const test=require('node:test'),assert=require('node:assert/strict');
const {create,primitives}=require('../draftsman-mechanical.js');
function fixture(fail=false){const calls=[],hosts=[],document={body:{append(host){hosts.push(host);}},createElement(){return{style:{},setAttribute(){},remove(){this.removed=true;}};}};
 const service=create({document,source:{repository:'owner/project',ref:'a'.repeat(40)},request:async(type,args)=>{calls.push({type,args});return type==='repo-model-index'?{paths:['body.step'],warnings:[]}: {base64:'AAAA'};},loadEngine:async()=>({mountBoard3D(host,source,options){calls.push({source,options});return{captureMechanicalView:async projection=>{if(fail)throw Error('GPU unavailable');return{image:'data:image/png;base64,iVBORw0KGgo=',bounds:{x:0,y:0,width:10,height:10},projection,warnings:[]};},dispose(){calls.push('disposed');}};}})});return{service,calls,hosts};}
test('mechanical source filtering drops every copper layer, pads, vias and zones while retaining mounting drills',()=>{
 const items=[{type:'line',layer:'F.Cu'},{type:'line',layer:'In1.Cu'},{type:'polygon',layer:'B.Cu'},
 {type:'pad',layer:'F.Fab'},{type:'via'},{type:'zone'},{type:'line',layer:'F.Mask'},
 {type:'line',layer:'Edge.Cuts'},{type:'text',layer:'F.Fab'},{type:'circle',layer:'F.Cu',hole:true,kind:'drill'},
 {type:'line',layer:'Dwgs.User'},{type:'line',layer:'F.Fab',hidden:true}];
 assert.deepEqual(primitives(items),items.slice(7,11));
});
test('mechanical capture uses the mechanical-only renderer, reuses assets and disposes its GPU scene',async()=>{
 const {service,calls,hosts}=fixture(),file={path:'board.kicad_pcb',content:'(kicad_pcb)'};
 const [first,second]=await Promise.all([service.capture(file,'top'),service.capture(file,'top')]);
 assert.equal(first,second);const mount=calls.find(x=>x.options);assert.equal(mount.options.mechanical,true);assert.equal(mount.options.dark,false);assert.equal(mount.options.lighting,'universal');assert.equal(mount.options.boardPath,file.path);
 assert.deepEqual(mount.options.assetPaths,['body.step']);assert.equal(calls.filter(x=>x==='disposed').length,1);assert.equal(hosts.length,1);assert.equal(hosts[0].removed,true);
 await mount.options.loadAsset('body.step');assert.equal(calls.at(-1).type,'repo-asset');assert.equal(calls.at(-1).args.ref,'a'.repeat(40));
 service.dispose();await assert.rejects(service.capture(file),/closed/);
});
test('failed captures remove their host and leave no successful cache entry',async()=>{
 const {service,calls,hosts}=fixture(true),file={path:'board.kicad_pcb',content:'(kicad_pcb)'};
 await assert.rejects(service.capture(file),/GPU unavailable/);await assert.rejects(service.capture(file),/GPU unavailable/);
 assert.equal(hosts.length,2);assert.ok(hosts.every(host=>host.removed));assert.equal(calls.filter(x=>x==='disposed').length,2);service.dispose();
});
