const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const comments=require('../review-comments.js'),HOST='https://gitlab.example.org',repo='owner/project';
const scope={repository:repo,ref:'main',file:'board.kicad_pcb'};
const connection=nodes=>({nodes,pageInfo:{hasNextPage:false,endCursor:null}});
const project=()=>({id:'PVT_1',title:'Hardware',url:'https://github.com/orgs/owner/projects/1',repositories:connection([{nameWithOwner:repo}]),fields:connection([{id:'FIELD_1',name:'Status',options:[{id:'todo',name:'Todo'},{id:'done',name:'Done'}]}]),items:connection([{id:'ITEM_1',fieldValues:connection([{optionId:'todo',field:{id:'FIELD_1'}}]),content:{__typename:'Issue',number:42,title:'Fix U1',repository:{nameWithOwner:repo},assignees:{nodes:[{login:'reviewer'}]}}}])});
const glProject={id:7,path_with_namespace:repo,default_branch:'main',visibility:'public'};
const glBoard=()=>({id:1,name:'Hardware',project:{id:7},lists:[{id:3,label:{name:'Doing'},position:0},{id:4,label:{name:'Review'},position:1}],labels:[],milestone:null,assignee:null,weight:null});
const glIssue=()=>({iid:42,project_id:7,title:'Fix U1',labels:['Doing','unrelated'],state:'opened',updated_at:'2026-10-28T00:00:00Z',assignees:[{username:'reviewer'}]});
async function harness(provider,route,options={}){
 const calls=[],local=new Map(),session=new Map();
 const area=map=>({get:async key=>({[key]:map.get(key)}),set:async value=>Object.entries(value).forEach(([k,v])=>map.set(k,v)),remove:async keys=>[].concat(keys).forEach(k=>map.delete(k))});
 const ctx=vm.createContext({crypto:require('node:crypto').webcrypto,TextEncoder,TextDecoder,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,atob,btoa,KiCadReviewComments:comments,KiCadManagedPolicy:options.policy,
  chrome:{storage:{local:area(local),session:area(session)}},fetch:async(url,init)=>{
   calls.push({url,init});assert.equal(new URL(url).origin,provider==='github'?'https://api.github.com':HOST);assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');
   let value=await route?.(url,init);
   if(value===undefined){if(url.endsWith('/user'))value=provider==='github'?{login:'owner'}:{id:10,username:'owner'};
    else if(url.includes('/contents/.kicad-review-policy.json')||url.includes('/repository/files/'))return new Response('{}',{status:404});
    else if(url.includes('/repository/tree?'))value=[];
    else if(provider==='github'&&url.endsWith('/repos/'+repo))value={full_name:repo,default_branch:'main',private:false};
    else if(provider==='gitlab')value=glProject;
    else throw Error('Unexpected request '+url);}
   return value instanceof Response?value:new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
  }});
 vm.runInContext(fs.readFileSync(require.resolve(`../${provider}-review-api.js`),'utf8'),ctx);
 const api=provider==='github'?ctx.KiCadGitHubReviewApi:ctx.KiCadGitLabReviewApi;
 if(options.signed!==false){if(provider==='github')await api.setToken('github_pat_board_test_1234567890');else await api.setToken(HOST,'glpat_board_test_1234567890');}
 return{api,calls};
}
const githubRead=(h,extra={})=>h.api.boardRead({...scope,boardId:'PVT_1',...extra});
const glScope={...scope,provider:'gitlab',host:HOST};
const glRoute=(url,init)=>url.includes('/boards/1')?glBoard():url.includes('/issues?')?[glIssue()]:url.endsWith('/issues/42')?glIssue():undefined;

