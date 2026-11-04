const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=require('../../android-app/web/mobile-session-client.js'),comments=require('../../extension/review-comments.js'),local=require('../../extension/local-project.js');
const sha='c'.repeat(40),repository='owner/board',time='2026-11-04T00:00:00Z';
globalThis.crypto=require('node:crypto').webcrypto;
const storage=()=>{const map=new Map();return{getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};};
test('repository browser accepts only exact GitHub home addresses',()=>{
 assert.equal(core.repository('https://github.com/owner/board/'),repository);
 for(const value of ['https://github.com.evil/owner/board','https://github.com/owner/board?token=x','../board','owner/../board','https://user@github.com/owner/board','https://github.com/owner/board/issues/1'])assert.throws(()=>core.repository(value));
});
test('native bridge correlates replies and accepts imported project exactly once',async()=>{
 const sent=[],accepted=[],cleared=[],host={repositoryBrowserRequest:(id,text)=>sent.push([id,JSON.parse(text)]),acceptRepositoryBrowserRequest:id=>accepted.push(id)};
 const bridge=core.bridge(()=>host,{later:()=>1,clear:id=>cleared.push(id)});
 const result=bridge.request({action:'import',repository});bridge.reply(9,{ok:true,result:'foreign'});bridge.reply(sent[0][0],{ok:true,result:{project:{id:'sample'}}});bridge.reply(sent[0][0],{ok:true,result:{project:{id:'duplicate'}}});
 assert.equal((await result).project.id,'sample');assert.deepEqual(accepted,[sent[0][0]]);assert.equal(cleared.length,1);
});
test('discovery pins every nested read and exposes source/model inventory without API credentials',async()=>{
 const calls=[],context={repository,sha,ref:'main',directory:'design',items:[{path:'design/root.kicad_sch',type:'file'},{path:'design/sub',type:'directory'}]};
 const value=await core.discover(repository,async m=>{calls.push(m);if(m.action==='context')return context;assert.equal(m.ref,sha);return{sha,items:[{path:'design/sub/power.kicad_sch',type:'file'},{path:'design/sub/model.step',type:'file'}]};},{textFile:local.textFile});
 assert.equal(value.nodes.length,3);assert.equal(calls.length,2);assert.ok(calls.every(n=>!n.token&&!n.headers));
 await assert.rejects(core.discover(repository,async()=>({...context,repository:'foreign/project'}),{textFile:local.textFile}),/identity/);
 await assert.rejects(core.discover(repository,async m=>m.action==='context'?context:{sha,items:[{path:'outside/file.kicad_pcb',type:'file'}]},{textFile:local.textFile}),/escaped/);
});
test('website-session marker survives local project validation without granting other transports',()=>{
 const project=local.validate({id:'sample',github:{repository,sha,transport:'website-session'},files:[{path:'root.kicad_sch',content:'(kicad_sch)'}]});assert.equal(project.github.transport,'website-session');
 assert.equal(local.validate({...project,github:{repository,sha,transport:'arbitrary'}}).github.transport,undefined);
});
test('page adapter chunks UTF8 files, rejects cross-repo reads, and clears cancelled transfers',async()=>{
 const source=fs.readFileSync('android-app/web/mobile-session-page.js','utf8'),calls=[],context={URL,TextEncoder,AbortController,Date,Map,Set,Error,Number,module:{exports:{}},crypto:globalThis.crypto,btoa:s=>Buffer.from(s,'binary').toString('base64'),location:{href:'https://github.com/'+repository+'/tree/main/design'},KiCadGitHubSessionReader:{create:()=>({read:async m=>{calls.push(m);return m.action==='context'?{repository,sha}:{content:'µ'.repeat(300000),sha};}})},KiCadGitHubSessionReview:{create:()=>({dispatch:async()=>({})})}};context.globalThis=context;vm.runInNewContext(source,context);
 await context.KiCadMobileSessionPage.dispatch({type:'source',action:'context',repository,ref:'HEAD'});assert.equal(calls[0].path,'tree/main/design');
 const result=await context.KiCadMobileSessionPage.dispatch({type:'source',action:'file',repository,ref:sha,path:'root.kicad_sch'});assert.equal(result.transfer.bytes,600000);assert.ok(result.transfer.chunks>1);
 let base64='';for(let index=0;index<result.transfer.chunks;index++){const chunk=await context.KiCadMobileSessionPage.dispatch({type:'chunk',repository,id:result.transfer.id,index});base64+=chunk.base64;assert.equal(chunk.last,index===result.transfer.chunks-1);}assert.equal(Buffer.from(base64,'base64').toString('utf8'),'µ'.repeat(300000));
 await assert.rejects(context.KiCadMobileSessionPage.dispatch({type:'source',action:'file',repository:'other/repo',ref:sha,path:'x'}),/matching/);
 context.KiCadMobileSessionPage.cancel();await assert.rejects(context.KiCadMobileSessionPage.dispatch({type:'chunk',repository,id:result.transfer.id,index:0}),/expired/);
});
test('mobile session review reads markers through the shared bounded worker and never requests a token',async()=>{
 const note=comments.validateComment({id:'sample-note',text:'Check connector',severity:'major',state:'open',createdAt:time,updatedAt:time,anchor:{repository,ref:sha,file:'root.kicad_sch',position:{x:10,y:20},area:{x:8,y:18,width:4,height:4}}});
 const project=local.validate({id:'sample',github:{repository,sha,transport:'website-session'},files:[{path:'root.kicad_sch',content:'(kicad_sch)'}]}),calls=[];
 const thread={kind:'issue',number:1,url:'https://github.com/'+repository+'/issues/1',title:'Review',body:comments.toMarkdown(note),author:'author',createdAt:time,updatedAt:time,state:'open',account:'author',comments:[],capabilities:{create:true},warnings:[]};
 const adapter=core.remote(project,async operation=>{calls.push(operation);return operation.action==='list'?{account:'author',threads:[{kind:'issue',number:1}]}:thread;},comments,storage(),require('../../extension/github-website-reviews.js'));
 const result=await adapter.send({type:'github-annotations',repository,ref:sha,file:'root.kicad_sch',issueNumber:1});assert.equal(result.ok,true);assert.equal(result.result.notes.length,1);assert.equal(result.result.notes[0].anchor.position.x,10);assert.equal(result.result.notes[0].anchor.area.width,4);
 assert.ok(calls.every(n=>n.type==='review'&&!n.token&&!n.headers));
 assert.equal((await adapter.send({type:'github-thread-read',kind:'issue',number:1,repository:'foreign/project',ref:sha,file:'root.kicad_sch'})).ok,false);
 assert.equal((await adapter.send({type:'chat-thread-state',repository,ref:sha,file:'root.kicad_sch'})).ok,false);
});
test('mobile website transport rejects new threads and attachments before any provider request',async()=>{
 const project=local.validate({id:'sample',github:{repository,sha},files:[{path:'root.kicad_sch',content:'(kicad_sch)'}]}),calls=[];
 const adapter=core.remote(project,async m=>calls.push(m),comments,storage(),require('../../extension/github-website-reviews.js'));
 const note=comments.validateComment({id:'sample-note',text:'Check',severity:'info',state:'open',createdAt:time,updatedAt:time,anchor:{repository,ref:sha,file:'root.kicad_sch'}});
 const result=await adapter.send({type:'github-publish-comment',comment:note,destination:'new-issue',confirmedSend:true});assert.equal(result.ok,false);assert.match(result.error,/existing/);assert.equal(calls.length,0);
});
