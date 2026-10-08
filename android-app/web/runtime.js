/* Loaded only in packaged trusted viewer pages, before the shared scripts. */
(() => {
 'use strict';
 window.KiCadAndroidRuntime=true;
 const project=window.top.KiCadAndroidProject;if(!project)throw Error('Open a local KiCad file first.');
 const api=KiCadAndroidLocal.transport(project,localStorage);
 const online=Boolean(project.github||project.remote);window.KiCadAndroidOnline=online;
 const provider=project.remote?.provider||'github';
 const nativeRequest=message=>(provider==='gitlab'?window.top.KiCadAndroidGitLab:window.top.KiCadAndroidGitHub).request(message);
 const info=project.remote||project.github,params=new URLSearchParams(location.search);
 const frameRef=params.get('ref')||params.get('head')||info?.sha;
 if(online)window.top.KiCadAndroid.ensureSnapshots();
 const source=async ref=>ref&&online?window.top.KiCadAndroidRevisionCache.get(ref):project;
 const reviewAdapters=new Map();
 const remoteTypes=new Set(['github-auth-status','comment-policy-status','comment-mention-users','github-discussion-categories','github-thread-read','github-annotations','comment-remote-list','github-publish-comment','comment-publish','github-recover-publication']);
 const dispatch=async message=>{try{
  if(message.type==='open-options'){window.top.document.getElementById(provider==='gitlab'?'gitlabButton':'githubButton').click();return{ok:true,result:{opened:true}};}
  if(message.type==='open-project-drawing'||message.type==='open-viewer-window'){window.top.KiCadAndroid.openDrawing(message.file);return{ok:true,result:{opened:true}};}
  if(online&&(message.repository&&message.repository.toLowerCase()!==info.repository.toLowerCase()||message.provider&&message.provider!==provider||message.host&&message.host!==project.remote?.host))throw Error('Request belongs to another repository or server.');
  if(online&&['revision-resolve','revision-branches','revision-commits'].includes(message.type))return{ok:true,result:await nativeRequest(message)};
  const snapshot=await source(message.ref||message.comment?.anchor?.ref||frameRef);
  if(online&&remoteTypes.has(message.type)){
   if(!reviewAdapters.has(snapshot.id))reviewAdapters.set(snapshot.id,KiCadAndroidRemote.create(snapshot,nativeRequest,window.top.KiCadReviewComments,localStorage));const remote=reviewAdapters.get(snapshot.id);
   const reply=await remote.send(message);if(reply.authExpired)(provider==='gitlab'?window.top.KiCadAndroidGitLab:window.top.KiCadAndroidGitHub).authExpired?.(project.remote?.host);return reply;
  }
  return KiCadAndroidLocal.transport(snapshot,localStorage).send(message);
 }catch(error){if(error.authExpired)(provider==='gitlab'?window.top.KiCadAndroidGitLab:window.top.KiCadAndroidGitHub).authExpired?.(project.remote?.host);return{ok:false,error:error.message};}};
 window.KiCadVSCodeContext={search:location.search}; // Shared viewer local-source contract.
 window.chrome={runtime:{id:'android-local',getURL:name=>new URL(name,location.href).href,sendMessage:message=>{if(message.type==='open-project-file'){window.top.KiCadAndroid.openDrawing(message.file);return Promise.resolve({ok:true,result:{opened:true}});}if(message.type==='open-project-overview'){window.top.KiCadAndroid.openProject(message.file);return Promise.resolve({ok:true,result:{opened:true}});}return dispatch(message);},onMessage:{addListener(){}}},storage:{local:{async get(key){return{[key]:JSON.parse(localStorage.getItem('android-pref:'+key)||'null')};},async set(values){for(const [key,value]of Object.entries(values))localStorage.setItem('android-pref:'+key,JSON.stringify(value));}}}};
 document.addEventListener('DOMContentLoaded',()=>{const clean=()=>{for(const node of document.querySelectorAll('#projectTools > button'))if(node.textContent==='Pop out')node.hidden=true;};clean();new MutationObserver(clean).observe(document.body,{childList:true,subtree:true});for(const id of ['sourceLink','htmlTab','popOut',...(!online?['githubPane','commentPublishSettings','postComment']:[])]){const node=document.getElementById(id);if(node)node.hidden=true;}const save=document.getElementById('saveComment');if(save){save.hidden=false;if(!online)save.textContent='Save note';}const search=document.getElementById('universalSearch');if(search)search.placeholder='Search parts, nets, sheets…';});
})();