test('GitHub project discovery reuses account auth and only returns open linked projects',async()=>{
 const h=await harness('github',()=>({data:{repository:{projectsV2:connection([{id:'PVT_1',title:'Hardware',number:1,url:'https://github.com/orgs/owner/projects/1',closed:false},{id:'PVT_2',title:'Old',number:2,url:'https://github.com/orgs/owner/projects/2',closed:true}])}}}));
 const result=await h.api.boardList(scope);assert.equal(result.boards.length,1);assert.equal(result.boards[0].id,'PVT_1');assert.equal(result.hasMore,false);assert.match(h.calls[0].init.headers.Authorization,/^Bearer /);assert.ok(!JSON.stringify(result).includes('github_pat'));
});
test('GitHub board fields use actual options and exclude other repositories and drafts',async()=>{
 const p=project();p.items.nodes.push({id:'OTHER',content:{__typename:'Issue',repository:{nameWithOwner:'other/project'}}},{id:'DRAFT',content:{__typename:'DraftIssue',title:'Draft'}});
 const h=await harness('github',()=>({data:{node:p}})),result=await githubRead(h);
 assert.deepEqual(Array.from(result.columns,c=>c.title),['No status','Todo','Done']);assert.equal(result.items.length,1);assert.equal(result.items[0].number,42);assert.equal(result.items[0].columnId,'todo');assert.equal(result.items[0].url,'https://github.com/owner/project/issues/42');assert.equal(result.fieldId,'FIELD_1');
});
test('GitHub discovery and board reads bound pagination and reject bad provenance',async()=>{
 for(const change of [p=>p.repositories.nodes=[],p=>p.url='https://evil.invalid/',p=>p.items.pageInfo={hasNextPage:true,endCursor:'same'},p=>p.items.nodes[0].fieldValues.nodes[0].optionId='invented']){
  const p=project();change(p);const h=await harness('github',()=>({data:{node:p}}));await assert.rejects(githubRead(h,{cursor:'same'}));
 }
 const p=project();p.items.pageInfo={hasNextPage:true,endCursor:'next'};const h=await harness('github',()=>({data:{node:p}}));const result=await githubRead(h);assert.equal(result.hasMore,true);assert.equal(result.cursor,'next');
});
test('GitHub invalid identifiers and unsigned sessions fail before networking',async()=>{
 const h=await harness('github',()=>({}),{signed:false});await assert.rejects(githubRead(h));await assert.rejects(githubRead(h,{boardId:'../bad'}));await assert.rejects(h.api.boardList({...scope,provider:'gitlab'}));assert.equal(h.calls.length,0);
});
test('GitHub status update verifies project item and mutates only the chosen field',async()=>{
 let mutation;
 const h=await harness('github',(url,init)=>{if(!url.endsWith('/graphql'))return;const q=JSON.parse(init.body);
  if(q.query.startsWith('mutation')){mutation=q;return{data:{updateProjectV2ItemFieldValue:{projectV2Item:{id:'ITEM_1'}}}};}
  if(q.query.includes('... on ProjectV2Item{'))return{data:{node:{id:'ITEM_1',project:{id:'PVT_1'},content:{repository:{nameWithOwner:repo}}}}};
  return{data:{node:project()}};
 });
 const result=await h.api.boardMove({...scope,boardId:'PVT_1',itemId:'ITEM_1',optionId:'done'});assert.equal(result.updated,true);assert.deepEqual(mutation.variables.input,{projectId:'PVT_1',itemId:'ITEM_1',fieldId:'FIELD_1',value:{singleSelectOptionId:'done'}});
 assert.ok(!h.calls.some(c=>c.url.includes('/issues/')&&c.init.method!=='GET'));
});
test('GitHub cross-project item and managed write denial never mutate',async()=>{
 const h=await harness('github',(url,init)=>url.endsWith('/graphql')?{data:{node:JSON.parse(init.body).query.includes('... on ProjectV2Item{')?{id:'ITEM_1',project:{id:'OTHER'},content:{repository:{nameWithOwner:repo}}}:project()}}:undefined);
 await assert.rejects(h.api.boardMove({...scope,boardId:'PVT_1',itemId:'ITEM_1',optionId:'done'}),/another/);assert.ok(!h.calls.some(c=>c.init.body&&JSON.parse(c.init.body).query?.startsWith('mutation')));
 const denied=await harness('github',()=>({}),{policy:{assertNetwork:async()=>{},assertWrites:async()=>{throw Error('Managed denial');}}});await assert.rejects(denied.api.boardMove({}),/Managed denial/);assert.equal(denied.calls.length,0);
});
test('GitHub stale column and unconfirmed update cannot report success',async()=>{
 for(const stale of [true,false]){
  let mutations=0;const h=await harness('github',(url,init)=>{if(!url.endsWith('/graphql'))return;const q=JSON.parse(init.body);if(q.query.startsWith('mutation')){mutations++;return{data:{updateProjectV2ItemFieldValue:{projectV2Item:{id:'WRONG'}}}};}return{data:{node:q.query.includes('... on ProjectV2Item{')?{id:'ITEM_1',project:{id:'PVT_1'},fieldValues:connection([{optionId:'todo',field:{id:'FIELD_1'}}]),content:{repository:{nameWithOwner:repo}}}:project()}};});
  await assert.rejects(h.api.boardMove({...scope,boardId:'PVT_1',itemId:'ITEM_1',optionId:'done',expectedColumnId:stale?'done':'todo'}),stale?/changed/:/did not confirm/);assert.equal(mutations,stale?0:1);
 }
});
test('GitLab board discovery and issue membership retain multiple label columns',async()=>{
 const h=await harness('gitlab',(url,init)=>url.includes('/boards?')?[glBoard()]:url.includes('/issues?')?[{...glIssue(),labels:['Doing','Review']}, {...glIssue(),iid:43,state:'closed'}]:glRoute(url,init));
 const listed=await h.api.boardList(glScope);assert.equal(listed.boards[0].id,1);
 const result=await h.api.boardRead({...glScope,boardId:1});assert.deepEqual(Array.from(result.columns,c=>c.id),['open',3,4,'closed']);assert.deepEqual(Array.from(result.items[0].columnIds),[3,4]);assert.equal(result.items[1].columnId,'closed');assert.ok(!JSON.stringify(result).includes('glpat'));
});
test('GitLab label moves preserve unrelated labels and only remove the source column',async()=>{
 let update;
 const h=await harness('gitlab',(url,init)=>{if(url.endsWith('/issues/42')&&init.method==='PUT'){update=JSON.parse(init.body);return{...glIssue(),labels:['Review','unrelated']};}return glRoute(url,init);});
 const result=await h.api.boardMove({...glScope,boardId:1,itemId:42,listId:4,fromListId:3,expectedUpdatedAt:glIssue().updated_at});
 assert.equal(result.updated,true);assert.deepEqual(update,{add_labels:'Review',remove_labels:'Doing'});assert.equal(update.labels,undefined);
});
test('GitLab open and closed columns have explicit native state behavior',async()=>{
 for(const listId of ['open','closed']){
  let update;const h=await harness('gitlab',(url,init)=>{if(url.endsWith('/issues/42')&&init.method==='PUT'){update=JSON.parse(init.body);return{...glIssue(),labels:listId==='open'?['unrelated']:glIssue().labels,state:listId==='closed'?'closed':'opened'};}return glRoute(url,init);});
  await h.api.boardMove({...glScope,boardId:1,itemId:42,listId});
  assert.deepEqual(update,listId==='open'?{remove_labels:'Doing'}:{state_event:'close'});
 }
});
test('GitLab unsupported scoped boards, wrong project, stale tasks reject without writes',async()=>{
 for(const board of [{...glBoard(),milestone:{id:1}},{...glBoard(),lists:[{id:1,assignee:{id:1}}]},{...glBoard(),project:{id:99}}]){
  const h=await harness('gitlab',(url,init)=>url.includes('/boards/1')?board:glRoute(url,init));await assert.rejects(h.api.boardRead({...glScope,boardId:1}));
 }
 const h=await harness('gitlab',glRoute);await assert.rejects(h.api.boardMove({...glScope,boardId:1,itemId:42,listId:4,expectedUpdatedAt:'old'}),/changed/);assert.ok(h.calls.every(c=>c.init.method==='GET'));
});
test('GitLab invalid scope and missing authentication cannot write',async()=>{
 const h=await harness('gitlab',glRoute,{signed:false});await assert.rejects(h.api.boardMove({...glScope,boardId:1,itemId:42,listId:4}),/Sign in/);
 const before=h.calls.length;for(const extra of [{provider:'github'},{host:'http://gitlab.com'},{boardId:'1'},{page:21}])await assert.rejects(h.api.boardRead({...glScope,boardId:1,...extra}));assert.equal(h.calls.length,before);assert.ok(h.calls.every(c=>c.init.method==='GET'));
});
test('provider errors and oversized responses fail rather than replacing a board with empty data',async()=>{
 for(const provider of ['github','gitlab']){const h=await harness(provider,()=>new Response('{}',{status:403}));await assert.rejects(h.api.boardList(provider==='github'?scope:glScope));}
 const h=await harness('github',()=>new Response('x'.repeat(4*1024*1024+1)));await assert.rejects(githubRead(h),/4 MiB/);
});

