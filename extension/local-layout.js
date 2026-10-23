/* Accessible workspace divider. Layout changes never reload drawing frames. */
((root)=>{'use strict';
 function install(panes,divider,storage,host=root){
  const key='kiview:parallel-layout:v1';let share=50,drag=null;
  const media=host.matchMedia?.('(max-width:850px)');
  const stacked=()=>media?.matches??false;
  function apply(value){share=Math.max(20,Math.min(80,Number.isFinite(value)?value:50));panes.style.setProperty('--primary-share',share+'%');divider.setAttribute('aria-valuenow',String(Math.round(share)));divider.setAttribute('aria-orientation',stacked()?'horizontal':'vertical');}
  function persist(){try{storage?.setItem(key,String(share));}catch{}}
  try{const saved=storage?.getItem(key);if(saved!==null&&saved!==undefined&&saved.trim()!=='')share=Number(saved);}catch{}
  function end(event,cancel=false){if(!drag||event.pointerId!==drag.id)return;const previous=drag;drag=null;if(cancel)apply(previous.share);panes.classList.remove('resizing');if(divider.hasPointerCapture?.(event.pointerId))divider.releasePointerCapture(event.pointerId);if(!cancel)persist();}
  divider.addEventListener('pointerdown',event=>{if(event.button!==0||drag)return;event.preventDefault();drag={id:event.pointerId,share};divider.setPointerCapture(event.pointerId);panes.classList.add('resizing');});
  divider.addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.id)return;const rect=panes.getBoundingClientRect(),vertical=stacked(),length=(vertical?rect.height:rect.width)-8;if(length<=0)return;apply(((vertical?event.clientY-rect.top:event.clientX-rect.left)-4)/length*100);});
  divider.addEventListener('pointerup',event=>end(event));divider.addEventListener('pointercancel',event=>end(event,true));divider.addEventListener('lostpointercapture',event=>end(event,true));
  divider.addEventListener('dblclick',()=>{apply(50);persist();});
  divider.addEventListener('keydown',event=>{const direction=stacked()?['ArrowUp','ArrowDown']:['ArrowLeft','ArrowRight'];let next;if(event.key===direction[0])next=share-(event.shiftKey?10:2);else if(event.key===direction[1])next=share+(event.shiftKey?10:2);else if(event.key==='Home')next=20;else if(event.key==='End')next=80;else return;event.preventDefault();apply(next);persist();});
  media?.addEventListener('change',()=>apply(share));apply(share);
  return {reset(){apply(50);persist();}};
 }
 if(typeof module==='object'&&module.exports)module.exports={install};else root.KiCadLocalLayout={install};
})(globalThis);
