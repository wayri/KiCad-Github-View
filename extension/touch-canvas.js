/* Touch camera adapter for the shared read-only canvas; desktop behavior is unchanged. */
((root)=>{
 'use strict';
 function attach(view){
  const node=view.canvas,camera=view.viewport.camera,points=new Map();let previous=null,moved=false,travel=0,lastTap=null,hold=null,held=false;
  const state=()=>{const p=[...points.values()];return{x:p.reduce((n,v)=>n+v.x,0)/p.length,y:p.reduce((n,v)=>n+v.y,0)/p.length,d:p.length===2?Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y):0};};
  const cancelHold=()=>{if(hold!==null){root.clearTimeout(hold);hold=null;}};
  const tool=()=>node.classList.contains('ruler-mode')||node.classList.contains('area-mode');
  const down=e=>{if(e.pointerType!=='touch'||tool())return;e.preventDefault();e.stopImmediatePropagation();view.dismissTouchPicker?.();points.set(e.pointerId,{x:e.clientX,y:e.clientY});node.setPointerCapture?.(e.pointerId);previous=state();cancelHold();if(points.size===1){moved=false;travel=0;held=false;const x=e.clientX,y=e.clientY;hold=root.setTimeout(()=>{hold=null;if(!moved&&points.size===1){held=true;lastTap=null;node.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:x,clientY:y,button:2}));}},550);}else moved=true;view.prepareMotion?.();};
  const move=e=>{if(!points.has(e.pointerId))return;e.preventDefault();e.stopImmediatePropagation();points.set(e.pointerId,{x:e.clientX,y:e.clientY});const next=state(),dx=next.x-previous.x,dy=next.y-previous.y;
   travel+=Math.abs(dx)+Math.abs(dy);if(travel>6){moved=true;cancelHold();}
   const rect=node.getBoundingClientRect(),screen={x:next.x-rect.left,y:next.y-rect.top};camera.center.x-=dx/camera.zoom*(camera.flipped?-1:1);camera.center.y-=dy/camera.zoom;
   if(next.d&&previous.d){const before=camera.screen_to_world(screen);camera.zoom=Math.max(.001,Math.min(10000,camera.zoom*next.d/previous.d));const after=camera.screen_to_world(screen);camera.center.x+=before.x-after.x;camera.center.y+=before.y-after.y;}
   previous=next;view.requestDraw();
  };
  const up=e=>{if(!points.has(e.pointerId))return;e.preventDefault();e.stopImmediatePropagation();cancelHold();points.delete(e.pointerId);node.releasePointerCapture?.(e.pointerId);if(points.size){previous=state();moved=true;return;}view.finishMotion?.();previous=null;if(!moved&&!held&&e.type!=='pointercancel'){const init={bubbles:true,clientX:e.clientX,clientY:e.clientY,button:0},now=e.timeStamp||Date.now();if(view.touchNetPick?.(init)){lastTap=null;return;}node.dispatchEvent(new MouseEvent('click',init));if(lastTap&&now-lastTap.time<350&&Math.hypot(e.clientX-lastTap.x,e.clientY-lastTap.y)<20){node.dispatchEvent(new MouseEvent('dblclick',init));lastTap=null;}else lastTap={time:now,x:e.clientX,y:e.clientY};}else lastTap=null;};
  for(const [name,fn]of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',up]])node.addEventListener(name,fn,true);
  return()=>{for(const [name,fn]of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',up]])node.removeEventListener(name,fn,true);cancelHold();points.clear();};
 }
 root.KiCadTouchCanvas={attach};root.KiCadAndroidTouch=root.KiCadTouchCanvas;if(typeof module==='object'&&module.exports)module.exports=root.KiCadAndroidTouch;
 if(root.KiCadOwnedCanvas){const mount=root.KiCadOwnedCanvas.mount;root.KiCadOwnedCanvas.mount=(...args)=>{const view=mount(...args),detach=attach(view),dispose=view.dispose.bind(view);view.dispose=()=>{detach();dispose();};return view;};}
})(globalThis);
