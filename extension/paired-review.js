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
  if(!value||typeof value!=='object'||!['part','net'].includes(value.kind))return false;
  const bounded=(v,n)=>typeof v==='string'&&v.length>0&&v.length<=n&&!/[\x00-\x1f\x7f]/.test(v);
  if(!bounded(value.path,1000)||!/^.+\.kicad_(?:sch|pcb)$/i.test(value.path)||value.path.startsWith('/')||value.path.split('/').some(p=>!p||p==='.'||p==='..'||/[\\:]/.test(p)))return false;
  const keys=value.kind==='part'?['kind','reference','path','uuid','symbolUuid']:['kind','netName','path'];if(Object.keys(value).some(k=>!keys.includes(k)))return false;
  if(value.kind==='net')return bounded(value.netName,500);
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
 root.KiCadPairedReview={validSelection,relatedPart,symbolUuid};
 if(typeof module==='object'&&module.exports)module.exports=root.KiCadPairedReview;
})(globalThis);
