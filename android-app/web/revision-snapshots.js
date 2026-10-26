/* Memory-only snapshots for source-bound mobile commit comparison. */
((root)=>{
'use strict';
function create(project,getActive,request,validate,limit=96*1024*1024){
 const info=project.remote||{provider:'github',repository:project.github.repository,sha:project.github.sha};
 const snapshots=new Map([[info.sha,project]]),pending=new Map();
 const size=p=>p.files.reduce((n,f)=>n+new TextEncoder().encode(f.content).length,0)+(p.assets||[]).reduce((n,f)=>n+f.base64.length*.75,0);
 const aborted=()=>Object.assign(Error('Revision loading cancelled.'),{name:'AbortError',cancelled:true});
 function subscribe(record,signal){
  return new Promise((resolve,reject)=>{
   const token={};record.consumers.add(token);let released=false;
   const release=()=>{if(released)return;released=true;record.consumers.delete(token);signal?.removeEventListener?.('abort',cancel);};
   const cancel=()=>{release();reject(aborted());if(!record.settled&&!record.consumers.size){record.cancelled=true;record.controller?.abort();if(pending.get(record.sha)===record)pending.delete(record.sha);}};
   record.promise.then(value=>{if(released)return;release();resolve(value);},error=>{if(released)return;release();reject(error);});
   if(signal?.aborted){cancel();return;}signal?.addEventListener?.('abort',cancel,{once:true});
  });
 }
 return{async get(sha,{signal}={}){
  if(signal?.aborted)throw aborted();
  if(getActive()!==project)throw Error('The active project changed.');
  if(!/^[a-f0-9]{40}$/.test(sha))throw Error('Comparison requires an immutable commit.');
  if(snapshots.has(sha))return snapshots.get(sha);if(project.diskBacked)throw Error('Commit comparison is unavailable for large downloaded projects. Open a smaller online project to compare revisions.');
  let record=pending.get(sha);
  if(!record){
   record={sha,consumers:new Set(),settled:false,cancelled:false,controller:typeof root.AbortController==='function'?new root.AbortController():null};
   record.promise=(async()=>{const value=await request({type:'revision-import',repository:info.repository,ref:sha,...(info.provider==='gitlab'?{host:info.host}:{})},record.controller?{signal:record.controller.signal}:undefined);
    if(record.cancelled)throw aborted();
    if(getActive()!==project)throw Error('The active project changed while downloading.');
    if(value.sha!==sha||value.repository.toLowerCase()!==info.repository.toLowerCase())throw Error('Revision import identity mismatch.');
    const snapshot=validate({...value.project,...(info.provider==='gitlab'?{remote:{...info,sha}}:{github:{repository:info.repository,sha}})});
    if([...snapshots.values()].reduce((n,p)=>n+size(p),0)+size(snapshot)>limit)throw Error('Comparison snapshots exceed the 96 MiB memory limit. Use a smaller project.');
    if(snapshots.size>=3)throw Error('Comparison is limited to three revisions. Reopen the project to compare others.');
    snapshots.set(sha,snapshot);return snapshot;
   })().finally(()=>{record.settled=true;if(pending.get(sha)===record)pending.delete(sha);});pending.set(sha,record);
  }
  return subscribe(record,signal);
 }};
}
root.KiCadAndroidSnapshots={create};if(typeof module==='object'&&module.exports)module.exports=root.KiCadAndroidSnapshots;
})(globalThis);
