/* Pure saved-part field grid shared by the BoM and assembly viewers. */
((root) => {
'use strict';
const MAX_PARTS = 100000;
const DEFAULTS = ['Reference','Value','Footprint','Qty','DNP','Exclude from BoM','Assembly'];
const MANAGEMENT = ['Manufacturer','MPN','Supplier','SKU','Notes','status','Unit price','Currency','Assembly'];
const text = v => String(v ?? '');
const normalize = key => text(key).trim().toLocaleLowerCase();
const aliases = new Map([
 ['reference','Reference'],['references','Reference'],['ref','Reference'],['designator','Reference'],
 ['value','Value'],['footprint','Footprint'],['library id','Footprint'],
 ['qty','Qty'],['quantity','Qty'],['dnp','DNP'],['dni','DNP'],
 ['exclude from bom','Exclude from BoM'],['excluded from bom','Exclude from BoM'],['assembly','Assembly']
]);
function check(parts) {
 if (!Array.isArray(parts) || parts.length > MAX_PARTS) throw Error('BoM field table part limit exceeded.');
}
function lookup(record, key) {
 if (!record || typeof record !== 'object') return undefined;
 if (Object.prototype.hasOwnProperty.call(record,key)) return record[key];
 const match = Object.keys(record).find(k => normalize(k) === normalize(key));
 return match === undefined ? undefined : record[match];
}
function value(part, key) {
 if (!part) return '';
 switch (aliases.get(normalize(key)) || key) {
  case 'Reference': return text(part.reference);
  case 'Value': return text(part.value ?? lookup(part.properties,'Value'));
  case 'Footprint': return text(part.footprint ?? lookup(part.properties,'Footprint') ?? lookup(part.properties,'Library ID'));
  case 'Qty': return '1';
  case 'DNP': return part.populated === false ? 'Yes' : 'No';
  case 'Exclude from BoM': return part.excluded ? 'Yes' : 'No';
  case 'Assembly': return text(lookup(part.management,'Assembly') ?? lookup(part.properties,'Assembly'));
  default: return text(lookup(part.management,key) ?? lookup(part.properties,key));
 }
}
function fields(parts) {
 check(parts);
 const result = DEFAULTS.map(key => ({key,label:key,show:true,groupBy:key==='Value'||key==='Footprint'}));
 const seen = new Set(DEFAULTS.map(normalize));
 const add = key => {
  key = text(key).trim(); if (!key) return;
  const canonical = aliases.get(normalize(key)) || key;
  if (seen.has(normalize(canonical))) return;
  seen.add(normalize(canonical)); result.push({key:canonical,label:canonical,show:false,groupBy:false});
 };
 MANAGEMENT.forEach(add);
 const discovered = new Set();
 for (const part of parts) for (const record of [part?.properties,part?.management]) {
  if (record && typeof record==='object') Object.keys(record).forEach(key=>discovered.add(key));
 }
 [...discovered].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).forEach(add);
 return result;
}
function rows(parts, descriptors, groupEnabled=false) {
 check(parts);
 if (!Array.isArray(descriptors)) throw Error('BoM field descriptors must be an array.');
 const keys = [...new Set(descriptors.map(f=>f.key))];
 const grouping = descriptors.filter(f=>f.groupBy && !['Reference','Qty'].includes(aliases.get(normalize(f.key))||f.key)).map(f=>f.key);
 // Reference can be explicitly selected as a grouping field; quantity is computed.
 if (descriptors.some(f=>f.groupBy&&(aliases.get(normalize(f.key))||f.key)==='Reference')) grouping.push('Reference');
 const buckets = new Map();
 for (let index=0;index<parts.length;index++) {
  const part = parts[index];
  const key = groupEnabled ? JSON.stringify([text(part.path),text(part.object?.kind??part.kind),part.populated!==false,!!part.excluded,...grouping.map(k=>value(part,k))]) : index;
  let bucket = buckets.get(key); if (!bucket) {bucket=[];buckets.set(key,bucket);} bucket.push(part);
 }
 return [...buckets.values()].map(members=> {
  const reference = members.map(p=>value(p,'Reference')).join(', ');
  const values = Object.create(null);
  for (const key of keys) {
   const canonical=aliases.get(normalize(key))||key;
   if (canonical==='Qty') values[key]=text(members.length);
   else if (canonical==='Reference') values[key]=reference;
   else { const first=value(members[0],key); values[key]=members.every(p=>value(p,key)===first)?first:'<mixed>'; }
  }
  return {parts:members,quantity:members.length,reference,values};
 });
}
const api={fields,value,rows,MAX_PARTS};
root.KiCadBomFieldTable=api;
if (typeof module==='object'&&module.exports) module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
