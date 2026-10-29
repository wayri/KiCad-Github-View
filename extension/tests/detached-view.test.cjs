const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const D=require('../detached-view.js'),session='12345678-1234-1234-1234-123456789012',sha='a'.repeat(40);
test('detached drawing discovery prefers saved matching project stem but preserves ambiguous choices',()=>{
 const files=['a/main.kicad_pcb','b/main.kicad_pcb','a/main.kicad_sch','../bad.kicad_pcb'];
 assert.deepEqual(D.candidates('layout','a/main.kicad_sch',files),['a/main.kicad_pcb']);
 assert.deepEqual(D.candidates('3d','a/main.kicad_pcb',files),['a/main.kicad_pcb']);
 assert.deepEqual(D.candidates('layout','unrelated.kicad_sch',files),['a/main.kicad_pcb','b/main.kicad_pcb']);
 assert.deepEqual(D.candidates('simulation','a/main.kicad_pcb',files),[]);
});
test('detached viewer preserves immutable provider and revision scope with random session',()=>{
 const input={base:'chrome-extension://owned/browser-viewer.html',mode:'3d',file:'design/main.kicad_pcb',repository:'group/sub/repo',ref:sha,provider:'gitlab',host:'https://gitlab.example',session};
 const url=new URL(D.url(input));assert.equal(url.pathname,'/revision-viewer.html');assert.equal(url.searchParams.get('ref'),sha);assert.equal(url.searchParams.get('viewSession'),session);assert.equal(url.searchParams.get('initialView'),'3d');assert.equal(url.searchParams.get('host'),input.host);
 assert.throws(()=>D.url({...input,ref:'HEAD'}),/pinned revision/);assert.throws(()=>D.url({...input,file:'../private.kicad_pcb'}),/valid project/);assert.throws(()=>D.url({...input,session:'predictable'}),/random|pinned/);
 assert.equal(new URL(D.url({...input,allowLocal:true,ref:'local-snapshot'})).searchParams.get('ref'),'local-snapshot');
});
test('matching drawing opens synchronously from the explicit gesture without fetching inventory',()=>{
 let called=0,inventory=0,problem=null;const sandbox={URL,URLSearchParams,open:(target,name,features)=>{called++;assert.equal(target,'https://owned/view');assert.equal(name,'_blank');assert.match(features,/popup/);return {opener:{}};}};vm.runInNewContext(fs.readFileSync(require.resolve('../detached-view.js'),'utf8'),sandbox);
 sandbox.KiCadDetachedView.chooser({mode:'3d',current:'board.kicad_pcb',getEntries:()=>{inventory++;return[];},buildURL:()=> 'https://owned/view',onError:x=>problem=x});assert.equal(called,1);assert.equal(inventory,0);assert.equal(problem,null);
 sandbox.open=()=>null;sandbox.KiCadDetachedView.chooser({mode:'layout',current:'board.kicad_pcb',buildURL:()=> 'https://owned/view',onError:x=>problem=x});assert.match(problem,/blocked/);
});
