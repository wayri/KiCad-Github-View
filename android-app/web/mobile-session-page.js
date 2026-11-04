/* Packaged, host-invoked adapter for the bridge-free repository WebView.
 * Values returned to native are untrusted data; no native API is exposed here. */
((root)=>{'use strict';
 if(root.KiCadMobileSessionPage)return;
 const transfers=new Map(),controllers=new Set(),CHUNK=256*1024,MAX=128*1024*1024;
 function scope(repository){
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository||'')||repository.split('/').some(n=>n==='.'||n==='..'))throw Error('Invalid repository.');
  const u=new URL(root.location.href);if(u.origin!=='https://github.com'||u.pathname.split('/').slice(1,3).join('/').toLowerCase()!==repository.toLowerCase())throw Error('Open the matching repository in the repository browser.');
 }
 function cleanup(){for(const[id,t]of transfers)if(t.expires<Date.now())transfers.delete(id);}
 const review=()=>root.KiCadGitHubSessionReview.create();
 async function dispatch(message){
  scope(message.repository);cleanup();
  if(message.type==='review')return review().dispatch(message);
  if(message.type==='discard'){const t=transfers.get(message.id);if(t&&t.repository===message.repository)transfers.delete(message.id);return{discarded:true};}
  if(message.type==='chunk'){
   const t=transfers.get(message.id);if(!t||t.repository!==message.repository||!Number.isSafeInteger(message.index)||message.index<0||message.index*CHUNK>=t.value.length)throw Error('File transfer expired or changed.');
   const offset=message.index*CHUNK;return{base64:t.value.slice(offset,offset+CHUNK),index:message.index,last:offset+CHUNK>=t.value.length};
  }
  if(message.type!=='source')throw Error('Unsupported repository-browser operation.');
  const controller=new AbortController();controllers.add(controller);
  const reader=root.KiCadGitHubSessionReader.create({signal:controller.signal});let operation={...message};delete operation.type;
  if(message.action==='context'){
   const u=new URL(root.location.href),tail=u.pathname.split('/').slice(3).map(decodeURIComponent).join('/');
   operation={...operation,ref:'HEAD',path:u.pathname.split('/')[3]==='tree'?tail:''};
  }
  let result;try{result=await reader.read(operation);}finally{controllers.delete(controller);}
  if(controller.signal.aborted)throw Error('Repository read cancelled.');
  if(result===null||!['file','asset'].includes(message.action))return result;
  let value=result.base64;
  if(message.action==='file'){
   const bytes=new TextEncoder().encode(result.content),pieces=[];
   for(let i=0;i<bytes.length;i+=8192)pieces.push(String.fromCharCode(...bytes.subarray(i,i+8192)));
   value=root.btoa(pieces.join(''));
  }
  if(typeof value!=='string'||value.length>MAX)throw Error('File exceeds the mobile browser transfer budget.');
  if(transfers.size>=2||[...transfers.values()].reduce((n,t)=>n+t.value.length,0)+value.length>MAX)throw Error('Wait for the current repository file transfer.');
  const id=root.crypto.randomUUID(),bytes=value.length*3/4-(value.endsWith('==')?2:value.endsWith('=')?1:0);
  transfers.set(id,{repository:message.repository,value,expires:Date.now()+120000});
  return{transfer:{id,bytes,characters:value.length,chunks:Math.ceil(value.length/CHUNK),sha:result.sha,encoding:'base64'}};
 }
 const cancel=()=>{for(const controller of controllers)controller.abort();controllers.clear();transfers.clear();};
 root.KiCadMobileSessionPage={dispatch,cancel};
 if(typeof module==='object'&&module.exports)module.exports={dispatch,scope};
})(globalThis);
