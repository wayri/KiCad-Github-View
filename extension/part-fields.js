/* Replace only saved part field string tokens; never reserialize design geometry. */
((root)=>{
'use strict';
const diff=root.KiCadDesignDiff||(typeof require==='function'?require('./design-diff.js'):null);
const protectedFields=new Set(['reference','footprint','uuid','sheetname','sheetfile','sheet name','sheet file','ki_description','ki_keywords']);
function tree(source){
 diff.parse(source);const stack=[],roots=[];let i=0;
 const add=node=>(stack.at(-1)?.items||roots).push(node);
 while(i<source.length){const c=source[i];if(/\s/.test(c)){i++;continue;}if(c===';'){while(i<source.length&&source[i]!=='\n')i++;continue;}
  if(c==='('){const node={start:i++,items:[]};add(node);stack.push(node);continue;}if(c===')'){const node=stack.pop();node.end=++i;continue;}
  const start=i;let quoted=c==='"';if(quoted){i++;while(i<source.length){if(source[i]==='\\'){i+=2;continue;}if(source[i++]==='"')break;}}
  else while(i<source.length&&!/[\s();"]/.test(source[i]))i++;
  const token=source.slice(start,i);let value=token;if(quoted){value=token.slice(1,-1).replace(/\\([\s\S])/g,(_,c)=>({n:'\n',r:'\r',t:'\t','"':'"','\\':'\\'})[c]??'\\'+c);}
  add({start,end:i,value,quoted});
 }
 return roots[0];
}
const kind=node=>node?.items?.[0]?.value;
function part(source,uuid){const ast=tree(source);if(!['kicad_sch','kicad_pcb'].includes(kind(ast)))throw Error('Choose a modern KiCad schematic or board.');
 const found=ast.items.filter(n=>['symbol','footprint'].includes(kind(n))&&n.items.some(c=>['uuid','tstamp'].includes(kind(c))&&c.items[1]?.value===uuid));
 if(found.length!==1)throw Error('Saved part identity is missing or ambiguous.');return found[0];}
function fields(source,uuid){const record=part(source,uuid),result=[];
 for(const child of record.items){if(kind(child)==='property'&&child.items[1]?.quoted&&child.items[2]?.quoted){const name=child.items[1].value;if(!protectedFields.has(name.toLowerCase()))result.push({name,value:child.items[2].value,token:child.items[2]});}
  if(kind(child)==='fp_text'&&child.items[1]?.value==='value'&&child.items[2]?.quoted)result.push({name:'Value',value:child.items[2].value,token:child.items[2]});}
 return result;}
const quote=value=>'"'+value.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'\\n').replace(/\r/g,'\\r').replace(/\t/g,'\\t')+'"';
function replace(source,uuid,changes){if(!changes||Array.isArray(changes)||typeof changes!=='object'||Object.keys(changes).length>64)throw Error('Invalid field changes.');const available=fields(source,uuid),patches=[];
 for(const [name,value]of Object.entries(changes)){if(typeof value!=='string'||value.length>4096||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))throw Error('Field values must be text of at most 4096 characters.');const found=available.filter(f=>f.name===name);if(found.length!==1)throw Error('Field is missing, protected or ambiguous: '+name);if(found[0].value!==value)patches.push({...found[0].token,text:quote(value)});}
 let result=source;for(const patch of patches.sort((a,b)=>b.start-a.start))result=result.slice(0,patch.start)+patch.text+result.slice(patch.end);diff.parse(result);return result;
}
root.KiCadPartFields={fields,replace};if(typeof module==='object'&&module.exports)module.exports=root.KiCadPartFields;
})(globalThis);
