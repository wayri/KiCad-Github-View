const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {create}=require('../github-project-buffer.js'),{create:createView}=require('../github-project-view.js'),data=require('../browser-data.js'),paths=require('../parsing.js');
global.KiCadGitHubSessionReader=require('../github-session-reader.js');
test('owned viewer asset dispatch preserves literal hash filenames and rejects encoded or query paths',async()=>{
 const calls=[],sha='a'.repeat(40),view=createView({buffer:{asset:async(...args)=>{calls.push(args);return{base64:'AAEC'};}},data,paths});
 const file='local/part/IC#PBF.STEP',result=await view.read({type:'repo-asset',repository:'owner/project',ref:sha,file});
 assert.equal(result.mediaType,'model/step');assert.equal(calls[0][2],file);
 for(const path of ['local/part/IC%23PBF.STEP','local/part/IC?other.STEP','../IC#PBF.STEP'])await assert.rejects(view.read({type:'repo-asset',repository:'owner/project',ref:sha,file:path}),/Invalid/);
 assert.equal(calls.length,1);
});
test('repository-root boards discover shared models without crawling unrelated source and output folders',async()=>{
 const repo='owner/project',sha='a'.repeat(40),reads=[];
 const api=create({foregroundOnly:true,readSession:async(repository,ref,action,path)=>{
  reads.push(path);assert.equal(repository,repo);assert.equal(ref,sha);
  return {sha,items:path===''?[{path:'board.kicad_pcb',type:'file'},{path:'packages3D',type:'directory'},{path:'root.step',type:'file'},...Array.from({length:70},(_,i)=>({path:'unrelated'+i,type:'directory'}))]:[{path:'packages3D/IC#PBF.step',type:'file'}]};
 }});
 const result=await createView({buffer:api,data,paths}).read({type:'repo-model-index',repository:repo,ref:sha,file:'board.kicad_pcb'});
 assert.deepEqual(reads,['','packages3D']);assert.deepEqual(result.paths.sort(),['packages3D/IC#PBF.step','root.step']);assert.ok(!result.warnings.some(w=>/incomplete/.test(w)));api.dispose();
});
const fixture=JSON.parse(fs.readFileSync(require.resolve('./fixtures/github-model-discovery/olimex-m2-index.json'),'utf8')),folder=fixture.boardPath.split('/').slice(0,-1).join('/');
function setup({missing,extra=[]}={}){const reads=[],all=[fixture.boardPath,...fixture.paths,...extra],api=create({readSession:async(repo,ref,action,path)=>{reads.push({repo,ref,action,path});assert.equal(repo,fixture.repository);assert.equal(ref,fixture.sha);if(path===missing)throw Error('Website folder access unavailable');const entries=new Map(),prefix=path?path+'/':'';for(const file of all){if(!file.startsWith(prefix))continue;const rest=file.slice(prefix.length),head=rest.split('/')[0];if(!head)continue;entries.set(prefix+head,{path:prefix+head,type:rest.includes('/')?'directory':'file'});}return{sha:fixture.sha,items:[...entries.values()]};},fetch:async()=>{throw Error('No API, tokens or anonymous source requests required for scoped metadata');}});return {api,reads,view:createView({buffer:api,data,paths})};}

test('real Olimex M2 model paths are discovered directly under the selected board without enumerating historical revisions',async()=>{const h=setup({extra:Array.from({length:70},(_,i)=>'historical'+i+'/design/model.step')}),result=await h.view.read({type:'repo-model-index',repository:fixture.repository,ref:fixture.sha,file:fixture.boardPath});assert.deepEqual(result.paths.sort(),fixture.paths.slice().sort());assert.equal(result.scopeDirectory,folder);assert.equal(result.snapshotRef,fixture.sha);assert.ok(h.reads.every(r=>r.path===folder||r.path.startsWith(folder+'/')||r.path===''||r.path==='HARDWARE'));assert.equal(h.reads.length,4);assert.ok(result.warnings.some(w=>w.includes('selected board folder')));h.api.dispose();});

