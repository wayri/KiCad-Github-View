/* Local-only project metadata. Source contents and credentials never enter this store. */
((root)=>{'use strict';
 const KEY='kiview-project-recents-v1',MAX_ENTRIES=50;
 const bounded=(value,max)=>typeof value==='string'&&value.length>0&&value.length<=max&&!/[\x00-\x1f\x7f]/.test(value);
 function origin(value){let url;try{url=new URL(value);}catch{throw Error('Enter an HTTPS repository URL.');}if(value.length>300||url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||!url.hostname||url.hostname.endsWith('.'))throw Error('Use an exact HTTPS provider origin.');return url.origin;}
 function repository(value,provider){return bounded(value,300)&&/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/.test(value)&&(provider==='gitlab'||value.split('/').length===2)&&value.split('/').every(part=>part!=='.'&&part!=='..');}
 function drawing(value){return bounded(value,500)&&/\.kicad_(sch|pcb|pro)$/i.test(value)&&!value.startsWith('/')&&value.split('/').every(part=>part&&part!=='.'&&part!=='..'&&!/[\\:]/.test(part));}
 function normalize(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid recent project.');
  if(value.kind==='local'){
   if(!bounded(value.localId,100)||! /^[A-Za-z0-9_-]+$/.test(value.localId)||!bounded(value.name,120))throw Error('Invalid local project identity.');
   return{kind:'local',localId:value.localId,name:value.name};
  }
  if(value.kind!=='remote'||!['github','gitlab'].includes(value.provider)||!repository(value.repository,value.provider)||! /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(value.ref||'')||!drawing(value.file))throw Error('Invalid saved remote project location.');
  const host=origin(value.host||(value.provider==='github'?'https://github.com':'https://gitlab.com'));if(value.provider==='github'&&host!=='https://github.com'||value.provider==='gitlab'&&['https://github.com','https://api.github.com','https://raw.githubusercontent.com'].includes(host))throw Error('Repository provider does not match its host.');
  return{kind:'remote',provider:value.provider,host,repository:value.repository,ref:value.ref.toLowerCase(),file:value.file,name:value.file.split('/').at(-1).replace(/\.kicad_(sch|pcb|pro)$/i,'')};
 }
 const identity=entry=>JSON.stringify(entry.kind==='local'?['local',entry.localId]:[entry.provider,entry.host,entry.repository.toLowerCase()]);
 function saved(value){const entry=normalize(value);if(!Number.isSafeInteger(value.lastOpened)||value.lastOpened<0||value.lastOpened>8640000000000000)throw Error('Invalid recent access time.');return{...entry,id:identity(entry),lastOpened:value.lastOpened};}
 function parseURL(value){
  if(!bounded(value,1000))throw Error('Enter a repository URL.');let url;try{url=new URL(value);}catch{throw Error('Enter a complete HTTPS GitHub or GitLab repository URL.');}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||/%2f|%5c/i.test(url.pathname))throw Error('Use a repository URL without credentials or query parameters.');
  const host=origin(url.origin),provider=host==='https://github.com'?'github':'gitlab',parts=url.pathname.replace(/\/$/,'').split('/').slice(1);let repo;try{repo=parts.map(decodeURIComponent).join('/').replace(/\.git$/,'');}catch{throw Error('Invalid repository URL.');}
  if(!repository(repo,provider)||repo.split('/').includes('-'))throw Error('Use the repository root URL, such as https://github.com/owner/project.');return{provider,host,repository:repo,url:host+'/'+repo};
 }
 function viewerURL(entry,getURL){entry=normalize(entry);if(entry.kind==='local')return getURL('local-viewer.html');const page=/\.kicad_pro$/i.test(entry.file)?'project-viewer.html':'browser-viewer.html',query=new URLSearchParams({repository:entry.repository,ref:entry.ref,...(page==='browser-viewer.html'?{head:entry.ref}:{}),file:entry.file,...(entry.provider==='gitlab'?{provider:'gitlab',host:entry.host}:{})});return getURL(page)+'?'+query;}
 function createStore(area,{now=()=>Date.now()}={}){
  if(!area?.get||!area?.set)throw Error('Local extension storage is unavailable.');let queue=Promise.resolve();
  const serialize=work=>{const run=queue.then(work,work);queue=run.catch(()=>{});return run;};
  async function read(){const envelope=(await area.get(KEY))[KEY];if(envelope===undefined)return[];if(!envelope||envelope.version!==1||!Array.isArray(envelope.entries)||envelope.entries.length>MAX_ENTRIES)throw Error('Recent project history is invalid or from a newer version. Clear history to reset it.');return envelope.entries.map(saved).sort((a,b)=>b.lastOpened-a.lastOpened);}
  async function write(entries){await area.set({[KEY]:{version:1,entries}});return entries;}
  return{list:()=>serialize(read),record:value=>serialize(async()=>{const entry=normalize(value),lastOpened=now();if(!Number.isSafeInteger(lastOpened)||lastOpened<0)throw Error('Invalid local access time.');const item={...entry,id:identity(entry),lastOpened};await write([item,...(await read()).filter(old=>old.id!==item.id)].slice(0,MAX_ENTRIES));return item;}),remove:id=>serialize(async()=>{if(!bounded(id,1000))throw Error('Invalid recent project identity.');return write((await read()).filter(entry=>entry.id!==id));}),clear:()=>serialize(()=>write([]))};
 }
 const api={KEY,MAX_ENTRIES,normalize,identity,parseURL,viewerURL,createStore};root.KiCadProjectRecents=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
