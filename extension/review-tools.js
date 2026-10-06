/* Owned review geometry, page overrides and bounded canvas evidence capture. */
((root)=>{
 'use strict';
 const papers={A0:[1189,841],A1:[841,594],A2:[594,420],A3:[420,297],A4:[297,210],A5:[210,148],A:[279.4,215.9],B:[431.8,279.4],C:[558.8,431.8],D:[863.6,558.8],E:[1117.6,863.6],Letter:[279.4,215.9],Legal:[355.6,215.9],Ledger:[431.8,279.4]};
 function area(a,b){if(![a?.x,a?.y,b?.x,b?.y].every(Number.isFinite))throw new Error('Invalid review area.');const value={x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(b.x-a.x),height:Math.abs(b.y-a.y)};if(value.width<.001||value.height<.001||[value.x,value.y,value.x+value.width,value.y+value.height].some(n=>Math.abs(n)>1e6))throw new Error('Draw a nonzero review area.');return value;}
 function page(value){
  if(!value||typeof value!=='object')throw new Error('Invalid page setup.');
  let size=papers[value.format],width=size?size[0]:Number(value.width),height=size?size[1]:Number(value.height);
  if(!size&&value.format!=='User')throw new Error('Choose a supported paper format.');
  if(value.portrait)[width,height]=[Math.min(width,height),Math.max(width,height)];
  if(![width,height].every(n=>Number.isFinite(n)&&n>=100&&n<=2000))throw new Error('Page dimensions must be 100–2,000 mm.');
  const titleBlock={};for(const key of ['title','company','date','rev']){if(typeof value[key]!=='string'||value[key].length>300||/[\x00-\x1f]/.test(value[key]))throw new Error('Invalid title-block field.');titleBlock[key]=value[key];}
  if(!Array.isArray(value.comments)||value.comments.length!==9||value.comments.some(s=>typeof s!=='string'||s.length>300||/[\x00-\x1f]/.test(s)))throw new Error('Invalid title-block comments.');titleBlock.comments=value.comments;
  return{format:value.format,width,height,titleBlock};
 }
 function crop(canvas,camera,region){
  const a=camera.world_to_screen({x:region.x,y:region.y}),b=camera.world_to_screen({x:region.x+region.width,y:region.y+region.height});
  const rect=canvas.getBoundingClientRect(),sx=canvas.width/rect.width,sy=canvas.height/rect.height;
  const x=Math.max(0,Math.min(a.x,b.x)*sx),y=Math.max(0,Math.min(a.y,b.y)*sy),right=Math.min(canvas.width,Math.max(a.x,b.x)*sx),bottom=Math.min(canvas.height,Math.max(a.y,b.y)*sy);
  if(right-x<2||bottom-y<2)throw new Error('The review area is outside the visible drawing. Fit or zoom it into view before capturing.');
  return{x,y,width:right-x,height:bottom-y};
 }
 function capture(canvas,camera,region,create=()=>document.createElement('canvas')){
  const c=crop(canvas,camera,region),out=create();let factor=Math.min(1,1024/c.width,1024/c.height);
  for(let attempt=0;attempt<6;attempt++){
   out.width=Math.max(1,Math.round(c.width*factor));out.height=Math.max(1,Math.round(c.height*factor));
   const ctx=out.getContext('2d');if(!ctx)throw new Error('Screenshot capture is unavailable.');ctx.drawImage(canvas,c.x,c.y,c.width,c.height,0,0,out.width,out.height);
   const dataUrl=out.toDataURL('image/png');if(dataUrl.length<=262144)return{mime:'image/png',dataUrl,width:out.width,height:out.height};factor*=.65;
  }
  throw new Error('Screenshot is too large; draw a smaller area.');
 }
 const valid=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y);
 const turn=a=>(a%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
 function onArc(a,angle){return a.ccw?turn(a.start-angle)<=turn(a.start-a.end)+1e-9:turn(angle-a.start)<=turn(a.end-a.start)+1e-9;}
 function snap(at,primitives,options={}){
  if(!valid(at))throw new Error('Invalid ruler point.');
  const mode=options.mode||'geometry-grid',pitch=Number(options.pitch)||1,tolerance=8/Math.max(.001,options.zoom||1),origin=options.origin;
  let point={...at},axis=null;
  if(options.constrain&&valid(origin)){axis=Math.abs(at.x-origin.x)>=Math.abs(at.y-origin.y)?'y':'x';point[axis]=origin[axis];}
  const allowed=q=>valid(q)&&(!axis||Math.abs(q[axis]-origin[axis])<1e-7);
  let best=null,bestDist=Infinity,bestPriority=Infinity;
  const candidate=(q,kind,priority)=>{if(!allowed(q))return;const d=Math.hypot(q.x-point.x,q.y-point.y);if(d<=tolerance&&(priority<bestPriority||priority===bestPriority&&d<bestDist)){best={point:{x:q.x,y:q.y},kind};bestDist=d;bestPriority=priority;}};
  if(!options.bypass&&mode.includes('geometry'))for(const p of primitives||[]){
   if(p.hidden||p.frame||p.hole||p.type==='text')continue;
   if(['pad','via','pin','junction'].includes(p.kind)){if(valid(p.connectPoint))candidate(p.connectPoint,'pin',0);else if(valid(p))candidate(p,p.kind+' center',0);else if(p.kind==='pad'&&p.points?.length){const pts=p.points;candidate({x:pts.reduce((n,q)=>n+q.x,0)/pts.length,y:pts.reduce((n,q)=>n+q.y,0)/pts.length},'pad center',0);}if(p.kind==='pad'||p.kind==='via')continue;}
   const pts=p.points||[p.start,p.mid,p.end].filter(valid);
   for(const q of pts)candidate(q,'endpoint',0);
   if(p.type==='arc'&&options.arcThrough){const a=options.arcThrough(p.start,p.mid,p.end);if(a){const angle=Math.atan2(point.y-a.y,point.x-a.x);if(onArc(a,angle))candidate({x:a.x+a.r*Math.cos(angle),y:a.y+a.r*Math.sin(angle)},'arc edge',1);}continue;}
   if(p.type==='circle'&&valid(p)&&Number.isFinite(p.r)){const angle=Math.atan2(point.y-p.y,point.x-p.x);candidate({x:p.x+p.r*Math.cos(angle),y:p.y+p.r*Math.sin(angle)},'circle edge',1);}
   for(let i=1;i<pts.length+(p.type==='polygon'?1:0);i++){const a=pts[i-1],b=pts[i%pts.length];if(!valid(a)||!valid(b))continue;const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/l)):0;candidate({x:a.x+t*dx,y:a.y+t*dy},'edge',1);}
  }
  if(best)return{...best,constrained:Boolean(axis)};
  if(!options.bypass&&mode.includes('grid')&&pitch>=.001&&pitch<=100){const q={x:Math.round(point.x/pitch)*pitch,y:Math.round(point.y/pitch)*pitch};if(axis)q[axis]=origin[axis];if(mode==='grid'||Math.hypot(q.x-point.x,q.y-point.y)<=tolerance)return{point:q,kind:'grid',constrained:Boolean(axis)};}
  return{point,kind:'free',constrained:Boolean(axis)};
 }
 function boardExtents(primitives,arcThrough){
  const pts=[];for(const p of primitives||[]){if(p.hidden||p.frame||p.layer!=='Edge.Cuts'||p.type==='text')continue;
   if(p.type==='circle'&&valid(p)&&Number.isFinite(p.r))pts.push({x:p.x-p.r,y:p.y-p.r},{x:p.x+p.r,y:p.y+p.r});
   else if(p.type==='arc'){pts.push(...[p.start,p.mid,p.end].filter(valid));const a=arcThrough?.(p.start,p.mid,p.end);if(a)for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5])if(onArc(a,angle))pts.push({x:a.x+a.r*Math.cos(angle),y:a.y+a.r*Math.sin(angle)});}
   else pts.push(...(p.points||[]).filter(valid));
  }
  if(!pts.length)return null;let x=Infinity,y=Infinity,maxX=-Infinity,maxY=-Infinity;for(const p of pts){x=Math.min(x,p.x);y=Math.min(y,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);}const width=maxX-x,height=maxY-y;
  return{x,y,width,height};
 }
 function ruler(a,b,units='mm'){const dx=b.x-a.x,dy=b.y-a.y,distance=Math.hypot(dx,dy),angle=Math.atan2(dy,dx)*180/Math.PI,factor=units==='mil'?1000/25.4:1;return{dx,dy,distance,angle,text:`${(distance*factor).toFixed(3)} ${units} · ΔX ${(dx*factor).toFixed(3)} · ΔY ${(dy*factor).toFixed(3)} · ${angle.toFixed(1)}°`};}
 function angle(a,v,b){if(![a,v,b].every(valid))return null;const ax=a.x-v.x,ay=a.y-v.y,bx=b.x-v.x,by=b.y-v.y;if(Math.hypot(ax,ay)<1e-9||Math.hypot(bx,by)<1e-9)return null;const degrees=Math.atan2(Math.abs(ax*by-ay*bx),ax*bx+ay*by)*180/Math.PI;return{degrees,text:`${degrees.toFixed(1)}°`};}
 root.KiCadReviewTools={papers,area,page,crop,capture,ruler,angle,snap,boardExtents};if(typeof module==='object'&&module.exports)module.exports=root.KiCadReviewTools;
})(globalThis);
