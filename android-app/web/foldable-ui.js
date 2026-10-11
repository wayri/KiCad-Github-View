/* Keep the existing workspace and drafts mounted while display posture changes. */
((root)=>{'use strict';
 function region(fold,width,height){
  const full={x:0,y:0,width,height};
  if(!fold?.separating||!['vertical','horizontal'].includes(fold.orientation))return full;
  const values=['x','y','width','height'].map(key=>Number(fold[key]));
  if(!values.every(Number.isFinite)||values.some(v=>v<0))return full;
  const [x,y,w,h]=values;
  let candidates;
  if(fold.orientation==='vertical'){
   if(x>width||y>0.5||y+h<height-0.5)return full;
   candidates=[{x:0,y:0,width:x,height},{x:Math.min(width,x+w),y:0,width:Math.max(0,width-x-w),height}];
  }else{
   if(y>height||x>0.5||x+w<width-0.5)return full;
   candidates=[{x:0,y:0,width,height:y},{x:0,y:Math.min(height,y+h),width,height:Math.max(0,height-y-h)}];
  }
  return candidates.sort((a,b)=>b.width*b.height-a.width*a.height)[0];
 }
 const API={region};root.KiCadAndroidFoldUI=API;
 if(typeof module==='object'&&module.exports)module.exports=API;
 if(!root.document)return;
 const d=root.document;let frame=0;
 function update(){
  frame=0;if(!d.body)return;
  const width=root.innerWidth,height=Math.min(root.innerHeight,root.visualViewport?.height||root.innerHeight);
  const r=region(root.KiCadAndroidFold,width,height),active=r.width!==width||r.height!==height;
  d.body.dataset.fold=active?root.KiCadAndroidFold.orientation:'none';
  for(const [key,value]of Object.entries(r))d.body.style.setProperty('--fold-'+key,value+'px');
  root.KiCadAndroidUsableViewport=active?r:null;
  // Child viewers resize naturally inside the existing iframe; no source reload.
  root.dispatchEvent(new CustomEvent('kicad-usable-viewport-changed',{detail:r}));
 }
 const schedule=()=>{if(!frame)frame=root.requestAnimationFrame(update);};
 root.addEventListener('kicad-fold-changed',schedule);root.addEventListener('resize',schedule);
 root.visualViewport?.addEventListener('resize',schedule);
 if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',schedule);else schedule();
})(globalThis);
