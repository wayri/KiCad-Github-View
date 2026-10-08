/* Phone sheets resize from their handle; scrolling content never starts a drag. */
((root)=>{
 'use strict';
 const limits=viewport=>{const max=Math.max(1,Math.floor(viewport*.94));return{min:Math.min(max,Math.max(180,Math.floor(viewport*.4))),max};};
 const clamp=(height,viewport)=>{const {min,max}=limits(viewport);return Math.max(min,Math.min(max,height));};
 function install(doc,host){
  const registered=new Map();
  const viewport=()=>host.visualViewport?.height||host.innerHeight;
  const mobile=()=>host.innerWidth<600;
  const targets='dialog,.touch-net-picker,#objectMenu,#designNavigator,#designInspector,#commentsSidebar,.viewer-settings,#ruleWindow';
  function attach(panel){
   if(registered.has(panel))return;
   panel.classList.add('android-resizable-sheet');
   const handle=doc.createElement('button');handle.type='button';handle.className='android-sheet-handle';handle.setAttribute('aria-label','Expand panel');handle.setAttribute('aria-expanded','false');handle.title='Drag up to enlarge; tap to expand or reduce';
   const grip=doc.createElement('span');grip.setAttribute('aria-hidden','true');handle.append(grip);panel.prepend(handle);
   let drag=null,suppress=false,height=null,isExpanded=false;
   const set=value=>{height=clamp(value,viewport());panel.style.setProperty('--android-sheet-height',height+'px');if(mobile())panel.style.setProperty('height',height+'px','important');const expanded=height>=limits(viewport()).max-8;isExpanded=expanded;handle.setAttribute('aria-expanded',String(expanded));handle.setAttribute('aria-label',expanded?'Reduce panel':'Expand panel');};
   const refresh=()=>{panel.style.setProperty('--android-sheet-max',limits(viewport()).max+'px');if(mobile()){panel.style.setProperty('max-height',limits(viewport()).max+'px','important');if(height!==null)set(isExpanded?limits(viewport()).max:height);}else{panel.style.removeProperty('height');panel.style.removeProperty('max-height');}};
   const finish=(event,cancel=false)=>{if(!drag||event.pointerId!==drag.id)return;const moved=drag.moved;handle.releasePointerCapture?.(drag.id);drag=null;panel.classList.remove('sheet-dragging');if(moved){suppress=true;event.preventDefault();event.stopPropagation();}if(cancel)refresh();};
   handle.addEventListener('pointerdown',event=>{if(!mobile()||event.button>0)return;drag={id:event.pointerId,y:event.clientY,height:panel.getBoundingClientRect().height,moved:false};suppress=false;handle.setPointerCapture?.(event.pointerId);event.preventDefault();});
   handle.addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.id)return;const delta=drag.y-event.clientY;if(Math.abs(delta)>4)drag.moved=true;if(drag.moved){panel.classList.add('sheet-dragging');set(drag.height+delta);event.preventDefault();event.stopPropagation();}});
   handle.addEventListener('pointerup',event=>finish(event));handle.addEventListener('pointercancel',event=>finish(event,true));
   handle.addEventListener('click',event=>{if(suppress){suppress=false;event.preventDefault();event.stopPropagation();return;}if(mobile())set(handle.getAttribute('aria-expanded')==='true'?viewport()*.55:limits(viewport()).max);});
   handle.addEventListener('keydown',event=>{if(!mobile())return;if(event.key==='ArrowUp'||event.key==='ArrowDown'){set((height??panel.getBoundingClientRect().height)+(event.key==='ArrowUp'?80:-80));event.preventDefault();}});
   registered.set(panel,{refresh});refresh();
  }
  function scan(){for(const panel of doc.querySelectorAll(targets))attach(panel);for(const panel of registered.keys())if(!panel.isConnected)registered.delete(panel);}
  const observer=new host.MutationObserver(scan);observer.observe(doc.body,{childList:true,subtree:true});scan();
  const refresh=()=>{for(const state of registered.values())state.refresh();};host.addEventListener('resize',refresh);host.visualViewport?.addEventListener('resize',refresh);
  return{scan,dispose(){observer.disconnect();host.removeEventListener('resize',refresh);host.visualViewport?.removeEventListener('resize',refresh);}};
 }
 const API={limits,clamp,install};root.KiCadAndroidSheets=API;if(typeof module==='object'&&module.exports)module.exports=API;
 if(root.document){const start=()=>install(root.document,root);if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});else start();}
})(globalThis);
