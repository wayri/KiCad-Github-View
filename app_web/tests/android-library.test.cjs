const {test}=require('node:test');const assert=require('node:assert/strict');
const {metadata,filter,recent,availability,bridge}=require('../../android-app/web/project-library.js');
test('recent projects use persisted open time, not stars or modification time',()=>{
 const items=[{id:'a',lastOpened:2,updated:100,starred:true},{id:'b',lastOpened:3,updated:1},{id:'c',updated:200},{id:'d',lastOpened:1}];
 assert.deepEqual(recent(items,2).map(x=>x.id),['b','a']);assert.equal(items[0].id,'a');
});
test('source indicators distinguish online copies and local projects without saved files',()=>{
 assert.equal(availability({provider:'github',offline:false}),'Online');
 assert.equal(availability({provider:'gitlab',offline:true}),'Online · available offline');
 assert.equal(availability({provider:'local',offline:true}),'Offline only');
 assert.match(availability({provider:'local',offline:false}),/reopen file/);
});
test('library metadata contains only bookmark identity, never source or credentials',()=>{
 const meta=metadata({id:'abc',github:{repository:'wayri/Marble',sha:'a'.repeat(40)},files:[{path:'design/main.kicad_pro',content:'secret source'}],token:'secret'});
 assert.equal(meta.provider,'github');assert.equal(meta.host,'https://github.com');assert.equal(meta.name,'wayri/Marble');assert(!JSON.stringify(meta).includes('secret'));
 assert.throws(()=>metadata(null),/Open a project/);
});
test('library collections and search retain offline/starred membership and deterministic order',()=>{
 const items=[{name:'Board A',repository:'team/a',host:'https://gitlab.com',updated:2,offline:true,starred:false},{name:'Board B',updated:1,offline:false,starred:true},{name:'Board C',updated:3,offline:true,starred:true}];
 assert.deepEqual(filter(items,'starred','').map(x=>x.name),['Board C','Board B']);
 assert.deepEqual(filter(items,'offline','').map(x=>x.name),['Board C','Board A']);
 assert.equal(filter(items,'all','TEAM/A')[0].name,'Board A');assert.equal(items[0].name,'Board A');
});
test('library bridge correlates replies, rejects errors, and fails without native storage',async()=>{
 let request;const timers=new Map();let next=0;const api=bridge(()=>({libraryRequest:(id,message)=>request={id,message}}),fn=>{timers.set(++next,fn);return next;},id=>timers.delete(id));
 const save=api.request({action:'save',offline:true});api.reply(999,{ok:true,result:{}});api.reply(request.id,{ok:true,result:{items:[]}});assert.deepEqual(await save,{items:[]});assert.equal(timers.size,0);
 const bad=api.request({action:'open',id:'abc'});api.reply(request.id,{ok:false,error:'Copy unavailable'});await assert.rejects(bad,/Copy unavailable/);
 await assert.rejects(bridge(()=>null).request({action:'list'}),/updated Android/);
});
test('temporary library metadata and source indicators never imply permanent offline storage',()=>{
 const expiresAt=Date.now()+3600000,meta=metadata({temporary:true,diskBacked:true,offline:true,libraryId:'a'.repeat(64),expiresAt,github:{repository:'wayri/Marble',sha:'a'.repeat(40)},files:[{path:'board.kicad_pcb'}]});
 assert.equal(meta.temporary,true);assert.equal(meta.expiresAt,expiresAt);assert.equal(meta.provider,'github');assert.match(availability(meta),/^Temporary · expires/);assert.equal(availability({...meta,expiresAt:Date.now()-1}),'Temporary · expired');
});
const {projectName,sourceLabel,lastAccess}=require('../../android-app/web/project-library.js');
test('project names prefer folder labels and recover generic local labels from KiCad files',()=>{
 assert.equal(projectName({name:'Local project',files:[{path:'Subsheets/power.kicad_sch'},{path:'design/Marble.kicad_pro'}]}),'Marble');
 assert.equal(projectName({name:'Controller',files:[{path:'board.kicad_pcb'}]}),'Controller');
 assert.equal(metadata({name:'Local project',files:[{path:'design/main.kicad_pcb'}]}).name,'main');
 assert.equal(projectName({github:{repository:'team/board'},files:[]}), 'team/board');
});
test('recent metadata labels provider and last access separately from project title',()=>{
 assert.equal(sourceLabel({provider:'github'}),'GitHub');assert.equal(sourceLabel({provider:'gitlab'}),'GitLab');assert.equal(sourceLabel({provider:'local'}),'Local project');
 assert.match(lastAccess({lastOpened:Date.UTC(2026,9,10,12,30)}),/^Last opened /);assert.equal(lastAccess({}),'');
 const expired={id:'temp',name:'Marble',temporary:true,expiresAt:1,lastOpened:9,provider:'github',offline:false};
 assert.deepEqual(recent([expired]),[expired]);assert.match(availability(expired),/expired/);
});
