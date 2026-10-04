/* Bounded STEP mesh contract and interruptible decoder client. No credentials. */
((root)=>{
 'use strict';
 function meshes(result){
  if(result?.success!==true||!Array.isArray(result.meshes)||!result.meshes.length||result.meshes.length>512)throw new Error('STEP did not produce a supported mesh.');
  let vertices=0,triangles=0;
  return result.meshes.map(mesh=>{
   const positions=mesh.attributes?.position?.array,index=mesh.index?.array,normals=mesh.attributes?.normal?.array;
   if(!Array.isArray(positions)||positions.length%3||!positions.length||!Array.isArray(index)||index.length%3||!index.length)throw new Error('STEP returned invalid mesh arrays.');
   vertices+=positions.length/3;triangles+=index.length/3;
   if(vertices>500000||triangles>500000)throw new Error('STEP tessellation exceeds 500,000 vertices or triangles.');
   if(positions.some(x=>!Number.isFinite(x)||Math.abs(x)>1e6)||index.some(x=>!Number.isSafeInteger(x)||x<0||x>=positions.length/3))throw new Error('STEP mesh coordinates or indices are invalid.');
   if(normals&&(!Array.isArray(normals)||normals.length!==positions.length||normals.some(x=>!Number.isFinite(x))))throw new Error('STEP returned invalid mesh normals.');
   const color=Array.isArray(mesh.color)&&mesh.color.length===3&&mesh.color.every(x=>Number.isFinite(x)&&x>=0&&x<=1)?mesh.color:[.65,.68,.7];
   return{positions:new Float32Array(positions),normals:normals?new Float32Array(normals):null,index:new Uint32Array(index),color};
  });
 }
 async function bundledWorker(url,WorkerType=root.Worker,host=root,signal){
  const response=await host.fetch(url,{credentials:'omit',redirect:'error',signal});
  if(!response.ok)throw new Error('Bundled STEP worker could not be read.');
  const bytes=await response.arrayBuffer();if(bytes.byteLength>256*1024)throw new Error('Bundled STEP worker exceeds 256 KiB.');
  const blobURL=host.URL.createObjectURL(new host.Blob([bytes],{type:'text/javascript'}));
  try{return new WorkerType(blobURL);}finally{host.URL.revokeObjectURL(blobURL);}
 }
 class Client{
  constructor(url,WorkerType=root.Worker){this.url=url;this.WorkerType=WorkerType;this.worker=null;this.queue=Promise.resolve();this.disposed=false;this.pending=null;this.loadingAbort=null;this.wasmUrl=root.KiCadVSCodeContext?.stepWasmUrl;}
  decode(bytes){const run=()=>this.run(bytes);const task=this.queue.then(run,run);this.queue=task.catch(()=>{});return task;}
  async run(bytes){
   if(this.disposed)throw new Error('STEP decoder is closed.');
   if(!(bytes instanceof Uint8Array)||!bytes.byteLength||bytes.byteLength>8*1024*1024)throw new Error('STEP input exceeds 8 MiB or is empty.');
   if(!this.worker){
    const controller=new AbortController();this.loadingAbort=controller;const timer=setTimeout(()=>controller.abort(),10000);
    try{this.worker=root.KiCadVSCodeContext?.stepWorkerUrl?await bundledWorker(root.KiCadVSCodeContext.stepWorkerUrl,this.WorkerType,root,controller.signal):new this.WorkerType(this.url);}
    catch(error){throw new Error('STEP worker is unavailable: '+error.message);}
    finally{clearTimeout(timer);this.loadingAbort=null;}
    if(this.disposed){this.worker.terminate();this.worker=null;throw new Error('STEP decoder is closed.');}
   }
   return new Promise((resolve,reject)=>{
   const finish=(error,result)=>{clearTimeout(timer);this.pending=null;this.worker&&(this.worker.onmessage=this.worker.onerror=null);error?reject(error):resolve(result);};
   const stop=message=>{this.worker?.terminate();this.worker=null;finish(new Error(message));};
   const timer=setTimeout(()=>stop('STEP conversion timed out after 30 seconds.'),30000);
   this.pending=()=>stop('STEP decoder is closed.');
   this.worker.onmessage=event=>event.data?.ok===true?finish(null,event.data.meshes):finish(new Error(event.data?.error||'STEP conversion failed.'));
   this.worker.onerror=()=>stop('STEP worker failed.');
   try{const copy=bytes.slice();this.worker.postMessage({bytes:copy,...(this.wasmUrl?{wasmUrl:this.wasmUrl}:{})},[copy.buffer]);}catch(error){stop('STEP worker could not accept input.');}
  });}
  dispose(){this.disposed=true;this.loadingAbort?.abort();this.pending?.();this.worker?.terminate();this.worker=null;}
 }
 root.KiCadStepDecoder={meshes,Client,bundledWorker};if(typeof module==='object'&&module.exports)module.exports=root.KiCadStepDecoder;
})(typeof globalThis==='object'?globalThis:this);
