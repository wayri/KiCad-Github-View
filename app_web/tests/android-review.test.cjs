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
