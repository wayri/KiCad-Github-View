/* Trusted viewer side. Website credentials remain in the separate repository browser. */
((root)=>{'use strict';
 const repo=value=>{const raw=String(value||'').trim();let name=raw;if(raw.startsWith('https://')){const u=new URL(raw);if(u.origin!=='https://github.com'||u.search||u.hash||u.username||u.password)throw Error('Enter a github.com repository home URL.');name=u.pathname.replace(/^\/|\/$/g,'');}if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(name)||name.split('/').some(p=>p==='.'||p==='..'))throw Error('Enter owner/repository or its GitHub home URL.');return name;};
 function bridge(native,{later=root.setTimeout,clear=root.clearTimeout}={}){
  let next=0;const pending=new Map();
  function request(message){return new Promise((resolve,reject)=>{
   if(typeof native()?.repositoryBrowserRequest!=='function')return reject(Error('Repository browser requires the updated Android app.'));
   if(pending.size>=8)return reject(Error('Wait for the current repository operation.'));
   const id=++next,timer=later(()=>{pending.delete(id);try{native().cancelRepositoryBrowserRequest?.(id);}catch{}reject(Error('Repository browser timed out. A send may have completed; refresh before retrying.'));},message.action==='import'?1800000:90000);
   pending.set(id,{resolve,reject,timer,importing:message.action==='import'});
   try{native().repositoryBrowserRequest(id,JSON.stringify(message));}catch{pending.delete(id);clear(timer);reject(Error('Repository browser unavailable.'));}
  });}
  function reply(id,value){const item=pending.get(id);if(!item||!value||typeof value.ok!=='boolean')return;pending.delete(id);clear(item.timer);if(value.ok){if(item.importing)native().acceptRepositoryBrowserRequest?.(id);item.resolve(value.result);}else item.reject(Error(value.error||'Repository website operation failed.'));}
  return{request,reply};
 }
 async function discover(repository,call,{textFile,assetFile=p=>/\.(step|stp|wrl|vrml|glb|pdf)$/i.test(p)}={}){
  const context=await call({type:'source',repository,action:'context',ref:'HEAD'});
  if(context.repository!==repository||! /^[a-f0-9]{40}$/.test(context.sha||'')||typeof context.directory!=='string'||!Array.isArray(context.items))throw Error('Repository identity was not resolved. Complete website sign-in or SSO, then retry.');
  const safe=p=>typeof p==='string'&&p.length<=500&&p.split('/').every(n=>n&&n!=='.'&&n!=='..'&&!/[\\:\x00-\x1f\x7f]/.test(n));
  if(context.directory&&!safe(context.directory))throw Error('Unsafe repository folder.');
  const files=new Map(),directories=[],seen=new Set(),warnings=[];
  function add(items,directory){
   for(const item of items){if(!safe(item?.path)||directory&&!item.path.startsWith(directory+'/'))throw Error('Repository tree escaped its selected folder.');
    if(item.type==='directory'){if(!seen.has(item.path))directories.push(item.path);}
    else if(item.type==='file'&&(textFile(item.path)||assetFile(item.path))){if(files.size>=2000)throw Error('Project exceeds 2000 supported files. Choose a smaller folder.');files.set(item.path,{path:item.path,type:'blob',mode:'100644',size:-1});}
   }
  }
  add(context.items,context.directory);
  while(directories.length){const path=directories.shift();if(seen.has(path))continue;if(seen.size>=64){warnings.push('Incomplete repository scan: 64 folder limit. Open the project folder directly for complete source/model coverage.');break;}seen.add(path);const value=await call({type:'source',repository,action:'directory',ref:context.sha,path});if(value?.sha!==context.sha||!Array.isArray(value.items))throw Error('Repository revision changed while loading.');add(value.items,path);}
  if(![...files.keys()].some(p=>/\.(kicad_(sch|pcb|pro)|sch|brd|pro)$/i.test(p)))throw Error('No KiCad drawings found in this folder. Navigate to the project folder in the repository browser.');
  return{repository,sha:context.sha,sourceRef:context.ref,directory:context.directory,nodes:[...files.values()],warnings};
 }
 function remote(project,call,comments,storage,worker){
  const info=project.github,repository=info.repository,scope=value=>{const s=comments.normalizeScope(value);if(s.repository!==repository||s.ref!==info.sha||!project.files.some(f=>f.path===s.file)||(s.provider||'github')!=='github')throw Error('Review belongs to another project, revision or drawing.');return s;};
  const store={async get(key){let value;try{value=JSON.parse(storage.getItem(key)||'null');}catch{}return{[key]:value};},async set(values){for(const[k,v]of Object.entries(values))storage.setItem(k,JSON.stringify(v));}};
  const context={ref:info.sha,file:project.files[0].path};
  const reviews=worker.create({call:message=>call({type:'review',...context,...message}),storage:store,assertWrites:async()=>{await call({type:'policy',repository,action:'write',...context});},reserve:()=>comments.reservePublication(store,'github-mobile-website:'+repository),comments});
  return{async send(message){try{
   if(message.repository!==undefined&&message.repository!==repository||message.provider&&message.provider!=='github'||message.host&&message.host!=='https://github.com')throw Error('Review belongs to another repository.');
   let result;
   switch(message.type){
    case'github-auth-status':{const v=await reviews.list(repository);result={configured:true,connected:true,login:v.account,transport:'website-session'};break;}
    case'comment-policy-status':{const v=await reviews.list(repository);result={allowed:true,login:v.account,transport:'website-session',reason:'Existing GitHub Issues only; browser permissions are checked again before sending.'};break;}
    case'github-thread-read':if(message.kind!=='issue')throw Error('Website-session beta supports existing GitHub Issues.');scope(message);result=await reviews.read(repository,message.number,message.force===true);break;
    case'chat-thread-list':scope(message);result=message.kind==='issue'?await reviews.list(repository):{threads:[],hasMore:false,warnings:['Discussions require the repository website.']};break;
    case'github-annotations':case'comment-remote-list':scope(message.scope||message);result=await reviews.annotations(message.scope||message,{repository,number:message.issueNumber});break;
    case'chat-message-write':scope(message);result=await reviews.chat(message);break;
    case'github-publish-comment':case'comment-publish':{
     const note=comments.validateComment(message.comment);scope(note.anchor);if(message.destination!=='issue'||!Number.isSafeInteger(message.number)||message.number<1)throw Error('Choose an existing GitHub Issue. Create new Issues using the repository browser.');if(note.capture)throw Error('Upload attachments on the website; this transport sends text and drawing metadata only.');
     const posted=await reviews.send({repository,number:message.number,body:comments.toMarkdown(note),clientMutationId:note.id,confirmedSend:message.confirmedSend});result={remoteRef:{repository,kind:'issue',number:message.number,url:posted.url,publishedAt:posted.createdAt}};break;
    }
    case'comment-mention-users':result={users:[],warnings:['Type a known GitHub @username; account-wide member lookup is not requested.']};break;
    case'github-discussion-categories':result=[];break;
    default:throw Error('This action is not supported by the existing-Issue website-session beta.');
   }
   return{ok:true,result};
  }catch(error){return{ok:false,error:error.message};}}};
 }
 const core={repository:repo,bridge,discover,remote};root.KiCadMobileSessionCore=core;
 if(typeof module==='object'&&module.exports){module.exports=core;return;}
 const api=bridge(()=>root.AndroidKiCad),adapters=new WeakMap();let repository=null,importing=false;
 const status=(text,error=false)=>{const node=document.getElementById('githubStatus');if(node){node.textContent=text;node.dataset.error=String(error);}else root.KiCadAndroid?.receiveError(text);};
 const call=async operation=>{
  if(operation.type==='review'&&operation.action==='prepare')await api.request({action:'open',repository:operation.repository,url:'https://github.com/'+operation.repository+'/issues/'+operation.number,waitForReady:true});
  return api.request({action:'dispatch',repository:operation.repository,operation});
 };
 async function open(){try{repository=repo(document.getElementById('githubRepository')?.value||root.KiCadAndroidProject?.github?.repository);await api.request({action:'open',repository});status('Sign in inside the separate repository browser. Navigate to the project folder, then tap Use project. No repository OAuth grant is requested.');}catch(error){status(error.message,true);}}
 async function useProject(){if(importing||!repository)return;importing=true;root.KiCadAndroidUI?.loading('Reading repository website…');try{const value=await discover(repository,call,{textFile:root.KiCadAndroidLocal.textFile});const result=await api.request({action:'import',...value,temporary:true});const project=root.KiCadAndroidLocal.validate(result.project);root.KiCadAndroid.receiveProject(project);document.getElementById('githubDialog')?.close();await root.KiCadAndroidLibrary?.rememberDownloaded(root.KiCadAndroidProject);status(value.warnings.join(' ')||'Opened through the isolated repository session. Reviews use this same session.');}catch(error){status(error.message,true);}finally{importing=false;root.KiCadAndroidUI?.loading(null);}}
 root.KiCadAndroidSession={reply:api.reply,useProject,open,owns:project=>project?.github?.transport==='website-session',async reopen(){const project=root.KiCadAndroidProject;if(project?.github){repository=project.github.repository;await api.request({action:'open',repository});}},remote(project,storage){if(!adapters.has(project))adapters.set(project,remote(project,call,root.KiCadReviewComments,storage,root.KiCadGitHubWebsiteReviews));return adapters.get(project);}};
 function install(){const holder=document.getElementById('githubAdd')?.parentElement;if(!holder||document.getElementById('githubBrowserSession'))return;const button=document.createElement('button');button.id='githubBrowserSession';button.textContent='Open through browser · no repo OAuth';button.onclick=open;button.title='Separate GitHub website sign-in for organization projects and existing-Issue reviews';document.getElementById('githubAdd').before(button);const help=document.createElement('p');help.className='github-help';help.textContent='Organization blocks third-party app access? Use the repository browser. It has its own login; SSO and organization restrictions still apply.';button.after(help);const reopen=document.createElement('button');reopen.id='repositoryBrowser';reopen.textContent='Repository browser';reopen.hidden=true;reopen.onclick=()=>root.KiCadAndroidSession.reopen().catch(error=>status(error.message,true));document.getElementById('projectPicker')?.append(reopen);root.addEventListener('kicad-project-opened',()=>{reopen.hidden=!root.KiCadAndroidSession.owns(root.KiCadAndroidProject);});}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})(globalThis);
