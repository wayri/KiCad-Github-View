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
 class Client{
  constructor(url,WorkerType=root.Worker){this.url=url;this.WorkerType=WorkerType;this.worker=null;this.queue=Promise.resolve();this.disposed=false;this.pending=null;}
  decode(bytes){const run=()=>this.run(bytes);const task=this.queue.then(run,run);this.queue=task.catch(()=>{});return task;}
  run(bytes){return new Promise((resolve,reject)=>{
   if(this.disposed)return reject(new Error('STEP decoder is closed.'));
   if(!(bytes instanceof Uint8Array)||!bytes.byteLength||bytes.byteLength>8*1024*1024)return reject(new Error('STEP input exceeds 8 MiB or is empty.'));
   try{this.worker ||=new this.WorkerType(this.url);}catch(error){return reject(new Error('STEP worker is unavailable: '+error.message));}
   const finish=(error,result)=>{clearTimeout(timer);this.pending=null;this.worker&&(this.worker.onmessage=this.worker.onerror=null);error?reject(error):resolve(result);};
   const stop=message=>{this.worker?.terminate();this.worker=null;finish(new Error(message));};
   const timer=setTimeout(()=>stop('STEP conversion timed out after 30 seconds.'),30000);
   this.pending=()=>stop('STEP decoder is closed.');
   this.worker.onmessage=event=>event.data?.ok===true?finish(null,event.data.meshes):finish(new Error(event.data?.error||'STEP conversion failed.'));
   this.worker.onerror=()=>stop('STEP worker failed.');
   try{const copy=bytes.slice();this.worker.postMessage({bytes:copy},[copy.buffer]);}catch(error){stop('STEP worker could not accept input.');}
  });}
  dispose(){this.disposed=true;this.pending?.();this.worker?.terminate();this.worker=null;}
 }
 root.KiCadStepDecoder={meshes,Client};if(typeof module==='object'&&module.exports)module.exports=root.KiCadStepDecoder;
})(typeof globalThis==='object'?globalThis:this);
