/* Optional provider sync cache. Pending legacy drafts are preserved separately. */
((root)=>{
 "use strict";
 function createStore({getHandle,setHandle,lock,validator=root.KiCadReviewComments}){
  const scopeKey=anchor=>JSON.stringify([anchor.provider||'github',anchor.provider==='gitlab'?anchor.host:'https://github.com',anchor.repository,anchor.ref,anchor.file]);
  const key=note=>JSON.stringify([scopeKey(note.anchor),note.id]);
  const published=note=>Boolean(note.remoteRefs?.length);
  async function permitted(handle){if(!handle||handle.kind!=="file"||handle.name!==".kicad-review.json")throw new Error("Choose .kicad-review.json in your Git project.");if(await handle.queryPermission({mode:"readwrite"})!=="granted")throw new Error("Review file permission needs renewal in extension settings.");}
  async function snapshot(handle){await permitted(handle);const file=await handle.getFile();if(file.size>4*1024*1024)throw new Error("Review file exceeds 4 MiB.");const text=await file.text();return{text,notes:validator.parseSidecar(text)};}
  async function commit(handle,before,notes){const text=validator.serializeSidecar(notes);if(text===before)return;if((await snapshot(handle)).text!==before)throw new Error("Review file changed externally; reload before saving.");let writer;try{writer=await handle.createWritable({keepExistingData:false});await writer.write(text);if((await snapshot(handle)).text!==before)throw new Error("Review file changed externally; staged save cancelled.");await writer.close();}catch(error){try{await writer?.abort();}catch{}throw error;}}
  return {
   async status(){const h=await getHandle();return{connected:Boolean(h),name:h?.name||null,mode:'provider-sync-cache'};},
   async connect(handle){return lock(async()=>{await permitted(handle);const file=await handle.getFile();if(file.size===0){const writer=await handle.createWritable();try{await writer.write(validator.serializeSidecar([]));await writer.close();}catch(e){try{await writer.abort();}catch{}throw e;}}else await snapshot(handle);await setHandle(handle);return{name:handle.name};});},
   async disconnect(){return lock(()=>setHandle(null));},
   async read(){return lock(async()=>{const h=await getHandle();if(!h)throw new Error("No Git review file connected.");return(await snapshot(h)).notes;});},
   async readSnapshot(){return lock(async()=>{const h=await getHandle();if(!h)throw new Error('No review sync cache connected.');const {notes}=await snapshot(h);return{synced:notes.filter(published),pending:notes.filter(note=>!published(note))};});},
   async sync(rawScope,remoteNotes,{complete=false,sourceUrl=null}={}){return lock(async()=>{
    const scope=validator.normalizeScope(rawScope),wanted=scopeKey(scope),h=await getHandle();if(!h)throw new Error('No review sync cache connected.');
    if(typeof complete!=='boolean')throw new Error('Invalid provider snapshot completeness.');
    if(sourceUrl!==null){const base=scope.provider==='gitlab'?`${scope.host}/${scope.repository}/-/issues/`:'https://github.com/';if(typeof sourceUrl!=='string'||!sourceUrl.startsWith(base)||!(scope.provider==='gitlab'?/^[1-9][0-9]*$/:/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/(?:issues|discussions|pull)\/[1-9][0-9]*$/).test(sourceUrl.slice(base.length))||sourceUrl.slice(base.length).split('/').some(part=>part==='.'||part==='..'))throw new Error('Invalid provider thread scope.');}
    const inThread=note=>sourceUrl===null||note.remoteRefs.some(ref=>ref.url.split('#')[0]===sourceUrl);
    if(!Array.isArray(remoteNotes)||remoteNotes.length>10000)throw new Error('Invalid provider comment snapshot.');
    const incoming=remoteNotes.map(note=>validator.validateComment(note)),ids=new Set();
    for(const note of incoming){if(scopeKey(note.anchor)!==wanted||!published(note)||!inThread(note))throw new Error('Sync requires published comments from the selected provider scope.');const id=key(note);if(ids.has(id))throw new Error('Duplicate provider comment.');ids.add(id);}
    const before=await snapshot(h),notes=before.notes.filter(note=>!(published(note)&&scopeKey(note.anchor)===wanted&&inThread(note)&&(complete||ids.has(key(note)))));
    // Never replace an unpublished draft that happens to reuse a remote ID.
    const pending=new Set(notes.filter(note=>!published(note)).map(key));if(incoming.some(note=>pending.has(key(note))))throw new Error('A pending draft conflicts with a provider comment; preserve or publish the draft first.');
    notes.push(...incoming);await commit(h,before.text,notes);return{synced:incoming.length,pending:notes.filter(note=>!published(note)).length,complete:Boolean(complete)};
   });},
   async save(raw,expectedUpdatedAt){return lock(async()=>{const note=validator.validateComment(raw),h=await getHandle();if(!h)throw new Error("No Git review file connected.");const before=await snapshot(h),notes=before.notes,index=notes.findIndex(n=>key(n)===key(note));if(index>=0&&expectedUpdatedAt!==undefined&&notes[index].updatedAt!==expectedUpdatedAt)throw new Error("This annotation changed; reload before saving.");if(index<0)notes.push(note);else notes[index]=note;await commit(h,before.text,notes);return note;});},
   async remove(scope,id){return lock(async()=>{const normalized=validator.normalizeScope(scope);const h=await getHandle();if(!h)throw new Error("No Git review file connected.");const before=await snapshot(h);const after=before.notes.filter(note=>key(note)!==JSON.stringify([scopeKey(normalized),id]));await commit(h,before.text,after);return {deleted:after.length!==before.notes.length};});}
  };
 }
 async function handleStorage(value,write=false){return new Promise((resolve,reject)=>{const request=indexedDB.open("kicad-review-files",1);request.onupgradeneeded=()=>request.result.createObjectStore("handles");request.onerror=()=>reject(new Error("Review file handle storage unavailable."));request.onsuccess=()=>{const db=request.result,tx=db.transaction("handles",write?"readwrite":"readonly"),store=tx.objectStore("handles"),operation=write?(value?store.put(value,"active"):store.delete("active")):store.get("active");let result;operation.onsuccess=()=>result=operation.result;tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=tx.onabort=()=>{db.close();reject(new Error("Review file handle storage failed."));};};});}
 const store=createStore({getHandle:()=>handleStorage(),setHandle:h=>handleStorage(h,true),lock:fn=>{if(!root.navigator?.locks?.request)throw new Error("This browser lacks cross-tab file locking; update Chrome.");return navigator.locks.request("kicad-review-sidecar",fn);}});
 root.KiCadReviewFileStore={...store,createStore};if(typeof module==="object"&&module.exports)module.exports=root.KiCadReviewFileStore;
})(globalThis);
