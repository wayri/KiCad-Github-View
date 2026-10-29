/* Discovery is restricted to this owned page; project files open without host chrome. */
(()=>{
 'use strict';
 const query=new URLSearchParams(location.search),status=document.getElementById('launchStatus'),title=document.getElementById('launchTitle'),details=document.getElementById('launchDetails'),projects=document.getElementById('launchProjects'),retry=document.getElementById('launchRetry');
 let busy=false;
 async function load(){
  if(busy)return;busy=true;retry.hidden=true;projects.replaceChildren();status.className='';
  try{
   const source=query.get('source');
   if(!source){title.textContent='No KiCad project detected';status.textContent=query.get('error')||'Open a GitHub or approved GitLab repository, then click the extension icon. You can also open local files or recent projects above.';return;}
   const context=KiCadProjectLaunch.context(source,{ref:query.get('ref')});
   if(context?.kind!=='repository')throw Error('Open a repository page, then click the extension icon again.');
   status.textContent='Checking '+context.repository+'…';details.textContent=context.source+' · '+context.ref;
   const reply=await chrome.runtime.sendMessage({type:'repository-detect',source:context.source,repository:context.repository,ref:context.ref,...(context.provider?{provider:context.provider,host:context.host}:{})});
   if(!reply?.ok)throw Error(reply?.accessIssue?[reply.accessIssue.title,reply.accessIssue.message,reply.accessIssue.action].join(' '):reply?.error||'Repository discovery failed. Reload the extension and try again.');
   const result=reply.result;
   if(!/^[a-f0-9]{40}$/i.test(result?.sha||'')||!Array.isArray(result.projects)||result.projects.length>100)throw Error('Invalid repository discovery response.');
   const files=result.projects;for(const file of files)KiCadProjectLaunch.viewerURL({...context,sha:result.sha},file,p=>chrome.runtime.getURL(p));
   if(files.length===1&&!result.truncated){location.replace(KiCadProjectLaunch.viewerURL({...context,sha:result.sha},files[0],p=>chrome.runtime.getURL(p)));return;}
   title.textContent=files.length?'Choose a KiCad project':'No KiCad project detected';
   status.textContent=files.length?files.length+' projects or standalone drawings found.':result.truncated?'No KiCad project detected in the partial listing. Additional folders may contain projects.':'No KiCad project detected in this repository revision.';
   if(result.truncated)details.textContent+=' · Partial listing; additional projects may exist.';
   for(const file of files){const link=document.createElement('a');link.textContent=file;link.href=KiCadProjectLaunch.viewerURL({...context,sha:result.sha},file,p=>chrome.runtime.getURL(p));projects.append(link);}
  }catch(error){title.textContent='Project discovery unavailable';status.className='error';status.textContent='! '+error.message;retry.hidden=false;}
  finally{busy=false;}
 }
 retry.addEventListener('click',load);load();
})();
