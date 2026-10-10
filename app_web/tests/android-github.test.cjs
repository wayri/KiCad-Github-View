const test=require('node:test'),assert=require('node:assert/strict');
const {repository,library,bridge}=require('../../android-app/web/github.js');
const local=require('../../android-app/web/local-project.js');
const store=()=>{const map=new Map();return{getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};};
test('GitHub repository input rejects foreign hosts, file URLs and unsafe names',()=>{
 assert.equal(repository('https://github.com/wayri/Marble/'),'wayri/Marble');
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
 for(const [label,expected]of [['Download and keep','keep'],['Temporary (6 hours)','temporary'],['Cancel',null]]){
  const nodes=[];const document={createElement:tag=>{const n={tag,children:[],append(...children){this.children.push(...children);},addEventListener(type,fn){this[type]=fn;},showModal(){this.open=true;},close(){this.open=false;},remove(){this.removed=true;}};nodes.push(n);return n;},body:{append(){}}};
  const pending=chooseDownload({bytes:50*1048576},document);const dialog=nodes.find(n=>n.tag==='dialog');nodes.find(n=>n.textContent===label).onclick();assert.equal(await pending,expected);assert.equal(dialog.removed,true);assert.equal(dialog.open,false);assert.match(nodes.find(n=>n.tag==='p').textContent,/Android may delay physical cleanup/);
 }
});
