'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHost,remoteURL}=require('../remote-collaboration.js'),comments=require('../../extension/review-comments.js');
const {deploymentPolicy}=require('../remote-collaboration.js');
const sha='a'.repeat(40),content='(kicad_pcb)',uri=path=>({scheme:'file',path,toString(){return 'file://'+path;}});
function harness({remote='git@github.com:owner/board.git',factory,forkFactory,dirty=false,transport,commentAPI=comments}={}){
 const values=new Map(),secrets=new Map(),auth=[],fetches=[],invocations=[];
 const repo={rootUri:uri('/repo'),state:{HEAD:{commit:sha},remotes:[{name:'origin',fetchUrl:remote}]},show:async(ref,path)=>dirty?'different':content};
 const vscode={workspace:{isTrusted:true,getConfiguration:()=>({inspect:()=>({defaultValue:true})})},extensions:{getExtension:()=>({isActive:true,exports:{getAPI:()=>({repositories:[repo]})}})},authentication:{getSession:async(...args)=>{auth.push(args);return{accessToken:'gho_SUPERSECRET000000000000'};}},window:{showInputBox:async()=> 'glpat_SECRET000000000000000'}};
 const session={uri:uri('/repo/workspace/board.kicad_pcb'),scope:{boundary:uri('/repo/workspace'),repository:'local/workspace',ref:'workspace',rootFile:'board.kicad_pcb'},paths:new Set(['board.kicad_pcb']),files:[{path:'board.kicad_pcb',content}],context:{secrets:{get:async k=>secrets.get(k),store:async(k,v)=>secrets.set(k,v)},workspaceState:{get:k=>values.get(k),update:async(k,v)=>values.set(k,v)}}};
 const apiFactory=deps=>factory?factory(deps):({readThread:async args=>{invocations.push(args);const credential=await deps.credential(args.host);await deps.fetch(args.provider==='github'?'https://api.github.com/repos/owner/board/issues/1':'https://gitlab.com/api/v4/projects/owner%2Fboard',{headers:{Authorization:'Bearer '+credential?.token}});return{kind:'issue',number:1,body:'Thread',comments:[],warnings:[]};},publish:async args=>{invocations.push(args);await deps.credential(args.host);return{remoteRef:{kind:'issue',repository:args.repository,number:1,url:'https://github.com/'+args.repository+'/issues/1',publishedAt:'2026-10-26T00:00:00Z'}};},commentPolicyStatus:async()=>({allowed:true}),categories:async()=>({categories:[{id:'id',name:'Help'}]})});
 const host=createHost(vscode,{sameScope:(file,root)=>file.path.startsWith(root.path+'/'),comments:commentAPI,apiFactory,forkFactory,readCommitted:async(ctx,path)=>dirty?'different':content,fetch:async(url,init)=>{fetches.push({url,init});return transport?transport(url,init):new Response(JSON.stringify({path_with_namespace:'owner/board',id:42}));}});
 const request=(type,extra={})=>host.dispatch({type,repository:'local/workspace',ref:'workspace',file:'board.kicad_pcb',...extra},session);
 const note={id:'note',text:'Review R1',severity:'info',createdAt:'2026-10-26T00:00:00Z',anchor:{repository:'local/workspace',ref:'workspace',file:'board.kicad_pcb'}};
 return{host,request,session,vscode,repo,note,secrets,auth,fetches,invocations};
}
test('remote parsing excludes credentials, ambiguous paths and local/network destinations',()=>{
 assert.deepEqual(remoteURL('git@github.com:owner/board.git'),{provider:'github',host:'https://github.com',repository:'owner/board'});
 assert.equal(remoteURL('https://gitlab.com/group/sub/board.git').repository,'group/sub/board');
 for(const remote of ['https://user:secret@github.com/owner/repo','http://github.com/o/r','https://127.0.0.1/o/r','https://localhost/o/r','https://git.local/o/r','https://github.com/o/../r','git@github.com:../r','https://github.com/o/r?token=secret'])assert.equal(remoteURL(remote),null,remote);
});

