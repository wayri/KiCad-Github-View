/* Optional desktop bridge. Paths are obtained only from this operation's completed browser download. */
((root)=>{'use strict';
 const HOST='dev.pocketkivi.kicad',SHA=/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i;
 function create({chrome=root.chrome,isViewer,policy=root.KiCadManagedPolicy,hosts=root.KiCadGitLabHosts,timeoutMs=600000}={}){
  const jobs=new Map();
  async function nativeCall(message,ms){let timer;try{return await Promise.race([chrome.runtime.sendNativeMessage(HOST,message),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message.operation==='status'?'Pocket KiVi desktop helper did not respond.':'The desktop helper did not confirm completion. Check KiCad before retrying; the ZIP remains saved.')),ms);})]);}finally{clearTimeout(timer);}}
  const key=sender=>[sender.tab?.id??'page',sender.documentId||sender.frameId||0,sender.url].join('|');
  function context(message,sender){
   if(!isViewer(sender)||message.confirmed!==true||Object.keys(message).some(k=>!['type','repository','ref','file','provider','host','confirmed'].includes(k)))throw Error('Open in KiCad requires a confirmed extension viewer request.');
   const page=new URL(sender.url),query=page.searchParams,provider=message.provider||'github',host=provider==='github'?'https://github.com':message.host||'https://gitlab.com';
   if(!['github','gitlab'].includes(provider)||!SHA.test(message.ref||'')||typeof message.repository!=='string'||message.repository.length>500||message.repository.split('/').length<2||message.repository.split('/').some(p=>! /^[A-Za-z0-9_.-]+$/.test(p)||p==='.'||p==='..')||provider==='github'&&message.repository.split('/').length!==2)throw Error('Choose a repository project at an immutable commit.');
   if(typeof message.file!=='string'||message.file.length>1000||! /\.kicad_(pro|sch|pcb)$/i.test(message.file)||/[\\\x00-\x1f\x7f]/.test(message.file)||message.file.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('Choose a KiCad project or drawing.');
   if(query.get('repository')!==message.repository||(query.get('ref')||query.get('head'))!==message.ref||query.get('file')!==message.file||(query.get('provider')||'github')!==provider||(provider==='gitlab'&&(query.get('host')||'https://gitlab.com')!==host))throw Error('The project context changed. Reopen the saved revision before launching KiCad.');
   const origin=new URL(host);if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw Error('Invalid repository host.');
   return{repository:message.repository,ref:message.ref.toLowerCase(),file:message.file,provider,host:origin.origin};
  }
  async function guard(scope,job){if(job.cancelled)throw Error('Open in KiCad cancelled because the viewer closed or changed.');await policy?.assertNetwork?.();if(scope.provider==='gitlab'&&!(hosts?await hosts.allowed(scope.host):scope.host==='https://gitlab.com'))throw Error('GitLab host permission is unavailable.');if(job.cancelled)throw Error('Open in KiCad cancelled because the viewer closed or changed.');}
  function cancel(message,sender){if(!isViewer(sender)||Object.keys(message).some(k=>k!=='type'))throw Error('Only the owning viewer can cancel its desktop open.');const job=jobs.get(key(sender));if(job){job.cancelled=true;job.reject?.(Error('Open in KiCad cancelled because the viewer closed or changed.'));}return{cancelled:Boolean(job)};}
  async function open(message,sender){
   const scope=context(message,sender),id=key(sender);if(jobs.has(id)||jobs.size>=4)throw Error('An Open in KiCad operation is already active.');
   if(!chrome.permissions?.contains||!await chrome.permissions.contains({permissions:['downloads','nativeMessaging']})||!chrome.downloads?.download||!chrome.runtime?.sendNativeMessage)throw Error('Grant optional Downloads and Native Messaging permissions, then install the Pocket KiVi desktop helper.');
   if(jobs.has(id)||jobs.size>=4)throw Error('An Open in KiCad operation is already active.');
   const job={cancelled:false,downloadId:null};jobs.set(id,job);let changed,removed,updated,timer,done=false;
   const cleanup=()=>{clearTimeout(timer);if(changed)chrome.downloads.onChanged.removeListener(changed);if(removed)chrome.tabs?.onRemoved?.removeListener(removed);if(updated)chrome.tabs?.onUpdated?.removeListener(updated);jobs.delete(id);};
   try{
    removed=tabId=>{if(tabId===sender.tab?.id){job.cancelled=true;job.reject?.(Error('Viewer tab closed.'));}};updated=(tabId,change)=>{if(tabId===sender.tab?.id&&change.url){job.cancelled=true;job.reject?.(Error('Viewer tab navigated to another page.'));}};chrome.tabs?.onRemoved?.addListener(removed);chrome.tabs?.onUpdated?.addListener(updated);
    await guard(scope,job);let status;try{status=await nativeCall({operation:'status'},10000);}catch{throw Error('Install or configure the Pocket KiVi desktop helper before using Open in KiCad. See Open in KiCad setup in the installation guide.');}
    if(!status?.ok)throw Error(status?.error||'Pocket KiVi desktop helper is unavailable.');await guard(scope,job);
    const name=scope.repository.split('/').at(-1),url=scope.provider==='github'?scope.host+'/'+scope.repository+'/archive/'+scope.ref+'.zip':scope.host+'/'+scope.repository+'/-/archive/'+scope.ref+'/'+encodeURIComponent(name)+'-'+scope.ref+'.zip';
    const download=new Promise((resolve,reject)=>{job.reject=reject;changed=delta=>{if(delta.id!==job.downloadId)return;if(delta.error?.current||delta.state?.current==='interrupted')reject(Error('Project download was cancelled or interrupted.'));else if(delta.state?.current==='complete')resolve();};chrome.downloads.onChanged.addListener(changed);timer=setTimeout(()=>reject(Error('Project download timed out. Retry Open in KiCad.')),timeoutMs);});
    // A rejection can arrive while the browser's Save As dialog is still open.
    download.catch(()=>{});
    job.downloadId=await chrome.downloads.download({url,filename:name+'-'+scope.ref.slice(0,12)+'.zip',saveAs:true,conflictAction:'uniquify'});
    if(!Number.isSafeInteger(job.downloadId)||job.downloadId<0)throw Error('Project download did not start.');
    const first=(await chrome.downloads.search({id:job.downloadId}))[0];if(!first||first.id!==job.downloadId)throw Error('Project download could not be verified.');
    if(first.state==='interrupted')throw Error('Project download was cancelled or interrupted.');if(first.state!=='complete')await download;
    await guard(scope,job);const record=(await chrome.downloads.search({id:job.downloadId}))[0];
    if(!record||record.id!==job.downloadId||record.state!=='complete'||typeof record.filename!=='string'||! /\.zip$/i.test(record.filename)||/[\x00-\x1f\x7f]/.test(record.filename)||! /^(?:[A-Za-z]:[\\/]|\/)/.test(record.filename))throw Error('The completed archive path could not be verified.');
    await guard(scope,job);
    const result=await nativeCall({operation:'open-project',archivePath:record.filename,repository:scope.repository,ref:scope.ref,file:scope.file},300000);
    if(!result?.ok||!result.opened)throw Error(result?.error||'KiCad could not be opened. The downloaded ZIP remains at your chosen location.');done=true;return{opened:true,downloaded:true,...(typeof result.projectPath==='string'?{projectPath:result.projectPath}:{})};
   }finally{if(!done&&job.cancelled&&Number.isSafeInteger(job.downloadId)){try{await chrome.downloads.cancel?.(job.downloadId);}catch{}}cleanup();}
  }
  return{open,cancel};
 }
 root.KiCadNativeKiCad={create};if(typeof module==='object'&&module.exports)module.exports=root.KiCadNativeKiCad;
})(globalThis);
