const test=require('node:test'),assert=require('node:assert/strict');
const {repository,library,bridge}=require('../../android-app/web/github.js');
const local=require('../../android-app/web/local-project.js');
const store=()=>{const map=new Map();return{getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};};
test('GitHub repository input rejects foreign hosts, file URLs and unsafe names',()=>{
 assert.equal(repository('https://github.com/wayri/Marble/'),'wayri/Marble');
 for(const input of ['https://attacker@github.com/wayri/Marble','https://user:secret@github.com/wayri/Marble','https://git\thub.com/wayri/Marble','https://github.com/wayri\\Marble','wayri/Marble\u0000'])assert.throws(()=>repository(input));
 for(const input of ['https://evil.test/wayri/Marble','https://github.com/wayri/Marble/blob/main/a','../repo','wayri/..','https://github.com/wayri/Marble?token=secret'])assert.throws(()=>repository(input));
});
test('Saved GitHub projects contain only repository metadata and deduplicate',()=>{
 const storage=store(),saved=library(storage),item={repository:'wayri/Marble',ref:'main',sha:'a'.repeat(40),private:true,token:'secret',files:['private source']};saved.save(item);saved.save(item);
 assert.equal(saved.list().length,1);assert.deepEqual(Object.keys(saved.list()[0]),['repository','ref','sha','private']);assert.ok(!storage.getItem('android-github-projects-v1').includes('secret'));saved.remove(item);assert.equal(saved.list().length,0);
});
test('Native GitHub bridge maps actions, ignores stale replies and propagates expiry',async()=>{
 const sent=[],timers=new Map();let timer=0;const api=bridge(()=>({githubRequest:(id,message)=>sent.push({id,message})}),{setTimeout:f=>{timers.set(++timer,f);return timer;},clearTimeout:id=>timers.delete(id)});
 const result=api.request({type:'repositories',page:2});assert.deepEqual(sent[0].message,{action:'repositories',page:2});api.reply(999,{ok:true,result:'wrong'});api.reply(sent[0].id,{ok:true,result:{repositories:[]}});assert.deepEqual(await result,{repositories:[]});assert.equal(timers.size,0);
 const expired=api.request({type:'import',repository:'owner/private'});api.reply(sent[1].id,{ok:false,error:'Expired',authExpired:true});await assert.rejects(expired,e=>e.authExpired===true);
 const cancelled=api.request({type:'import'});api.cancel('import');await assert.rejects(cancelled,/cancelled/);api.reply(sent[2].id,{ok:true,result:'late'});assert.equal(timers.size,0);
});
test('Stop cancels only its native read request, rejects promptly and ignores late delivery',async()=>{
 const prior=global.KiCadLoading,tracked=[],sent=[],cancelled=[],timers=new Map();let serial=0;
 global.KiCadLoading={track:(promise,stage,options)=>{tracked.push({stage,options});return promise;}};
 const api=bridge(()=>({githubRequest:(id,message)=>sent.push({id,message}),cancelGithubRequest:id=>cancelled.push(id)}),{setTimeout:fn=>{timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id)});
 try{
  const first=api.request({type:'import',repository:'team/first'}),second=api.request({type:'repository-tree',repository:'team/second'});
  const rejected=assert.rejects(first,error=>error.name==='AbortError'&&error.cancelled===true);
  tracked[0].options.onStop();await rejected;
  assert.deepEqual(cancelled,[sent[0].id]);assert.equal(timers.size,1);
  api.reply(sent[0].id,{ok:true,result:{project:'stale'}});
  api.reply(sent[1].id,{ok:true,result:{tree:['valid']}});assert.deepEqual(await second,{tree:['valid']});assert.equal(timers.size,0);
  tracked[0].options.onStop();assert.equal(cancelled.length,1,'stale Stop cannot cancel another request');
 }finally{api.close();global.KiCadLoading=prior;}
});
test('writes and authorization never offer loading Stop, and older native bridges offer no fake cancellation',async()=>{
 const prior=global.KiCadLoading,tracked=[],sent=[],cancelled=[];
 global.KiCadLoading={track:(promise,stage,options)=>{tracked.push(options);return promise;}};
 const api=bridge(()=>({githubRequest:(id,message)=>sent.push({id,message}),cancelGithubRequest:id=>cancelled.push(id)}),{setTimeout:()=>1,clearTimeout(){}});
 try{
  for(const type of ['review-publish','review-upload','publish','upload','token-connect','oauth-start']){const task=api.request({type});assert.equal(tracked.at(-1)?.onStop,undefined);api.reply(sent.at(-1).id,{ok:true,result:{}});await task;}
  const before=tracked.length,auth=api.request({type:'device-start'});assert.equal(tracked.length,before);api.reply(sent.at(-1).id,{ok:true,result:{}});await auth;
  const old=bridge(()=>({githubRequest:(id,message)=>sent.push({id,message})}),{setTimeout:()=>1,clearTimeout(){}});
  const read=old.request({type:'import'});assert.equal(tracked.at(-1)?.onStop,undefined);old.reply(sent.at(-1).id,{ok:true,result:{}});await read;old.close();assert.deepEqual(cancelled,[]);
 }finally{api.close();global.KiCadLoading=prior;}
});
test('only a live accepted primary import acknowledges native project delivery',async()=>{
 const sent=[],accepted=[],api=bridge(()=>({githubRequest:(id,message)=>sent.push({id,message}),cancelGithubRequest(){},acceptGithubRequest:id=>accepted.push(id)}),{setTimeout:()=>1,clearTimeout(){}});
 const cancelled=api.request({type:'import'});api.cancel('import');await assert.rejects(cancelled,/cancelled/);api.reply(sent.at(-1).id,{ok:true,result:{project:{}}});assert.deepEqual(accepted,[]);
 const revision=api.request({type:'revision-import'});api.reply(sent.at(-1).id,{ok:true,result:{project:{}}});await revision;assert.deepEqual(accepted,[]);
 const primary=api.request({type:'import'});api.reply(sent.at(-1).id,{ok:true,result:{project:{}}});await primary;assert.deepEqual(accepted,[sent.at(-1).id]);
});
test('GitHub source transport stays pinned to repository and commit',async()=>{
 const sha='b'.repeat(40),project=local.validate({id:'fixture',github:{repository:'owner/private',sha},files:[{path:'nested/root.kicad_sch',content:'(kicad_sch)'}]});
 const api=local.transport(project,store());assert.equal(api.scope,'owner/private');assert.equal(api.ref,sha);
 assert.equal((await api.send({type:'project-file',file:'nested/root.kicad_sch',ref:'main'})).ok,false);
 assert.throws(()=>local.validate({...project,github:{repository:'owner/private',sha:'main'}}));
});

