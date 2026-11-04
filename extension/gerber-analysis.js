/* Read-only screening of parsed fabrication geometry, in mm and Y-down coordinates. */
((root)=>{
 'use strict';
 const LIMITS=Object.freeze({layers:64,primitives:200000,diagnostics:1000,points:2000000});
 const disclaimer='Geometry screening only. Bounds include dark and clear operations before polarity subtraction. Stroke widths are rendered aperture widths, not measured trace widths or clearances. Operation areas are summed before overlap removal and polarity subtraction; omitted geometry is excluded. Envelope area is an extent rectangle, not board area. This is not a full DFM check.';
 function role(path,model){
  const f=model.attributes?.FileFunction;
  if(!f&&model.jobFile?.fileFunction)return {name:model.jobFile.fileFunction,source:'job',fileFunction:model.jobFile.fileFunction};
  if(typeof f==='string'&&f.trim())return {name:f,source:'x2',fileFunction:f};
  const name=String(path).split(/[\\/]/).pop().toLowerCase();
  const names={gtl:'Top copper',gbl:'Bottom copper',gts:'Top solder mask',gbs:'Bottom solder mask',gto:'Top silkscreen',gbo:'Bottom silkscreen',gtp:'Top paste',gbp:'Bottom paste',gko:'Board outline',drl:'Drill',xln:'Drill',xnc:'Drill',exc:'Drill',nc:'Drill'};
  const ext=name.split('.').pop();let inferred=names[ext];
  if(!inferred){const m=/(?:^|[-_.])(f|b)[-_.]?(cu|mask|silks|silkscreen|paste)(?:[-_.]|$)/.exec(name);if(m)inferred=(m[1]==='f'?'Top':'Bottom')+' '+({cu:'copper',mask:'solder mask',silks:'silkscreen',silkscreen:'silkscreen',paste:'paste'}[m[2]]);else if(/(?:^|[-_.])in(\d+)[-_.]?cu(?:[-_.]|$)/.test(name))inferred='Inner copper '+/(?:^|[-_.])in(\d+)[-_.]?cu(?:[-_.]|$)/.exec(name)[1];else if(/edge[-_.]?cuts|outline/.test(name))inferred='Board outline';else if(model.format==='excellon')inferred='Drill';}
  return {name:inferred||'Unknown layer',source:inferred?'filename':'unknown'};
 }
 const finite=n=>typeof n==='number'&&Number.isFinite(n);
 const turn=a=>(a%(Math.PI*2)+Math.PI*2)%(Math.PI*2);
 function primitiveBounds(p,visit){
  if(!p||typeof p!=='object'||Array.isArray(p)||p.polarity!==undefined&&!['dark','clear'].includes(p.polarity))throw Error('Invalid primitive geometry or polarity.');
  const width=p.fill?0:(p.width||0);if(!finite(width)||width<0)throw Error('Invalid primitive width.');const pad=width/2;
  const point=q=>{if(!q||!finite(q.x)||!finite(q.y))throw Error('Invalid primitive coordinate.');visit(q.x-pad,q.y-pad);visit(q.x+pad,q.y+pad);};
  if(p.type==='circle'){if(!finite(p.x)||!finite(p.y)||!finite(p.r)||p.r<0)throw Error('Invalid circle.');visit(p.x-p.r-pad,p.y-p.r-pad);visit(p.x+p.r+pad,p.y+p.r+pad);return;}
  if(p.type==='arc'){
   const a=p.start,b=p.mid,c=p.end;point(a);point(b);point(c);
   const u={x:b.x-a.x,y:b.y-a.y},v={x:c.x-a.x,y:c.y-a.y},d=2*(u.x*v.y-u.y*v.x);if(d===0)throw Error('Degenerate arc.');
   const uu=u.x*u.x+u.y*u.y,vv=v.x*v.x+v.y*v.y;
   const center={x:a.x+(uu*v.y-vv*u.y)/d,y:a.y+(vv*u.x-uu*v.x)/d};if(!finite(center.x)||!finite(center.y))throw Error('Invalid arc center.');
   const r=Math.hypot(a.x-center.x,a.y-center.y),start=Math.atan2(a.y-center.y,a.x-center.x),end=turn(Math.atan2(c.y-center.y,c.x-center.x)-start),mid=turn(Math.atan2(b.y-center.y,b.x-center.x)-start),positive=mid<=end;
   for(let i=0;i<4;i++){const angle=i*Math.PI/2,delta=turn(angle-start);if(positive?delta<=end+1e-12:delta>=end-1e-12)point({x:center.x+r*Math.cos(angle),y:center.y+r*Math.sin(angle)});}return;
  }
  if(!['line','polygon'].includes(p.type)||!Array.isArray(p.points)||p.points.length<(p.type==='line'?2:3))throw Error('Unsupported primitive geometry.');
  for(const contour of p.contours||[p.points]){if(!Array.isArray(contour))throw Error('Invalid contour.');for(const q of contour)point(q);}
 }
 // Areas describe individual rendered operations, never their boolean union.
 function measurements(p){
  let pathLength=0,area=null;
  const width=p.fill?0:(p.width||0),half=width/2;
  if(p.type==='circle'){
   pathLength=p.fill?0:2*Math.PI*p.r;
   area=p.fill?Math.PI*p.r*p.r:Math.PI*((p.r+half)**2-Math.max(0,p.r-half)**2);
  }else if(p.type==='line'){
   for(let i=1;i<p.points.length;i++)pathLength+=Math.hypot(p.points[i].x-p.points[i-1].x,p.points[i].y-p.points[i-1].y);
   if(p.points.length===2&&!p.fill)area=pathLength*width+Math.PI*half*half;
  }else if(p.type==='arc'){
   const a=p.start,b=p.mid,c=p.end,u={x:b.x-a.x,y:b.y-a.y},v={x:c.x-a.x,y:c.y-a.y},d=2*(u.x*v.y-u.y*v.x),uu=u.x*u.x+u.y*u.y,vv=v.x*v.x+v.y*v.y;
   const center={x:a.x+(uu*v.y-vv*u.y)/d,y:a.y+(vv*u.x-uu*v.x)/d},start=Math.atan2(a.y-center.y,a.x-center.x),end=turn(Math.atan2(c.y-center.y,c.x-center.x)-start),mid=turn(Math.atan2(b.y-center.y,b.x-center.x)-start);
   pathLength=Math.hypot(a.x-center.x,a.y-center.y)*(mid<=end?end:Math.PI*2-end);
  }else if(p.type==='polygon'&&p.fill&&Number.isInteger(p.aperture)&&(!p.contours||p.contours.length===1)&&p.points.length>=3&&p.points.length<=12){
   // Standard rectangle/polygon flashes are convex; check every edge before
   // using shoelace. Regions and compound/self-intersecting contours stay omitted.
   const pts=p.points;let sign=0,convex=true;
   for(let i=0;i<pts.length;i++)for(let j=0;j<pts.length;j++){
    const a=pts[i],b=pts[(i+1)%pts.length],c=pts[j],cross=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
    if(Math.abs(cross)>1e-12){const direction=Math.sign(cross);if(sign&&direction!==sign)convex=false;sign=direction;}
   }
   if(convex&&sign){let sum=0;const origin=pts[0];for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];sum+=(a.x-origin.x)*(b.y-origin.y)-(b.x-origin.x)*(a.y-origin.y);}area=Math.abs(sum)/2;}
  }
  if(!finite(pathLength)||area!==null&&(!finite(area)||area<0))throw Error('Geometry measurements exceed finite bounds.');
  return {pathLength,area};
 }
 function analyze(layers,options={}){
  if(!Array.isArray(layers)||layers.length>LIMITS.layers)throw Error('Fabrication analysis accepts at most 64 layers.');
  const criteria={};for(const key of ['minTrack','minDrill']){const value=options[key];criteria[key]=value===undefined||value===null||value===''?null:Number(value);if(criteria[key]!==null&&(!finite(criteria[key])||criteria[key]<0||criteria[key]>100000))throw Error('Invalid '+key+' criterion in mm.');}
  const result={layers:[],bounds:null,totals:{layers:layers.length,primitives:0,dark:0,clear:0,drillHits:0,drillSlots:0},diagnostics:[],criteria,coverage:'parsed',disclaimer};let points=0,suppressed=0;
  const diagnostic=d=>{if(result.diagnostics.length<LIMITS.diagnostics)result.diagnostics.push(d);else suppressed++;};
  const merge=(bounds,x,y)=>{if(!finite(x)||!finite(y))throw Error('Invalid derived geometry bounds.');if(++points>LIMITS.points)throw Error('Fabrication analysis point limit exceeded.');bounds.minX=Math.min(bounds.minX,x);bounds.minY=Math.min(bounds.minY,y);bounds.maxX=Math.max(bounds.maxX,x);bounds.maxY=Math.max(bounds.maxY,y);};
  const finish=b=>{if(b.minX===Infinity)return null;const result={...b,width:b.maxX-b.minX,height:b.maxY-b.minY};if(!finite(result.width)||!finite(result.height))throw Error('Geometry extents exceed finite bounds.');return result;};
  const blank=()=>({minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity});const totalBounds=blank();const roles=new Map();
  for(const entry of layers){
   const path=String(entry?.path||entry?.model?.path||'Unnamed layer'),model=entry?.model;
   if(!model||!Array.isArray(model.primitives)||model.units!=='mm')throw Error('Analysis requires parsed geometry in mm: '+path);
   if(result.totals.primitives+model.primitives.length>LIMITS.primitives)throw Error('Fabrication analysis primitive limit exceeded.');
   const warnings=Array.isArray(model.warnings)?model.warnings.slice(0,100).map(String):[],layer={path,role:role(path,model),bounds:null,counts:{primitives:model.primitives.length,dark:0,clear:0,drillHits:0,drillSlots:0},minStroke:null,drillDiameters:[],objects:{line:0,arc:0,circle:0,polygon:0},usedTools:[],fileAttributes:{...model.attributes},objectAttributeExamples:[],objectAttributeExamplesTruncated:false,metrics:{envelopeArea:null,pathLength:0,darkOperationArea:0,clearOperationArea:0,computedAreaOperations:0,omittedAreaOperations:0},warnings,coverage:warnings.some(w=>/omitt|unsupported|ignored/i.test(w))?'partial':'parsed'};
   if(layer.coverage==='partial')result.coverage='partial';for(const warning of warnings)diagnostic({severity:'warning',code:'parser-warning',path,message:warning});
   const b=blank(),diameters=new Map(),hits=new Map(),tools=new Map(),attributeExamples=new Set();
   for(const p of model.primitives){
    primitiveBounds(p,(x,y)=>{merge(b,x,y);merge(totalBounds,x,y);});const polarity=p.polarity==='clear'?'clear':'dark';layer.counts[polarity]++;layer.objects[p.type]++;
    if(p.objectAttributes&&Object.keys(p.objectAttributes).length){const key=JSON.stringify(p.objectAttributes);if(!attributeExamples.has(key)){if(attributeExamples.size<64){attributeExamples.add(key);layer.objectAttributeExamples.push({...p.objectAttributes});}else layer.objectAttributeExamplesTruncated=true;}}
    const measured=measurements(p);layer.metrics.pathLength+=measured.pathLength;
    if(measured.area===null)layer.metrics.omittedAreaOperations++;else{layer.metrics.computedAreaOperations++;layer.metrics[polarity+'OperationArea']+=measured.area;}
    if(typeof p.reference==='string'&&/^[DT]\d+$/.test(p.reference)){
     const item=tools.get(p.reference)||{reference:p.reference,operations:0,dark:0,clear:0};item.operations++;item[polarity]++;tools.set(p.reference,item);
    }
    if(p.kind!=='drill'&&polarity==='dark'&&!p.fill&&finite(p.width)&&p.width>0){layer.minStroke=layer.minStroke===null?p.width:Math.min(layer.minStroke,p.width);if(criteria.minTrack!==null&&p.width<criteria.minTrack)diagnostic({severity:'warning',code:'stroke-below-criterion',path,primitiveId:p.uuid,message:'Rendered stroke '+p.width+' mm is below the '+criteria.minTrack+' mm criterion; this does not measure etched trace width.'});}
    if(p.kind==='drill'){
     const slot=p.type==='line'||p.type==='arc'||p.routeCircle===true,diameter=slot?p.width:p.r*2;if(!finite(diameter)||diameter<=0)throw Error('Invalid drill diameter.');layer.counts[slot?'drillSlots':'drillHits']++;const key=diameter.toPrecision(12);diameters.set(key,{diameter,count:(diameters.get(key)?.count||0)+1});
     if(criteria.minDrill!==null&&diameter<criteria.minDrill)diagnostic({severity:'warning',code:'drill-below-criterion',path,primitiveId:p.uuid,message:'Drill tool diameter '+diameter+' mm is below the '+criteria.minDrill+' mm criterion.'});
     if(!slot){const coordinate=p.x+','+p.y;if(hits.has(coordinate))diagnostic({severity:'warning',code:'duplicate-drill-hit',path,primitiveId:p.uuid,x:p.x,y:p.y,message:'Repeated drill hit at the same coordinate; tools '+hits.get(coordinate)+' and '+(p.reference||'unknown')+'.'});else hits.set(coordinate,p.reference||'unknown');}
    }
   }
   layer.bounds=finish(b);layer.metrics.envelopeArea=layer.bounds?layer.bounds.width*layer.bounds.height:null;if(Object.values(layer.metrics).some(v=>v!==null&&!finite(v)))throw Error('Geometry measurements exceed finite bounds.');layer.usedTools=[...tools.values()].sort((a,b)=>a.reference[0].localeCompare(b.reference[0])||Number(a.reference.slice(1))-Number(b.reference.slice(1)));layer.drillDiameters=[...diameters.values()].sort((a,b)=>a.diameter-b.diameter);result.layers.push(layer);
   for(const key of Object.keys(layer.counts))result.totals[key]+=layer.counts[key];
   if(layer.role.source==='x2'||layer.role.source==='job'){const functionKey=layer.role.fileFunction.toLowerCase();if(roles.has(functionKey))diagnostic({severity:'warning',code:'duplicate-layer-role',path,message:'The saved fabrication FileFunction matches '+roles.get(functionKey)+'. Check whether both files belong in this set.'});else roles.set(functionKey,path);}
   if(!layer.counts.primitives)diagnostic({severity:'warning',code:'empty-layer',path,message:'No geometry was parsed from this layer.'});
  }
  result.bounds=finish(totalBounds);if(suppressed)result.diagnostics.push({severity:'warning',code:'diagnostics-truncated',message:suppressed+' additional diagnostics were suppressed.'});return result;
 }
 const api={analyze,role,primitiveBounds,LIMITS};root.KiCadGerberAnalysis=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis==='object'?globalThis:this);
