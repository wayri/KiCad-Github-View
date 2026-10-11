/* Data-only BoM interchange. HTML scripts are never executed. */
((root)=>{
 'use strict';
 const MAX_BYTES=16*1024*1024,MAX_PARTS=50000,MAX_TEXT=32768,MAX_PRIMITIVES=100000;
 const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k),obj=o=>o&&typeof o==='object'&&!Array.isArray(o);
 const scalar=v=>v===null||v===undefined?'':typeof v==='string'||typeof v==='number'||typeof v==='boolean'?String(v):(()=>{throw Error('BoM fields must be scalar values.');})();
 function text(v){const s=scalar(v);if(s.length>MAX_TEXT)throw Error('BoM field is too long.');return s;}
 function properties(v){if(!obj(v)||Object.keys(v).length>256)throw Error('Invalid BoM properties.');const p=Object.create(null);for(const [k,x]of Object.entries(v)){if(k.length>256)throw Error('BoM field name is too long.');p[k]=text(x);}return p;}
 const finite=v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<1e7;
 const xy=v=>Array.isArray(v)&&v.length>=2&&finite(v[0])&&finite(v[1])?{x:v[0],y:v[1]}:null;
 const refRE=/^[A-Za-z][A-Za-z0-9_.]*\d+[A-Za-z]?$/;
 function references(value){
  const parts=text(value).trim().split(/[\s,;]+/).filter(Boolean),refs=[];
  for(const part of parts){const range=part.match(/^([A-Za-z][A-Za-z_.]*)(\d+)[–-](?:([A-Za-z][A-Za-z_.]*))?(\d+)$/u);
   if(range){const [,prefix,lo,other,hi]=range,a=Number(lo),b=Number(hi);if(other&&other!==prefix||a>b||b-a>=MAX_PARTS||lo.length>1&&lo[0]==='0'||hi.length>1&&hi[0]==='0')throw Error('Ambiguous reference range: '+part);for(let n=a;n<=b;n++)refs.push(prefix+n);}
   else if(refRE.test(part))refs.push(part);else throw Error('Invalid or ambiguous component reference: '+part);
   if(refs.length>MAX_PARTS)throw Error('Too many component references.');
  }
  if(!refs.length||new Set(refs).size!==refs.length)throw Error('Missing or duplicate component references.');return refs;
 }
 function record(reference,p,path,index,flags={},position=null,side=''){
  p.Reference=reference;if(!own(p,'Value'))p.Value='';if(!own(p,'Footprint'))p.Footprint='';
  const dnp=flags.dnp===true||/^(?:dnp|dni|not fitted|no|false|0)$/i.test(p.Assembly||p.Population||p.Populated||'')||/^(?:yes|true|1|dnp|dni)$/i.test(p.DNP||'');
  const excluded=flags.excluded===true||/^(?:no|false|0)$/i.test(p.InBOM||'')||/^(?:yes|true|1)$/i.test(p['Excluded from BOM']||p.ExcludeFromBom||'');
  if(!side){const raw=p.Side||p.Layer||'';side=/^(?:f|f\.cu|front|top)$/i.test(raw)?'F':/^(?:b|b\.cu|back|bottom)$/i.test(raw)?'B':'';}
  const uuid='bom:'+path+':'+index,metadata={uuid,properties:p,position};
  // Supply the same record shape as DesignDiff.collect, plus assembly annotations.
  return {kind:'footprint',path,uuid,key:uuid,scope:uuid,label:reference,reference,properties:p,metadata,position,side,populated:!dnp,excludeFromBom:excluded,form:null};
 }
 function table(columns,rows,path){
  if(!Array.isArray(columns)||!columns.length||columns.length>256||columns.some(v=>typeof v!=='string')||new Set(columns.map(v=>v.trim().toLowerCase())).size!==columns.length)throw Error('Missing or duplicate BoM column names.');
  if(!Array.isArray(rows)||rows.length>MAX_PARTS)throw Error('Too many BoM rows.');
  const aliases=['reference','references','refs','ref','designator','designators'],ri=columns.findIndex(c=>aliases.includes(c.trim().toLowerCase()));
  if(ri<0)throw Error('A Reference or Designator column is required; quantity alone cannot identify components.');
  const qi=columns.findIndex(c=>['qty','quantity','quantity per board'].includes(c.trim().toLowerCase())),objects=[],seen=new Set();
  for(const row of rows){if(!Array.isArray(row)||row.length!==columns.length)throw Error('BoM rows have inconsistent column counts.');const refs=references(row[ri]);
   if(qi>=0&&text(row[qi]).trim()!==''&&(!/^\d+$/.test(text(row[qi]).trim())||Number(row[qi])!==refs.length))throw Error('Quantity does not match the listed references: '+row[ri]);
   const p=Object.create(null),canonical=['Value','Footprint','Assembly','Population','Populated','DNP','InBOM','Excluded from BOM','ExcludeFromBom','Side','Layer'];columns.forEach((c,i)=>{if(i!==ri&&i!==qi){const name=c.trim();p[canonical.find(k=>k.toLowerCase()===name.toLowerCase())||name]=text(row[i]);}});
   for(const ref of refs){if(seen.has(ref))throw Error('Reference appears in more than one BoM row: '+ref);seen.add(ref);objects.push(record(ref,{...p},path,objects.length));if(objects.length>MAX_PARTS)throw Error('Too many components.');}
  }return objects;
 }
 function csv(source,path){
  const first=source.split(/\r?\n/,1)[0];let quoted=false,counts={',':0,';':0,'\t':0};for(let i=0;i<first.length;i++){if(first[i]==='"'){if(quoted&&first[i+1]==='"')i++;else quoted=!quoted;}else if(!quoted&&own(counts,first[i]))counts[first[i]]++;}
  const separator=Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0],rows=[];let row=[],cell='',inQuote=false,ended=false;
  const push=()=>{row.push(cell);cell='';ended=false;if(row.length>256)throw Error('Too many BoM columns.');};
  for(let i=0;i<source.length;i++){const c=source[i];if(c==='"'){if(inQuote&&source[i+1]==='"'){cell+='"';i++;}else if(inQuote){inQuote=false;ended=true;}else if(!cell&&!ended)inQuote=true;else throw Error('Invalid CSV quoting.');}
   else if(!inQuote&&c===separator)push();else if(!inQuote&&(c==='\r'||c==='\n')){if(c==='\r'&&source[i+1]==='\n')i++;push();if(row.some(x=>x.trim()))rows.push(row);row=[];if(rows.length>MAX_PARTS+1)throw Error('Too many BoM rows.');}
   else {if(ended&&!inQuote)throw Error('Unexpected text after a quoted CSV cell.');cell+=c;if(cell.length>MAX_TEXT)throw Error('CSV field is too long.');}}
  if(inQuote)throw Error('Incomplete quoted CSV field.');if(cell||row.length){push();rows.push(row);}if(!rows.length)throw Error('The BoM file is empty.');
  while(rows[0].length>1&&rows.every(r=>r.at(-1)===''))for(const r of rows)r.pop();
  return table(rows.shift().map(x=>x.replace(/^\uFEFF/,'').trim()),rows,path);
 }
 // LZ-string base64 wire format. Bounded decoder only, no dynamic script loading.
 // Format defined by https://github.com/pieroxy/lz-string (MIT).
 function decompress(input){
  if(typeof input!=='string'||input.length>MAX_BYTES||!/^[A-Za-z0-9+/]*={0,3}$/.test(input))throw Error('Invalid compressed iBOM data.');
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',dictionary=[null,null,null];let pos=0,mask=32,current=alphabet.indexOf(input[0]),bitsRead=0,dictSize=4,enlarge=4,numBits=3,total=0;
  const bits=n=>{let v=0;for(let i=0;i<n;i++){if(pos>=input.length||++bitsRead>MAX_BYTES*8)throw Error('Truncated compressed iBOM.');if(current&mask)v|=2**i;mask>>=1;if(!mask){mask=32;current=alphabet.indexOf(input[++pos]);}}return v;};
  let code=bits(2),c;if(code===0)c=String.fromCharCode(bits(8));else if(code===1)c=String.fromCharCode(bits(16));else if(code===2)return '';else throw Error('Invalid compressed iBOM.');dictionary[3]=c;let w=c;const out=[c];total=c.length;
  while(true){code=bits(numBits);if(code===0||code===1){dictionary[dictSize++]=String.fromCharCode(bits(code===0?8:16));code=dictSize-1;enlarge--;}else if(code===2)return out.join('');
   if(!enlarge){enlarge=2**numBits;numBits++;}const entry=dictionary[code]??(code===dictSize?w+w[0]:null);if(entry===null)throw Error('Invalid compressed iBOM dictionary.');total+=entry.length;if(total>MAX_BYTES||dictSize>1000000||numBits>21)throw Error('Expanded iBOM exceeds import limits.');out.push(entry);dictionary[dictSize++]=w+entry[0];enlarge--;w=entry;if(!enlarge){enlarge=2**numBits;numBits++;}
  }
 }
 function literal(source,start){
  while(/\s/.test(source[start]||'')&&start<source.length)start++;const begin=start,first=source[start];if(first!=='{'&&first!=='['&&first!=='"')throw Error('iBOM assignment must contain literal JSON.');
  let depth=0,string=false,escape=false;for(let i=start;i<source.length;i++){const c=source[i];if(string){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"'){string=false;if(first==='"')return {value:JSON.parse(source.slice(begin,i+1)),end:i+1};}}
   else if(c==='"')string=true;else if(c==='{'||c==='['){if(++depth>128)throw Error('JSON nesting exceeds import limits.');}else if(c==='}'||c===']'){if(--depth===0)return {value:JSON.parse(source.slice(begin,i+1)),end:i+1};}}
  throw Error('Incomplete literal iBOM data.');
 }
 function html(source){
  const scripts=[...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)];if(scripts.length>256)throw Error('Too many scripts in iBOM file.');let pcb=null,config={};
  for(const m of scripts){const script=m[1];for(const name of ['pcbdata','config']){const re=new RegExp('(?:^|[;\\n\\r])\\s*(?:var|let|const)\\s+'+name+'\\s*=\\s*','g');let a;while((a=re.exec(script))){if(name==='pcbdata'&&pcb)throw Error('Multiple iBOM payload assignments.');let value,end;
    const rest=script.slice(re.lastIndex),compressed=rest.match(/^JSON\.parse\(LZString\.decompressFromBase64\(/);if(name==='pcbdata'&&compressed){const l=literal(script,re.lastIndex+compressed[0].length);if(typeof l.value!=='string'||!/^\s*\)\s*\)/.test(script.slice(l.end)))throw Error('Unsupported iBOM compressed expression.');const suffix=script.slice(l.end).match(/^\s*\)\s*\)/)[0];value=JSON.parse(decompress(l.value));end=l.end+suffix.length;}
    else {const l=literal(script,re.lastIndex);value=l.value;end=l.end;}
    const suffix=script.slice(end).replace(/^(?:\s|\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/,m=>m.includes('\n')?'\n':' ');if(!/^\s*(?:;|$)/.test(suffix)&&!/^\s*\n\s*(?:var|let|const)\s/.test(suffix))throw Error('Unsupported executable iBOM assignment.');if(name==='pcbdata')pcb=value;else config=value;
   }}}
  if(!pcb)throw Error('No supported data-only iBOM payload found. Export iBOM JSON or standard BoM CSV.');return {pcbdata:pcb,config};
 }
 function ibom(value,path,config={}){
  if(!obj(value)||!Array.isArray(value.footprints)||value.footprints.length>MAX_PARTS||!obj(value.bom))throw Error('Invalid iBOM footprint/BoM schema.');
  const fields=Array.isArray(config.fields)?config.fields:[],warnings=[],objects=[],primitives=[],components=[],seen=new Set(),membership=new Map(),skipped=new Set(value.bom.skipped||[]);
  if(fields.length>256||fields.some(f=>typeof f!=='string')||new Set(fields).size!==fields.length)throw Error('Invalid iBOM field headers.');
  for(const group of value.bom.both||[]){if(!Array.isArray(group))throw Error('Invalid iBOM group.');for(const pair of group){if(!Array.isArray(pair)||pair.length!==2||typeof pair[0]!=='string'||!Number.isInteger(pair[1])||pair[1]<0||pair[1]>=value.footprints.length||membership.has(pair[1]))throw Error('Invalid or duplicate iBOM footprint index.');membership.set(pair[1],pair[0]);}}
  const add=p=>{if(primitives.length<MAX_PRIMITIVES)primitives.push(p);else throw Error('Too much iBOM drawing geometry.');};
  for(const edge of Array.isArray(value.edges)?value.edges:[]){const a=xy(edge?.start),b=xy(edge?.end);if(edge?.type==='segment'&&a&&b)add({type:'line',points:[a,b],width:finite(edge.width)?Math.max(.05,edge.width):.1,color:'#8796a5',layer:'Edge.Cuts'});}
  for(const [i,f]of value.footprints.entries()){
   if(obj(f)&&typeof f.ref==='string'&&!refRE.test(f.ref)&&!membership.has(i)){warnings.push('Unassigned excluded footprint '+i+' ('+text(f.ref)+') has no usable component reference and was omitted.');continue;}
   if(!obj(f)||typeof f.ref!=='string'||!refRE.test(f.ref)||seen.has(f.ref)||membership.has(i)&&membership.get(i)!==f.ref)throw Error('Ambiguous iBOM component identity at footprint '+i+': '+text(f?.ref));seen.add(f.ref);
   const values=value.bom.fields?.[i],p=Object.create(null);if(Array.isArray(values)){if(values.length>256)throw Error('Too many iBOM fields.');values.forEach((v,j)=>p[fields[j]||'Field '+(j+1)]=text(v));if(!fields.length&&values.length)warnings.push('iBOM JSON has no config.fields: positional fields are retained without guessing Value or Footprint.');}
   const position=xy(f.bbox?.pos)||xy(f.center),side=f.layer==='F'?'F':f.layer==='B'?'B':'';
   // iBOM skipped conflates DNP, blacklist and variant filters: retain exclusion, never infer DNP.
   const r=record(f.ref,p,path,i,{excluded:skipped.has(i)||!membership.has(i)},position,side);objects.push(r);
   const b=f.bbox,rel=xy(b?.relpos),size=xy(b?.size);if(position&&rel&&size&&size.x>=0&&size.y>=0&&finite(b.angle??0)){const angle=-(b.angle||0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);const points=[[rel.x,rel.y],[rel.x+size.x,rel.y],[rel.x+size.x,rel.y+size.y],[rel.x,rel.y+size.y]].map(([x,y])=>({x:position.x+c*x-s*y,y:position.y+s*x+c*y}));const primitive={type:'polygon',points,width:.12,stroke:true,color:side==='B'?'#ec7985':'#6abdad',layer:side==='B'?'B.Fab':'F.Fab',reference:f.ref,context:r};add(primitive);components.push({reference:f.ref,side,position,points,object:r});}
  }
  const bbox=value.edges_bbox,bounds=obj(bbox)&&['minx','miny','maxx','maxy'].every(k=>finite(bbox[k]))?{minX:bbox.minx,minY:bbox.miny,maxX:bbox.maxx,maxY:bbox.maxy}:null;
  return {objects,warnings:[...new Set(warnings),'iBOM geometry is a saved assembly outline and footprint boxes; copper, pads and exact curved edges are not reconstructed.'],assembly:{primitives,components,bounds},variant:text(value.metadata?.variant||'')};
 }
 function parse(source,path='import.csv',options={}){
  if(typeof source!=='string'||new TextEncoder().encode(source).length>MAX_BYTES)throw Error('BoM exceeds the 16 MiB import limit.');let format,objects,warnings=[],assembly=null,variant='',provenance={path,source:'Imported file'};
  if(/\.html?$/i.test(path)||/^\s*<!doctype|^\s*<html/i.test(source)){const value=html(source);const result=ibom(value.pcbdata,path,value.config);({objects,warnings,assembly,variant}=result);format='InteractiveHtmlBom';}
  else if(/\.json$/i.test(path)||/^\s*[\[{]/.test(source)){const value=JSON.parse(source);if(obj(value)&&obj(value.pcbdata)||obj(value)&&Array.isArray(value.footprints)&&obj(value.bom)){const result=ibom(value.pcbdata||value,path,value.config||options.config||{});({objects,warnings,assembly,variant}=result);format='InteractiveHtmlBom';}
   else if(obj(value)&&Array.isArray(value.columns)&&Array.isArray(value.rows)&&own(value,'variant')&&own(value,'template')&&own(value,'project')){objects=table(value.columns,value.rows,path);variant=text(value.variant);format='WayriCAD BoM Studio export';provenance={path,source:format,project:text(value.project),status:text(value.status||''),generated:text(value.generated||'')};warnings.push('This is one exported variant, not a complete BoM Studio workspace. Pricing/stock are saved observations.');}
   else if(obj(value)&&value.schema===1&&obj(value.variants)&&obj(value.base))throw Error('BoM Studio workspace sidecars contain overrides, not source components. Export a variant as JSON or CSV.');
   else throw Error('Unsupported BoM JSON. Use iBOM pcbdata/config or a BoM Studio JSON export.');
  }else {objects=csv(source,path);format='BoM CSV / TSV';}
  if(!objects.length)warnings.push('This exported BoM contains no components.');return {format,model:{kind:'pcb',objects},warnings,provenance,assembly,variant};
 }
 const api={parse,references,candidate:path=>/(?:bom|ibom)[^/]*\.(?:csv|tsv|json|html?)$/i.test(path),limits:{bytes:MAX_BYTES,components:MAX_PARTS,primitives:MAX_PRIMITIVES}};
 root.KiCadBomImport=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
