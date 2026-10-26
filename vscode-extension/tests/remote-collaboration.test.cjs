'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHost,remoteURL}=require('../remote-collaboration.js'),comments=require('../../extension/review-comments.js');
const sha='a'.repeat(40),content='(kicad_pcb)',uri=path=>({scheme:'file',path,toString(){return 'file://'+path;}});
function harness({remote='git@github.com:owner/board.git',factory,dirty=false,transport,commentAPI=comments}={}){
 const values=new Map(),secrets=new Map(),auth=[],fetches=[],invocations=[];
 const repo={rootUri:uri('/repo'),state:{HEAD:{commit:sha},remotes:[{name:'origin',fetchUrl:remote}]},show:async(ref,path)=>dirty?'different':content};
 const vscode={workspace:{isTrusted:true},extensions:{getExtension:()=>({isActive:true,exports:{getAPI:()=>({repositories:[repo]})}})},authentication:{getSession:async(...args)=>{auth.push(args);return{accessToken:'gho_SUPERSECRET000000000000'};}},window:{showInputBox:async()=> 'glpat_SECRET000000000000000'}};
 const session={uri:uri('/repo/workspace/board.kicad_pcb'),scope:{boundary:uri('/repo/workspace'),repository:'local/workspace',ref:'workspace',rootFile:'board.kicad_pcb'},paths:new Set(['board.kicad_pcb']),files:[{path:'board.kicad_pcb',content}],context:{secrets:{get:async k=>secrets.get(k),store:async(k,v)=>secrets.set(k,v)},workspaceState:{get:k=>values.get(k),update:async(k,v)=>values.set(k,v)}}};
 const apiFactory=deps=>factory?factory(deps):({readThread:async args=>{invocations.push(args);const credential=await deps.credential(args.host);await deps.fetch(args.provider==='github'?'https://api.github.com/repos/owner/board/issues/1':'https://gitlab.com/api/v4/projects/owner%2Fboard',{headers:{Authorization:'Bearer '+credential?.token}});return{kind:'issue',number:1,body:'Thread',comments:[],warnings:[]};},publish:async args=>{invocations.push(args);await deps.credential(args.host);return{remoteRef:{kind:'issue',repository:args.repository,number:1,url:'https://github.com/'+args.repository+'/issues/1',publishedAt:'2026-10-26T00:00:00Z'}};},commentPolicyStatus:async()=>({allowed:true}),categories:async()=>({categories:[{id:'id',name:'Help'}]})});
 const host=createHost(vscode,{sameScope:(file,root)=>file.path.startsWith(root.path+'/'),comments:commentAPI,apiFactory,readCommitted:async(ctx,path)=>dirty?'different':content,fetch:async(url,init)=>{fetches.push({url,init});return transport?transport(url,init):new Response(JSON.stringify({path_with_namespace:'owner/board',id:42}));}});
 const request=(type,extra={})=>host.dispatch({type,repository:'local/workspace',ref:'workspace',file:'board.kicad_pcb',...extra},session);
 const note={id:'note',text:'Review R1',severity:'info',createdAt:'2026-10-26T00:00:00Z',anchor:{repository:'local/workspace',ref:'workspace',file:'board.kicad_pcb'}};
 return{host,request,session,vscode,repo,note,secrets,auth,fetches,invocations};
}
test('remote parsing excludes credentials, ambiguous paths and local/network destinations',()=>{
 assert.deepEqual(remoteURL('git@github.com:owner/board.git'),{provider:'github',host:'https://github.com',repository:'owner/board'});
 assert.equal(remoteURL('https://gitlab.com/group/sub/board.git').repository,'group/sub/board');
 for(const remote of ['https://user:secret@github.com/owner/repo','http://github.com/o/r','https://127.0.0.1/o/r','https://localhost/o/r','https://git.local/o/r','https://github.com/o/../r','git@github.com:../r','https://github.com/o/r?token=secret'])assert.equal(remoteURL(remote),null,remote);
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
