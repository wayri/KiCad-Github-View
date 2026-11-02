/* Attach saved native identities to owner-parser geometry without changing placement. */
const text=v=>v&&typeof v==='object'&&!Array.isArray(v)?v.quoted:v;
const child=(node,name)=>node.find(v=>Array.isArray(v)&&text(v[0])===name);
const children=(node,name)=>node.filter(v=>Array.isArray(v)&&text(v[0])===name);
const identity=node=>text(child(node,'uuid')?.[1]??child(node,'tstamp')?.[1]);
export function sourceSelectionRecords(ast,board){
 const components=new Map(),pads=new Map(),duplicates=new Set();
 const add=(map,key,value)=>{if(typeof key!=='string'||!key||key.length>500)return;const token=(map===pads?'pad:':'part:')+key;if(duplicates.has(token))return;if(map.has(key)){map.delete(key);duplicates.add(token);}else map.set(key,value);};
 if(!Array.isArray(ast)||text(ast[0])!=='kicad_pcb')return {components:board.components||[],pads:board.pads||[]};
 for(const fp of children(ast,'footprint')){
  const reference=text(children(fp,'property').find(p=>text(p[1])==='Reference')?.[2])||text(children(fp,'fp_text').find(p=>text(p[1])==='reference')?.[2]);
  const uuid=identity(fp),tstampPath=text(child(fp,'path')?.[1]);
  const part={...(typeof uuid==='string'?{uuid}:{}),...(typeof tstampPath==='string'?{tstampPath,symbolUuid:tstampPath.split('/').filter(Boolean).at(-1)}:{})};
  const parserId=text(child(fp,'uuid')?.[1])||(reference?'component-'+reference:null);
  add(components,parserId,part);
  for(const [index,pad]of children(fp,'pad').entries()){
   const pinNumber=String(text(pad[1])??''),padUuid=identity(pad);
   const padId=text(child(pad,'uuid')?.[1])||(reference?'pad-'+reference+'-'+(pinNumber||String(index+1)):null);
   add(pads,padId,{...part,type:'Pad',...(typeof padUuid==='string'?{uuid:padUuid}:{}),...(typeof uuid==='string'?{ownerUuid:uuid}:{}),pinNumber,pinName:String(text(child(pad,'pinfunction')?.[1])??'')});
  }
 }
 return {components:(board.components||[]).map(record=>({...record,...components.get(record.id)})),pads:(board.pads||[]).map(record=>({...record,pinNumber:'',pinName:'',...pads.get(record.id)}))};
}
