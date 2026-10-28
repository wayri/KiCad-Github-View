/* Source-bound cross-probing; no coordinate mapping between PCB and schematic. */
((root)=>{
 'use strict';
 const text=v=>v&&typeof v==='object'?v.quoted:v;
 function symbolUuid(object){
  const form=object?.saved?.tree;if(!Array.isArray(form))return null;
  const path=form.find(v=>Array.isArray(v)&&v[0]==='path');
  const value=text(path?.[1]);return typeof value==='string'&&value.length<=2000?value.split('/').filter(Boolean).at(-1)||null:null;
 }
 function validSelection(value){
  if(value?.kind==='group'){
   if(Object.keys(value).some(k=>!['kind','items'].includes(k))||!Array.isArray(value.items)||value.items.length>200)return false;
   for(const item of value.items)if(!item||item.kind==='group'||!validSelection(item))return false;
   return true;
  }
  if(!value||typeof value!=='object'||!['part','net','pin'].includes(value.kind))return false;
  const bounded=(v,n)=>typeof v==='string'&&v.length>0&&v.length<=n&&!/[\x00-\x1f\x7f]/.test(v);
  if(!bounded(value.path,1000)||!/^.+\.kicad_(?:sch|pcb)$/i.test(value.path)||value.path.startsWith('/')||value.path.split('/').some(p=>!p||p==='.'||p==='..'||/[\\:]/.test(p)))return false;
  const keys=value.kind==='pin'?['kind','reference','path','uuid','ownerUuid','symbolUuid','pinNumber']:value.kind==='part'?['kind','reference','path','uuid','symbolUuid']:['kind','netName','qualifiedNetName','path'];if(Object.keys(value).some(k=>!keys.includes(k)))return false;
  if(value.kind==='net')return bounded(value.netName,500)&&(value.qualifiedNetName===undefined||bounded(value.qualifiedNetName,500));
  if(value.kind==='pin'&&(!bounded(value.pinNumber,200)||(value.ownerUuid!==undefined&&!bounded(value.ownerUuid,200))))return false;
  return bounded(value.reference,200)&&(value.uuid===undefined||bounded(value.uuid,200))&&(value.symbolUuid===undefined||bounded(value.symbolUuid,200));
 }
 function relatedPart(objects,selection){
  if(!validSelection(selection)||selection.kind!=='part')return {error:'Invalid cross-highlight selection.'};
  const board=/\.kicad_sch$/i.test(selection.path),kind=board?'footprint':'symbol';
  const parts=objects.filter(o=>o.kind===kind);
  const sourceId=board?selection.uuid:selection.symbolUuid;
  const linked=sourceId?parts.filter(o=>(board?symbolUuid(o):o.uuid)===sourceId):[];
  if(linked.length===1)return {object:linked[0]};
  if(linked.length>1)return {error:'Multiple saved instances match this source identity. Select the target sheet explicitly.'};
  const refs=parts.filter(o=>o.reference===selection.reference);
  if(refs.length!==1)return {error:refs.length?'Reference is ambiguous across units or sheets. Select the target explicitly.':'No matching part in this drawing.'};
  // A saved link that disagrees is evidence against reference-only matching.
  if(sourceId&&(board?symbolUuid(refs[0]):selection.symbolUuid))return {error:'Saved schematic identity does not match this part; update the design association.'};
  return {object:refs[0]};
 }
 // Pin numbers establish electrical terminals only after resolving a unique saved parent.
 function relatedPin(objects,designs,selection){
  if(!validSelection(selection)||selection.kind!=='pin')return {error:'Invalid cross-highlight pin.'};
  const fromSchematic=/\.kicad_sch$/i.test(selection.path);
  const match=relatedPart(objects,{kind:'part',reference:selection.reference,path:selection.path,
   ...(fromSchematic&&(selection.ownerUuid||selection.uuid)?{uuid:selection.ownerUuid||selection.uuid}:{}),
   ...(!fromSchematic&&selection.symbolUuid?{symbolUuid:selection.symbolUuid}:{})});
  if(!match.object)return match;
  const object=match.object;
  const design=designs instanceof Map?designs.get(object.path):Array.isArray(designs)?designs.find(d=>d.path===object.path):designs?.[object.path];
  const primitives=(design?.primitives||[]).filter(p=>!p.hidden&&!p.hole&&
   (fromSchematic?p.kind==='pad':p.kind==='pin')&&
   (fromSchematic?p.ownerUuid===object.uuid:(p.ownerUuid||p.uuid)===object.uuid)&&
   String(p.pinNumber??p.name??'')===selection.pinNumber);
  if(!primitives.length)return {error:'The corresponding saved pin/pad number is unavailable in the paired drawing.'};
  return {object,primitives,pinNumber:selection.pinNumber};
 }
 function sheetTarget(object){
  const name=object.properties?.Sheetfile??object.properties?.['Sheet file'];
  if(typeof name!=='string'||!name||name.startsWith('/')||/[\\:\x00-\x1f]/.test(name))return null;
  const parts=object.path.split('/');parts.pop();
  for(const part of name.split('/')){if(part==='..'){if(!parts.length)return null;parts.pop();}else if(part&&part!=='.')parts.push(part);}
  return parts.join('/');
 }
 // Only a single saved hierarchy instance can provide a safe local-net prefix.
 function sheetPrefix(path,objects){
  const seen=new Set();let current=path,prefix=[];
  while(!seen.has(current)&&seen.size<32){
   seen.add(current);const parents=objects.filter(o=>o.kind==='sheet'&&sheetTarget(o)===current);
   if(!parents.length)return '/'+(prefix.length?prefix.join('/')+'/':'');
   if(parents.length!==1)return null;
   const parent=parents[0],name=parent.properties?.Sheetname??parent.properties?.['Sheet name'];
   if(typeof name!=='string'||!name||/[\/\x00-\x1f]/.test(name))return null;
   prefix.unshift(name);current=parent.path;
  }
  return null;
 }
 function qualifiedNetName(net,objects){
  if(net?.kind==='pcb')return net.name;
  const prefix=sheetPrefix(net?.path||'',objects);
  return prefix&&typeof net?.name==='string'&&!net.name.startsWith('Unnamed network (')?prefix+net.name:null;
 }
 function relatedNet(nets,objects,selection,currentPath){
  if(!validSelection(selection)||selection.kind!=='net')return {error:'Invalid cross-highlight network.'};
  const board=/\.kicad_sch$/i.test(selection.path),targets=nets.filter(n=>board?n.kind==='pcb':n.kind==='schematic');
  const names=n=>[n.name,...(Array.isArray(n.names)?n.names:[])];
  const exact=targets.filter(n=>names(n).includes(selection.netName));
  const qualified=targets.filter(n=>board?names(n).includes(selection.qualifiedNetName):names(n).some(name=>{const prefix=sheetPrefix(n.path,objects);return prefix&&prefix+name===selection.netName;}));
  // Qualified saved hierarchy wins over same-named local labels elsewhere.
  let matches=board?[...new Set([...qualified,...exact])]:qualified.length?qualified:exact;
  if(!qualified.length&&currentPath){const local=matches.filter(n=>n.path===currentPath);if(local.length===1)matches=local;}
  return matches.length===1?{net:matches[0]}:{error:matches.length?'The related net is ambiguous across sheets or saved instances. Choose its sheet explicitly.':'No matching saved net in the paired drawing.'};
 }
 function relatedGroup(objects,nets,selection,currentFile){
  const result={objects:[],nets:[],errors:[]};
  if(!validSelection(selection)||selection.kind!=='group'){result.errors.push('Invalid cross-highlight group.');return result;}
  const matchedObjects=new Set(),matchedNets=new Set(),errors=new Set();
  for(const item of selection.items){
   // A group spans sheets: the currently displayed sheet must not resolve an
   // otherwise ambiguous local name on behalf of the whole selection.
   const match=item.kind==='part'?relatedPart(objects,item):item.kind==='pin'?{error:'Pin groups require drawing geometry; select one terminal explicitly.'}:relatedNet(nets,objects,item);
   if(match.object)matchedObjects.add(match.object);
   if(match.net)matchedNets.add(match.net);
   if(match.error)errors.add(match.error);
  }
  result.objects=[...matchedObjects];result.nets=[...matchedNets];result.errors=[...errors];
  return result;
 }
 root.KiCadPairedReview={validSelection,relatedPart,relatedPin,symbolUuid,sheetPrefix,qualifiedNetName,relatedNet,relatedGroup};
 if(typeof module==='object'&&module.exports)module.exports=root.KiCadPairedReview;
})(globalThis);
