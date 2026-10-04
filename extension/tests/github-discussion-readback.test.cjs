const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const comments=require('../review-comments.js');
const scope={repository:'owner/private',ref:'main',file:'design/root.kicad_sch'};
const note=(id='review1',anchor=scope)=>({id,text:'Check this part',threadType:'discussion',createdAt:'2026-10-04T01:00:00.000Z',anchor});
const item=(id=1,extra={})=>({id:'DC_'+id,databaseId:id,body:comments.toMarkdown(note()),author:{login:'actual-author'},createdAt:'2026-10-04T02:00:00Z',updatedAt:'2026-10-04T03:00:00Z',...extra});
const page=(nodes=[],next=null)=>({nodes,pageInfo:{hasNextPage:!!next,endCursor:next}});
const root=(nodes=[],next=null)=>({data:{repository:{discussion:{number:42,closed:false,...item(),comments:page(nodes,next)}}}});
async function harness(handler=()=>root(),signed=true){
 const local=new Map(),session=new Map(),calls=[];
 const area=map=>({get:async key=>({[key]:map.get(key)}),set:async data=>{for(const[k,v]of Object.entries(data))map.set(k,v);},remove:async keys=>[].concat(keys).forEach(k=>map.delete(k))});
 const context=vm.createContext({crypto:require('node:crypto').webcrypto,TextEncoder,TextDecoder,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,atob,KiCadReviewComments:comments,
  chrome:{storage:{local:area(local),session:area(session)}},fetch:async(url,init)=>{calls.push({url,init});const value=await handler(url,init,calls.length);return value instanceof Response?value:new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});}});
 vm.runInContext(fs.readFileSync(require.resolve('../github-review-api.js'),'utf8'),context);
 const api=context.KiCadGitHubReviewApi;if(signed)await api.setToken('github_pat_readback_1234567890');
 return{api,calls};
}
const read=h=>h.api.readDiscussionAnnotations({repository:'owner/private',number:42,scope});
test('private Discussion body/comments/replies use fixed authenticated GraphQL and actual provenance',async()=>{
 const h=await harness(()=>root([{...item(2),replies:page([item(3)])}]));
 const result=await read(h);assert.equal(result.notes.length,3);assert.equal(result.warnings.length,0);
 for(const n of result.notes){assert.equal(n.github.author,'actual-author');assert.equal(n.github.createdAt,'2026-10-04T02:00:00Z');assert.equal(n.github.updatedAt,'2026-10-04T03:00:00Z');assert.equal(n.github.state,'open');}
 assert.equal(result.notes[2].github.url,'https://github.com/owner/private/discussions/42#discussioncomment-3');
 for(const c of h.calls){assert.equal(c.url,'https://api.github.com/graphql');assert.equal(c.init.headers.Authorization,'Bearer github_pat_readback_1234567890');assert.equal(c.init.redirect,'error');assert.equal(c.init.credentials,'omit');assert.ok(!JSON.parse(c.init.body).query.includes('mutation'));}
});
test('comments and replies paginate independently, preserving comment anchors',async()=>{
 const h=await harness((url,init)=>{const {query,variables}=JSON.parse(init.body);
  if(query.includes('node(id:'))return{data:{node:{replies:page([item(4)])}}};
  return variables.cursor?root([{...item(3),replies:page()}]):root([{...item(2),replies:page([],'reply-next')}],'comments-next');});
 const result=await read(h);assert.equal(result.notes.length,4);assert.equal(h.calls.length,3);
 assert.equal(JSON.parse(h.calls[1].init.body).variables.cursor,'comments-next');assert.equal(JSON.parse(h.calls[2].init.body).variables.id,'DC_2');
});
test('scope mismatch, duplicate markers, and malformed server identity never forge provenance',async()=>{
 const h=await harness(()=>root([
  {...item(2,{body:comments.toMarkdown(note('other',{...scope,file:'else.kicad_sch'}))}),replies:page()},
  {...item(3,{databaseId:'https://evil.test'}),replies:page()},
  {...item(4,{updatedAt:'not-a-time'}),replies:page()},
  {...item(5,{author:{login:'bad/name'}}),replies:page()},
  {...item(6,{body:comments.toMarkdown(note())+'\n'+comments.toMarkdown(note())}),replies:page()}
 ]));
 const result=await read(h);assert.equal(result.notes.length,2);assert.ok(result.warnings.some(s=>s.includes('provenance')));
});
test('500 source-record bound explicitly reports truncation',async()=>{
 let n=10;const h=await harness(()=>root(Array.from({length:50},()=>({...item(n++),replies:page()})),'cursor-'+n));
 const result=await read(h);assert.equal(result.notes.length,500);assert.equal(h.calls.length,10);assert.ok(result.warnings.some(s=>s.includes('truncated')));
});
test('20 request bound and invalid reply pagination are explicit',async()=>{
 const h=await harness((url,init,count)=>root([],String(count)));
 assert.ok((await read(h)).warnings.some(s=>s.includes('truncated')));assert.equal(h.calls.length,20);
 const broken=await harness(()=>root([{...item(2),replies:{nodes:[],pageInfo:{hasNextPage:true,endCursor:null}}}]));
 assert.ok((await read(broken)).warnings.some(s=>s.includes('pagination')));
});
test('Discussion readback requires login and rejects invalid inputs before networking',async()=>{
 const h=await harness(undefined,false);await assert.rejects(read(h),/Sign in/);assert.equal(h.calls.length,0);
 for(const args of [{repository:'../repo',number:42,scope},{repository:'owner/private',number:'42',scope},{repository:'owner/private',number:42,scope:{...scope,provider:'gitlab',host:'https://gitlab.com'}}])await assert.rejects(h.api.readDiscussionAnnotations(args));
 assert.equal(h.calls.length,0);
});
test('signout or account replacement during a response rejects the whole operation',async()=>{
 for(const action of ['clear','replace']){
  let release,reached;const pause=new Promise(r=>reached=r);
  const h=await harness(async()=>{reached();await new Promise(r=>release=r);return root();});
  const operation=read(h),rejected=assert.rejects(operation,/signed out|changed|locked/);await pause;
  if(action==='clear')await h.api.clearToken();else await h.api.setToken('github_pat_replacement_1234567890');release();await rejected;
 }
});
test('REST reader uses anonymous public fallback and authenticated private requests',async()=>{
 for(const signed of [false,true]){const h=await harness(()=>[],signed),reader=await h.api.createAnnotationReader();assert.deepEqual(Array.from(await reader('/repos/owner/private/issues?state=all&per_page=100&page=1')),[]);
  assert.equal(h.calls[0].init.headers.Authorization,signed?'Bearer github_pat_readback_1234567890':undefined);assert.equal(h.calls[0].init.redirect,'error');assert.equal(h.calls[0].init.credentials,'omit');}
});
test('REST reader rejects unapproved paths, parameters and ambiguous pagination before fetch',async()=>{
 const h=await harness(()=>[]),reader=await h.api.createAnnotationReader();
 for(const path of ['https://evil.test','/repos/owner/private/contents/a','/repos/../private/issues','/repos/owner/private/issues/01','/repos/owner/private/issues?foo=a','/repos/owner/private/issues?page=11','/repos/owner/private/issues?page=1&page=2','/repos/owner/private/issues?state=all#bad'])await assert.rejects(reader(path));
 assert.equal(h.calls.length,0);await reader('/repos/owner/private/issues/42/comments?per_page=100&page=2');assert.equal(h.calls.length,1);
});
test('REST reader binds anonymous and signed-in identity across multiple calls',async()=>{
 for(const signed of [false,true]){const h=await harness(()=>[],signed),reader=await h.api.createAnnotationReader();await reader('/repos/owner/private/issues');await h.api.setToken('github_pat_changed_1234567890');await assert.rejects(reader('/repos/owner/private/issues'),/changed|signed out/);assert.equal(h.calls.length,1);}
});
test('readback bounds streamed body bytes and rejects GraphQL errors',async()=>{
 const h=await harness(()=>new Response('x'.repeat(4*1024*1024+1)));const reader=await h.api.createAnnotationReader();await assert.rejects(reader('/repos/owner/private/issues'),/4 MiB/);
 const bad=await harness(()=>({errors:[{message:'hidden'}]}));await assert.rejects(read(bad),/denied/);
});
