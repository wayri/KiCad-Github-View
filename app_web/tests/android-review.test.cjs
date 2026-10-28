const test=require('node:test'),assert=require('node:assert/strict');
globalThis.crypto=require('node:crypto').webcrypto;
const comments=require('../../extension/review-comments.js'),local=require('../../android-app/web/local-project.js'),{create}=require('../../android-app/web/remote-review.js');
const store=()=>{const data=new Map();return{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};};
const sha='c'.repeat(40),time='2026-10-06T00:00:00Z';
const project=(gitlab=false)=>local.validate({id:gitlab?'lab':'hub',...(gitlab?{remote:{provider:'gitlab',host:'https://gitlab.example',repository:'group/sub/board',sha}}:{github:{repository:'owner/board',sha}}),files:[{path:'design/board.kicad_sch',content:'(kicad_sch)'}]});
const note=(gitlab=false)=>comments.validateComment({id:'note',text:'Check connector\nPlease verify pin one.',severity:'major',state:'open',createdAt:time,updatedAt:time,anchor:{...(gitlab?{provider:'gitlab',host:'https://gitlab.example'}:{}),repository:gitlab?'group/sub/board':'owner/board',ref:sha,file:'design/board.kicad_sch'}});
test('Native review adapter publishes formatted notes once and validates receipts',async()=>{
 const sent=[],storage=store(),api=create(project(),async message=>{sent.push(message);return{remoteRef:{repository:'owner/board',kind:'issue',number:7,publishedAt:time,url:'https://github.com/owner/board/issues/7'}};},comments,storage);
 const request={type:'github-publish-comment',comment:note(),destination:'new-issue'};
 const results=await Promise.all([api.send(request),api.send(request)]);assert.ok(results.every(r=>r.ok));assert.equal(sent.length,1);assert.equal(sent[0].type,'review-publish');assert.match(sent[0].body,/Severity/);assert.match(sent[0].body,/kicad-review:v1/);assert.equal(sent[0].title,'Check connector');assert.match(sent[0].operationId,/^[a-f0-9]{64}$/);
 assert.equal((await api.send(request)).ok,true);assert.equal(sent.length,1);
});
test('GitLab reviews stay bound to host, source revision and existing issue conversations',async()=>{
 const sent=[],api=create(project(true),async m=>{sent.push(m);return{number:3,url:'https://gitlab.example/group/sub/board/-/issues/3'};},comments,store());
 const result=await api.send({type:'comment-publish',comment:note(true),destination:'issue',discussion:true,number:3});assert.equal(result.ok,true);assert.equal(sent[0].type,'publish');assert.equal(sent[0].destination,'discussion');assert.equal(sent[0].host,'https://gitlab.example');assert.equal(result.result.remoteRef.provider,'gitlab');
 assert.equal((await api.send({type:'comment-policy-status',host:'https://evil.test'})).ok,false);
 assert.equal((await api.send({type:'comment-publish',comment:{...note(true),anchor:{...note(true).anchor,ref:'d'.repeat(40)}}})).ok,false);assert.equal(sent.length,1);
});
test('Screenshot failure prevents posting; expiry is propagated for native-source purge',async()=>{
 const sent=[],api=create(project(),async m=>{sent.push(m);throw Object.assign(Error('Expired'),{authExpired:true});},comments,store());
 const value={...note(),capture:{mime:'image/png',dataUrl:'data:image/png;base64,iVBORw0KGgo=',width:1,height:1}};
 const result=await api.send({type:'github-publish-comment',comment:value});assert.equal(result.ok,false);assert.equal(result.authExpired,true);assert.deepEqual(sent.map(m=>m.type),['review-upload']);
});
test('Remote annotation readback includes matching thread replies and excludes foreign revisions',async()=>{
 const current=note(),other={...note(),id:'other',anchor:{...note().anchor,ref:'d'.repeat(40)}};
 const api=create(project(),async m=>{assert.equal(m.type,'review-thread');return{kind:'issue',number:4,title:'Thread',state:'open',author:'reviewer',url:'https://github.com/owner/board/issues/4',body:comments.toMarkdown(other),createdAt:time,updatedAt:time,comments:[{id:'8',author:'reviewer',body:comments.toMarkdown(current),url:'https://github.com/owner/board/issues/4#issuecomment-8',createdAt:time,updatedAt:time}],warnings:[]};},comments,store());
 const result=await api.send({type:'github-annotations',repository:'owner/board',file:current.anchor.file,ref:sha,issueNumber:4});assert.equal(result.ok,true);assert.equal(result.result.notes.length,1);assert.equal(result.result.notes[0].github.number,4);
});
test('GitLab local notes cannot leak across identical paths on different hosts',async()=>{
 const source=project(true),api=local.transport(source,store()),value=note(true);
 assert.equal((await api.send({type:'comment-save',comment:value,provider:'gitlab',host:source.remote.host})).ok,true);
 assert.equal((await api.send({type:'comment-list',file:value.anchor.file,provider:'gitlab',host:'https://other.example'})).ok,false);
 assert.equal((await api.send({type:'comment-save',comment:{...value,anchor:{...value.anchor,host:'https://other.example'}}})).ok,false);
});

