/* Keep transient phone pickers inside the usable drawing viewport. */
((root)=>{'use strict';
 const selector='#objectMenu,.touch-net-picker,.review-control-popover';
 function bounds(rect,width,height,pad=8){const w=Math.min(Math.max(1,rect.width),Math.max(1,width-pad*2)),h=Math.min(Math.max(1,rect.height),Math.max(1,height-pad*2));return{left:Math.max(pad,Math.min(rect.left,width-pad-w)),top:Math.max(pad,Math.min(rect.top,height-pad-h)),width:w,height:h};}
 function install(doc,host){let scheduled=false;
  function scan(){scheduled=false;if(host.innerWidth>=840)return;const viewport=host.KiCadAndroidSheets?.viewportGeometry?.(host),width=host.visualViewport?.width||host.innerWidth,height=viewport?.height||host.visualViewport?.height||host.innerHeight;
   for(const menu of doc.querySelectorAll(selector)){if(menu.hidden||!menu.getClientRects().length)continue;const r=menu.getBoundingClientRect(),b=bounds(r,width,height);const styles={position:'fixed',left:b.left+'px',top:b.top+'px',maxWidth:Math.max(1,width-16)+'px',maxHeight:Math.max(1,height-16)+'px',overflowY:'auto',boxSizing:'border-box'};for(const[key,value]of Object.entries(styles))if(menu.style[key]!==value)menu.style[key]=value;}
  }
  const schedule=()=>{if(scheduled)return;scheduled=true;(host.requestAnimationFrame||host.setTimeout)(scan);};const observer=new host.MutationObserver(schedule);observer.observe(doc.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','style','class']});host.addEventListener('resize',schedule);host.visualViewport?.addEventListener('resize',schedule);host.addEventListener('kicad-usable-viewport-changed',schedule);schedule();return{scan};
 }
 if(typeof module==='object'&&module.exports){module.exports={bounds,install};return;}if(root.document){const start=()=>{root.KiCadResponsiveControls=install(root.document,root);};if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});else start();}
})(globalThis);
