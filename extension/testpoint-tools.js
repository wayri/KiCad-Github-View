/* Saved testpoint evidence, scoped to source objects. Does not infer cross-sheet nets. */
(function(root){'use strict';
 const LIMITS=Object.freeze({objects:200000,members:300000,rows:50000,treeNodes:20000});
 const value=v=>v&&typeof v==='object'&&!Array.isArray(v)?v.quoted:v;
 const kind=n=>Array.isArray(n)?String(value(n[0])):'';
 const child=(n,k)=>Array.isArray(n)?n.find(v=>kind(v)===k):null;
 const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)?{x:p.x,y:p.y}:null;
 const text=v=>String(v??'').slice(0,4096);
 function classify(object){
  const props=object.properties||{};
  for(const [name,v] of Object.entries(props))if(/^(?:test[ _-]?point|is[ _-]?test[ _-]?point)$/i.test(name)&&/^(?:yes|true|1|test[ _-]?point)$/i.test(String(v).trim()))return {classification:'explicit',provenance:`Saved property ${name}=${v}`};
  const ref=object.reference||props.Reference||'';
  if(/^TP\d+[A-Za-z]*$/i.test(ref))return {classification:'inferred',provenance:'Reference matches TP followed by a number'};
  for(const key of ['Library ID','lib_id','Footprint','Value'])if(/(?:^|[^a-z])test[ _-]?point(?:[^a-z]|$)/i.test(props[key]||''))return {classification:'inferred',provenance:`Saved ${key} identifies a testpoint`};
  return null;
 }
 function pinNumbers(object,cache){
  const tree=object.saved?.library?.tree||object.saved?.tree;if(tree&&cache.has(tree))return cache.get(tree);
  const stack=tree?[tree]:[],result=new Set();let count=0;
  while(stack.length){if(++count>LIMITS.treeNodes)break;const n=stack.pop();if(!Array.isArray(n))continue;if(kind(n)==='pin'){const number=value(child(n,'number')?.[1]);if(number!==undefined)result.add(text(number));}for(const v of n)if(Array.isArray(v))stack.push(v);}
  const numbers=[...result];if(tree)cache.set(tree,numbers);return numbers;
 }
 function summarize(model){
  if(!model||!Array.isArray(model.objects))throw Error('Testpoint summary requires a saved design model.');
  if(model.objects.length>LIMITS.objects)throw Error('Testpoint object limit exceeded.');
  const warnings=[],rows=[],objects=model.objects,pads=new Map(),connections=new Map(),ownerConnections=new Map(),pins=new Map(),noConnect=new Set(),libraryPins=new Map();
  const key=(path,uuid,number)=>JSON.stringify([path,uuid,String(number)]);
  for(const o of objects){if(o.kind==='pad'&&o.parentId){if(!pads.has(o.parentId))pads.set(o.parentId,[]);pads.get(o.parentId).push(o);}if(o.kind==='no_connect'&&point(o.position))noConnect.add(JSON.stringify([o.path,o.position.x,o.position.y]));}
  let count=0;
  for(const net of model.nets||[])for(const member of net.members||[]){if(++count>LIMITS.members)throw Error('Testpoint net member limit exceeded.');if(!member.uuid||!['pad','pin'].includes(member.kind))continue;const k=key(net.path,member.uuid,member.kind==='pad'?member.pad:member.pin);if(!connections.has(k))connections.set(k,[]);connections.get(k).push({net,member});if(member.kind==='pin'){const owner=JSON.stringify([net.path,member.uuid]);if(!ownerConnections.has(owner))ownerConnections.set(owner,[]);ownerConnections.get(owner).push({net,member});}}
  const addPrimitives=(path,list)=>{for(const p of list||[]){if(++count>LIMITS.members)throw Error('Testpoint primitive limit exceeded.');if(p.kind!=='pin'||p.pinNumber==null||!(p.ownerUuid||p.uuid))continue;const k=JSON.stringify([path,p.ownerUuid||p.uuid]);if(!pins.has(k))pins.set(k,new Map());pins.get(k).set(String(p.pinNumber),point(p.connectPoint));}};
  if(model.designs instanceof Map)for(const [path,design]of model.designs)addPrimitives(path,design.primitives);
  else if(model.designs&&typeof model.designs==='object')for(const [path,design]of Object.entries(model.designs))addPrimitives(path,design.primitives);
  if(Array.isArray(model.primitives))for(const p of model.primitives)addPrimitives(p.path||p.sourceFile||model.path,[p]);
  function emit(object,classification,pad,number,position){
   const uuid=pad?.uuid||object.uuid,links=connections.get(key(object.path,uuid,number))||[],saved=pad?child(pad.saved?.tree,'net'):null;
   let states=links.map(({net})=>({netId:net.id,netCode:text(net.code),netName:text(net.name),status:net.kind==='schematic'?'source connectivity':'saved net',netProvenance:net.kind==='schematic'?'Per-file schematic source connectivity; cross-sheet and hidden power resolution are limited':'Saved PCB net code'}));
   if(!states.length){const code=saved?value(saved[1]):undefined,name=saved?value(saved[2]):undefined;
    if(code!==undefined&&String(code)!=='0')states=[{netId:`${object.path}/net:${code}`,netCode:text(code),netName:typeof name==='string'?name:'',status:typeof name==='string'&&name?'saved net':'unresolved name',netProvenance:'Saved pad net declaration'}];
    else states=[{netId:'',netCode:code===undefined?'':text(code),netName:'',status:pad?'no net':position&&noConnect.has(JSON.stringify([object.path,position.x,position.y]))?'no connect':'unresolved',netProvenance:pad?'No saved nonzero pad net':'No resolved per-file pin network'}];
   }
   for(const state of states){if(rows.length>=LIMITS.rows)throw Error('Testpoint row limit exceeded.');rows.push({id:JSON.stringify([object.id,pad?.id||number,state.netId]),objectId:object.id,padObjectId:pad?.id||'',path:object.path,sourceFile:object.path,uuid:object.uuid,padUuid:pad?.uuid||'',reference:text(object.reference||object.properties?.Reference),value:text(object.properties?.Value),footprint:text(object.properties?.Footprint||object.properties?.['Library ID']),kind:object.kind,padNumber:text(number),position:point(position),footprintPosition:point(object.position),...classification,...state});}
  }
  for(const object of objects){if(!['footprint','symbol'].includes(object.kind))continue;const classification=classify(object);if(!classification)continue;
   if(object.kind==='footprint'){const list=pads.get(object.id)||[];if(list.length)for(const pad of list)emit(object,classification,pad,pad.properties?.Number??'',pad.position);else emit(object,classification,null,'',object.position);}
   else {const owner=JSON.stringify([object.path,object.uuid]),numbers=new Map(pins.get(owner)||[]);for(const n of pinNumbers(object,libraryPins))if(!numbers.has(n))numbers.set(n,null);for(const {member}of ownerConnections.get(owner)||[])if(!numbers.has(String(member.pin)))numbers.set(String(member.pin),point(member.position));if(numbers.size)for(const [n,p]of numbers)emit(object,classification,null,n,p);else emit(object,classification,null,'',null);}
  }
  if(rows.some(r=>r.kind==='symbol'))warnings.push('Schematic connections are per-file source evidence. Cross-sheet hierarchy, implicit hidden power pins and bus expansion are not resolved; unresolved pins are retained.');
  rows.sort((a,b)=>a.path.localeCompare(b.path)||a.reference.localeCompare(b.reference,undefined,{numeric:true})||a.padNumber.localeCompare(b.padNumber,undefined,{numeric:true})||a.id.localeCompare(b.id));
  return {rows,warnings};
 }
 const columns=[['reference','Testpoint'],['padNumber','Pad / pin'],['netName','Net'],['status','Connectivity'],['value','Value'],['footprint','Footprint / library'],['sourceFile','Source file'],['classification','Detection'],['provenance','Detection evidence'],['netProvenance','Net evidence'],['uuid','Object UUID'],['padUuid','Pad UUID'],['netId','Net ID'],['netCode','Net code']];
 function filterRows(rows,query='',filters={}){
  const fields={ref:'reference',net:'netName',pad:'padNumber',file:'path',value:'value',status:'status'};
  const terms=text(query).match(/(?:[^\s"]+|"[^"]*")+/g)||[];
  return rows.filter(row=>{
   const connected=!!row.netId&&row.status!=='unresolved name';
   if(filters.connectivity==='connected'&&!connected||filters.connectivity==='unresolved'&&connected||filters.source&&row.kind!==filters.source||filters.detection&&row.classification!==filters.detection)return false;
   const all=[row.reference,row.padNumber,row.netName,row.path,row.value,row.footprint,row.status].join(' ').toLowerCase();
   return terms.every(term=>{const match=term.match(/^(ref|net|pad|file|value|status):(.*)$/i),needle=(match?match[2]:term).replace(/^"|"$/g,'').toLowerCase();return (match?text(row[fields[match[1].toLowerCase()]]).toLowerCase():all).includes(needle);});
  });
 }
 function connectionIndex(model){
  if(!model||!Array.isArray(model.objects)||model.objects.length>LIMITS.objects)throw Error('Testpoint connection index requires a bounded saved design model.');
  const byId=new Map(model.objects.map(o=>[o.id,o])),byUuid=new Map(),index=new Map();
  for(const o of model.objects){if(!o.uuid)continue;const k=JSON.stringify([o.path,o.uuid]);if(!byUuid.has(k))byUuid.set(k,[]);byUuid.get(k).push(o);}
  let count=0;
  for(const net of model.nets||[]){const members=[],seen=new Set();for(const member of net.members||[]){if(++count>LIMITS.members)throw Error('Testpoint net member limit exceeded.');if(!['pad','pin'].includes(member.kind)||!member.uuid)continue;
    const candidates=(byUuid.get(JSON.stringify([net.path,member.uuid]))||[]).filter(o=>member.kind==='pad'?o.kind==='pad':o.kind==='symbol');
    // Ambiguous UUIDs never become a guessed navigation target.
    if(candidates.length!==1)continue;const saved=candidates[0],owner=member.kind==='pad'?byId.get(saved.parentId):saved;if(!owner||owner.path!==net.path)continue;
    const number=text(member.kind==='pad'?member.pad:member.pin),id=JSON.stringify([saved.id,number]);if(seen.has(id))continue;seen.add(id);
    members.push({id,objectId:owner.id,padObjectId:member.kind==='pad'?saved.id:'',path:net.path,sourceFile:net.path,uuid:owner.uuid,padUuid:member.kind==='pad'?saved.uuid:'',reference:text(owner.reference||owner.properties?.Reference),padNumber:number,position:point(member.kind==='pad'?saved.position:member.position),netId:net.id,netName:text(net.name)});
   }members.sort((a,b)=>a.reference.localeCompare(b.reference,undefined,{numeric:true})||a.padNumber.localeCompare(b.padNumber,undefined,{numeric:true}));index.set(JSON.stringify([net.path,net.id]),members);
  }
  return index;
 }
 function connectedMembers(index,row){return row.netId?(index.get(JSON.stringify([row.path,row.netId]))||[]).filter(member=>member.objectId!==row.objectId||member.padNumber!==row.padNumber):[];}
 function csv(rows){const cell=v=>{let s=text(v);if(/^[\s]*[=+@-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};return columns.map(c=>cell(c[1])).concat(['"X (mm)"','"Y (mm)"']).join(',')+'\r\n'+rows.map(r=>columns.map(c=>cell(r[c[0]])).concat([cell(r.position?.x),cell(r.position?.y)]).join(',')).join('\r\n');}
 function open(options){
  const doc=root.document;if(!doc)throw Error('Testpoint table requires a document.');
  const result=summarize(options.model),connections=connectionIndex(options.model),dialog=doc.createElement('dialog');dialog.className='testpoint-summary';dialog.setAttribute('aria-label','Testpoint summary');dialog.style.cssText='box-sizing:border-box;width:min(1100px,94vw);max-height:90vh;overflow:auto;background:var(--bg,#171d27);color:var(--fg,#e8edf5);border:1px solid #738095;border-radius:12px;padding:16px';
  const make=(tag,label)=>{const el=doc.createElement(tag);if(tag==='button')el.style.cssText='min-height:44px;padding:8px 12px';if(label!==undefined)el.textContent=label;return el;};
  const heading=make('h2','Testpoints and connected nets'),close=make('button','Close'),search=make('input'),exportButton=make('button','Export CSV'),status=make('p'),notes=make('p',result.warnings.join(' ')),wrap=make('div'),table=make('table'),head=make('thead'),body=make('tbody');
  status.setAttribute('role','status');const controls=make('div');controls.style.cssText='display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0';
  const selector=(label,values)=>{const el=make('select');el.setAttribute('aria-label',label);el.style.cssText='min-height:44px;max-width:100%;padding:8px';for(const [value,label]of values){const option=make('option',label);option.value=value;el.append(option);}return el;};
  const connectivity=selector('Connectivity filter',[['','All connectivity'],['connected','With resolved net'],['unresolved','Unconnected / unresolved']]),source=selector('Source filter',[['','PCB and schematic'],['footprint','PCB only'],['symbol','Schematic only']]),detection=selector('Detection filter',[['','All detection'],['explicit','Explicit testpoints'],['inferred','Inferred testpoints']]),reset=make('button','Clear filters'),hint=make('p','Combine search terms, for example ref:TP net:GND or pad:1 file:power. Quote phrases such as net:"POWER GOOD".');
  hint.style.cssText='font-size:12px;margin:4px 0';search.type='search';search.placeholder='Search reference, net, pad or file';search.setAttribute('aria-label',search.placeholder);search.style.cssText='min-height:44px;min-width:180px;flex:1;padding:8px';controls.append(search,connectivity,source,detection,reset,exportButton);wrap.className='testpoint-table-wrap';wrap.style.cssText='overflow:auto;max-height:58vh';table.className='testpoint-table';table.style.cssText='border-collapse:collapse;width:100%;font:inherit';
  const headings=['Testpoint','Pad / pin','Net','Connectivity','Source file','Location (mm)','Detection','Actions'],tr=make('tr');for(const label of headings){const th=make('th',label);th.scope='col';th.style.cssText='text-align:left;padding:8px;border-bottom:1px solid #738095';tr.append(th);}head.append(tr);table.append(head,body);wrap.append(table);dialog.append(heading,close,controls,hint,status,notes,wrap);doc.body.append(dialog);
  let visible=result.rows;
  const draw=()=>{visible=filterRows(result.rows,search.value,{connectivity:connectivity.value,source:source.value,detection:detection.value});body.replaceChildren();status.textContent=`${visible.length} of ${result.rows.length} pad / pin rows. Saved design positions and nets; classification evidence is available on each row.`;for(const row of visible.slice(0,1000)){const line=make('tr');for(const [column,v] of [row.reference,row.padNumber,row.netName||'—',row.status,row.path,row.position?`${row.position.x.toFixed(3)}, ${row.position.y.toFixed(3)}`:'Unavailable',`${row.classification}: ${row.provenance}`].entries()){const td=make('td',v);td.setAttribute('data-label',headings[column]);td.style.cssText='padding:8px;border-bottom:1px solid #73809555';line.append(td);}const td=make('td');td.setAttribute('data-label','Actions');if(options.onLocate){const button=make('button','Locate');button.addEventListener('click',()=>options.onLocate(row));td.append(button);}if(options.onSchematic){const button=make('button','Schematic');button.addEventListener('click',()=>options.onSchematic(row));td.append(button);}if(row.netId){const details=make('details'),summary=make('summary','Connected pads / pins'),members=make('div');summary.style.cssText='cursor:pointer;min-height:44px;padding:8px 0';details.append(summary,members);let populated=false;details.addEventListener('toggle',()=>{if(!details.open||populated)return;populated=true;const connected=connectedMembers(connections,row);members.append(make('p',`${connected.length} other saved pads / pins on this source-file net.`));for(const target of connected.slice(0,200)){const label=`${target.reference||'Unnamed component'} · ${target.padNumber||'unnumbered'}`;if(options.onLocate){const button=make('button',label);button.setAttribute('aria-label',`Locate ${label} in ${target.path}`);button.addEventListener('click',()=>options.onLocate(target));members.append(button);}else members.append(make('p',label));}if(connected.length>200)members.append(make('p','First 200 connections shown. Use net search to inspect further testpoints.'));});td.append(details);}line.append(td);body.append(line);}if(visible.length>1000)status.textContent+=' First 1,000 rows displayed; narrow the search or export all matching rows.';if(!visible.length){const line=make('tr'),cell=make('td',result.rows.length?'No testpoints match these filters. Clear filters to see all rows.':'No saved testpoints found in this project.');cell.colSpan=8;cell.className='testpoint-empty';cell.style.cssText='padding:20px';line.append(cell);body.append(line);}};
  close.addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>dialog.remove());search.addEventListener('input',draw);for(const el of [connectivity,source,detection])el.addEventListener('change',draw);reset.addEventListener('click',()=>{search.value=connectivity.value=source.value=detection.value='';draw();});exportButton.addEventListener('click',()=>{const content=csv(visible);if(options.onExport)options.onExport(content,visible);else{const url=root.URL.createObjectURL(new root.Blob([content],{type:'text/csv;charset=utf-8'})),link=make('a');link.href=url;link.download='testpoint-summary.csv';link.click();root.setTimeout(()=>root.URL.revokeObjectURL(url),1000);}});draw();dialog.showModal();return {dialog,rows:result.rows,close:()=>dialog.close(),refresh:draw};
 }
 const api={summarize,classify,csv,filterRows,connectionIndex,connectedMembers,open,LIMITS};root.KiCadTestpointTools=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis==='object'?globalThis:this);
