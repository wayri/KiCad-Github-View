/* Read-only candidate connections from saved copper. Not a KiCad connectivity or DRC engine. */
((root)=>{
 'use strict';
 const EPS=1e-7,point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y),distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 function onLine(p,a,b){const d=distance(a,b);return d<EPS?distance(p,a)<=EPS:Math.abs((p.x-a.x)*(b.y-a.y)-(p.y-a.y)*(b.x-a.x))<=EPS*d&&p.x>=Math.min(a.x,b.x)-EPS&&p.x<=Math.max(a.x,b.x)+EPS&&p.y>=Math.min(a.y,b.y)-EPS&&p.y<=Math.max(a.y,b.y)+EPS;}
 function crossing(a,b,c,d){if(onLine(a,c,d)||onLine(b,c,d)||onLine(c,a,b)||onLine(d,a,b))return true;const turn=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);return turn(a,b,c)*turn(a,b,d)<0&&turn(c,d,a)*turn(c,d,b)<0;}
 function contains(s,p){if(s.circle)return distance(s.center,p)<=s.radius+EPS;if(s.line)return onLine(p,...s.points);let inside=false;for(let i=0,j=s.points.length-1;i<s.points.length;j=i++){const a=s.points[j],b=s.points[i];if(onLine(p,a,b))return true;if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;}
 function edges(s){if(s.circle)return [];if(s.line)return [s.points];return s.points.map((p,i)=>[p,s.points[(i+1)%s.points.length]]);}
 function contact(a,b,step){if(a.layer!==b.layer||!a.layer)return false;if((b.circle||b.line)&&contains(a,b.center)||(a.circle||a.line)&&contains(b,a.center))return true;if(a.circle&&b.circle)return distance(a.center,b.center)<=a.radius+b.radius+EPS;
  if(a.circle||b.circle){const c=a.circle?a:b,s=a.circle?b:a;return edges(s).some(([p,q])=>{if(!step())return false;const dx=q.x-p.x,dy=q.y-p.y,l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((c.center.x-p.x)*dx+(c.center.y-p.y)*dy)/l)):0;return distance(c.center,{x:p.x+t*dx,y:p.y+t*dy})<=c.radius+EPS;});}
  return edges(a).some(([p,q])=>edges(b).some(([r,s])=>step()&&crossing(p,q,r,s)))||a.points.some(p=>step()&&contains(b,p))||b.points.some(p=>step()&&contains(a,p));
 }
 function shape(p){if(!['pad','via','track'].includes(p.kind)||!String(p.layer||'').endsWith('.Cu')||p.padType==='np_thru_hole')return null;
  const line=p.kind==='track'&&p.type==='line'&&Array.isArray(p.points)&&p.points.length===2&&p.points.every(point);
  if(line)return {source:p,line:true,points:p.points,center:p.points[0],layer:p.layer};
  if(p.kind==='track')return null;
  if(point(p)&&Number.isFinite(p.r)&&p.r>0)return {source:p,circle:true,radius:p.r,center:{x:p.x,y:p.y},layer:p.layer};
  if(Array.isArray(p.points)&&p.points.length>=3&&p.points.length<=128&&p.points.every(point))return {source:p,points:p.points,center:{x:p.points.reduce((s,v)=>s+v.x,0)/p.points.length,y:p.points.reduce((s,v)=>s+v.y,0)/p.points.length},layer:p.layer};
  return null;
 }
 function build(nets,options={}){
  const limit=(name,fallback,max)=>Number.isSafeInteger(options[name])&&options[name]>0?Math.min(options[name],max):fallback;
  const maxPrimitives=limit('maxPrimitives',4000,10000),maxChecks=limit('maxChecks',200000,1000000),maxIslands=limit('maxIslands',256,512),maxLines=limit('maxLines',2000,10000),maxNets=limit('maxNets',2000,10000);
  const lines=[],warnings=new Set(['Candidate connections only: conservative saved-copper geometry; not KiCad unrouted counts or DRC. Zones, arc copper and track-width overlaps are not resolved. Connections span island representatives, not optimized routing.']);
  const stats={nets:0,primitives:0,checks:0,islands:0,connections:0,truncated:false};
  const warn=text=>{if(warnings.size<30)warnings.add(text);};
  if(!Array.isArray(nets))return {lines,status:'candidate-connections',warnings:[...warnings],stats};
  for(const net of nets.slice(0,maxNets)){
   if(net.kind&&net.kind!=='pcb')continue;if(stats.primitives>=maxPrimitives||lines.length>=maxLines){stats.truncated=true;break;}stats.nets++;
   const label=String(net.name||net.id||'Net').slice(0,100),all=Array.isArray(net.primitives)?net.primitives:[];
   if(all.some(p=>p.kind==='zone'||p.kind==='zone-outline'))warn(`${label}: zones omitted; candidate connections may already be joined by filled copper.`);
   const shapes=[];let inspected=0;const seen=new Set();
   for(const p of all){if(inspected>=maxPrimitives-stats.primitives){stats.truncated=true;break;}inspected++;if(seen.has(p))continue;seen.add(p);const s=shape(p);if(s)shapes.push(s);else if(['pad','via','track','arc'].includes(p.kind))warn(`${label}: unsupported copper geometry omitted.`);}
   stats.primitives+=inspected;
   // Missing render geometry retains pad-only candidates without claiming electrical continuity.
   if(!shapes.some(s=>s.source.kind==='pad')){
    const members=(net.members||[]).filter(m=>m.kind==='pad'&&point(m.position));
    for(const m of members.slice(0,Math.max(0,maxPrimitives-stats.primitives))){shapes.push({source:{kind:'pad'},center:{x:m.position.x,y:m.position.y},layer:null});stats.primitives++;}
    if(members.length)warn(`${label}: pad-only fallback; saved copper membership unavailable.`);
   }
   const parents=shapes.map((_,i)=>i),find=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;},join=(i,j)=>{parents[find(i)]=find(j);};
   const plated=new Map();
   shapes.forEach((s,i)=>{const p=s.source;if(!p.uuid||!(p.kind==='via'||p.kind==='pad'&&p.padType==='thru_hole'))return;const key=p.kind==='via'?JSON.stringify(['via',p.uuid,s.center.x,s.center.y]):JSON.stringify(['pad',p.ownerUuid||p.uuid,p.name,s.center.x,s.center.y]);if(plated.has(key))join(i,plated.get(key));else plated.set(key,i);});
   outer:for(let i=0;i<shapes.length;i++)for(let j=0;j<i;j++){
    if(stats.checks>=maxChecks){stats.truncated=true;break outer;}stats.checks++;if(find(i)===find(j)||!shapes[i].layer||!shapes[j].layer)continue;if(contact(shapes[i],shapes[j],()=>{if(stats.checks>=maxChecks){stats.truncated=true;return false;}stats.checks++;return true;}))join(i,j);
   }
   const islands=new Map();shapes.forEach((s,i)=>{if(s.source.kind==='pad'&&!islands.has(find(i)))islands.set(find(i),s.center);});stats.islands+=islands.size;
   const points=[...islands.values()];if(points.length>maxIslands){points.length=maxIslands;stats.truncated=true;warn(`${label}: island limit reached; only part of this net is shown.`);}
   if(points.length<2)continue;
   const visited=new Set([0]),cost=points.map(p=>distance(points[0],p)),previous=points.map(()=>0);
   while(visited.size<points.length&&lines.length<maxLines){let chosen=-1;for(let i=0;i<points.length;i++)if(!visited.has(i)&&(chosen<0||cost[i]<cost[chosen]))chosen=i;
    if(chosen<0)break;lines.push({a:{...points[previous[chosen]]},b:{...points[chosen]},netId:net.id,netName:net.name,path:net.path,lengthMm:cost[chosen],kind:'candidate-connection'});visited.add(chosen);
    for(let i=0;i<points.length;i++)if(!visited.has(i)){if(stats.checks>=maxChecks){stats.truncated=true;break;}stats.checks++;const d=distance(points[chosen],points[i]);if(d<cost[i]){cost[i]=d;previous[i]=chosen;}}
   }
  }
  if(nets.length>maxNets)stats.truncated=true;if(stats.truncated)warn('Work limit reached; candidates are incomplete. Narrow the selected nets for a more complete view.');stats.connections=lines.length;
  return {lines,status:'candidate-connections',warnings:[...warnings],stats};
 }
 root.KiCadRatsnest={build};if(typeof module==='object'&&module.exports)module.exports=root.KiCadRatsnest;
})(typeof globalThis==='object'?globalThis:this);
