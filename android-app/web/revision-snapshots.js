/* Memory-only snapshots for source-bound mobile commit comparison. */
((root)=>{
'use strict';
function create(project,getActive,request,validate,limit=96*1024*1024){
 const info=project.remote||{provider:'github',repository:project.github.repository,sha:project.github.sha};
 const snapshots=new Map([[info.sha,project]]),pending=new Map();
 const size=p=>p.files.reduce((n,f)=>n+new TextEncoder().encode(f.content).length,0)+(p.assets||[]).reduce((n,f)=>n+f.base64.length*.75,0);
 return{async get(sha){
  if(getActive()!==project)throw Error('The active project changed.');
  if(!/^[a-f0-9]{40}$/.test(sha))throw Error('Comparison requires an immutable commit.');
  if(snapshots.has(sha))return snapshots.get(sha);if(pending.has(sha))return pending.get(sha);
  const task=(async()=>{const value=await request({type:'revision-import',repository:info.repository,ref:sha,...(info.provider==='gitlab'?{host:info.host}:{})});
   if(getActive()!==project)throw Error('The active project changed while downloading.');
   if(value.sha!==sha||value.repository.toLowerCase()!==info.repository.toLowerCase())throw Error('Revision import identity mismatch.');
   const snapshot=validate({...value.project,...(info.provider==='gitlab'?{remote:{...info,sha}}:{github:{repository:info.repository,sha}})});
   if([...snapshots.values()].reduce((n,p)=>n+size(p),0)+size(snapshot)>limit)throw Error('Comparison snapshots exceed the 96 MiB memory limit. Use a smaller project.');
   if(snapshots.size>=3)throw Error('Comparison is limited to three revisions. Reopen the project to compare others.');
   snapshots.set(sha,snapshot);return snapshot;
  })();pending.set(sha,task);try{return await task;}finally{pending.delete(sha);}
 }};
}
root.KiCadAndroidSnapshots={create};if(typeof module==='object'&&module.exports)module.exports=root.KiCadAndroidSnapshots;
})(globalThis);
