/* Local viewer bridge: only same-origin frames of the explicit local workspace. */
(()=>{
 'use strict';let host;try{if(parent!==window&&parent.location.origin===location.origin)host=parent.KiCadLocalWorkspace;else if(new URLSearchParams(location.search).get('detached')==='1'&&opener&&opener.location.origin===location.origin){const candidate=opener.KiCadLocalWorkspace;if(candidate?.acceptDetached?.(location.href))host=candidate;}}catch{}if(!host)return;
 window.KiCadLocalRuntime=true;window.KiCadLocalWorkspace=host;
 const api=host.transport,storage=host.storage;
 window.chrome={runtime:{id:'kiview-local',getURL:name=>host.assetURL(name),sendMessage:async message=>{
  try{
   if(['open-project-file','open-project-drawing','open-viewer-window'].includes(message.type)){if(message.searchResult)host.openDrawing(message.file,message.searchResult);else host.openDrawing(message.file);return{ok:true,result:{opened:true}};}
   if(['open-project-overview','open-options'].includes(message.type)){host.openProject();return{ok:true,result:{opened:true}};}
   return await api.send(message);
  }catch(e){return{ok:false,error:e.message};}
 },onMessage:{addListener(){}}},storage:{local:{async get(key){return{[key]:JSON.parse(storage.getItem('local-pref:'+key)||'null')};},async set(values){for(const [key,value]of Object.entries(values))storage.setItem('local-pref:'+key,JSON.stringify(value));},async remove(key){storage.removeItem('local-pref:'+key);}}}};
 window.open=url=>{host.openURL(url);return null;};
 document.addEventListener('dragover',e=>{if([...e.dataTransfer?.types||[]].includes('Files'))e.preventDefault();});
 document.addEventListener('drop',e=>{if([...e.dataTransfer?.types||[]].includes('Files')){e.preventDefault();host.importDrop(e.dataTransfer);}});
 document.addEventListener('DOMContentLoaded',()=>{
  for(const id of ['sourceLink','githubPane','commentPublishSettings','postComment','popOut']){const node=document.getElementById(id);if(node)node.hidden=true;}
  const save=document.getElementById('saveComment');if(save){save.hidden=false;save.textContent='Save local note';}
 });
})();