test('an incomplete whole-repository inventory cannot erase a complete separately scoped model index',async()=>{const h=setup({extra:Array.from({length:70},(_,i)=>'historical'+i+'/design/model.step')});const whole=await h.api.inventory(fixture.repository,fixture.sha);assert.ok(whole.warnings.some(w=>/incomplete/.test(w)));const result=await h.view.read({type:'repo-model-index',repository:fixture.repository,ref:fixture.sha,file:fixture.boardPath});assert.equal(result.paths.length,fixture.paths.length);assert.equal(result.scopeDirectory,folder);assert.ok(!result.warnings.some(w=>/incomplete/.test(w)));h.api.dispose();});

test('scoped incomplete discovery still disables unsafe library recovery rather than pretending complete',async()=>{const h=setup({missing:folder+'/packages3D'}),result=await h.view.read({type:'repo-model-index',repository:fixture.repository,ref:fixture.sha,file:fixture.boardPath});assert.deepEqual(result.paths,[]);assert.ok(result.warnings.some(w=>/incomplete/.test(w)));assert.ok(result.warnings.some(w=>/Library model matching is disabled/.test(w)));h.api.dispose();});

test('model discovery rejects source traversal, non-PCB files and unpinned revisions before metadata reads',async()=>{const h=setup();for(const patch of [{file:'../secret.kicad_pcb'},{file:'root.kicad_sch'},{file:'https://evil.test/file.kicad_pcb'},{ref:'main'}])await assert.rejects(h.view.read({type:'repo-model-index',repository:fixture.repository,ref:fixture.sha,file:fixture.boardPath,...patch}),/Invalid|Model discovery/);assert.equal(h.reads.length,0);h.api.dispose();});

test('explicit saved model assets outside the discovery folder remain exact pinned reads with the existing8MiB ceiling',async()=>{const calls=[],assetPath='shared/models/body.step',view=createView({buffer:{asset:async(...args)=>{calls.push(args);return{base64:'SU8='};}},data,paths});const result=await view.read({type:'repo-asset',repository:fixture.repository,ref:fixture.sha,file:assetPath});assert.equal(result.mediaType,'model/step');assert.equal(calls[0][2],assetPath);assert.equal(calls[0][3],8*1024*1024);for(const file of ['../shared/body.step','https://evil.test/body.step','models/body.svg','models/body.step?token=private'])await assert.rejects(view.read({type:'repo-asset',repository:fixture.repository,ref:fixture.sha,file}),/Invalid/);assert.equal(calls.length,1);});


test('cancelled scoped model discovery cannot publish a late metadata cache result',async()=>{
 let release;const api=create({readSession:()=>new Promise(resolve=>release=resolve),fetch:async()=>{throw Error('No outside request');}}),controller=new AbortController(),pending=api.modelInventory(fixture.repository,fixture.sha,fixture.boardPath,controller.signal);await new Promise(resolve=>setImmediate(resolve));controller.abort();await assert.rejects(pending,/cancelled/);release({sha:fixture.sha,items:[]});await new Promise(resolve=>setImmediate(resolve));assert.equal(api.stats().entries,0);api.dispose();
});


test('adjacent shared model folders remain discoverable without crawling unrelated project directories',async()=>{
 const h=setup({extra:['HARDWARE/models/shared.step','models/root.wrl','unrelated/other.kicad_pcb','unrelated/packages3D/foreign.step']}),result=await h.view.read({type:'repo-model-index',repository:fixture.repository,ref:fixture.sha,file:fixture.boardPath});assert.ok(result.paths.includes('HARDWARE/models/shared.step'));assert.ok(result.paths.includes('models/root.wrl'));assert.ok(!result.paths.includes('unrelated/packages3D/foreign.step'));assert.ok(h.reads.every(read=>!read.path.startsWith('unrelated')));h.api.dispose();
});
