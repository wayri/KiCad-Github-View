/* Full-bleed app surfaces; safe spacing is applied once at each screen edge. */
((root)=>{'use strict';
 function localInsets(safe,box,width,height){return{
  left:Math.min(box.width,Math.max(0,(safe.left||0)-box.x)),
  top:Math.min(box.height,Math.max(0,(safe.top||0)-box.y)),
  right:Math.min(box.width,Math.max(0,box.x+box.width-width+(safe.right||0))),
  bottom:Math.min(box.height,Math.max(0,box.y+box.height-height+(safe.bottom||0)))
 };}
 if(typeof module==='object'&&module.exports){module.exports={localInsets};return;}
 if(root!==root.top){try{root.top.KiCadAndroidEdges?.schedule();root.addEventListener('load',()=>root.top.KiCadAndroidEdges?.schedule(),true);root.addEventListener('resize',()=>root.top.KiCadAndroidEdges?.schedule());}catch{}return;}
 let pending=false;
 function update(){pending=false;const safe=root.KiCadAndroidSafeInsets||{},width=root.innerWidth,height=root.innerHeight;
  function visit(win,x,y,depth){if(depth>8)return;try{
   const doc=win.document,insets=localInsets(safe,{x,y,width:win.innerWidth,height:win.innerHeight},width,height);
   for(const [edge,value]of Object.entries(insets)){const key='--android-safe-'+edge,next=value+'px';if(doc.documentElement.style.getPropertyValue(key)!==next)doc.documentElement.style.setProperty(key,next);}
   for(const frame of doc.querySelectorAll('iframe')){const rect=frame.getBoundingClientRect();if(rect.width&&rect.height&&frame.contentWindow)visit(frame.contentWindow,x+rect.left,y+rect.top,depth+1);}
  }catch{}}
  visit(root,0,0,0);
 }
 const schedule=()=>{if(!pending){pending=true;root.requestAnimationFrame(update);}};
 root.KiCadAndroidEdges={schedule};root.addEventListener('kicad-safe-insets',schedule);root.addEventListener('resize',schedule);root.document.addEventListener('load',schedule,true);schedule();
})(globalThis);
