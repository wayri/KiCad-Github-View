/* Phone sheets resize from their handle; scrolling content never starts a drag. */
((root)=>{
 'use strict';
 const limits=viewport=>{const max=Math.max(1,Math.floor(viewport*.94));return{min:Math.min(max,Math.max(180,Math.floor(viewport*.4))),max};};
 const peek=viewport=>Math.min(360,Math.max(limits(viewport).min,viewport*.42));
 // A nested drawing must use the visible space left above the root keyboard.
 function viewportGeometry(host){
  let height=host.visualViewport?.height||host.innerHeight,bottom=Math.max(0,host.innerHeight-height-(host.visualViewport?.offsetTop||0));
  try{let frame=host;let y=0;while(frame.parent&&frame.parent!==frame){y+=frame.frameElement?.getBoundingClientRect().top||0;frame=frame.parent;}const vv=frame.visualViewport;const outerHeight=vv?.height||frame.innerHeight;if(Number.isFinite(outerHeight)){const end=outerHeight+(vv?.offsetTop||0)-y;height=Math.max(1,Math.min(height,end));bottom=Math.max(bottom,host.innerHeight-end);}}catch{}
  return{height,bottom:Math.max(0,bottom)};
 }
 const clamp=(height,viewport)=>{const {min,max}=limits(viewport);return Math.max(min,Math.min(max,height));};
 function install(doc,host){
  const registered=new Map();
  const viewport=()=>viewportGeometry(host).height;
  const mobile=()=>host.innerWidth<600;
  const targets='dialog,.touch-net-picker,#objectMenu,#designNavigator,#designInspector,#commentsSidebar,.viewer-settings,#ruleWindow';
  function attach(panel){
   if(registered.has(panel)){if(!panel.classList.contains?.('android-resizable-sheet'))panel.classList.add('android-resizable-sheet');const state=registered.get(panel);if(![...panel.children].includes(state.handle))panel.prepend(state.handle);return;}
   panel.classList.add('android-resizable-sheet');
   const handle=doc.createElement('button');handle.type='button';handle.className='android-sheet-handle';handle.setAttribute('aria-label','Expand panel');handle.setAttribute('aria-expanded','false');handle.title='Drag up to enlarge; tap to expand or reduce';
   const grip=doc.createElement('span');grip.setAttribute('aria-hidden','true');handle.append(grip);panel.prepend(handle);
   let drag=null,suppress=false,height=null,isExpanded=false;let wasClosed=Boolean(panel.hidden||(panel.tagName==='DIALOG'&&!panel.open));
   const set=value=>{height=clamp(value,viewport());panel.style.setProperty('--android-sheet-height',height+'px');if(mobile())panel.style.setProperty('height',height+'px','important');const expanded=height>=limits(viewport()).max-8;isExpanded=expanded;panel.setAttribute('data-sheet-stage',expanded?'expanded':'peek');handle.setAttribute('aria-expanded',String(expanded));handle.setAttribute('aria-label',expanded?'Reduce panel':'Expand panel');};
   const refresh=()=>{const geometry=viewportGeometry(host);panel.style.setProperty('--android-keyboard-bottom',geometry.bottom+'px');panel.style.setProperty('--android-sheet-max',limits(viewport()).max+'px');if(mobile()){panel.style.setProperty('max-height',limits(viewport()).max+'px','important');set(isExpanded?limits(viewport()).max:(height??peek(viewport())));}else{panel.style.removeProperty('height');panel.style.removeProperty('max-height');}};
   const finish=(event,cancel=false)=>{if(!drag||event.pointerId!==drag.id)return;const moved=drag.moved;handle.releasePointerCapture?.(drag.id);drag=null;panel.classList.remove('sheet-dragging');if(moved){suppress=true;event.preventDefault();event.stopPropagation();}if(cancel)refresh();};
   handle.addEventListener('pointerdown',event=>{if(!mobile()||event.button>0)return;drag={id:event.pointerId,y:event.clientY,height:panel.getBoundingClientRect().height,moved:false};suppress=false;handle.setPointerCapture?.(event.pointerId);event.preventDefault();});
   handle.addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.id)return;const delta=drag.y-event.clientY;if(Math.abs(delta)>4)drag.moved=true;if(drag.moved){panel.classList.add('sheet-dragging');set(drag.height+delta);event.preventDefault();event.stopPropagation();}});
   handle.addEventListener('pointerup',event=>finish(event));handle.addEventListener('pointercancel',event=>finish(event,true));
   handle.addEventListener('click',event=>{if(suppress){suppress=false;event.preventDefault();event.stopPropagation();return;}if(mobile())set(handle.getAttribute('aria-expanded')==='true'?peek(viewport()):limits(viewport()).max);});
   handle.addEventListener('keydown',event=>{if(!mobile())return;if(event.key==='ArrowUp'||event.key==='ArrowDown'){set((height??panel.getBoundingClientRect().height)+(event.key==='ArrowUp'?80:-80));event.preventDefault();}});
   panel.addEventListener('focusin',event=>{if(!mobile()||!event.target.matches?.('textarea,input:not([type=checkbox]):not([type=radio]),[contenteditable=true]'))return;set(limits(viewport()).max);host.requestAnimationFrame?.(()=>event.target.scrollIntoView?.({block:'nearest'}));});
   const sync=()=>{const closed=Boolean(panel.hidden||(panel.tagName==='DIALOG'&&!panel.open));if(wasClosed&&!closed&&mobile()){height=null;const active=doc.activeElement;isExpanded=Boolean(panel.contains?.(active)&&active?.matches?.('textarea,input:not([type=checkbox]):not([type=radio]),[contenteditable=true]'));refresh();}wasClosed=closed;};
   registered.set(panel,{handle,refresh,sync});refresh();
  }
  function scan(){for(const panel of doc.querySelectorAll(targets))attach(panel);for(const [panel,state]of registered)if(!panel.isConnected)registered.delete(panel);else state.sync();}
  const observer=new host.MutationObserver(scan);observer.observe(doc.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','open','class']});scan();
  const refresh=()=>{for(const [panel,state]of registered){state.refresh();const active=doc.activeElement;if(mobile()&&panel.contains?.(active)&&active?.matches?.('textarea,input'))host.requestAnimationFrame?.(()=>active.scrollIntoView?.({block:'nearest'}));}};host.addEventListener('resize',refresh);host.visualViewport?.addEventListener('resize',refresh);host.visualViewport?.addEventListener('scroll',refresh);let outerViewport;try{if(host.top!==host)outerViewport=host.top?.visualViewport;}catch{}outerViewport?.addEventListener('resize',refresh);outerViewport?.addEventListener('scroll',refresh);
  return{scan,dispose(){observer.disconnect();host.removeEventListener('resize',refresh);host.visualViewport?.removeEventListener('resize',refresh);host.visualViewport?.removeEventListener('scroll',refresh);outerViewport?.removeEventListener('resize',refresh);outerViewport?.removeEventListener('scroll',refresh);}};
 }
 const API={limits,clamp,peek,viewportGeometry,install};root.KiCadAndroidSheets=API;if(typeof module==='object'&&module.exports)module.exports=API;
 if(root.document){const start=()=>install(root.document,root);if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});else start();}
})(globalThis);