const forkRequest={sha:'b'.repeat(40),namespace:'reviewer',name:'board-copy',branch:'review/selected',confirmed:true};
test('remote fork host binds selected commit to workspace and keeps native credentials inside exact routes',async()=>{
 let received;
 const h=harness({forkFactory:{async create(message,{request,authorize}){received=message;await authorize();await request('GET','/user');await request('GET','/repos/owner/board/commits/'+message.sha);await request('POST','/repos/owner/board/forks',{name:message.name});await request('GET','/repos/reviewer/board-copy');await request('POST','/repos/reviewer/board-copy/git/refs',{ref:'refs/heads/'+message.branch,sha:message.sha});return{created:true,url:'https://github.com/reviewer/board-copy'};}},transport:async url=>new Response(JSON.stringify(url.endsWith('/user')?{login:'reviewer'}:{}))});
 let prompts=0;h.vscode.window.showWarningMessage=async(_message,_options,action)=>{prompts++;return action;};
 const result=await h.request('repository-fork-revision',forkRequest);assert.equal(result.created,true);assert.equal(prompts,1);assert.equal(received.repository,'owner/board');assert.equal(received.sha,forkRequest.sha);assert.equal(received.ref,forkRequest.sha);assert.equal(received.file,'workspace/board.kicad_pcb');assert.equal(received.destinationNamespace,'reviewer');assert.equal(h.fetches.length,5);assert.ok(h.fetches.every(item=>item.init.redirect==='error'&&item.init.credentials==='omit'));assert.equal(JSON.stringify(result).includes('SECRET'),false);
});
test('fork host rejects unconfirmed requests, disabled writes, cancel and foreign route before network writes',async()=>{
 const factory={async create(_message,{request}){return request('POST','/repos/stranger/board/git/refs',{});}};
 for(const extra of [{confirmed:false},{sha:'HEAD'},{name:'../board'},{branch:'bad\nbranch'}]){const h=harness({forkFactory:factory});await assert.rejects(h.request('repository-fork-revision',{...forkRequest,...extra}),/Confirm/);assert.equal(h.auth.length,0);assert.equal(h.fetches.length,0);}
 const disabled=harness({forkFactory:factory});setDeployment(disabled,{providerWrites:false});await assert.rejects(disabled.request('repository-fork-revision',forkRequest),/Provider writes/);assert.equal(disabled.auth.length,0);
 const cancel=harness({forkFactory:factory});cancel.vscode.window.showWarningMessage=async()=>undefined;await assert.rejects(cancel.request('repository-fork-revision',forkRequest),/cancelled/);assert.equal(cancel.auth.length,0);
 const foreign=harness({forkFactory:factory});foreign.vscode.window.showWarningMessage=async(_m,_o,a)=>a;await assert.rejects(foreign.request('repository-fork-revision',forkRequest),/outside this workspace/);assert.equal(foreign.fetches.length,0);
 const revoked=harness({forkFactory:factory});revoked.vscode.window.showWarningMessage=async(_m,_o,a)=>{revoked.vscode.workspace.isTrusted=false;return a;};await assert.rejects(revoked.request('repository-fork-revision',forkRequest),/Trust|trusted/);assert.equal(revoked.auth.length,0);
});

test('real fork workflow passes the host route gate for GitHub and nested GitLab namespace with synthetic HTTP only',async()=>{
 const forkFactory=require('../../extension/revision-fork.js');
 for(const provider of ['github','gitlab']){
  const gh=provider==='github',namespace=gh?'reviewer':'123',target=gh?'reviewer/board-copy':'hardware/lab/board-copy',source=gh?'/repos/owner/board':'/api/v4/projects/owner%2Fboard',destination=gh?'/repos/'+target:'/api/v4/projects/'+encodeURIComponent(target),sourceObject=gh?source:'/api/v4/projects/42',destinationObject=gh?destination:'/api/v4/projects/99';let made=false;
  const h=harness({forkFactory,remote:gh?'https://github.com/owner/board.git':'https://gitlab.com/owner/board.git',transport:async(url,init)=>{
   const p=new URL(url).pathname,method=init.method;let data,status=200;
   if(p===(gh?'/user':'/api/v4/user'))data={id:7,login:'reviewer',username:'reviewer'};
   else if(p==='/api/v4/namespaces/123')data={id:123,kind:'group',full_path:'hardware/lab'};
   else if(p===source)data={id:42,full_name:'owner/board',path_with_namespace:'owner/board'};
   else if(p===sourceObject+(gh?'/commits/':'/repository/commits/')+forkRequest.sha||p===destinationObject+(gh?'/commits/':'/repository/commits/')+forkRequest.sha)data={sha:forkRequest.sha,id:forkRequest.sha};
   else if(p===destination||p===destinationObject){if(!made){status=404;data=null;}else data={id:99,full_name:target,path_with_namespace:target,default_branch:'main',import_status:'finished'};}
   else if(p===sourceObject+(gh?'/forks':'/fork')&&method==='POST'){made=true;status=gh?202:201;data={id:99,full_name:target,path_with_namespace:target,fork:true,parent:{id:42},forked_from_project:{id:42}};}
   else if(p===destinationObject+(gh?'/git/ref/heads/':'/repository/branches/')+encodeURIComponent(forkRequest.branch)){status=404;data=null;}
   else if(p===destinationObject+(gh?'/git/refs':'/repository/branches')&&method==='POST')data=gh?{ref:'refs/heads/'+forkRequest.branch,object:{sha:forkRequest.sha}}:{name:forkRequest.branch,commit:{id:forkRequest.sha}};
   else throw Error('Unexpected synthetic route '+method+' '+p);
   return new Response(JSON.stringify(data),{status});
  }});
  h.vscode.window.showWarningMessage=async(_m,_o,a)=>a;if(!gh)h.secrets.set('kiview:gitlab:https://gitlab.com','synthetic-provider-secret');
  const result=await h.request('repository-fork-revision',{...forkRequest,namespace});assert.equal(result.created,true);assert.equal(result.partial,false);assert.equal(result.sha,forkRequest.sha);assert.equal(result.repository,target);assert.ok(h.fetches.some(value=>value.init.method==='POST'));
 }
});

