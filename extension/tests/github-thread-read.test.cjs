const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const comments=require('../review-comments.js');
async function harness(handler=()=>root(),signed=true){
 const local=new Map(),session=new Map(),calls=[];
 const area=map=>({get:async key=>({[key]:map.get(key)}),set:async data=>{for(const[k,v]of Object.entries(data))map.set(k,v);},remove:async keys=>[].concat(keys).forEach(k=>map.delete(k))});
 const context=vm.createContext({crypto:require('node:crypto').webcrypto,TextEncoder,TextDecoder,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,atob,KiCadReviewComments:comments,
  chrome:{storage:{local:area(local),session:area(session)}},fetch:async(url,init)=>{calls.push({url,init});const value=await handler(url,init,calls.length);return value instanceof Response?value:new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});}});
 vm.runInContext(fs.readFileSync(require.resolve('../github-review-api.js'),'utf8'),context);
 const api=context.KiCadGitHubReviewApi;if(signed)await api.setToken('github_pat_readback_1234567890');
 return{api,calls};
}

const scope={repository:'owner/private',ref:'main',file:'design/root.kicad_sch'};
const entry=(id=1,extra={})=>({id,databaseId:id,body:'Ordinary markdown @reviewer **hello**',user:{login:'reviewer'},author:{login:'reviewer'},created_at:'2026-10-04T02:00:00Z',updated_at:'2026-10-04T03:00:00Z',createdAt:'2026-10-04T02:00:00Z',updatedAt:'2026-10-04T03:00:00Z',...extra});
const page=(nodes=[],next=null)=>({nodes,pageInfo:{hasNextPage:!!next,endCursor:next}});
const issue=(extra={})=>({...entry(),number:42,title:'Review',state:'open',comments:1,...extra});
const discussion=(nodes=[],next=null)=>({data:{repository:{discussion:{...entry(),number:42,title:'Review',closed:false,comments:page(nodes,next)}}}});
const read=(h,kind='issue',extra={})=>h.api.readThread({...scope,kind,number:42,...extra});
test('ordinary private Issue body and comments return bounded plaintext with authenticated transport',async()=>{
 const h=await harness(url=>url.includes('/comments?')?[entry(2)]:issue());const result=await read(h);assert.equal(result.body,'Ordinary markdown @reviewer **hello**');assert.equal(result.comments.length,1);assert.equal(result.comments[0].url,'https://github.com/owner/private/issues/42#issuecomment-2');assert.equal(result.comments[0].replyTo,null);
 for(const c of h.calls){assert.equal(c.init.headers.Authorization,'Bearer github_pat_readback_1234567890');assert.equal(c.init.redirect,'error');assert.equal(c.init.credentials,'omit');assert.equal(c.init.method,'GET');}
});
test('public Issue supports anonymous reads and rejects invalid scope/kind/number before networking',async()=>{
 const h=await harness(()=>issue({comments:0}),false);assert.equal((await read(h)).kind,'issue');assert.equal(h.calls[0].init.headers.Authorization,undefined);
 const before=h.calls.length;for(const extra of [{repository:'../repo'},{file:'../bad.kicad_sch'},{ref:''},{kind:'pull'},{number:'42'},{provider:'gitlab'}])await assert.rejects(read(h,'issue',extra));assert.equal(h.calls.length,before);
});
test('Discussion reads ordinary comments and paginated replies with parent identity',async()=>{
 const h=await harness((url,init)=>{const q=JSON.parse(init.body);return q.query.includes('node(id:')?{data:{node:{replies:page([entry(4)])}}}:discussion([{...entry(2,{id:'DC_2'}),replies:page([entry(3)],'more')}]);});
 const result=await read(h,'discussion');assert.deepEqual(Array.from(result.comments,v=>v.id),['2','3','4']);assert.equal(result.comments[1].replyTo,'2');assert.equal(result.comments[2].replyTo,'2');assert.equal(h.calls.length,2);for(const c of h.calls)assert.ok(!JSON.parse(c.init.body).query.includes('mutation'));
});
test('Discussion requires authentication and malformed roots fail closed',async()=>{
 const h=await harness(()=>discussion(),false);await assert.rejects(read(h,'discussion'),/Sign in/);assert.equal(h.calls.length,0);
 for(const value of [issue({number:43}),issue({state:'mystery'}),issue({created_at:'bad'}),issue({user:{login:'bad/name'}}),issue({body:{html:'bad'}})]){const bad=await harness(()=>value);await assert.rejects(read(bad),/invalid/);}
 const bad=await harness(()=>discussion());await assert.rejects(read(bad,'discussion',{number:41}),/invalid/);
});
test('malformed comments are omitted with warning and UTF-8 text is bounded',async()=>{
 const h=await harness(url=>url.includes('/comments?')?[entry(2,{user:{login:'evil/name'}}),entry(3,{body:'😀'.repeat(50000)})]:issue({comments:2}));const result=await read(h);assert.equal(result.comments.length,1);assert.ok(new TextEncoder().encode(result.comments[0].body).length<=65536);assert.ok(result.warnings.some(s=>s.includes('provenance')));assert.ok(result.warnings.some(s=>s.includes('truncated')));
});
test('Issue comments truncate after four pages and report limit',async()=>{
 let id=10;const h=await harness(url=>url.includes('/comments?')?Array.from({length:50},()=>entry(id++)):issue({comments:1000}));const result=await read(h);assert.equal(result.comments.length,200);assert.equal(h.calls.length,5);assert.ok(result.warnings.some(s=>s.includes('truncated')));
});
test('Discussion request limit and repeated cursors report incomplete readback',async()=>{
 const h=await harness((url,init,count)=>discussion([],String(count)));const result=await read(h,'discussion');assert.equal(h.calls.length,10);assert.ok(result.warnings.some(s=>s.includes('truncated')));
 const repeated=await harness(()=>discussion([],'same'));assert.ok((await read(repeated,'discussion')).warnings.some(s=>/repeated|invalid/.test(s)));assert.equal(repeated.calls.length,2);
});
test('signout and account replacement discard the whole in-flight thread',async()=>{
 for(const action of ['clear','replace']){let release,reached;const pause=new Promise(r=>reached=r);const h=await harness(async()=>{reached();await new Promise(r=>release=r);return issue({comments:0});});const operation=read(h),rejected=assert.rejects(operation,/signed out|changed|locked/);await pause;if(action==='clear')await h.api.clearToken();else await h.api.setToken('github_pat_replacement_1234567890');release();await rejected;}
});
test('transport byte bounds, HTTP errors and GraphQL errors reject thread data',async()=>{
 for(const response of [new Response('x'.repeat(4*1024*1024+1)),new Response('{}',{status:404}),{errors:[{message:'internal'}]}]){const h=await harness(()=>response);await assert.rejects(read(h),/4 MiB|HTTP 404|denied/);}
});

test('aggregate text limit stops reads and clips incomplete UTF-8 without replacement inflation',async()=>{
 let id=10;const h=await harness(url=>url.includes('/comments?')?Array.from({length:20},()=>entry(id++,{body:'€'.repeat(30000)})):issue({comments:20,body:'€'.repeat(30000)}));const result=await read(h);const bytes=[result,...result.comments].reduce((n,v)=>n+new TextEncoder().encode(v.body).length,0);assert.ok(bytes<=1024*1024);assert.ok(result.comments.length<20);assert.ok(result.warnings.some(s=>s.includes('truncated')));assert.ok(!result.body.includes('\uFFFD'));
});
