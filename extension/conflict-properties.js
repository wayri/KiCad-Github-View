/* Read-only saved field metadata for visual conflict review. */
((root)=>{'use strict';
const value=x=>x&&typeof x==='object'&&!Array.isArray(x)?x.quoted:x;
const kind=x=>Array.isArray(x)?value(x[0]):null;
const child=(n,k)=>n.find(x=>kind(x)===k);
const flag=(n,k)=>Array.isArray(n)&&n.slice(1).some(x=>kind(x)===k?[undefined,true,'yes','true',1].includes(value(x[1])):typeof x==='string'&&x===k);
const visible=n=>!flag(n,'hide')&&!flag(child(n,'effects'),'hide')&&!flag(child(child(n,'effects')||[],'font'),'hide');
function objects(ast){return ast.filter(n=>['symbol','sheet','footprint'].includes(kind(n))).map(n=>{
 const fields=n.filter(x=>kind(x)==='property').map(x=>({name:String(value(x[1])||''),value:String(value(x[2])??''),visible:visible(x)}));
 if(kind(n)==='footprint')for(const [role,name]of [['reference','Reference'],['value','Value']]){const legacy=n.find(x=>kind(x)==='fp_text'&&value(x[1])===role);if(legacy&&!fields.some(f=>f.name===name))fields.push({name,value:String(value(legacy[2])??''),visible:visible(legacy)});}
 const label=fields.find(f=>f.name==='Reference'||f.name==='Sheetname'||f.name==='Sheet name')?.value||String(value(n[1])||kind(n));
 const at=child(n,'at');const position=at&&Number.isFinite(value(at[1]))&&Number.isFinite(value(at[2]))?{x:value(at[1]),y:value(at[2])}:null;return {position,uuid:String(value(child(n,'uuid')?.[1]||child(n,'tstamp')?.[1])||''),kind:kind(n),label,fields};
});}
function rows(before,after){const a=new Map((before?.fields||[]).map(f=>[f.name,f])),b=new Map((after?.fields||[]).map(f=>[f.name,f]));return [...new Set([...a.keys(),...b.keys()])].map(name=>{const current=a.get(name)||null,incoming=b.get(name)||null;return {name,current,incoming,valueChanged:Boolean(current&&incoming&&current.value!==incoming.value),visibilityChanged:Boolean(current&&incoming&&current.visible!==incoming.visible),changed:!current||!incoming||current.value!==incoming.value||current.visible!==incoming.visible};});}
function candidates(primitives,list){const seen=new Set();return primitives.map(p=>list.find(o=>o.uuid&&(o.uuid===(p.ownerUuid||p.uuid)))).filter(o=>o&&!seen.has(o.uuid)&&seen.add(o.uuid));}
function annotations(before,after){const fields=rows(before,after).filter(r=>r.valueChanged&&['Reference','Value'].includes(r.name)).map(r=>({name:r.name,text:r.current.value+' → '+r.incoming.value}));const a=before?.position,b=after?.position;return {fields,movement:before?.kind==='footprint'&&after?.kind==='footprint'&&a&&b&&Math.hypot(b.x-a.x,b.y-a.y)>0.000001?{from:a,to:b}:null};}
function presence(before,after){if(before&&after)return {current:{text:'Present in current',kind:'present'},incoming:{text:'Present in incoming',kind:'present'}};if(after)return {current:{text:'Not present in current',kind:'absent'},incoming:{text:'Added in incoming',kind:'added'}};if(before)return {current:{text:'Removed in incoming · Present in current',kind:'removed'},incoming:{text:'Not present in incoming',kind:'absent'}};return {current:{text:'Select a part',kind:'empty'},incoming:{text:'Select a part',kind:'empty'}};}
root.KiCadConflictProperties={objects,rows,visible,presence,candidates,annotations};if(typeof module==='object'&&module.exports)module.exports=root.KiCadConflictProperties;
})(globalThis);