test('Commit comparison snapshots pin refs, deduplicate downloads and reject stale imports',async()=>{
 const original=project(),snapshots=require('../../android-app/web/revision-snapshots.js');let active=original,calls=0;
 const cache=snapshots.create(original,()=>active,async request=>{calls++;return{repository:'owner/board',sha:request.ref,project:{id:'revision',files:original.files,assets:[]}};},local.validate);
 const ref='d'.repeat(40),loaded=await Promise.all([cache.get(ref),cache.get(ref)]);assert.equal(calls,1);assert.equal(loaded[0].github.sha,ref);assert.strictEqual(loaded[0],loaded[1]);
 await assert.rejects(cache.get('main'),/immutable/);active=null;await assert.rejects(cache.get(ref),/active project changed/);
 let release;active=original;const interrupted=snapshots.create(original,()=>active,()=>new Promise(r=>release=r),local.validate);const request=interrupted.get(ref);active=null;release({repository:'owner/board',sha:ref,project:{files:original.files}});await assert.rejects(request,/active project changed/);
});

test('native chat bridge maps actions without colliding with provider dispatch and passes read capabilities',async()=>{
 const sent=[],api=create(project(),async request=>{sent.push(request);return{messageId:'7'};},comments,store());
 const message={type:'chat-message-write',repository:'owner/board',ref:sha,file:'design/board.kicad_sch',thread:{kind:'issue',number:42},action:'reply',body:'Plain reply',replyTo:'6',clientMutationId:'chat_mutation_123456789'};
 assert.equal((await api.send(message)).ok,true);assert.equal(sent[0].type,'chat-message-write');assert.equal(sent[0].messageAction,'reply');assert.equal(sent[0].action,undefined);assert.equal(sent[0].replyTo,'6');
 await api.send({type:'github-thread-read',repository:'owner/board',ref:sha,file:message.file,kind:'issue',number:42,includeCapabilities:true});assert.equal(sent[1].type,'review-thread');assert.equal(sent[1].includeCapabilities,true);assert.equal(sent[1].ref,sha);
 const before=sent.length;for(const mutation of [{ref:'d'.repeat(40)},{file:'other.kicad_sch'},{repository:'other/repo'},{thread:{kind:'pull',number:42}},{clientMutationId:'tiny'}])assert.equal((await api.send({...message,...mutation})).ok,false);assert.equal(sent.length,before);
});
test('native chat annotations bind original text and rendered marker to the same source scope',async()=>{
 const sent=[],api=create(project(),async request=>{sent.push(request);return{messageId:'7'};},comments,store()),id='chat_annotation_123456789';
 const annotation=comments.validateComment({...note(),id,threadType:'issue'}),message={type:'chat-message-write',repository:'owner/board',ref:sha,file:annotation.anchor.file,thread:{kind:'issue',number:42},action:'create',body:annotation.text,clientMutationId:id,annotation};
 assert.equal((await api.send(message)).ok,true);assert.equal(sent[0].body,annotation.text);assert.match(sent[0].renderedBody,/<!-- kicad-review:v1 /);assert.equal(comments.fromMarkdown(sent[0].renderedBody)[0].id,id);
 assert.equal((await api.send({...message,body:'Different message'})).ok,false);assert.equal((await api.send({...message,action:'edit',messageId:'7',expectedUpdatedAt:time})).ok,false);assert.equal(sent.length,1);
});
test('native chat discovery normalizes null cursor and rejects foreign scope or wrong provider pagination',async()=>{
 const sent=[],api=create(project(),async request=>{sent.push(request);return{threads:[],hasMore:false};},comments,store());
 const message={type:'chat-thread-list',repository:'owner/board',ref:sha,file:'design/board.kicad_sch',kind:'issue',page:1,cursor:null};assert.equal((await api.send(message)).ok,true);assert.equal(sent[0].cursor,undefined);assert.equal(sent[0].type,'chat-thread-list');
 for(const mutation of [{page:6},{cursor:'next'},{ref:'main'},{kind:'pull'}])assert.equal((await api.send({...message,...mutation})).ok,false);assert.equal(sent.length,1);
});
test('GitLab chat refreshes authentication before scoped transport and aborts on failed preflight',async()=>{
 const sent=[],api=create(project(true),async request=>{sent.push(request);return{connected:true};},comments,store());
 const scope={repository:'group/sub/board',ref:sha,file:'design/board.kicad_sch'};
 const write={type:'chat-message-write',...scope,thread:{kind:'issue',number:42},action:'create',body:'Plain message',clientMutationId:'native_auth_test_00001'};
 for(const message of [{type:'chat-thread-list',...scope,kind:'issue'},{type:'github-thread-read',...scope,kind:'issue',number:42,includeCapabilities:true},write])assert.equal((await api.send(message)).ok,true);
 assert.deepEqual(sent.map(m=>m.type),['auth-status','chat-thread-list','auth-status','thread','auth-status','chat-message-write']);
 const failed=[],blocked=create(project(true),async request=>{failed.push(request.type);throw Error('Sign-in refresh failed');},comments,store());
 assert.equal((await blocked.send(write)).ok,false);assert.deepEqual(failed,['auth-status']);
 const capture={mime:'image/png',dataUrl:'data:image/png;base64,iVBORw0KGgo=',width:1,height:1},annotation={...note(true),id:write.clientMutationId,text:write.body,threadType:'issue',capture};
 const upload=[],withCapture=create(project(true),async request=>{upload.push(request.type);if(request.type==='upload')throw Error('Synthetic upload stop');return{connected:true};},comments,store());
 assert.equal((await withCapture.send({...write,annotation})).ok,false);assert.deepEqual(upload,['auth-status','upload']);
});
for(const provider of ['github','gitlab'])test('Android trusted runtime routes '+provider+' chat discovery and writes through the remote adapter',async()=>{
 const requests=[],info={repository:provider==='github'?'owner/board':'team/sub/board',sha,...(provider==='gitlab'?{provider,host:'https://gitlab.example'}:{})},p={id:'chat-runtime',...(provider==='gitlab'?{remote:info}:{github:info}),files:project().files},top={KiCadAndroidProject:p,KiCadAndroid:{ensureSnapshots(){}},KiCadAndroidRevisionCache:{get:async()=>p},KiCadReviewComments:comments,KiCadAndroidGitHub:{request(){}},KiCadAndroidGitLab:{request(){}}};
 const context={AbortController,URL,URLSearchParams,location:{search:'?ref='+sha,href:'https://appassets.androidplatform.net/assets/viewer/pcb-viewer.html'},top,localStorage:store(),document:{addEventListener(){}},KiCadAndroidLocal:{transport:()=>({send(){throw Error('Chat must not enter local file transport');}})},KiCadAndroidRemote:{create:()=>({send:async message=>{requests.push(message);return{ok:true,result:{accepted:true}};}})}};context.window=context;
 require('node:vm').runInNewContext(require('node:fs').readFileSync('android-app/web/runtime.js','utf8'),context);
 for(const type of ['chat-thread-list','chat-message-write'])assert.equal((await context.chrome.runtime.sendMessage({type,repository:info.repository,ref:sha,file:p.files[0].path,...(provider==='gitlab'?{provider,host:info.host}:{})})).ok,true);
 assert.equal(requests.length,2);assert.equal((await context.chrome.runtime.sendMessage({type:'chat-message-write',repository:'foreign/project',ref:sha,file:p.files[0].path})).ok,false);assert.equal(requests.length,2);
});

test('thread state adapter requires exact saved source, explicit confirmation, supported kind and passes no credentials',async()=>{
 for(const lab of [false,true]){
  const sent=[],api=create(project(lab),async message=>{sent.push(message);return{state:message.state};},comments,store()),request={type:'chat-thread-state',repository:lab?'group/sub/board':'owner/board',ref:sha,file:'design/board.kicad_sch',thread:{kind:'issue',number:42,title:'Not sent'},state:'closed',expectedUpdatedAt:time,confirmed:true};
  for(const override of [{confirmed:false},{state:'delete'},{ref:'main'},{file:'other.kicad_sch'},{host:'https://foreign.example'},...(lab?[{thread:{kind:'discussion',number:42}}]:[])])assert.equal((await api.send({...request,...override})).ok,false);
  assert.equal(sent.length,0);assert.equal((await api.send(request)).ok,true);const write=sent.find(row=>row.type==='chat-thread-state');assert.deepEqual(write.thread,{kind:'issue',number:42});assert.equal(write.ref,sha);assert.equal(write.confirmed,true);assert.equal(write.expectedUpdatedAt,time);assert.equal(write.body,undefined);if(lab)assert.equal(sent[0].type,'auth-status');
 }
});