test('fork credentials stay pinned across account replacement and sign-out, including partial creation',async()=>{
 const forkFactory=require('../../extension/revision-fork.js');
 for(const provider of ['github','gitlab'])for(const phase of ['before-create','after-create'])for(const replacement of ['synthetic-account-B',null]){
  const gh=provider==='github',target='reviewer/board-copy',source=gh?'/repos/owner/board':'/api/v4/projects/owner%2Fboard',sourceObject=gh?source:'/api/v4/projects/42',destination=gh?'/repos/'+target:'/api/v4/projects/'+encodeURIComponent(target);
  let token='synthetic-account-A',writes=0;
  const h=harness({forkFactory,remote:gh?'https://github.com/owner/board.git':'https://gitlab.com/owner/board.git',transport:async(url,init)=>{
   assert.equal(init.headers.Authorization,'Bearer synthetic-account-A');
   const p=new URL(url).pathname;let data,status=200;
   if(p===(gh?'/user':'/api/v4/user'))data={id:7,login:'reviewer',username:'reviewer'};
   else if(p===source)data={id:42,full_name:'owner/board',path_with_namespace:'owner/board'};
   else if(p===sourceObject+(gh?'/commits/':'/repository/commits/')+forkRequest.sha){data={sha:forkRequest.sha,id:forkRequest.sha};if(phase==='before-create')token=replacement;}
   else if(p===destination){status=404;data=null;}
   else if(p===sourceObject+(gh?'/forks':'/fork')&&init.method==='POST'){writes++;status=gh?202:201;data={id:99,full_name:target,path_with_namespace:target,fork:true,parent:{id:42},forked_from_project:{id:42}};token=replacement;}
   else throw Error('A request continued after credentials changed: '+p);
   return new Response(JSON.stringify(data),{status});
  }});
  h.vscode.window.showWarningMessage=async(_m,_o,a)=>a;
  h.vscode.authentication.getSession=async()=>token?{accessToken:token}:null;
  h.session.context.secrets.get=async()=>token;
  const pending=h.request('repository-fork-revision',{...forkRequest,namespace:undefined});
  if(phase==='before-create'){await assert.rejects(pending,/account changed or signed out/);assert.equal(writes,0);assert.equal(h.fetches.length,3);}
  else{const result=await pending;assert.equal(result.created,true);assert.equal(result.partial,true);assert.equal(result.uncertain,false);assert.equal(writes,1);assert.equal(h.fetches.length,5);}
 }
});

test('fork credentials are rechecked after asynchronous workspace provenance lookup',async()=>{
 let token='synthetic-account-A',switchOnLookup=false;
 const h=harness({forkFactory:{async create(_message,{request}){switchOnLookup=true;return request('GET','/user');}}});
 h.vscode.window.showWarningMessage=async(_m,_o,a)=>a;
 h.vscode.authentication.getSession=async()=>({accessToken:token});
 const original=h.vscode.extensions.getExtension;
 h.vscode.extensions.getExtension=(...args)=>{if(switchOnLookup)token='synthetic-account-B';return original(...args);};
 await assert.rejects(h.request('repository-fork-revision',forkRequest),/account changed or signed out/);
 assert.equal(h.fetches.length,0);
});

