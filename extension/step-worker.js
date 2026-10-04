/* STEP stays in an interruptible worker; only bounded mesh buffers leave it. */
'use strict';
importScripts('step-decoder.js','vendor/occt/occt-import-js.js');
let kernel;
self.onmessage=async event=>{
 try{
  const bytes=event.data?.bytes;
  if(!(bytes instanceof Uint8Array)||!bytes.byteLength||bytes.byteLength>8*1024*1024)throw new Error('Invalid STEP input size.');
  const header=new TextDecoder().decode(bytes.subarray(0,256));if(!/ISO-10303-21\s*;/i.test(header))throw new Error('Expected STEP Part 21 data.');
  const wasmUrl=event.data.wasmUrl||new URL('vendor/occt/occt-import-js.wasm',self.location.href).href;
  kernel ||=occtimportjs({locateFile:()=>wasmUrl});
  const occt=await kernel;
  const meshes=KiCadStepDecoder.meshes(occt.ReadStepFile(bytes,{linearUnit:'millimeter',linearDeflectionType:'absolute_value',linearDeflection:.05,angularDeflection:.5}));
  const buffers=meshes.flatMap(m=>[m.positions.buffer,m.index.buffer,...(m.normals?[m.normals.buffer]:[])]);
  self.postMessage({ok:true,meshes},buffers);
 }catch(error){kernel=null;self.postMessage({ok:false,error:String(error?.message||'STEP conversion failed.').slice(0,300)});}
};