test('optional Projects device authorization verifies both repository and project grants',async()=>{
 for(const [requested,granted,accepted] of [['public_repo project','public_repo,project',true],['repo project','repo project',true],['repo project','public_repo project',false],['public_repo project','public_repo',false]]){
  const session=new Map(),local=new Map(),calls=[],area=map=>({get:async key=>({[key]:map.get(key)}),set:async value=>Object.entries(value).forEach(([k,v])=>map.set(k,v)),remove:async keys=>[].concat(keys).forEach(k=>map.delete(k))});
  const ctx=vm.createContext({TextEncoder,TextDecoder,URLSearchParams,AbortController,setTimeout,clearTimeout,crypto:require('node:crypto').webcrypto,chrome:{storage:{session:area(session),local:area(local)}},fetch:async(url,init)=>{
   calls.push({url,init});return{ok:true,text:async()=>JSON.stringify(url.endsWith('/login/device/code')?{device_code:'d'.repeat(40),user_code:'TEST-CODE',verification_uri:'https://github.com/login/device',expires_in:900,interval:5}:{access_token:'gho_'+'t'.repeat(40),token_type:'bearer',scope:granted})};
  }});
  vm.runInContext(fs.readFileSync(require.resolve('../github-review-api.js'),'utf8'),ctx);const api=ctx.KiCadGitHubReviewApi;
  await api.startDevice('',requested);assert.equal(new URLSearchParams(calls[0].init.body).get('scope'),requested);session.get('github-device-pending').nextPollAt=Date.now()-1;
  if(accepted)assert.equal((await api.pollDevice()).state,'connected');else await assert.rejects(api.pollDevice(),/did not grant/);
  assert.equal(session.has('github-review-token'),accepted);assert.equal(local.has('github-review-token'),false);
 }
});
