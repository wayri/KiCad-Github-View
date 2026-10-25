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
  const registered=new Map();let viewportFrame=null,scrollTimer=null;
  const reveal=target=>{if(!target?.scrollIntoView)return;if(scrollTimer!==null)host.clearTimeout?.(scrollTimer);const show=()=>{scrollTimer=null;if(target===doc.activeElement)target.scrollIntoView({block:'nearest',behavior:'auto'});};if(host.setTimeout)scrollTimer=host.setTimeout(show,100);else host.requestAnimationFrame?.(show);};
  const viewport=()=>viewportGeometry(host).height;
  const mobile=()=>host.innerWidth<600;
  const targets='dialog:not(#androidQuickStart):not(.android-reader-dialog),#ruleWindow';
  const closeIds={designNavigator:'closeNavigator',designInspector:'closeInspector',commentsSidebar:'closeComments',viewerSettings:'closeSettings',ruleWindow:'closeRuleWindow'};
  const originalClose=panel=>doc.getElementById?.(closeIds[panel.id])||[...(panel.querySelectorAll?.('button')||[])].find(b=>!b.classList?.contains('android-sheet-dismiss')&&(/^(Close|Cancel)$/i.test(b.textContent?.trim()||'')||/^(Close|Collapse)\b/i.test(b.getAttribute?.('aria-label')||'')));
  const dismiss=panel=>{const original=originalClose(panel);if(original){original.click();return;}if(panel.tagName==='DIALOG')panel.close();else panel.hidden=true;};
  function attach(panel){
   if(panel.classList.contains('section-page')||panel.classList.contains('touch-net-picker'))return;
   if(registered.has(panel)){if(!panel.classList.contains?.('android-resizable-sheet'))panel.classList.add('android-resizable-sheet');const state=registered.get(panel);if(![...panel.children].includes(state.handle))panel.prepend(state.handle);if(state.close&&!panel.contains?.(state.close)&&![...panel.children].includes(state.close))panel.append(state.close);return;}
   panel.classList.add('android-resizable-sheet');
   const handle=doc.createElement('button');handle.type='button';handle.className='android-sheet-handle';handle.setAttribute('aria-label','Expand panel');handle.setAttribute('aria-expanded','false');handle.title='Drag up to enlarge; drag down to close; tap to expand or reduce';
   const grip=doc.createElement('span');grip.setAttribute('aria-hidden','true');handle.append(grip);panel.prepend(handle);
   let close=null;if(!doc.getElementById?.(closeIds[panel.id])&&!panel.querySelector?.('header button[aria-label^="Close"],header button[aria-label^="Collapse"],.sidebar-heading button[aria-label^="Collapse"]')){close=doc.createElement('button');close.type='button';close.className='android-sheet-dismiss';close.classList.add('android-sheet-dismiss');close.textContent='×';close.setAttribute('aria-label','Close panel');close.title='Close panel';close.onclick=()=>dismiss(panel);panel.append(close);panel.classList.add('android-sheet-has-dismiss');}
   let drag=null,suppress=false,height=null,isExpanded=false,frame=null,pendingHeight=null;let wasClosed=Boolean(panel.hidden||(panel.tagName==='DIALOG'&&!panel.open));
   const set=(value,size=viewport())=>{height=clamp(value,size);panel.style.setProperty('--android-sheet-height',height+'px');if(mobile())panel.style.setProperty('height',height+'px','important');const expanded=height>=limits(size).max-8;isExpanded=expanded;panel.setAttribute('data-sheet-stage',expanded?'expanded':'peek');handle.setAttribute('aria-expanded',String(expanded));handle.setAttribute('aria-label',expanded?'Reduce panel':'Expand panel');};
   const refresh=()=>{const geometry=viewportGeometry(host);panel.style.setProperty('--android-keyboard-bottom',geometry.bottom+'px');panel.style.setProperty('--android-sheet-max',limits(viewport()).max+'px');if(mobile()){panel.style.setProperty('max-height',limits(viewport()).max+'px','important');set(isExpanded?limits(viewport()).max:(height??(panel.id==='androidToolsSheet'?clamp(540,viewport()):peek(viewport()))));}else{panel.style.removeProperty('height');panel.style.removeProperty('max-height');}};
   const flush=()=>{frame=null;if(pendingHeight!==null){const value=pendingHeight;pendingHeight=null;const size=drag?.viewport??viewport();set(value,size);panel.style.setProperty('--android-sheet-pull',Math.max(0,limits(size).min-value)+'px');}};
   const schedule=value=>{pendingHeight=value;if(frame!==null)return;if(host.requestAnimationFrame)frame=host.requestAnimationFrame(flush);else flush();};
   const finish=(event,cancel=false)=>{
    if(!drag||event.pointerId!==drag.id)return;
    const gesture=drag,moved=gesture.moved,rawHeight=gesture.rawHeight??gesture.height;
    if(frame!==null){host.cancelAnimationFrame?.(frame);frame=null;}flush();
    drag=null;handle.releasePointerCapture?.(gesture.id);panel.classList.remove('sheet-dragging');panel.style.removeProperty('--android-sheet-pull');
    if(moved){suppress=true;event.preventDefault();event.stopPropagation();}
    if(cancel){set(gesture.height,gesture.viewport);return;}
    if(!moved)return;
    const {min,max}=limits(gesture.viewport),preview=peek(gesture.viewport);
    if(rawHeight<min-Math.min(64,gesture.viewport*.1)){dismiss(panel);return;}
    const velocity=event.timeStamp-gesture.lastTime>120?0:gesture.velocity||0;
    set(velocity>.45?max:velocity<-.45?preview:rawHeight>(preview+max)/2?max:preview,gesture.viewport);
   };
   handle.addEventListener('pointerdown',event=>{
    if(!mobile()||event.button>0||drag)return;
    const size=viewport();drag={id:event.pointerId,y:event.clientY,lastY:event.clientY,lastTime:event.timeStamp,viewport:size,height:panel.getBoundingClientRect().height,moved:false,velocity:0};
    suppress=false;handle.setPointerCapture?.(event.pointerId);event.preventDefault();
   });
   handle.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.id)return;
    const delta=drag.y-event.clientY;drag.rawHeight=drag.height+delta;
    const dt=event.timeStamp-drag.lastTime;if(dt>0)drag.velocity=(drag.lastY-event.clientY)/dt;
    drag.lastY=event.clientY;drag.lastTime=event.timeStamp;
    if(Math.abs(delta)>6&&!drag.moved){drag.moved=true;panel.classList.add('sheet-dragging');}
    if(drag.moved){schedule(drag.rawHeight);event.preventDefault();event.stopPropagation();}
   });
   handle.addEventListener('pointerup',event=>finish(event));handle.addEventListener('pointercancel',event=>finish(event,true));handle.addEventListener('lostpointercapture',event=>finish(event,true));
   handle.addEventListener('click',event=>{if(suppress){suppress=false;event.preventDefault();event.stopPropagation();return;}if(mobile())set(handle.getAttribute('aria-expanded')==='true'?peek(viewport()):limits(viewport()).max);});
   handle.addEventListener('keydown',event=>{if(!mobile())return;if(event.key==='ArrowUp'||event.key==='ArrowDown'){set((height??panel.getBoundingClientRect().height)+(event.key==='ArrowUp'?80:-80));event.preventDefault();}});
   panel.addEventListener('focusin',event=>{if(!event.target.matches?.('textarea,input:not([type=checkbox]):not([type=radio]),[contenteditable=true]'))return;if(mobile()&&!isExpanded)set(limits(viewport()).max);reveal(event.target);});
   const sync=()=>{const closed=Boolean(panel.hidden||(panel.tagName==='DIALOG'&&!panel.open));if(wasClosed&&!closed&&mobile()){height=null;const active=doc.activeElement;isExpanded=Boolean(panel.contains?.(active)&&active?.matches?.('textarea,input:not([type=checkbox]):not([type=radio]),[contenteditable=true]'));refresh();}wasClosed=closed;};
   registered.set(panel,{handle,close,refresh,sync,dispose(){if(frame!==null)host.cancelAnimationFrame?.(frame);frame=null;pendingHeight=null;drag=null;}});refresh();
  }
  function scan(){for(const panel of doc.querySelectorAll(targets))attach(panel);for(const [panel,state]of registered)if(!panel.isConnected){state.dispose();registered.delete(panel);}else state.sync();}
  const observer=new host.MutationObserver(scan);observer.observe(doc.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','open','class']});scan();
  const refreshNow=()=>{for(const [panel,state]of registered){state.refresh();const active=doc.activeElement;if(panel.contains?.(active)&&active?.matches?.('textarea,input'))reveal(active);}};const refresh=()=>{if(viewportFrame!==null)return;if(host.requestAnimationFrame)viewportFrame=host.requestAnimationFrame(()=>{viewportFrame=null;refreshNow();});else refreshNow();};host.addEventListener('resize',refresh);host.visualViewport?.addEventListener('resize',refresh);host.visualViewport?.addEventListener('scroll',refresh);let outerViewport;try{if(host.top!==host)outerViewport=host.top?.visualViewport;}catch{}outerViewport?.addEventListener('resize',refresh);outerViewport?.addEventListener('scroll',refresh);
  return{scan,dispose(){if(viewportFrame!==null)host.cancelAnimationFrame?.(viewportFrame);if(scrollTimer!==null)host.clearTimeout?.(scrollTimer);for(const state of registered.values())state.dispose();registered.clear();observer.disconnect();host.removeEventListener('resize',refresh);host.visualViewport?.removeEventListener('resize',refresh);host.visualViewport?.removeEventListener('scroll',refresh);outerViewport?.removeEventListener('resize',refresh);outerViewport?.removeEventListener('scroll',refresh);}};
 }
 const API={limits,clamp,peek,viewportGeometry,install};root.KiCadAndroidSheets=API;if(typeof module==='object'&&module.exports)module.exports=API;
 if(root.document){const start=()=>install(root.document,root);if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});else start();}
})(globalThis);
