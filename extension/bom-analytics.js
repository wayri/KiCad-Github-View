/* Source-bound, read-only BOM and PCB statistics. No copper union or refill. */
((root)=>{
'use strict';
const diff=root.KiCadDesignDiff||(typeof require==='function'?require('./design-diff.js'):null);
const value=x=>x&&typeof x==='object'&&!Array.isArray(x)?x.quoted:x;
const kind=x=>Array.isArray(x)?String(value(x[0])):'';
const children=(x,k)=>Array.isArray(x)?x.filter(n=>kind(n)===k):[];
const child=(x,k)=>children(x,k)[0];
const field=(x,k)=>value(child(x,k)?.[1]);
function bom(objects,path){
 if(!Array.isArray(objects)||objects.length>100000)throw new Error('BOM object limit exceeded.');
 const parts=objects.filter(o=>(!path||o.path===path)&&['symbol','footprint'].includes(o.kind));
 // Multi-unit symbols count once per saved file/reference. Different files retain identity.
 const unique=new Map();for(const o of parts){const key=JSON.stringify([o.path,o.kind==='footprint'?(o.uuid||o.id):(o.reference||o.uuid||o.id)]);if(!unique.has(key))unique.set(key,o);}
 const physical=[...unique.values()],eligible=physical.filter(o=>!o.excludeFromBom),groups=new Map();
 for(const o of eligible){const p=o.properties||{},key=JSON.stringify([p.Value||'',p.Footprint||p['Library ID']||'',o.populated!==false]);if(!groups.has(key))groups.set(key,{value:p.Value||'',footprint:p.Footprint||p['Library ID']||'',populated:o.populated!==false,parts:[]});groups.get(key).parts.push(o);}
 return {parts:physical,groups:[...groups.values()].sort((a,b)=>a.value.localeCompare(b.value)),total:physical.length,fitted:physical.filter(o=>o.populated!==false).length,dnp:physical.filter(o=>o.populated===false).length,excluded:physical.length-eligible.length,eligible:eligible.length};
}
function csv(result){
 const cell=x=>{let s=String(x??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
 const rows=[['Reference','Value','Footprint','Population','File']];for(const group of result.groups)for(const o of group.parts)rows.push([o.reference||'',group.value,group.footprint,group.populated?'Fitted':'DNP',o.path]);return rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
function polygonArea(points){if(!Array.isArray(points)||points.length<3)return null;let area=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];if(![a.x,a.y,b.x,b.y].every(Number.isFinite)||[a.x,a.y,b.x,b.y].some(v=>Math.abs(v)>100000))return null;area+=a.x*b.y-b.x*a.y;}return Math.abs(area)/2;}
function board(content){
 if(typeof content!=='string'||new TextEncoder().encode(content).length>8*1024*1024)throw new Error('Board analytics source exceeds 8 MiB.');
 const ast=diff.parse(content);if(kind(ast)!=='kicad_pcb')throw new Error('Board analytics requires a saved PCB.');
 const count=k=>children(ast,k).length,footprints=children(ast,'footprint');let pads=0,holes=0,smd=0,thru=0,length=0;
 for(const fp of footprints)for(const pad of children(fp,'pad')){pads++;if(child(pad,'drill'))holes++;const type=String(value(pad[2]));if(type==='smd')smd++;if(type==='thru_hole'||type==='np_thru_hole')thru++;}
 const xy=(node,k)=>{const n=child(node,k);return{x:Number(value(n?.[1])),y:Number(value(n?.[2]))};};
 for(const segment of children(ast,'segment')){const a=xy(segment,'start'),b=xy(segment,'end');if([a.x,a.y,b.x,b.y].every(Number.isFinite))length+=Math.hypot(b.x-a.x,b.y-a.y);}
 let pointCount=0;const warnings=[],layers=new Map(),zones=[];
 for(const [index,zone] of children(ast,'zone').entries()){
  const record={index,uuid:field(zone,'uuid')||field(zone,'tstamp')||null,name:String(field(zone,'name')||field(zone,'net_name')||`Zone ${index+1}`),layers:[],outlineAreaMm2:0,fillAreaMm2:0,valid:true};
  for(const [type,total] of [['polygon','outlineAreaMm2'],['filled_polygon','fillAreaMm2']])for(const poly of children(zone,type)){
   const pts=children(child(poly,'pts'),'xy').map(p=>({x:Number(value(p[1])),y:Number(value(p[2]))}));pointCount+=pts.length;if(pointCount>200000)throw new Error('Zone analytics exceeds 200,000 polygon points.');
   const area=polygonArea(pts);if(area===null){record.valid=false;warnings.push(`Zone ${index+1}: invalid polygon omitted.`);continue;}record[total]+=area;
   if(type==='filled_polygon'){const layer=String(field(poly,'layer')||field(zone,'layer')||'Unspecified');if(!record.layers.includes(layer))record.layers.push(layer);layers.set(layer,(layers.get(layer)||0)+area);}
  }
  if(!children(zone,'filled_polygon').length)warnings.push(`Zone ${index+1}: no saved filled polygons.`);
  zones.push(record);
 }
 return {footprints:footprints.length,pads,drilledPads:holes,smdPads:smd,throughHolePads:thru,segments:count('segment'),arcs:count('arc'),vias:count('via'),zones,straightTrackLengthMm:length,boardThicknessMm:Number(field(child(ast,'general'),'thickness'))||null,layerFill:[...layers].map(([layer,areaMm2])=>({layer,areaMm2})),warnings,limits:'Areas are sums of absolute shoelace areas of saved straight-edge polygons; overlaps are counted repeatedly and hole contours are not subtracted. They are not copper union, material mass, clearance checks or a fresh zone fill. Track length excludes arcs. BOM counts saved file/reference identities; reused sheet instances are not expanded.'};
}
root.KiCadBomAnalytics={bom,board,polygonArea,csv};if(typeof module==='object'&&module.exports)module.exports=root.KiCadBomAnalytics;
})(typeof globalThis!=='undefined'?globalThis:this);