function setDeployment(h,values={},workspace={}){h.vscode.workspace.getConfiguration=()=>({inspect:key=>({defaultValue:true,globalValue:values[key],workspaceValue:workspace[key],workspaceFolderValue:workspace[key]})});}
test('application policy ignores repository overrides and fails closed for malformed values',()=>{
 const h=harness();setDeployment(h,{networkAccess:false,providerWrites:false},{networkAccess:true,providerWrites:true});
 assert.deepEqual(deploymentPolicy(h.vscode),{networkAccess:false,providerWrites:false});
 for(const malformed of ['true',1,null,{}]){setDeployment(h,{providerWrites:malformed});assert.deepEqual(deploymentPolicy(h.vscode),{networkAccess:false,providerWrites:false});}
 h.vscode.workspace.getConfiguration=()=>{throw Error('unavailable');};assert.equal(deploymentPolicy(h.vscode).networkAccess,false);
});
test('disabled network blocks existing sessions and authentication before credentials or fetch',async()=>{
 const h=harness();await h.host.publicContext(h.session);setDeployment(h,{networkAccess:false});
 for(const type of ['open-options','github-thread-read','github-publish-comment'])await assert.rejects(h.request(type,{kind:'issue',number:1,comment:h.note,destination:'new-issue'}),/Network access is disabled/);
 assert.equal(h.auth.length,0);assert.equal(h.fetches.length,0);
});
test('read-only deployment permits remote reads while refusing publication and chat mutations',async()=>{
 const h=harness();setDeployment(h,{providerWrites:false});await h.request('github-thread-read',{kind:'issue',number:1});
 for(const type of ['github-publish-comment','github-recover-publication','comment-publish','chat-message-write','chat-reaction'])await assert.rejects(h.request(type,{comment:h.note,destination:'new-issue'}),/Provider writes are disabled/);
 assert.equal(h.fetches.length,1);
});
test('transport policy rejects writes disguised as reads including multi-operation GraphQL documents',async()=>{
 for(const [url,init] of [
  ['https://api.github.com/repos/owner/board/issues',{method:'POST',body:'{}'}],
  ['https://api.github.com/graphql',{method:'POST',body:JSON.stringify({query:'query A{viewer{id}} mutation B{addComment{id}}',operationName:'B'})}]
 ]){const h=harness({factory:deps=>({readThread:()=>deps.fetch(url,init)})});setDeployment(h,{providerWrites:false});await assert.rejects(h.request('github-thread-read',{kind:'issue',number:1}),/Provider writes are disabled/);assert.equal(h.fetches.length,0);}
 const h=harness({factory:deps=>({readThread:()=>deps.fetch('https://api.github.com/graphql',{method:'POST',body:JSON.stringify({query:'query{viewer{id}}'})})})});setDeployment(h,{providerWrites:false});await h.request('github-thread-read',{kind:'discussion',number:1});assert.equal(h.fetches.length,1);
});
test('network policy revocation during asynchronous authentication stops credential use',async()=>{
 const h=harness();h.vscode.authentication.getSession=async()=>{setDeployment(h,{networkAccess:false});return{accessToken:'synthetic-secret'};};
 await assert.rejects(h.request('github-thread-read',{kind:'issue',number:1}),/Network access is disabled/);assert.equal(h.fetches.length,0);
});
test('thread reads use native GitHub auth host-side while bootstrap exposes only committed remote context',async()=>{
 const h=harness(),context=await h.host.publicContext(h.session);assert.equal(context.prefix,'workspace');assert.equal(context.ref,sha);assert.equal(JSON.stringify(context).includes('SECRET'),false);
 const result=await h.request('github-thread-read',{kind:'issue',number:1});assert.equal(result.body,'Thread');assert.equal(h.invocations[0].file,'workspace/board.kicad_pcb');assert.equal(h.invocations[0].repository,'owner/board');assert.equal(h.auth[0][0],'github');assert.deepEqual(h.auth[0][1],['repo']);assert.equal(h.auth[0][2].silent,true);assert.equal(h.fetches[0].init.redirect,'error');assert.equal(JSON.stringify(result).includes('SECRET'),false);
});
test('untrusted workspaces, foreign repository/host/provider/file/ref and changed Git provenance are rejected before credentials',async()=>{
 for(const bad of [{repository:'other/repo'},{host:'https://evil.example'},{provider:'gitlab'},{file:'../secret'},{ref:'main'}]){const h=harness();await assert.rejects(h.request('github-thread-read',{kind:'issue',number:1,...bad}),/another|match/);assert.equal(h.auth.length,0);}
 const h=harness();h.vscode.workspace.isTrusted=false;await assert.rejects(h.request('github-thread-read',{kind:'issue',number:1}),/Trust/);assert.equal(h.auth.length,0);
 h.vscode.workspace.isTrusted=true;await h.host.publicContext(h.session);h.repo.state.HEAD.commit='b'.repeat(40);await assert.rejects(h.request('github-thread-read',{kind:'issue',number:1}),/changed/);
});
test('dirty displayed sources cannot publish pinned annotations, but ordinary conversation reading remains available',async()=>{
 const h=harness({dirty:true});await assert.rejects(h.request('github-publish-comment',{comment:h.note,destination:'new-issue'}),/differs/);await assert.rejects(h.request('github-annotations'),/differs/);assert.equal(h.auth.length,0);await h.request('github-thread-read',{kind:'issue',number:1});assert.equal(h.invocations.length,1);
});
test('explicit publication remaps anchor to committed remote source and invokes VS Code consent without leaking credential',async()=>{
 const h=harness();const result=await h.request('github-publish-comment',{comment:h.note,destination:'new-issue'});assert.equal(h.invocations[0].comment.anchor.ref,sha);assert.equal(h.invocations[0].comment.anchor.repository,'owner/board');assert.equal(h.invocations[0].comment.anchor.file,'workspace/board.kicad_pcb');assert.equal(h.note.anchor.ref,'workspace');assert.equal(h.auth[0][2].createIfNone,true);assert.equal(JSON.stringify(result).includes('SECRET'),false);
 const bad={...h.note,anchor:{...h.note.anchor,repository:'other/repo'}};await assert.rejects(h.request('github-publish-comment',{comment:bad,destination:'issue',number:1}),/anchor/);
});
test('GitLab connection is explicit and stores token only in exact-origin SecretStorage',async()=>{
 const h=harness({remote:'https://gitlab.com/owner/board.git'});await h.request('open-options',{provider:'gitlab',host:'https://gitlab.com'});assert.equal(h.secrets.get('kiview:gitlab:https://gitlab.com'),'glpat_SECRET000000000000000');assert.equal(h.auth.length,0);const result=await h.request('github-thread-read',{provider:'gitlab',host:'https://gitlab.com',kind:'issue',number:1});assert.equal(result.body,'Thread');assert.equal(h.fetches[0].init.headers.Authorization,'Bearer glpat_SECRET000000000000000');assert.equal(JSON.stringify(result).includes('SECRET'),false);
});
test('host fetch gate rejects foreign destinations even if a provider adapter requests them',async()=>{
 const h=harness({factory:deps=>({readThread:()=>deps.fetch('https://evil.example/repos/owner/board',{headers:{Authorization:'secret'}})})});await assert.rejects(h.request('github-thread-read',{kind:'issue',number:1}),/outside/);assert.equal(h.fetches.length,0);
});

test('closed remote viewers cannot request account connection',async()=>{
 const h=harness();h.session.disposed=true;
 await assert.rejects(h.request('open-options'),/active|closed/);
 assert.equal(h.auth.length,0);
});

test('remote Git activation stops when workspace trust is revoked',async()=>{
 const h=harness();let apiCalls=0;
 h.vscode.extensions.getExtension=()=>({isActive:false,async activate(){h.vscode.workspace.isTrusted=false;return{getAPI(){apiCalls++;return{repositories:[h.repo]};}};}});
 await assert.rejects(h.host.context(h.session),/trust/i);assert.equal(apiCalls,0);
});

