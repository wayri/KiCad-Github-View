/* Portable, source-bound local review files. No account or remote publication API. */
((root)=>{'use strict';
 const FORMAT='pocket-kiview-local-review',VERSION=1,MAX_BYTES=1024*1024,MAX_NOTES=2000,MAX_SOURCE_BYTES=96*1024*1024,MAX_DISK_BYTES=1024*1024*1024;
 const PORTABLE_REPOSITORY='local/source';
 const pathOK=p=>typeof p==='string'&&p.length<=500&&!/[\\:\x00-\x1f\x7f]/.test(p)&&p.split('/').every(x=>x&&x!=='.'&&x!=='..');
 const drawing=p=>/\.kicad_(sch|pcb)$/i.test(p);
 const bytes=text=>new TextEncoder().encode(text);
 const stable=value=>JSON.stringify(value);
 const exactKeys=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
 const digest=async value=>{if(!root.crypto?.subtle)throw Error('Secure source hashing is unavailable.');return Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256',value)),b=>b.toString(16).padStart(2,'0')).join('');};
 function parse(text){
  if(typeof text!=='string'||text.length>MAX_BYTES||bytes(text).length>MAX_BYTES)throw Error('Review file exceeds 1 MiB.');
  try{return JSON.parse(text,(key,value)=>{if(['__proto__','constructor','prototype'].includes(key))throw Error('Unsafe review field.');return value;});}catch(error){throw Error('Invalid review JSON: '+error.message);}
 }
 function createDiskReader(project,{fetch:fetchSource=root.fetch?.bind(root)}={}){
  if(!project?.diskBacked||typeof fetchSource!=='function')throw Error('Local disk source reader is unavailable.');
  const records=new Map(),diskPath=new RegExp('^/assets/viewer/'+(project.temporary?'temporary-downloads':'downloaded')+'/[a-f0-9]{32}/[0-9]{1,4}$');
  const capture=(entry,asset)=>{
   const limit=(asset?32:/\.kicad_pcb$/i.test(entry.path)?64:/(?:\.kicad_sch|\.sch|\.lib)$/i.test(entry.path)?8:32)*1024*1024;
   if(!pathOK(entry.path)||!diskPath.test(entry.diskPath)||!Number.isSafeInteger(entry.size)||entry.size<0||entry.size>limit)throw Error('Invalid or oversized local disk source.');
   records.set(entry,{path:entry.path,diskPath:entry.diskPath,size:entry.size,limit});
  };
  for(const entry of project.files||[])capture(entry,false);for(const entry of project.assets||[])capture(entry,true);
  return async entry=>{
   const saved=records.get(entry);if(!saved||entry.path!==saved.path||entry.diskPath!==saved.diskPath||entry.size!==saved.size)throw Error('Disk source is not in the imported project.');
   if(project.temporary&&(!Number.isSafeInteger(project.expiresAt)||project.expiresAt<=Date.now()))throw Error('Temporary project expired. Open the source project again.');
   const url='https://appassets.androidplatform.net'+saved.diskPath;
   const response=await fetchSource(url,{redirect:'error',credentials:'omit'});
   if(!response.ok||response.redirected||response.url&&response.url!==url)throw Error('Local disk source is unavailable or redirected.');
   const length=response.headers?.get('content-length');if(length!==null&&length!==undefined&&(!/^\d+$/.test(length)||Number(length)!==saved.size))throw Error('Local disk source size changed.');
   const reader=response.body?.getReader?.();let content;
   if(reader){
    const chunks=[];let size=0;
    try{for(;;){const result=await reader.read();if(result.done)break;const chunk=result.value;if(!(chunk instanceof Uint8Array)||size+chunk.byteLength>saved.size||size+chunk.byteLength>saved.limit)throw Error('Local disk source exceeds its declared size.');chunks.push(chunk);size+=chunk.byteLength;}
     if(size!==saved.size)throw Error('Local disk source size changed.');content=new Uint8Array(size);let offset=0;for(const chunk of chunks){content.set(chunk,offset);offset+=chunk.byteLength;}
    }catch(error){try{await reader.cancel();}catch{}throw error;}finally{reader.releaseLock?.();}
   }else{throw Error('Bounded local disk reading is unavailable. Reopen the original local project.');}
   return content;
  };
 }
 function create(project,storage,options={}){
  if(!project||project.github||project.remote||!/^[A-Za-z0-9_-]{1,64}$/.test(project.id||'')||!Array.isArray(project.files)||!Array.isArray(project.assets||[])||project.files.length+(project.assets||[]).length>2000)throw Error('Open a local project for local review files.');
  const comments=options.comments||root.KiCadReviewComments;
  if(!comments?.validateComment||!storage?.getItem||!storage?.setItem||!storage?.removeItem)throw Error('Local review storage is unavailable.');
  const repository=(options.local?'local/':'android/')+project.id,ref=options.ref||'a'.repeat(40),prefix=(options.local?'local-notes:':'android-notes:')+project.id+':';
  const paths=new Set(),drawings=[],sourceBudget=project.diskBacked?MAX_DISK_BYTES:MAX_SOURCE_BYTES;
  for(const entry of [...project.files,...(project.assets||[])]){if(!entry||!pathOK(entry.path)||paths.has(entry.path))throw Error('Invalid or duplicate local source path.');paths.add(entry.path);}
  for(const entry of project.files)if(drawing(entry.path))drawings.push(entry.path);
  if(!drawings.length)throw Error('Local review files require a KiCad schematic or PCB.');
  drawings.sort();
  const active=()=>{if(options.getProject&&options.getProject()!==project)throw Error('The active project changed. Open the review file again.');if(project.temporary&&(!Number.isSafeInteger(project.expiresAt)||project.expiresAt<=Date.now()))throw Error('Temporary project expired. Open the source project again.');};
  let identityPromise;
  async function sourceIdentity(){
   active();if(identityPromise)return identityPromise;
   identityPromise=(async()=>{
    const manifest=[];let total=0;
    for(const entry of [...project.files,...(project.assets||[])].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)){
     active();let content;
     if(typeof entry.content==='string'){if(entry.content.length>MAX_SOURCE_BYTES)throw Error('Local review source exceeds 96 MiB.');content=bytes(entry.content);}
     else if(typeof entry.base64==='string'){
      if(entry.base64.length>44*1024*1024||entry.base64.length%4||/[^A-Za-z0-9+/]/.test(entry.base64.replace(/={1,2}$/, '')))throw Error('Invalid local source asset.');
      const binary=root.atob(entry.base64);content=Uint8Array.from(binary,c=>c.charCodeAt(0));
     }else if(options.readSource)content=await options.readSource(entry);
     else throw Error('Source contents are unavailable for exact review matching. Reopen the original local project.');
     if(typeof content==='string')content=bytes(content);
     if(!(content instanceof Uint8Array))throw Error('Invalid local source bytes.');
     total+=content.byteLength;if(total>sourceBudget)throw Error('Local review source exceeds its project byte budget.');
     manifest.push(Object.freeze({path:entry.path,size:content.byteLength,sha256:await digest(content)}));
    }
    active();return Object.freeze({fingerprint:await digest(bytes(stable(manifest))),files:Object.freeze(manifest)});
   })();
   try{return await identityPromise;}catch(error){identityPromise=undefined;throw error;}
  }
  function validateNote(value,portable=false){
   if(value?.anchor?.provider!==undefined||value?.anchor?.host!==undefined)throw Error('Local review notes cannot have remote provider scope.');
   const note=comments.validateComment(value),a=note.anchor;
   if(a.provider||a.host||a.repository!==(portable?PORTABLE_REPOSITORY:repository)||a.ref!==(portable?currentFingerprint.slice(0,40):ref)||!drawings.includes(a.file))throw Error('Review note belongs to another project, revision or file.');
   return note;
  }
  // Set only after hashing succeeds; all import/export work is serialized by the UI.
  let currentFingerprint='';
  const rebase=(note,portable)=>comments.validateComment({...note,anchor:{...note.anchor,repository:portable?PORTABLE_REPOSITORY:repository,ref:portable?currentFingerprint.slice(0,40):ref}});
  function snapshot(){
   const result=new Map();let count=0;
   for(const file of drawings){
    const raw=storage.getItem(prefix+file);let values=[];
    if(raw!==null){if(typeof raw!=='string'||raw.length>MAX_BYTES||bytes(raw).length>MAX_BYTES)throw Error('Existing local review data exceeds the review file budget.');try{values=JSON.parse(raw);}catch{throw Error('Existing local review data is invalid.');}}
    if(!Array.isArray(values))throw Error('Existing local review data is invalid.');
    const ids=new Set(),notes=values.map(value=>{const note=validateNote(value);if(note.anchor.file!==file||ids.has(note.id))throw Error('Existing local review data has duplicate or misplaced notes.');ids.add(note.id);return note;});
    count+=notes.length;if(count>MAX_NOTES)throw Error('Local review note limit reached.');result.set(file,{raw,notes});
   }
   return result;
  }
  async function exportText(){
   const identity=await sourceIdentity();currentFingerprint=identity.fingerprint;active();
   const notes=[...snapshot().values()].flatMap(row=>row.notes.map(note=>rebase(note,true)));
   const text=stable({format:FORMAT,version:VERSION,source:identity,notes});
   if(bytes(text).length>MAX_BYTES)throw Error('Review file exceeds 1 MiB.');return text;
  }
  const plans=new WeakMap();
  async function previewImport(text){
   const value=parse(text);
   if(!exactKeys(value,['format','version','source','notes'])||value.format!==FORMAT||value.version!==VERSION||!exactKeys(value.source,['fingerprint','files'])||!Array.isArray(value.source.files)||value.source.files.length>2000||!Array.isArray(value.notes)||value.notes.length>MAX_NOTES)throw Error('Invalid local review schema.');
   if(!/^[a-f0-9]{64}$/.test(value.source.fingerprint))throw Error('Invalid review source fingerprint.');
   const seen=new Set();for(const file of value.source.files){if(!exactKeys(file,['path','size','sha256'])||!pathOK(file.path)||seen.has(file.path)||!Number.isSafeInteger(file.size)||file.size<0||file.size>MAX_SOURCE_BYTES||!/^[a-f0-9]{64}$/.test(file.sha256))throw Error('Invalid review source manifest.');seen.add(file.path);}
   const identity=await sourceIdentity();currentFingerprint=identity.fingerprint;active();
   if(stable(value.source)!==stable(identity))throw Error('Review file source does not match the exact imported project.');
   const before=snapshot(),merged=new Map([...before].map(([file,row])=>[file,[...row.notes]]));let added=0,unchanged=0;
   const imported=new Set();
   for(const raw of value.notes){
    const portable=validateNote(raw,true),note=rebase(portable,false),key=stable([note.anchor.file,note.id]);
    if(imported.has(key))throw Error('Duplicate review note.');imported.add(key);
    const notes=merged.get(note.anchor.file),existing=notes.find(n=>n.id===note.id);
    if(existing){if(stable(existing)!==stable(note))throw Error('Review conflict for '+note.id+'. Existing notes were preserved. Resolve divergent copies before importing.');unchanged++;}else{notes.push(note);added++;}
   }
   if([...merged.values()].reduce((n,notes)=>n+notes.length,0)>MAX_NOTES)throw Error('Local review note limit reached.');
   const writes=[];for(const [file,notes]of merged){if(notes.length!==before.get(file).notes.length){const text=stable(notes);if(bytes(text).length>MAX_BYTES)throw Error('Local review data exceeds 1 MiB.');writes.push({key:prefix+file,old:before.get(file).raw,text});}}
   const preview=Object.freeze({added,unchanged,total:added+unchanged});plans.set(preview,{before,writes});return preview;
  }
  function applyImport(preview,{confirmed=false}={}){
   active();const plan=plans.get(preview);if(!plan||confirmed!==true)throw Error('Preview and explicit confirmation are required.');
   for(const [file,row]of plan.before)if(storage.getItem(prefix+file)!==row.raw)throw Error('Local notes changed after preview. Preview the review file again.');
   const written=[];
   try{for(const write of plan.writes){storage.setItem(write.key,write.text);written.push(write);}}
   catch(error){let restored=true;for(const write of written.reverse()){try{if(storage.getItem(write.key)!==write.text){restored=false;continue;}if(write.old===null)storage.removeItem(write.key);else storage.setItem(write.key,write.old);}catch{restored=false;}}plans.delete(preview);throw Error(restored?'Unable to save review notes; previous notes were restored.':'Unable to save all review notes. Storage recovery was incomplete; retain your review file.');}
   plans.delete(preview);return{added:preview.added,unchanged:preview.unchanged};
  }
  return{exportText,previewImport,applyImport,sourceIdentity};
 }
 function install(){
  const d=root.document,host=d?.getElementById('projectPicker');if(!host||d.getElementById('androidLocalReviewFile'))return false;
  const make=(tag,text)=>{const node=d.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const launch=make('button','Review file');launch.id='androidLocalReviewFile';launch.type='button';launch.setAttribute('aria-label','Save or import a local review file');host.append(launch);
  const dialog=make('dialog'),heading=make('header'),close=make('button','Close'),body=make('section'),status=make('p'),save=make('button','Export review JSON'),load=make('button','Import review JSON'),confirm=make('button','Import notes'),input=make('input');
  heading.append(make('strong','Local review file'),close);close.type=save.type=load.type=confirm.type='button';status.setAttribute('role','status');status.setAttribute('aria-live','polite');input.type='file';input.accept='.json,application/json';input.hidden=true;confirm.hidden=true;
  body.className='github-content';body.append(make('p','Save notes and their states beside your project using Android’s save picker. Import matches the exact source files and adds notes after confirmation. Drive and OneDrive are storage providers; changes do not sync automatically.'),save,load,confirm,input,status);dialog.append(heading,body);d.body.append(dialog);
  let api,preview,busy=false,openedProject;
  const reset=()=>{api=null;preview=null;confirm.hidden=true;input.value='';};
  const update=()=>{const p=root.KiCadAndroidProject;launch.hidden=!p||Boolean(p.github||p.remote);if(dialog.open&&p!==openedProject){reset();dialog.close();}};
  const run=async action=>{if(busy)return;busy=true;save.disabled=load.disabled=confirm.disabled=true;try{await action();}catch(error){status.textContent=error.message;}finally{busy=false;save.disabled=load.disabled=confirm.disabled=false;}};
   launch.onclick=()=>{reset();openedProject=root.KiCadAndroidProject;try{api=create(openedProject,root.localStorage,{getProject:()=>root.KiCadAndroidProject,...(openedProject?.diskBacked?{readSource:createDiskReader(openedProject)}:{})});status.textContent='Review notes stay local until you export a file.';dialog.showModal();}catch(error){root.KiCadAndroid?.receiveError?.(error.message);}};
  close.onclick=()=>{reset();dialog.close();};dialog.addEventListener('close',reset);
  save.onclick=()=>run(async()=>{if(typeof root.AndroidKiCad?.exportText!=='function')throw Error('Android save picker is unavailable.');status.textContent='Preparing review file…';const pending=api,text=await pending.exportText();if(api!==pending)return;root.AndroidKiCad.exportText('kicad-local-review.json',text,'application/json');status.textContent='Choose where to save the review file. Saving completes in Android’s picker.';});
  load.onclick=()=>{confirm.hidden=true;preview=null;input.value='';input.click();};
  input.onchange=()=>run(async()=>{const file=input.files?.[0];if(!file)return;if(!Number.isSafeInteger(file.size)||file.size<0||file.size>MAX_BYTES)throw Error('Review file exceeds 1 MiB.');status.textContent='Checking project and review file…';const pending=api;const result=await pending.previewImport(await file.text());if(api!==pending)return;preview=result;status.textContent=result.added+' new notes; '+result.unchanged+' unchanged. Existing notes will be preserved.';confirm.hidden=!result.added;});
  confirm.onclick=()=>run(async()=>{const result=api.applyImport(preview,{confirmed:true});confirm.hidden=true;preview=null;status.textContent='Imported '+result.added+' notes. Drawing comments and markers are refreshing.';root.dispatchEvent(new root.Event('kicad-local-review-imported'));});
  root.addEventListener('kicad-project-opened',update);root.addEventListener('kicad-project-home',update);update();return true;
 }
 const API={FORMAT,VERSION,MAX_BYTES,MAX_NOTES,create,createDiskReader,install};root.KiCadAndroidLocalReviewFile=API;
 if(typeof module==='object'&&module.exports)module.exports=API;
 if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',install,{once:true});else install();}
})(globalThis);
