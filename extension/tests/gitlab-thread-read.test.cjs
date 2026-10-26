const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const review=require('../review-comments.js'),HOST='https://gitlab.example.org',REPO='group/sub/project',TOKEN='glpat_thread_read_abcdefghijklmnop';
const time='2026-10-26T01:00:00.000Z';
const note=(id,extra={})=>({id,author:{username:'reviewer'},created_at:time,updated_at:time,body:'Ordinary **comment** @person',system:false,...extra});
const issue=extra=>({...note(900),iid:42,project_id:7,title:'Board review',description:'Issue body',state:'opened',web_url:'https://evil.invalid/ignored',...extra});
const group=(notes=[note(1)],extra={})=>({id:'abc123',individual_note:false,notes,...extra});
const scope={provider:'gitlab',host:HOST,repository:REPO,ref:'main',file:'board.kicad_pcb',kind:'issue',number:42};
async function harness(handler,signed=false){
 const session=new Map(),local=new Map(),calls=[];const area=map=>({get:async key=>({[key]:map.get(key)}),set:async value=>Object.entries(value).forEach(([k,v])=>map.set(k,v)),remove:async keys=>[].concat(keys).forEach(k=>map.delete(k))});
 const ctx=vm.createContext({crypto:require('node:crypto').webcrypto,TextEncoder,TextDecoder,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,btoa,atob,KiCadReviewComments:review,chrome:{storage:{session:area(session),local:area(local)}},fetch:async(url,init)=>{
  calls.push({url,init});assert.equal(new URL(url).origin,HOST);assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');assert.equal(init.method,'GET');
  let value=handler?await handler(url,init,calls.length):undefined;
  if(value===undefined)value=url.includes('/discussions?')?[group([note(1),note(2)])]:url.endsWith('/issues/42')?issue():{id:7,path_with_namespace:REPO};
  return value instanceof Response?value:new Response(JSON.stringify(value));
 }});vm.runInContext(fs.readFileSync(require.resolve('../gitlab-review-api.js'),'utf8'),ctx);const api=ctx.KiCadGitLabReviewApi;if(signed)await api.setToken(HOST,TOKEN);return{api,calls};
}
test('GitLab ordinary issue and grouped replies normalize to shared secure reader schema',async()=>{
 const h=await harness(undefined,true),value=await h.api.readThread({...scope,kind:'discussion'});
 assert.equal(value.kind,'issue');assert.equal(value.state,'open');assert.equal(value.body,'Issue body');assert.equal(value.url,HOST+'/'+REPO+'/-/issues/42');assert.equal(value.comments[1].replyTo,'1');assert.equal(value.comments[1].discussionId,'abc123');assert.equal(value.comments[1].url,value.url+'#note_2');
 assert.equal(h.calls.length,3);for(const call of h.calls)assert.equal(call.init.headers.Authorization,'Bearer '+TOKEN);assert.ok(h.calls[2].url.includes('/projects/7/issues/42/discussions?'));
});
test('standalone notes, system notes, deduplication and deleted authors retain correct provenance',async()=>{
 const h=await harness(url=>url.includes('/discussions?')?[group([note(1)],{individual_note:true}),group([note(2,{system:true}),note(3,{author:null}),note(4)]),group([note(4)])]:undefined);
 const value=await h.api.readThread(scope);assert.deepEqual(Array.from(value.comments,c=>[c.id,c.replyTo]),[['1',null],['3',null],['4','3']]);assert.equal(value.comments[1].author,null);assert.equal(h.calls[0].init.headers.Authorization,undefined);
});
test('invalid provider, origin, scope, number and kind fail before transport',async()=>{
 const h=await harness();for(const extra of [{provider:'github'},{host:'http://gitlab.com'},{host:'https://x:y@gitlab.com'},{repository:'../repo'},{file:'../board.kicad_pcb'},{ref:''},{number:'42'},{number:0},{kind:'pull'}])await assert.rejects(h.api.readThread({...scope,...extra}));assert.equal(h.calls.length,0);
});
test('wrong project/issue identity and invalid root provenance fail closed',async()=>{
 for(const root of [issue({iid:43}),issue({project_id:8}),issue({state:'mystery'}),issue({created_at:'invalid'}),issue({author:{username:'bad/name'}}),issue({description:{html:'wrong'}})]){const h=await harness(url=>url.endsWith('/issues/42')?root:undefined);await assert.rejects(h.api.readThread(scope),/invalid/);}
 const h=await harness(url=>url.endsWith('/projects/group%2Fsub%2Fproject')?{id:7,path_with_namespace:'other/repo'}:undefined);await assert.rejects(h.api.readThread(scope),/identity/);assert.equal(h.calls.length,1);
});
test('invalid comments/groups omitted with warnings and text has UTF8 bounds',async()=>{
 const h=await harness(url=>url.includes('/discussions?')?[group([note(1,{author:{username:'bad/name'}}),note(2,{body:'😀'.repeat(50000)}),note(3)]),{id:'../bad',individual_note:false,notes:[]}]:undefined);const value=await h.api.readThread(scope);assert.equal(value.comments.length,2);assert.equal(value.comments[1].replyTo,'2');assert.ok(Buffer.byteLength(value.comments[0].body)<=65536);assert.ok(!value.comments[0].body.includes('�'));assert.ok(value.warnings.some(w=>w.includes('provenance')));assert.ok(value.warnings.some(w=>w.includes('groups')));assert.ok(value.warnings.some(w=>w.includes('truncated')));
});
test('comment, request and aggregate body budgets report incomplete readback',async()=>{
 const h=await harness(url=>url.includes('/discussions?')?[group(Array.from({length:201},(_,i)=>note(i+1)))]:undefined);let value=await h.api.readThread(scope);assert.equal(value.comments.length,200);assert.ok(value.warnings.some(w=>w.includes('200 comments')));
 const pages=await harness(url=>url.includes('/discussions?')?Array.from({length:100},(_,i)=>group([note(i+1,{system:true})])):undefined);value=await pages.api.readThread(scope);assert.equal(pages.calls.length,10);assert.ok(value.warnings.some(w=>w.includes('10 requests')));
 const text=await harness(url=>url.includes('/discussions?')?Array.from({length:100},(_,i)=>group([note(Number(new URL(url).searchParams.get('page'))*100+i+1,{body:'€'.repeat(3000)})],{id:'group_'+i})):undefined);value=await text.api.readThread(scope);assert.ok([value,...value.comments].reduce((n,c)=>n+Buffer.byteLength(c.body),0)<=1024*1024);assert.ok(value.comments.length<200);
});
test('HTTP failure, oversized body and account changes reject whole result',async()=>{
 for(const response of [new Response('',{status:302}),new Response('',{status:404}),new Response('x'.repeat(1024*1024+1))]){const h=await harness(()=>response);await assert.rejects(h.api.readThread(scope),/HTTP|size limit/);}
 let release,reached;const gate=new Promise(resolve=>reached=resolve);const h=await harness(async()=>{reached();await new Promise(resolve=>release=resolve);return{id:7,path_with_namespace:REPO};},true);const pending=h.api.readThread(scope),rejected=assert.rejects(pending,/changed|signed out/);await gate;await h.api.clearToken(HOST);release();await rejected;
});
