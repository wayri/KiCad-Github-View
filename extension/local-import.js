/* User-selected local files only. No filesystem paths are fetched by the browser. */
((root)=>{
'use strict';
const local=root.KiCadLocalProject||(typeof require==='function'?require('./local-project.js'):null);
const MAX=96*1024*1024,COUNT=2000;
async function readFiles(entries,{stripFolder=false}={}){
 if(!Array.isArray(entries)||!entries.length||entries.length>COUNT)throw Error('Choose 1–2000 files.');
 let items=entries.map(item=>({file:item.file||item,path:item.path||item.webkitRelativePath||item.name}));
 if(stripFolder&&items.every(i=>typeof i.path==='string'&&i.path.includes('/')&&i.path.split('/')[0]===items[0].path.split('/')[0]))items=items.map(i=>({...i,path:i.path.split('/').slice(1).join('/')}));
 const files=[],assets=[],seen=new Set();let total=0,ignored=0;
 for(const {file,path}of items){
  if(!local.pathOK(path))throw Error('Invalid local path: '+String(path).slice(0,100));
  if(!local.textFile(path)&&! /\.(step|stp|wrl|vrml|glb|pdf)$/i.test(path)){ignored++;continue;}
  if(seen.has(path))throw Error('Duplicate selected path: '+path);seen.add(path);
  if(!Number.isSafeInteger(file.size)||file.size<0||file.size>32*1024*1024||(total+=file.size)>MAX)throw Error('Local imports allow 32 MiB per file and 96 MiB per project.');
  const buffer=await file.arrayBuffer();if(buffer.byteLength!==file.size)throw Error('File changed while importing: '+path);
  const bytes=new Uint8Array(buffer);
  if(local.textFile(path)){
   let content;try{content=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw Error('Source is not UTF-8 text: '+path);}
   files.push({path,content});
  }else {let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));assets.push({path,base64:root.btoa(text)});}
 }
 const project=local.validate({id:'imported',name:'Local project',files,assets});return{project,ignored};
}
async function dropped(data){
 const entries=[...(data.items||[])].filter(i=>i.kind==='file').map(i=>i.webkitGetAsEntry?.()).filter(Boolean);
 if(!entries.length)return readFiles([...(data.files||[])],{stripFolder:true});
 const files=[];let visited=0;
 async function walk(entry,prefix=''){
  if(++visited>4000)throw Error('Dropped folder exceeds 4000 entries. Choose a smaller project.');
  const path=prefix+entry.name;if(!local.pathOK(path))throw Error('Invalid dropped path.');
  if(entry.isFile){const file=await new Promise((ok,no)=>entry.file(ok,no));files.push({path,file});if(files.length>COUNT)throw Error('Dropped project exceeds 2000 files.');}
  else if(entry.isDirectory){const reader=entry.createReader();for(;;){const batch=await new Promise((ok,no)=>reader.readEntries(ok,no));if(!batch.length)break;for(const child of batch)await walk(child,path+'/');}}
 }
 for(const entry of entries)await walk(entry);return readFiles(files,{stripFolder:entries.length===1&&entries[0].isDirectory});
}
async function identify(value){
 const project=local.validate(value),crypto=root.crypto||(typeof require==='function'?require('node:crypto').webcrypto:null);
 const material=JSON.stringify([...project.files.map(f=>[f.path,f.content]),...project.assets.map(f=>[f.path,f.base64])].sort((a,b)=>a[0].localeCompare(b[0])));
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(material)),hash=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
 return{project:{...project,id:hash.slice(0,32)},ref:hash.slice(0,40)};
}
const api={readFiles,dropped,identify};root.KiCadLocalImport=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
