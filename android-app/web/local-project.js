/* Bounded imported-source transport; no credentials, remote requests or source writes. */
((root)=>{
'use strict';
const pathOK=p=>typeof p==='string'&&p.length<=500&&!/[\\:\x00-\x1f]/.test(p)&&p.split('/').every(x=>x&&x!=='.'&&x!=='..');
const drawing=p=>/\.kicad_(sch|pcb)$/i.test(p),textFile=p=>/\.(kicad_(sch|pcb|pro|prl|dru|wks)|json|gbr|ger|drl|csv|tsv|txt|wbk|raw|html|htm)$/i.test(p)||/(^|\/)(sym-lib-table|fp-lib-table)$/i.test(p);
// Candidate reports are opened as inert saved data, including unfamiliar JSON schemas.
const analysisFile=p=>typeof p==='string'&&/\.(wbk|raw|csv|tsv|html|htm|json|txt)$/i.test(p);
function validate(value){
 if(!value||!Array.isArray(value.files)||value.files.length>2000||!Array.isArray(value.assets||[])||(value.assets||[]).length>2000)throw Error('Invalid local project.');
 const disk=Boolean(value.diskBacked),temporary=Boolean(value.temporary);if(temporary&&(!disk||!Number.isSafeInteger(value.expiresAt)||value.expiresAt<=Date.now()))throw Error('Temporary project expired. Download it again.');const diskEntry=f=>pathOK(f.path)&&new RegExp('^/assets/viewer/'+(temporary?'temporary-downloads':'downloaded')+'/[a-f0-9]{32}/[0-9]{1,4}$').test(f.diskPath)&&Number.isSafeInteger(f.size)&&f.size>=0&&f.size<=256*1024*1024;
 const names=new Set();let total=0;
 const files=value.files.map(f=>{if(disk){if(!diskEntry(f)||!textFile(f.path)||names.has(f.path))throw Error('Invalid disk project file.');names.add(f.path);total+=f.size;return{path:f.path,size:f.size,diskPath:f.diskPath};}if(!pathOK(f.path)||!textFile(f.path)||names.has(f.path)||typeof f.content!=='string'||f.content.length>32*1024*1024)throw Error('Invalid or duplicate project file.');names.add(f.path);total+=new TextEncoder().encode(f.content).length;return{path:f.path,content:f.content};});
 const assets=(value.assets||[]).map(f=>{if(disk){if(!diskEntry(f)||!/\.(step|stp|wrl)$/i.test(f.path)||names.has(f.path))throw Error('Invalid disk model.');names.add(f.path);total+=f.size;return{path:f.path,size:f.size,diskPath:f.diskPath};}if(!pathOK(f.path)||! /\.(step|stp|wrl)$/i.test(f.path)||names.has(f.path)||typeof f.base64!=='string'||f.base64.length>44*1024*1024||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(f.base64))throw Error('Invalid model asset.');names.add(f.path);total+=f.base64.length*.75;return{path:f.path,base64:f.base64};});
 if(total>(disk?1024:96)*1024*1024||!files.some(f=>drawing(f.path)||/\.kicad_pro$/i.test(f.path)||analysisFile(f.path)))throw Error(disk?'Downloaded project exceeds 1 GiB or has no KiCad drawings or analysis reports.':'Choose a KiCad drawing, project or analysis report (maximum 96 MiB).');
 let github;if(value.github){if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.github.repository||'')||value.github.repository.split('/').some(p=>p==='.'||p==='..')||!/^[a-f0-9]{40}$/.test(value.github.sha||''))throw Error('Invalid GitHub project revision.');github={repository:value.github.repository,sha:value.github.sha};}
 let remote;if(value.remote){remote=root.KiCadReviewComments.normalizeScope({...value.remote,ref:value.remote.sha,file:value.files[0]?.path});if(remote.provider!=='gitlab'||!/^[a-f0-9]{40}$/.test(value.remote.sha))throw Error('Invalid GitLab revision.');remote={provider:'gitlab',host:remote.host,repository:remote.repository,sha:value.remote.sha};}
 return{...(value.name?{name:String(value.name).slice(0,200)}:{}),...(disk?{diskBacked:true}:{}),...(temporary?{temporary:true,expiresAt:value.expiresAt}:{}),...(value.offline?{offline:true,name:String(value.name||'Offline project').slice(0,200),...(/^[a-f0-9]{64}$/.test(value.libraryId||'')?{libraryId:value.libraryId}:{})}:{}),...(remote?{remote}:{}),...(github?{github}:{}),id:String(value.id||'project').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,64)||'project',files,assets};
}
function transport(project,storage){
 const source=new Map(project.files.map(f=>[f.path,f])),assets=new Map(project.assets.map(f=>[f.path,f])),scope=project.remote?.repository||project.github?.repository||'android/'+project.id,ref=project.remote?.sha||project.github?.sha||'a'.repeat(40);
 const readSource=async path=>{const entry=read(path);if(!entry.diskPath)return entry;const response=await root.fetch(entry.diskPath);if(!response.ok)throw Error('Downloaded file unavailable.');return{path:entry.path,content:await response.text()};};
 const read=path=>{if(!pathOK(path)||!source.has(path))throw Error('File not imported: '+path+'. Open its project folder to include sheets and models.');return source.get(path);};
 const notesKey=file=>'android-notes:'+project.id+':'+file;
 const getNotes=file=>JSON.parse(storage.getItem(notesKey(file))||'[]');
 const dispatch=async message=>{
  if(project.temporary&&project.expiresAt<=Date.now())throw Error('Temporary project expired. Download it again.');
  if(!message||typeof message.type!=='string')throw Error('Invalid local request.');
  if(message.provider&&message.provider!==(project.remote?.provider||'github')||message.host&&message.host!==(project.remote?.host||'https://github.com')||message.repository&&message.repository!==scope||message.ref&&message.ref!==ref)throw Error('Request belongs to another imported project.');
  switch(message.type){
   case 'revision-resolve':return{sha:ref};
   case 'project-inventory':return{files:project.files.map(f=>({path:f.path,size:f.size??f.content.length})),snapshotRef:ref,warnings:[]};
   case 'project-file':return readSource(message.file);
   case 'project':return root.KiCadBrowserData.loadProject(scope,ref,message.file,async(_,__,file)=>source.has(file)?(await readSource(file)).content:null,async(_,__,dir)=>project.files.filter(f=>/\.kicad_sch$/i.test(f.path)&&f.path.split('/').slice(0,-1).join('/')===dir).map(f=>f.path),project.remote?.provider||'github',async()=>project.files.filter(f=>/\.kicad_sch$/i.test(f.path)).map(f=>f.path));
   case 'drawing-files':return{files:project.files.filter(f=>drawing(f.path)).map(f=>f.path),warnings:[]};
   case 'project-search-files':if(project.diskBacked&&project.files.reduce((n,f)=>n+f.size,0)>512*1024*1024)throw Error('Whole-project search exceeds the active 512 MiB memory budget. Search the current drawing instead.');return{files:await Promise.all(project.files.filter(f=>drawing(f.path)).map(f=>readSource(f.path))),settings:await Promise.all(project.files.filter(f=>/\.kicad_pro$/i.test(f.path)).map(f=>readSource(f.path))),warnings:[],snapshotRef:ref,totalDrawings:project.files.filter(f=>drawing(f.path)).length};
   case 'repo-asset':if(!pathOK(message.file)||!assets.has(message.file))throw Error('Model is not in the imported folder.');{const entry=assets.get(message.file);if(!entry.diskPath)return entry;const response=await root.fetch(entry.diskPath);if(!response.ok)throw Error('Downloaded model unavailable.');const bytes=new Uint8Array(await response.arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return{path:entry.path,base64:root.btoa(text)};}
   case 'rule-report':return readSource(message.reportPath);
   case 'github-auth-status':case 'github-device-status':return{configured:false,pending:false};
   case 'review-file-status':return{connected:false};
   case 'github-annotations':return{notes:[],warnings:['Android review: comments stay on this device.']};
   case 'comment-mention-users':return{users:[],warnings:[]};
   case 'comment-policy-status':return{allowed:false,reason:'Android app: remote publication is unavailable.'};
   case 'comment-list':read(message.file);return getNotes(message.file);
   case 'comment-save':{
    const note=root.KiCadReviewComments.validateComment(message.comment);if((note.anchor.provider||'github')!==(project.remote?.provider||'github')||note.anchor.provider==='gitlab'&&note.anchor.host!==project.remote?.host||note.anchor.repository!==scope||note.anchor.ref!==ref)throw Error('Comment belongs to another project.');read(note.anchor.file);
    const notes=getNotes(note.anchor.file),index=notes.findIndex(n=>n.id===note.id);
    if(index>=0&&message.expectedUpdatedAt&&notes[index].updatedAt!==message.expectedUpdatedAt)throw Error('Comment changed; reopen before saving.');
    if(index<0){if(notes.length>=2000)throw Error('Local comment limit reached.');notes.push(note);}else notes[index]=note;
    storage.setItem(notesKey(note.anchor.file),JSON.stringify(notes));return note;
   }
   case 'comment-delete':read(message.file);storage.setItem(notesKey(message.file),JSON.stringify(getNotes(message.file).filter(n=>n.id!==message.id)));return{deleted:true};
   default:throw Error('This feature needs the browser extension’s online account integration. Android supports local and imported GitHub projects.');
  }
 };
 return{scope,ref,send:async m=>{try{return{ok:true,result:await dispatch(m)};}catch(e){return{ok:false,error:e.message};}}};
}
root.KiCadAndroidLocal={validate,transport,pathOK,analysisFile};if(typeof module==='object'&&module.exports)module.exports=root.KiCadAndroidLocal;
})(globalThis);
