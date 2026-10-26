"use strict";
// Host-only collaboration. The webview never supplies credentials or destinations.
const REMOTE_OPERATIONS=new Set(['chat-thread-list','chat-message-write','chat-reaction','comment-mention-users','mention-users','comment-policy-status','comment-remote-list','github-thread-read','github-annotations','github-discussion-categories','github-comment-policy','github-publish-comment','github-recover-publication','comment-publish','open-options']);
function remoteURL(value){
 if(typeof value!=='string'||value.length>1000)return null;
 let host,path;const ssh=/^git@([^:/]+):(.+)$/.exec(value);
 if(ssh){host=ssh[1];path=ssh[2];}else{let u;try{u=new URL(value);}catch{return null;}if(!['https:','ssh:'].includes(u.protocol)||u.password||u.search||u.hash||u.port||u.username&&u.username!=='git')return null;host=u.hostname;path=u.pathname.replace(/^\//,'');}
 host=host.toLowerCase();path=path.replace(/\.git$/,'').replace(/\/$/,'');
 if(!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host)||host==='localhost'||!host.includes('.')||/^\d+(?:\.\d+){3}$/.test(host)||host.endsWith('.local')||host.endsWith('.localhost')||! /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/.test(path)||path.split('/').some(x=>x==='.'||x==='..'))return null;
 const provider=host==='github.com'?'github':'gitlab';if(provider==='github'&&path.split('/').length!==2)return null;
 return{provider,host:'https://'+host,repository:path};
}
function createHost(vscode,{sameScope,comments,apiFactory,readCommitted,fetch:fetcher=globalThis.fetch}={}){
 const memory=new Map(),publicationLocks=new Map();
 async function publication(message,session,ctx,work){
  const note=message.comment;
  if(typeof note?.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(note.id)||!['new-issue','issue','new-discussion','discussion'].includes(message.destination)||(message.number!==undefined&&(!Number.isSafeInteger(message.number)||message.number<1)))throw Error('Invalid remote publication identity.');
  const identity=[session.scope.boundary.toString(),ctx.provider,ctx.host,ctx.repository,ctx.ref,mapFile(ctx,note.anchor.file),note.id];
  const noteKey=JSON.stringify(identity),operationKey=JSON.stringify([...identity,message.destination,message.number||0]);
  // Provider API instances are request-scoped. Keep their mutation exclusion at
  // host scope so slow uploads cannot race a retry after the pacing window.
  if(publicationLocks.has(noteKey))throw Error('Publication already in progress for this note. Wait for it to finish before retrying or choosing another destination.');
  publicationLocks.set(noteKey,operationKey);
  try{return await work();}finally{if(publicationLocks.get(noteKey)===operationKey)publicationLocks.delete(noteKey);}
 }
 async function context(session){
  if(vscode.workspace.isTrusted!==true)throw Error('Trust this workspace before connecting remote collaboration.');
  if(session.scope.boundary.scheme!=='file')throw Error('Remote collaboration requires a local Git workspace.');
  const ext=vscode.extensions?.getExtension('vscode.git');if(!ext)throw Error('Enable the VS Code Git extension for remote collaboration.');
  const exports=ext.isActive?ext.exports:await ext.activate();
  const gitAPI=exports.getAPI(1),repo=(gitAPI.repositories||[]).filter(r=>sameScope(session.uri,r.rootUri)).sort((a,b)=>b.rootUri.path.length-a.rootUri.path.length)[0];
  if(!repo||typeof repo.show!=='function'||! /^[a-f0-9]{40}$/i.test(repo.state?.HEAD?.commit||''))throw Error('A committed Git repository is required for remote collaboration.');
  const remotes=repo.state.remotes||[],origin=remotes.find(r=>r.name==='origin')||remotes[0],remote=remoteURL(origin?.fetchUrl);
  if(!remote)throw Error('The Git remote is not a supported GitHub or GitLab repository.');
  if(origin.pushUrl&&JSON.stringify(remoteURL(origin.pushUrl))!==JSON.stringify(remote))throw Error('Fetch and push remotes differ; resolve this ambiguity before collaboration.');
  const prefix=session.scope.boundary.path.slice(repo.rootUri.path.replace(/\/$/,'').length).replace(/^\//,'');
  if(prefix&&prefix.split('/').some(x=>!x||x==='.'||x==='..'))throw Error('Workspace is outside its Git repository.');
  const current={...remote,ref:repo.state.HEAD.commit.toLowerCase(),prefix};
  if(session.remoteBinding&&JSON.stringify(session.remoteBinding)!==JSON.stringify(current))throw Error('The Git remote or commit changed. Reopen this drawing before remote collaboration.');
  session.remoteBinding=current;return{...current,repo,gitPath:gitAPI.git?.path};
 }
 async function publicContext(session){try{const {repo,gitPath,...value}=await context(session);return value;}catch{return null;}}
 function mapFile(ctx,file){return ctx.prefix?ctx.prefix+'/'+file:file;}
 async function verify(session,ctx){
  // VS Code Repository.show uses --textconv; compare raw committed blob bytes instead.
  let reader;
  if(!readCommitted){if(!ctx.gitPath||!ctx.repo.rootUri.fsPath)throw Error('Raw Git object verification is unavailable. Thread reading works; publishing requires native Git.');reader=require('./git-history-tree.js').createGitHistoryReader({gitPath:ctx.gitPath,rootPath:ctx.repo.rootUri.fsPath,isTrusted:()=>vscode.workspace.isTrusted===true});}
  const deadline=Date.now()+60000;let verifiedBytes=0;
  for(const file of session.files){if(Date.now()>=deadline)throw Error('Committed-source verification timed out. Nothing was published.');verifiedBytes+=new TextEncoder().encode(file.content).byteLength;if(verifiedBytes>24*1024*1024)throw Error('Committed-source verification exceeds 24 MiB. Nothing was published.');const path=mapFile(ctx,file.path),committed=readCommitted?await readCommitted(ctx,path):new TextDecoder('utf-8',{fatal:true}).decode((await reader.read({sha:ctx.ref,path,maxBytes:8*1024*1024})).bytes);if(committed!==file.content)throw Error('The displayed drawing differs from the committed Git revision. Commit the changes and reopen before publishing or reading pinned annotations.');}
 }
 async function credential(ctx,create=false,secrets){
  if(vscode.workspace.isTrusted!==true)throw Error('Workspace trust was revoked.');
  if(ctx.provider==='github'){
   const value=await vscode.authentication.getSession('github',['repo'],{createIfNone:create,silent:!create});
   return value?{token:value.accessToken,expiresAt:Date.now()+3600000}:null;
  }
  const token=await secrets?.get('kiview:gitlab:'+ctx.host);return token?{token,expiresAt:Date.now()+3600000}:null;
 }
 async function connect(session){
  const ctx=await context(session);
  if(ctx.provider==='github'){await credential(ctx,true);return{connected:true};}
  const token=await vscode.window.showInputBox({title:'Connect GitLab: '+ctx.host,prompt:'Token for this exact Git remote host (api scope). Stored only in VS Code SecretStorage.',password:true,ignoreFocusOut:true});
  if(token===undefined)return{connected:false};if(typeof token!=='string'||token.length<20||token.length>1000||/[^\x21-\x7e]/.test(token))throw Error('Invalid GitLab token.');
  if(vscode.workspace.isTrusted!==true)throw Error('Workspace trust changed.');await session.context.secrets.store('kiview:gitlab:'+ctx.host,token);return{connected:true};
 }
 function storage(session){
  const prefix='kiview:remote:'+session.scope.boundary.toString()+':';
  const area=persist=>({get:async key=>{const keys=Array.isArray(key)?key:[key],out={};for(const name of keys)out[name]=persist?session.context.workspaceState.get(prefix+name):memory.get(prefix+name);return out;},set:async values=>{for(const [key,value]of Object.entries(values))if(persist)await session.context.workspaceState.update(prefix+key,value);else memory.set(prefix+key,value);},remove:async keys=>{for(const key of Array.isArray(keys)?keys:[keys])if(persist)await session.context.workspaceState.update(prefix+key,undefined);else memory.delete(prefix+key);}});
  return{storage:{local:area(true),session:area(false)}};
 }
 async function dispatch(message,session){
  const ctx=await context(session);
  if(message.provider!==undefined&&message.provider!==ctx.provider||message.host!==undefined&&message.host!==ctx.host)throw Error('Remote provider or host does not match this Git workspace.');
  for(const key of ['repository','pullRepository','targetRepository'])if(message[key]!==undefined&&![session.scope.repository,ctx.repository].includes(message[key]))throw Error('Remote request belongs to another repository.');
  if(message.ref!==undefined&&![session.scope.ref,ctx.ref].includes(message.ref))throw Error('Remote request belongs to another revision.');
  const file=message.file||message.comment?.anchor?.file||session.scope.rootFile;if(!session.paths.has(file))throw Error('Remote request belongs to another drawing.');
  if(message.type==='open-options')return connect(session);
  if(!REMOTE_OPERATIONS.has(message.type))throw Error('Unsupported remote collaboration operation.');
  const write=['github-publish-comment','github-recover-publication','comment-publish'].includes(message.type);
  const chat=message.type==='chat-message-write';
  if(chat&&message.annotation){const a=message.annotation.anchor;if(a?.repository!==session.scope.repository||a.ref!==session.scope.ref||!session.paths.has(a.file))throw Error('Chat annotation belongs to another workspace.');await verify(session,ctx);}
  if(chat)await credential(ctx,ctx.provider==='github');
  if(write||['github-annotations','comment-remote-list'].includes(message.type))await verify(session,ctx);
  if(write){if(!message.comment)throw Error('An explicit review note is required.');const a=message.comment.anchor;if(a?.repository!==session.scope.repository||a.ref!==session.scope.ref||!session.paths.has(a.file))throw Error('Publication anchor belongs to another workspace.');await credential(ctx,ctx.provider==='github');}
  let requests=0,bytes=0,projectId=null;const deadline=Date.now()+120000;
  const safeFetch=async(url,init={})=>{
   if(vscode.workspace.isTrusted!==true||session.disposed)throw Error('The trusted viewer is no longer active.');
   // Recheck provenance before every credential-bearing request, including writes.
   await context(session);const u=new URL(url);if(u.username||u.password||u.hash)throw Error('Invalid remote API destination.');
   const github=ctx.provider==='github',project='/api/v4/projects/'+encodeURIComponent(ctx.repository);
   const allowed=github?(u.origin==='https://api.github.com'&&(u.pathname==='/user'||['mention-users','comment-mention-users'].includes(message.type)&&u.pathname==='/search/users'||u.pathname==='/graphql'||u.pathname==='/repos/'+ctx.repository||u.pathname.startsWith('/repos/'+ctx.repository+'/'))||u.origin==='https://uploads.github.com'&&u.pathname==='/user-attachments/assets'):
    u.origin===ctx.host&&(u.pathname==='/api/v4/user'||['mention-users','comment-mention-users'].includes(message.type)&&u.pathname==='/api/v4/users'||u.pathname===project||u.pathname.startsWith(project+'/')||projectId!==null&&(u.pathname==='/api/v4/projects/'+projectId||u.pathname.startsWith('/api/v4/projects/'+projectId+'/')));
   if(!allowed||++requests>40||Date.now()>=deadline)throw Error('Remote API request is outside this workspace or its request budget.');
   const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(()=>controller.abort(),Math.min(30000,Math.max(1,deadline-Date.now())));
   init.signal?.addEventListener('abort',abort,{once:true});if(init.signal?.aborted)abort();
   try{const response=await fetcher(url,{...init,signal:controller.signal,redirect:'error',credentials:'omit'});
   const reader=response.body?.getReader(),chunks=[];let size=0;
   const cancel=()=>reader?.cancel().catch(()=>{});controller.signal.addEventListener('abort',cancel,{once:true});if(controller.signal.aborted)cancel();
   if(reader){try{for(;;){const value=await reader.read();if(value.done)break;size+=value.value.byteLength;bytes+=value.value.byteLength;if(size>4*1024*1024||bytes>32*1024*1024)throw Error('Remote response exceeds its byte budget.');chunks.push(value.value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{controller.signal.removeEventListener('abort',cancel);}}
   if(controller.signal.aborted)throw Error('Remote collaboration request timed out.');
   const body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
   if(!github&&u.pathname===project&&response.ok){const value=JSON.parse(new TextDecoder().decode(body));if(value.path_with_namespace!==ctx.repository||!Number.isSafeInteger(value.id)||value.id<1)throw Error('GitLab project identity does not match the workspace.');projectId=value.id;}
   return new Response(response.status===204?null:body,{status:response.status,statusText:response.statusText,headers:response.headers});
   }finally{clearTimeout(timer);init.signal?.removeEventListener('abort',abort);}
  };
  const dependencies={chrome:storage(session),fetch:safeFetch,crypto:globalThis.crypto,KiCadReviewComments:comments,credential:host=>{if(host&&host!==ctx.host)throw Error('Credential host mismatch.');return credential(ctx,false,session.context.secrets);}};
  if(['mention-users','comment-mention-users'].includes(message.type)){const mentions=require('./media/mention-users.js').create({authorizationHeaders:async()=>{const value=await credential(ctx,false,session.context.secrets);return value?{Authorization:'Bearer '+value.token}:{};},fetcher:safeFetch});return mentions.lookup({...message,provider:ctx.provider,host:ctx.host,repository:ctx.repository});}
  const api=(apiFactory||require('./media/'+ctx.provider+'-review-host-api.js'))(dependencies);api.hostProjectId=()=>projectId;
  const scope={provider:ctx.provider,...(ctx.provider==='gitlab'?{host:ctx.host}:{}),repository:ctx.repository,ref:ctx.ref,file:mapFile(ctx,file)};
  if(message.type==='github-thread-read')return api.readThread({...scope,kind:message.kind,number:message.number,includeCapabilities:message.includeCapabilities===true});
  if(message.type==='chat-thread-list')return api.chatThreadList({...scope,kind:message.kind,page:message.page,cursor:message.cursor});
  if(message.type==='chat-reaction')throw Error('Chat reactions are not supported by this provider bridge.');
  if(chat){
   if(typeof message.clientMutationId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(message.clientMutationId)||!['issue','discussion'].includes(message.thread?.kind)||!Number.isSafeInteger(message.thread?.number)||message.thread.number<1)throw Error('Invalid chat publication identity.');
   const key=JSON.stringify(['chat',session.scope.boundary.toString(),ctx.provider,ctx.host,ctx.repository,message.thread.kind,message.thread.number,message.clientMutationId]);
   if(publicationLocks.has(key))throw Error('This chat message is already being sent. Wait before retrying.');
   publicationLocks.set(key,true);
   try{const annotation=message.annotation?{...message.annotation,anchor:{...message.annotation.anchor,...scope,file:mapFile(ctx,message.annotation.anchor.file)}}:undefined;return await api.chatMessageWrite({...message,...scope,...(annotation?{annotation}:{})});}finally{publicationLocks.delete(key);}
  }
  if(['github-comment-policy','comment-policy-status'].includes(message.type))return ctx.provider==='github'?api.commentPolicyStatus(ctx.repository):api.commentPolicyStatus(ctx.host,ctx.repository);
  if(message.type==='github-discussion-categories'){if(ctx.provider!=='github')throw Error('GitLab uses issue discussions.');return (await api.categories(ctx.repository)).categories;}
  const outbound=message.comment?{...message,repository:ctx.repository,provider:ctx.provider,host:ctx.host,comment:{...message.comment,anchor:{...message.comment.anchor,...scope,file:mapFile(ctx,message.comment.anchor.file)}}}:null;
  if(message.type==='github-recover-publication'){if(ctx.provider!=='github')throw Error('Open the GitLab issue to check an uncertain publication.');return publication(message,session,ctx,()=>api.recoverPublication(outbound,args=>annotations(args,session,ctx,api,true)));}
  if(write)return publication(message,session,ctx,()=>api.publish(outbound));
  if(['github-annotations','comment-remote-list'].includes(message.type))return annotations({...message,...scope},session,ctx,api);
  throw Error('Unsupported remote operation.');
 }
 async function annotations(args,session,ctx,api,raw=false){
  const file=args.file||args.scope?.file||mapFile(ctx,session.scope.rootFile),scope={provider:ctx.provider,...(ctx.provider==='gitlab'?{host:ctx.host}:{}),repository:ctx.repository,ref:ctx.ref,file};
  let result;
  if(ctx.provider==='github'&&args.discussionNumber)result=await api.readDiscussionAnnotations({repository:ctx.repository,number:args.discussionNumber,scope});
  else{
   const numbers=[args.issueNumber||args.pullNumber].filter(Boolean),notes=[],warnings=[];if(numbers.some(n=>!Number.isSafeInteger(n)||n<1))throw Error('Invalid issue number.');
   if(!numbers.length&&ctx.provider==='github'){
    const read=await api.createAnnotationReader(),issues=await read('/repos/'+ctx.repository+'/issues?state=all&per_page=5&page=1');if(!Array.isArray(issues)||issues.length>5)throw Error('Invalid issue listing.');for(const issue of issues)if(Number.isSafeInteger(issue.number)&&issue.number>0)numbers.push(issue.number);
    warnings.push('Annotation scan is limited to 5 recent issues; choose a thread number to inspect older reviews.');
   }
   if(!numbers.length)warnings.push('Choose an existing GitLab issue number to load its annotations.');
   for(const number of numbers){const thread=await api.readThread({...scope,kind:'issue',number});warnings.push(...thread.warnings);for(const row of [thread,...thread.comments]){let parsed;try{parsed=comments.fromMarkdown(row.body);}catch{continue;}for(const note of parsed)if(note.anchor.repository===ctx.repository&&note.anchor.ref===ctx.ref&&note.anchor.file===file){if(ctx.provider==='gitlab'&&note.attachments?.some(a=>a.projectId!==api.hostProjectId())){warnings.push('Screenshot attachments with a mismatched GitLab project were omitted.');note.attachments=note.attachments.filter(a=>a.projectId===api.hostProjectId());}notes.push({...note,github:{provider:ctx.provider,url:row.url,number,state:thread.state,source:row===thread?'issue':row.discussionId?'discussion-comment':'issue-comment',author:row.author,createdAt:row.createdAt,updatedAt:row.updatedAt}});if(notes.length>=500)break;}}}
   result={notes:notes.slice(0,500),warnings:[...new Set(warnings)]};
  }
  // Markdown may contain markers copied from another host/provider with identical
  // repository, commit and path. Bind provenance before rewriting anchors locally.
  result={...result,notes:result.notes.filter(note=>{
   const anchor=note?.anchor;
   return anchor&&(anchor.provider||'github')===ctx.provider&&(ctx.provider!=='gitlab'||anchor.host===ctx.host)&&anchor.repository===ctx.repository&&anchor.ref===ctx.ref&&anchor.file===file;
  })};
  if(raw)return result;
  return{...result,notes:result.notes.map(note=>{const {provider,host,...anchor}=note.anchor;return{...note,anchor:{...anchor,repository:session.scope.repository,ref:session.scope.ref,file:ctx.prefix?note.anchor.file.slice(ctx.prefix.length+1):note.anchor.file}};})};
 }
 return{dispatch,publicContext,context,connect,operations:REMOTE_OPERATIONS};
}
module.exports={createHost,remoteURL,REMOTE_OPERATIONS};
