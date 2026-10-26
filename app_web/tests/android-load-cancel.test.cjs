const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {create}=require('../../android-app/web/revision-snapshots.js');
const {bridge}=require('../../android-app/web/github.js');
const base='a'.repeat(40),next='b'.repeat(40),third='c'.repeat(40);
function fixture(){
 const project={id:'initial',github:{repository:'team/board',sha:base},files:[],assets:[]},requests=[];
 const request=(message,{signal}={})=>new Promise((resolve,reject)=>{const job={message,signal,resolve,reject};requests.push(job);signal?.addEventListener('abort',()=>reject(Object.assign(Error('stopped'),{name:'AbortError'})),{once:true});});
 const cache=create(project,()=>project,request,value=>value);
 const finish=job=>job.resolve({repository:'team/board',sha:job.message.ref,project:{id:job.message.ref,files:[],assets:[]}});
 return{project,cache,requests,finish};
}
test('cancelling one revision subscriber retains other consumers of the same native read',async()=>{
 const f=fixture(),first=new AbortController(),second=new AbortController();
 const a=f.cache.get(next,{signal:first.signal}),b=f.cache.get(next,{signal:second.signal});assert.equal(f.requests.length,1);
 const rejected=assert.rejects(a,error=>error.name==='AbortError');first.abort();await rejected;assert.equal(f.requests[0].signal.aborted,false);
 f.finish(f.requests[0]);assert.equal((await b).id,next);assert.equal((await f.cache.get(next)).id,next);assert.equal(f.requests.length,1);
});
test('last cancelled subscriber aborts its native read and a later retry gets a fresh request',async()=>{
 const f=fixture(),stop=new AbortController(),job=f.cache.get(next,{signal:stop.signal}),rejected=assert.rejects(job,error=>error.name==='AbortError');stop.abort();await rejected;assert.equal(f.requests[0].signal.aborted,true);
 const retry=f.cache.get(next);assert.equal(f.requests.length,2);f.finish(f.requests[1]);assert.equal((await retry).id,next);
});
test('a non-loader snapshot consumer prevents another load from cancelling its shared request',async()=>{
 const f=fixture(),stop=new AbortController(),keep=f.cache.get(next),loading=f.cache.get(next,{signal:stop.signal}),rejected=assert.rejects(loading,error=>error.name==='AbortError');stop.abort();await rejected;assert.equal(f.requests[0].signal.aborted,false);f.finish(f.requests[0]);await keep;
});
test('Android child load IDs cancel only their source subscribers, including cached sources',async()=>{
 const f=fixture(),top={KiCadAndroidProject:f.project,KiCadAndroid:{ensureSnapshots(){}},KiCadAndroidRevisionCache:f.cache};
 const context={AbortController,URL,URLSearchParams,location:{search:'?ref='+base,href:'https://appassets.androidplatform.net/assets/viewer/browser-viewer.html'},top,localStorage:{},document:{addEventListener(){}},KiCadAndroidLocal:{transport:snapshot=>({send:async()=>({ok:true,result:{id:snapshot.id}})})}};context.window=context;
 vm.runInNewContext(fs.readFileSync('android-app/web/runtime.js','utf8'),context);const send=context.chrome.runtime.sendMessage;
 const first=send({type:'project',ref:next,loadId:'first'}),second=send({type:'project-file',ref:next,loadId:'second'});
 await send({type:'load-cancel',loadId:'first'});assert.equal(f.requests[0].signal.aborted,false);f.finish(f.requests[0]);assert.equal((await first).cancelled,true);assert.equal((await second).ok,true);
 const stopped=send({type:'revision',ref:third,loadId:'last'});await send({type:'load-cancel',loadId:'last'});assert.equal((await stopped).cancelled,true);assert.equal(f.requests[1].signal.aborted,true);
 await send({type:'load-cancel',loadId:'cached'});assert.equal((await send({type:'project-inventory',ref:base,loadId:'cached'})).cancelled,true);assert.equal(f.requests.length,2);
 assert.equal((await send({type:'project-inventory',ref:base,loadId:'fresh'})).ok,true);
});
test('an AbortSignal reaches the exact native bridge request without cancelling a concurrent read',async()=>{
 const sent=[],cancelled=[],api=bridge(()=>({githubRequest:(id,message)=>sent.push({id,message}),cancelGithubRequest:id=>cancelled.push(id)}),{setTimeout:()=>1,clearTimeout(){}}),stop=new AbortController();
 const a=api.request({type:'revision-import'},{signal:stop.signal}),b=api.request({type:'repository-tree'}),rejected=assert.rejects(a,error=>error.name==='AbortError');stop.abort();await rejected;assert.deepEqual(cancelled,[sent[0].id]);api.reply(sent[1].id,{ok:true,result:{valid:true}});assert.deepEqual(await b,{valid:true});
});
