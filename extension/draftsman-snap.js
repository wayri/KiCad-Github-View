/* Bounded source-space Draftsman snapping. Index once per visible source view. */
((root)=>{'use strict';
 const LIMIT=1000000,LEAF=16,valid=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y)&&Math.abs(p.x)<=1e6&&Math.abs(p.y)<=1e6;
 function extent(p,owned){
  if(!p||p.hidden||p.frame||p.type==='text')return null;let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  const add=q=>{if(!Number.isFinite(q?.x)||!Number.isFinite(q?.y))return;minX=Math.min(minX,q.x);minY=Math.min(minY,q.y);maxX=Math.max(maxX,q.x);maxY=Math.max(maxY,q.y);};
  if((p.type==='circle'||p.type==='pad')&&valid(p)&&Number.isFinite(p.r)&&p.r>0){add({x:p.x-p.r,y:p.y-p.r});add({x:p.x+p.r,y:p.y+p.r});}
  else if(p.type==='arc'){add(p.start);add(p.mid);add(p.end);const arc=owned.arcThrough(p.start,p.mid,p.end);if(arc&&Number.isFinite(arc.r)&&arc.r>0){const turn=a=>(a%(Math.PI*2)+Math.PI*2)%(Math.PI*2);for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5])if(arc.ccw?turn(arc.start-angle)<=turn(arc.start-arc.end)+1e-9:turn(angle-arc.start)<=turn(arc.end-arc.start)+1e-9)add({x:arc.x+arc.r*Math.cos(angle),y:arc.y+arc.r*Math.sin(angle)});}}
  else{for(const point of p.points||[])add(point);add(p.start);add(p.end);add(p);}
  add(p.connectPoint);add(p.padCenter);if(minX===Infinity)return null;return{p,minX,minY,maxX,maxY};
 }
 function create(primitives){
  const tools=root.KiCadReviewTools||(typeof require==='function'?require('./review-tools.js'):null),owned=root.KiCadOwnedCanvas||(typeof require==='function'?require('./owned-canvas.js'):null);
  if(!Array.isArray(primitives)||primitives.length>LIMIT)throw Error('Draftsman snap supports at most 1,000,000 source primitives.');if(!tools?.snap||!owned?.arcThrough)throw Error('Draftsman snap geometry is unavailable.');
  const entries=[];let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const primitive of primitives){const e=extent(primitive,owned);if(!e)continue;entries.push(e);minX=Math.min(minX,e.minX);minY=Math.min(minY,e.minY);maxX=Math.max(maxX,e.maxX);maxY=Math.max(maxY,e.maxY);}
  const spread=n=>{n&=65535;n=(n|(n<<8))&0x00ff00ff;n=(n|(n<<4))&0x0f0f0f0f;n=(n|(n<<2))&0x33333333;return(n|(n<<1))&0x55555555;};
  const width=Math.max(1e-9,maxX-minX),height=Math.max(1e-9,maxY-minY);
  for(const e of entries){const x=Math.max(0,Math.min(65535,Math.floor(((e.minX+e.maxX)/2-minX)/width*65535))),y=Math.max(0,Math.min(65535,Math.floor(((e.minY+e.maxY)/2-minY)/height*65535)));e.order=(spread(x)|(spread(y)<<1))>>>0;}
  entries.sort((a,b)=>a.order-b.order);
  const nodes=[];
  function build(start,end){const index=nodes.length,node={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity,start,count:end-start};nodes.push(node);if(end-start<=LEAF){for(let i=start;i<end;i++){const e=entries[i];node.minX=Math.min(node.minX,e.minX);node.minY=Math.min(node.minY,e.minY);node.maxX=Math.max(node.maxX,e.maxX);node.maxY=Math.max(node.maxY,e.maxY);}}else{const mid=start+Math.floor((end-start)/2);node.left=build(start,mid);node.right=build(mid,end);const a=nodes[node.left],b=nodes[node.right];node.minX=Math.min(a.minX,b.minX);node.minY=Math.min(a.minY,b.minY);node.maxX=Math.max(a.maxX,b.maxX);node.maxY=Math.max(a.maxY,b.maxY);}return index;}
  if(entries.length)build(0,entries.length);let lastCandidates=0,lastVisitedNodes=0;
  const intersects=(e,x,y,r)=>e.minX<=x+r&&e.maxX>=x-r&&e.minY<=y+r&&e.maxY>=y-r;
  return{
   snap(at,options={}){
    if(!valid(at))throw Error('Invalid Draftsman cursor point.');const zoom=options.zoom===undefined?1:Number(options.zoom),pixels=options.tolerancePixels===undefined?10:Number(options.tolerancePixels);if(!Number.isFinite(zoom)||zoom<=0||!Number.isFinite(pixels)||pixels<=0)throw Error('Invalid Draftsman snap tolerance.');
    const radius=Math.max(4,Math.min(32,pixels))/Math.max(.001,zoom),query={...at};if(options.constrain&&valid(options.origin)){const axis=Math.abs(at.x-options.origin.x)>=Math.abs(at.y-options.origin.y)?'y':'x';query[axis]=options.origin[axis];}
    const candidates=[];lastCandidates=lastVisitedNodes=0;if(!options.bypass&&nodes.length){const stack=[0];while(stack.length){const node=nodes[stack.pop()];lastVisitedNodes++;if(!intersects(node,query.x,query.y,radius))continue;if(node.left!==undefined){stack.push(node.right,node.left);}else for(let i=node.start;i<node.start+node.count;i++){const e=entries[i];if(intersects(e,query.x,query.y,radius))candidates.push(e.p);}}}
    lastCandidates=candidates.length;return tools.snap(at,candidates,{...options,mode:'geometry',zoom,tolerancePixels:pixels,includeHoles:true,circleCenters:true,arcThrough:owned.arcThrough});
   },
   stats(){return{indexed:entries.length,nodes:nodes.length,lastCandidates,lastVisitedNodes};}
  };
 }
 const api={create,LIMIT};root.KiCadDraftsmanSnap=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