test('credential-bearing fetch rechecks trust and viewer lifetime after asynchronous provenance lookup',async()=>{
 for(const revoke of ['trust','viewer']){
  const h=harness({factory:deps=>({readThread:()=>deps.fetch('https://api.github.com/repos/owner/board/issues/1',{headers:{Authorization:'synthetic-secret'}})})});
  let lookups=0;
  h.vscode.extensions.getExtension=()=>({isActive:true,exports:{getAPI(){if(++lookups===2)queueMicrotask(()=>{if(revoke==='trust')h.vscode.workspace.isTrusted=false;else h.session.disposed=true;});return{repositories:[h.repo]};}}});
  await assert.rejects(h.request('github-thread-read',{kind:'issue',number:1}),/trusted|active|closed/);
  assert.equal(h.fetches.length,0);
 }
});
test('GitLab numeric project routes become available only after verified project discovery',async()=>{
 const h=harness({remote:'https://gitlab.com/owner/board.git',factory:deps=>({readThread:()=>deps.fetch('https://gitlab.com/api/v4/projects/42/issues/1')})});await assert.rejects(h.request('github-thread-read',{provider:'gitlab',host:'https://gitlab.com',kind:'issue',number:1}),/outside/);assert.equal(h.fetches.length,0);
});

// Build-time credential adaptation is executed in a host-only test sandbox.
const vm=require('node:vm'),exec=require('node:child_process').execFileSync,path=require('node:path');
const factorySources=JSON.parse(exec('python',['-c',"import json; import scripts.package_vscode as p; print(json.dumps({v:p.host_review_factory((p.ROOT/'extension'/f'{v}-review-api.js').read_bytes(),v).decode() for v in ('github','gitlab')}))"],{cwd:path.resolve(__dirname,'../..'),encoding:'utf8'}));
function realFactory(provider){const sandbox={module:{exports:{}},URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,AbortController,setTimeout,clearTimeout,atob,btoa,FormData,Blob,console};vm.runInNewContext(factorySources[provider],sandbox);return sandbox.module.exports;}
const timestamp='2026-10-26T00:00:00Z',json=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
const issue={id:11,number:1,title:'Review',state:'open',comments:1,body:'Issue body',created_at:timestamp,updated_at:timestamp,user:{login:'reviewer'}};
test('real shared GitHub adapter reads issue body/comments and Discussion nested replies through scoped host transport',async()=>{
 const h=harness({factory:realFactory('github'),transport:async(url,init)=>{
  if(url.endsWith('/graphql')){
   const entry=(id,body)=>({id:'node'+id,databaseId:id,body,createdAt:timestamp,updatedAt:timestamp,author:{login:'reviewer'}});
   const comments={nodes:[{...entry(2,'Parent'),replies:{nodes:[entry(3,'Reply')],pageInfo:{hasNextPage:false,endCursor:null}}}],pageInfo:{hasNextPage:false,endCursor:null}};
   return json({data:{repository:{discussion:{...entry(1,'Discussion body'),number:1,title:'Discussion',closed:false,comments}}}});
  }
  return url.includes('/comments?')?json([{...issue,id:12,body:'Issue reply'}]):json(issue);
 }});
 const thread=await h.request('github-thread-read',{kind:'issue',number:1});assert.equal(thread.body,'Issue body');assert.equal(thread.comments[0].body,'Issue reply');
 const discussion=await h.request('github-thread-read',{kind:'discussion',number:1});assert.equal(discussion.body,'Discussion body');assert.equal(discussion.comments[1].replyTo,'2');assert.ok(h.fetches.every(row=>!row.url.includes('local/workspace')));
});
test('real GitHub publication posts one screenshot-backed issue and retains receipt for duplicate retry',async()=>{
 const posts=[];const h=harness({factory:realFactory('github'),transport:async(url,init)=>{
  if(url.includes('user-attachments')){posts.push(url);return json({url:'https://github.com/user-attachments/assets/12345678-1234-1234-1234-123456789abc'});}
  if(url.endsWith('/issues')&&init.method==='POST'){posts.push(url);const body=JSON.parse(init.body);assert.match(body.body,/user-attachments/);assert.match(body.body,/kicad-review:v1/);return json({number:9,node_id:'issue9'});}
  if(url.includes('/contents/'))return new Response(null,{status:404});
  if(url.endsWith('/user'))return json({login:'reviewer'});
  return json({id:9,full_name:'owner/board',private:false,default_branch:'main',permissions:{push:true}});
 }});
 const note={...h.note,capture:{mime:'image/png',width:1,height:1,dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII='}};
 const result=await h.request('github-publish-comment',{comment:note,destination:'new-issue'});assert.equal(result.remoteRef.number,9);assert.equal(result.attachments.length,1);
 const duplicate=await h.request('github-publish-comment',{comment:note,destination:'new-issue'});assert.equal(duplicate.duplicate,true);assert.equal(posts.length,2);assert.equal(JSON.stringify(result).includes('SECRET'),false);
});
test('real GitLab adapter reads issue discussion groups with host-only SecretStorage token',async()=>{
 const h=harness({remote:'https://gitlab.com/owner/board.git',factory:realFactory('gitlab'),transport:async(url)=>{
  if(url.includes('/discussions?'))return json([{id:'group1',individual_note:false,notes:[{id:2,body:'Parent',created_at:timestamp,updated_at:timestamp,author:{username:'reviewer'}},{id:3,body:'Reply',created_at:timestamp,updated_at:timestamp,author:{username:'reviewer'}}]}]);
  if(url.endsWith('/issues/1'))return json({id:1,iid:1,project_id:42,title:'Issue',state:'opened',description:'GitLab body',created_at:timestamp,updated_at:timestamp,author:{username:'reviewer'}});
  return json({id:42,path_with_namespace:'owner/board'});
 }});
 await h.request('open-options',{provider:'gitlab',host:'https://gitlab.com'});const thread=await h.request('github-thread-read',{provider:'gitlab',host:'https://gitlab.com',kind:'discussion',number:1});assert.equal(thread.body,'GitLab body');assert.equal(thread.comments[1].replyTo,'2');assert.equal(thread.comments[1].discussionId,'group1');
});

test('real GitLab adapter creates an issue with a project-bound screenshot and prevents duplicate writes',async()=>{
 const writes=[];const h=harness({remote:'https://gitlab.com/owner/board.git',factory:realFactory('gitlab'),transport:async(url,init)=>{
  if(url.endsWith('/uploads')){writes.push(url);return json({url:'/uploads/'+'a'.repeat(32)+'/'+init.body.get('file').name});}
  if(url.endsWith('/issues')&&init.method==='POST'){writes.push(url);assert.match(JSON.parse(init.body).description,/uploads/);return json({iid:2});}
  if(url.includes('/repository/files/'))return new Response(null,{status:404});
  if(url.includes('/repository/tree?'))return json([]);
  if(url.endsWith('/api/v4/user'))return json({id:1,username:'reviewer'});
  return json({id:42,path_with_namespace:'owner/board',default_branch:'main',visibility:'public'});
 }});
 await h.request('open-options',{provider:'gitlab',host:'https://gitlab.com'});
 const note={...h.note,capture:{mime:'image/png',width:1,height:1,dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII='}};
 const args={provider:'gitlab',host:'https://gitlab.com',comment:note,destination:'new-issue'};
 const result=await h.request('comment-publish',args);assert.equal(result.remoteRef.provider,'gitlab');assert.equal(result.remoteRef.number,2);assert.equal(result.attachments[0].projectId,42);
 assert.equal((await h.request('comment-publish',args)).duplicate,true);assert.equal(writes.length,2);
});
test('pinned annotation readback preserves remote state but maps anchors back to local workspace paths',async()=>{
 let markdown;const h=harness({factory:realFactory('github'),transport:async url=>url.includes('/comments?')?json([]):json({...issue,comments:0,body:markdown})});
 markdown=comments.toMarkdown({...h.note,state:'skipped',anchor:{repository:'owner/board',ref:sha,file:'workspace/board.kicad_pcb'}});
 const result=await h.request('github-annotations',{issueNumber:1});assert.equal(result.notes.length,1);assert.equal(result.notes[0].state,'skipped');assert.equal(result.notes[0].anchor.repository,'local/workspace');assert.equal(result.notes[0].anchor.ref,'workspace');assert.equal(result.notes[0].anchor.file,'board.kicad_pcb');assert.equal(result.notes[0].github.state,'open');
});


test('GitLab pinned annotations reject foreign-host and foreign-provider markers with identical repository/ref/file',async()=>{
 let markdown;const h=harness({remote:'https://gitlab.com/owner/board.git',factory:realFactory('gitlab'),transport:async url=>{
  if(url.includes('/discussions?'))return json([]);
  if(url.endsWith('/issues/1'))return json({id:1,iid:1,project_id:42,title:'Issue',state:'opened',description:markdown,created_at:timestamp,updated_at:timestamp,author:{username:'reviewer'}});
  return json({id:42,path_with_namespace:'owner/board'});
 }});
 const anchor={repository:'owner/board',ref:sha,file:'workspace/board.kicad_pcb'};
 markdown=[{id:'matching',anchor:{...anchor,provider:'gitlab',host:'https://gitlab.com'}},{id:'foreign_host',anchor:{...anchor,provider:'gitlab',host:'https://other.example.org'}},{id:'foreign_provider',anchor}].map(value=>comments.toMarkdown({...h.note,...value})).join('\n');
 const result=await h.request('comment-remote-list',{provider:'gitlab',host:'https://gitlab.com',issueNumber:1});assert.deepEqual(Array.from(result.notes,n=>n.id),['matching']);assert.equal(result.notes[0].anchor.repository,'local/workspace');assert.equal(result.notes[0].anchor.provider,undefined);assert.equal(result.notes[0].anchor.host,undefined);
});
test('GitHub Issue and Discussion annotation branches retain only exact provider provenance',async()=>{
 const anchor={repository:'owner/board',ref:sha,file:'workspace/board.kicad_pcb'},good={id:'matching',text:'Valid',createdAt:timestamp,anchor},foreign={id:'foreign_provider',text:'Other provider',createdAt:timestamp,anchor:{...anchor,provider:'gitlab',host:'https://gitlab.com'}};
 let markdown=[good,foreign].map(value=>comments.toMarkdown(value)).join('\n');
 const issueHost=harness({factory:realFactory('github'),transport:async url=>url.includes('/comments?')?json([]):json({...issue,comments:0,body:markdown})});
 assert.deepEqual(Array.from((await issueHost.request('github-annotations',{issueNumber:1})).notes,n=>n.id),['matching']);
 const discussionHost=harness({factory:()=>({readDiscussionAnnotations:async()=>({notes:[good,foreign],warnings:[]})})});
 assert.deepEqual(Array.from((await discussionHost.request('github-annotations',{discussionNumber:1})).notes,n=>n.id),['matching']);
});


test('host publication lock excludes concurrent screenshot retries across generated API instances and preserves completed receipts',{timeout:5000},async()=>{
 for(const provider of ['github','gitlab']){
  let release,reached;const started=new Promise(resolve=>reached=resolve),gate=new Promise(resolve=>release=resolve);const writes=[];let attempts=0;
  // Advance pacing by four seconds between provider attempts while upload stays blocked.
  const commentAPI={...comments,reservePublication:(storage,scope,now)=>comments.reservePublication(storage,scope,now+4000*attempts++)};
  const h=harness({commentAPI,remote:provider==='github'?'git@github.com:owner/board.git':'https://gitlab.com/owner/board.git',factory:realFactory(provider),transport:async(url,init)=>{
   if(url.includes('user-attachments')||url.endsWith('/uploads')){writes.push('upload');reached();await gate;return provider==='github'?json({url:'https://github.com/user-attachments/assets/12345678-1234-1234-1234-123456789abc'}):json({url:'/uploads/'+'a'.repeat(32)+'/'+init.body.get('file').name});}
   if(url.endsWith('/issues')&&init.method==='POST'){writes.push('issue');return provider==='github'?json({number:9,node_id:'issue9'}):json({iid:9});}
   if(url.includes('/contents/')||url.includes('/repository/files/'))return new Response(null,{status:404});
   if(url.includes('/repository/tree?'))return json([]);
   if(url.endsWith('/user'))return provider==='github'?json({login:'reviewer'}):json({id:1,username:'reviewer'});
   return provider==='github'?json({id:42,full_name:'owner/board',private:false,default_branch:'main',permissions:{push:true}}):json({id:42,path_with_namespace:'owner/board',default_branch:'main',visibility:'public'});
  }});
  if(provider==='gitlab')await h.request('open-options',{provider,host:'https://gitlab.com'});
  const note={...h.note,capture:{mime:'image/png',width:1,height:1,dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII='}},args={comment:note,destination:'new-issue',...(provider==='gitlab'?{provider,host:'https://gitlab.com'}:{})};
  const first=h.request('comment-publish',args);await started;
  await assert.rejects(h.request('comment-publish',args),/Publication already in progress/);
  await assert.rejects(h.request('comment-publish',{...args,destination:'issue',number:9,comment:{...note,text:'Changed payload'}}),/Publication already in progress/);
  assert.deepEqual(writes,['upload']);release();assert.equal((await first).remoteRef.number,9);
  const retry=await h.request('comment-publish',args);assert.equal(retry.duplicate,true);assert.deepEqual(writes,['upload','issue']);
 }
});
test('publication guard releases after failure so a later explicit retry can proceed',async()=>{
 let attempts=0;const h=harness({factory:()=>({publish:async()=>{attempts++;if(attempts===1)throw Error('Synthetic definitive failure');return{remoteRef:{number:7}};}})});
 const args={comment:h.note,destination:'new-issue'};await assert.rejects(h.request('comment-publish',args),/Synthetic/);assert.equal((await h.request('comment-publish',args)).remoteRef.number,7);assert.equal(attempts,2);
});

test('chat writes bind workspace scope, verify annotation sources and exclude concurrent request-scoped adapters',async()=>{
 let entered,release,received;const started=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);
 const h=harness({factory:()=>({chatMessageWrite:async args=>{received=args;entered();await gate;return{messageId:'12'};}})});
 const args={thread:{kind:'issue',number:1},action:'create',body:'Hello',clientMutationId:'mutation_0123456789'};
 const first=h.request('chat-message-write',args);await started;
 await assert.rejects(h.request('chat-message-write',args),/already being sent/);release();assert.equal((await first).messageId,'12');
 assert.equal(received.repository,'owner/board');assert.equal(received.ref,sha);assert.equal(received.file,'workspace/board.kicad_pcb');assert.equal(h.auth[0][2].createIfNone,true);
 const dirty=harness({dirty:true});await assert.rejects(dirty.request('chat-message-write',{...args,annotation:{...dirty.note,id:args.clientMutationId,text:args.body}}),/differs/);assert.equal(dirty.auth.length,0);
 await assert.rejects(h.request('chat-message-write',{...args,annotation:{...h.note,anchor:{...h.note.anchor,repository:'foreign/repo'}}}),/another workspace/);
});

test('real GitHub chat adapter writes quoted reply and reads capabilities through host credentials',async()=>{
 const posted=[];const h=harness({factory:realFactory('github'),transport:async(url,init)=>{
  if(init.method==='POST'){posted.push(JSON.parse(init.body));return json({...issue,id:12});}
  if(url.endsWith('/user'))return json({login:'reviewer'});
  if(url.includes('/contents/'))return new Response(null,{status:404});
  if(url.includes('/comments?'))return json([{...issue,id:11}]);
  if(url.endsWith('/issues/1'))return json(issue);
  return json({full_name:'owner/board',default_branch:'main',private:false});
 }});
 const args={thread:{kind:'issue',number:1},action:'reply',replyTo:'11',body:'Reply',clientMutationId:'mutation_0123456789'};
 assert.equal((await h.request('chat-message-write',args)).messageId,'12');assert.match(posted[0].body,/^> Reply to/);
 assert.equal((await h.request('chat-message-write',args)).duplicate,true);assert.equal(posted.length,1);
 assert.equal((await h.request('github-thread-read',{kind:'issue',number:1,includeCapabilities:true})).comments[0].canEdit,true);
});

test('real conversation discovery adapter uses workspace-bound host transport',async()=>{
 const h=harness({factory:realFactory('github'),transport:async(url,init)=>{assert.ok(url.includes('/repos/owner/board/issues?'));assert.equal(init.method,'GET');return json([{...issue,pull_request:{}},{...issue,number:2,title:'Conversation'}]);}});
 const result=await h.request('chat-thread-list',{kind:'issue',page:2});assert.equal(result.threads.length,1);assert.equal(result.threads[0].url,'https://github.com/owner/board/issues/2');assert.ok(h.fetches[0].url.endsWith('page=2'));
 await assert.rejects(h.request('chat-thread-list',{kind:'issue',repository:'foreign/repo'}),/another repository/);
});

test('thread state host requires native confirmation and binds provider scope without exposing credentials',async()=>{
 let received;const h=harness({factory:()=>({chatThreadState:async args=>{received=args;return{state:args.state};}})});h.vscode.window.showWarningMessage=async(_message,_options,action)=>action;
 const args={thread:{kind:'issue',number:42},state:'closed',expectedUpdatedAt:'2026-10-27T00:00:00Z',confirmed:true};
 assert.equal((await h.request('chat-thread-state',args)).state,'closed');assert.equal(received.repository,'owner/board');assert.equal(received.ref,sha);assert.equal(received.file,'workspace/board.kicad_pcb');assert.equal(received.provider,'github');assert.equal(JSON.stringify(received).includes('SECRET'),false);
 await assert.rejects(h.request('chat-thread-state',{...args,confirmed:false}),/Confirm/);h.vscode.window.showWarningMessage=async()=>undefined;await assert.rejects(h.request('chat-thread-state',args),/cancelled/);
 setDeployment(h,{providerWrites:false});await assert.rejects(h.request('chat-thread-state',args),/Provider writes/);
});

for(const provider of ['github','gitlab'])test('real '+provider+' state adapter uses the host-pinned provider transport',async()=>{
 const lab=provider==='gitlab';let writes=0;
 const h=harness({remote:lab?'https://gitlab.com/owner/board.git':'git@github.com:owner/board.git',factory:realFactory(provider),transport:async(url,init)=>{
  if(url.endsWith('/user'))return json(lab?{id:7,username:'reviewer'}:{login:'reviewer'});
  if(url.includes('/contents/')||url.includes('/repository/files/'))return new Response(null,{status:404});
  if(url.includes('/repository/tree?'))return json([]);
  if(url.endsWith('/graphql')){const input=JSON.parse(init.body),mutation=input.query.startsWith('mutation'),value={id:'I_verified',number:1,closed:mutation,updatedAt:timestamp,viewerCanClose:true,viewerCanReopen:false};if(mutation){writes++;assert.equal(input.variables.input.issueId,'I_verified');return json({data:{closeIssue:{issue:value}}});}return json({data:{repository:{nameWithOwner:'owner/board',issue:value}}});}
  if(lab&&url.endsWith('/issues/1')){const mutation=init.method==='PUT';if(mutation){writes++;assert.deepEqual(JSON.parse(init.body),{state_event:'close'});}return json({id:11,iid:1,project_id:42,title:'Issue',updated_at:timestamp,state:mutation?'closed':'opened',author:{id:7,username:'reviewer'}});}
  return json({id:42,path_with_namespace:'owner/board',full_name:'owner/board',visibility:'public',private:false,default_branch:'main'});
 }});h.vscode.window.showWarningMessage=async(_message,_options,action)=>action;if(lab)await h.host.connect(h.session);
 const request={thread:{kind:'issue',number:1},state:'closed',expectedUpdatedAt:timestamp,confirmed:true};const result=await h.request('chat-thread-state',request);assert.equal(result.state,'closed');assert.equal(result.repository,'owner/board');assert.equal(writes,1);assert.equal((await h.request('chat-thread-state',request)).duplicate,true);assert.equal(writes,1);assert.ok(h.fetches.every(row=>row.init.redirect==='error'&&row.init.credentials==='omit'));
});
test('host state changes serialize across separately created provider adapters',async()=>{
 let release;const h=harness({factory:()=>({chatThreadState:()=>new Promise(resolve=>release=resolve)})});h.vscode.window.showWarningMessage=async(_message,_options,action)=>action;
 const request={thread:{kind:'issue',number:1},state:'closed',expectedUpdatedAt:timestamp,confirmed:true},first=h.request('chat-thread-state',request);while(!release)await new Promise(setImmediate);await assert.rejects(h.request('chat-thread-state',request),/already being changed/);release({state:'closed'});await first;
});