test('Explicit large download gets enough bridge time without extending ordinary requests',async()=>{
 const durations=[],sent=[];const api=bridge(()=>({githubRequest:(id,msg)=>sent.push(id)}),{setTimeout:(f,ms)=>{durations.push(ms);return durations.length;},clearTimeout:()=>{}});
 const ordinary=api.request({type:'import'}),large=api.request({type:'import',downloadLarge:true}),auth=api.request({type:'auth-status'});
 assert.deepEqual(durations,[600000,2100000,60000]);for(const id of sent)api.reply(id,{ok:true,result:{}});await Promise.all([ordinary,large,auth]);
});
const {chooseDownload}=require('../../android-app/web/github.js');
test('large project chooser distinguishes permanent, temporary and cancellation',async()=>{
 for(const [label,expected]of [['Download and keep','keep'],['Temporary download','temporary'],['Cancel',null]]){
  const nodes=[];const document={createElement:tag=>{const n={tag,children:[],append(...children){this.children.push(...children);},addEventListener(type,fn){this[type]=fn;},showModal(){this.open=true;},close(){this.open=false;},remove(){this.removed=true;}};nodes.push(n);return n;},body:{append(){}}};
  const pending=chooseDownload({bytes:50*1048576},document);const dialog=nodes.find(n=>n.tag==='dialog');nodes.find(n=>n.textContent===label).onclick();assert.equal(await pending,expected);assert.equal(dialog.removed,true);assert.equal(dialog.open,false);assert.match(nodes.find(n=>n.tag==='p').textContent,/Android may delay physical cleanup/);assert.match(nodes.find(n=>n.tag==='p').textContent,/selected duration \(30 minutes to 6 hours\)/);
 }
});


test('authorization requests never retain the global blocking loading surface',async()=>{
 const previous=global.KiCadLoading;let tracked=0,request;
 global.KiCadLoading={track:promise=>{tracked++;return promise;}};
 const api=bridge(()=>({githubRequest:(id,message)=>{request={id,message};}}),{setTimeout:()=>1,clearTimeout(){}});
 try{for(const type of ['auth-status','device-start','device-poll','device-cancel','open-verification','open-verification-mobile']){
  const task=api.request({type});api.reply(request.id,{ok:true,result:{}});await task;
 }assert.equal(tracked,0);
 const task=api.request({type:'repositories'});api.reply(request.id,{ok:true,result:{repositories:[]}});await task;assert.equal(tracked,1);
 }finally{api.close();global.KiCadLoading=previous;}
});
