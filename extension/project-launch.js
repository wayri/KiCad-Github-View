/* Toolbar launch context and standalone viewer URLs; no provider I/O here. */
((root)=>{
 'use strict';
 function context(value,hint){
  const parse=root.KiCadGitHub||(typeof require==='function'?require('./parsing.js'):null);
  let url;try{url=new URL(value);}catch{return null;}
  if(url.protocol!=='https:'||url.username||url.password)return null;
  const options={gitlabHosts:[url.origin]},repo=parse.repositoryRoute(url.href,options),blob=parse.route(url.href,options);
  if(blob?.kind==='blob'){
   const info=parse.blobRequest(blob,hint);
   if(info&&/\.kicad_(pro|sch|pcb)$/i.test(info.file))return{kind:'drawing',...info};
  }
  if(repo){
   const ref=repo.tail?hint?.ref||parse.repositoryRef(repo):'HEAD';
   if(!ref||repo.tail&&!(repo.tail.join('/')===ref||repo.tail.join('/').startsWith(ref+'/')))throw Error('The branch is ambiguous. Open the repository root or a KiCad file, then click the extension again.');
   return{kind:'repository',source:url.origin+url.pathname,repository:repo.repository,ref,...(repo.provider?{provider:repo.provider,host:repo.host}:{})};
  }
  // Issue, pull-request and unsupported file pages still belong to a repository.
  const parts=url.pathname.split('/').filter(Boolean),split=url.origin==='https://github.com'?2:parts.indexOf('-');
  const names=split>=2?parts.slice(0,split):url.origin==='https://gitlab.com'?parts:[];
  if(names.length<2||!names.every(p=>/^[A-Za-z0-9_.-]+$/.test(p)))return null;
  const repository=names.join('/');return{kind:'repository',source:url.origin+'/'+repository,repository,ref:'HEAD',...(url.origin!=='https://github.com'?{provider:'gitlab',host:url.origin}:{})};
 }
 function viewerURL(info,file,getURL){
  if(typeof file!=='string'||!root.KiCadGitHub?.filePath(file)||!/\.kicad_(pro|sch|pcb)$/i.test(file))throw Error('Invalid KiCad project path.');
  const head=info.sha||info.head,params=new URLSearchParams({repository:info.repository,ref:head,head,file});
  if(info.provider==='gitlab'){params.set('provider','gitlab');params.set('host',info.host||'https://gitlab.com');}
  return getURL(/\.kicad_pro$/i.test(file)?'project-viewer.html':'browser-viewer.html')+'?'+params;
 }
 const api={context,viewerURL};root.KiCadProjectLaunch=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
