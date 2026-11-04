const test=require('node:test'),assert=require('node:assert/strict');
globalThis.crypto=require('node:crypto').webcrypto;
const comments=require('../../extension/review-comments.js'),local=require('../../extension/local-project.js'),review=require('../../android-app/web/local-review-file.js');
const time='2026-11-04T00:00:00Z',ref='a'.repeat(40);
function storage(){const data=new Map();return{data,getItem:key=>data.has(key)?data.get(key):null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};}
function project(id='phone'){return local.validate({id,files:[{path:'board/main.kicad_sch',content:'(kicad_sch (uuid schematic))'},{path:'board/main.kicad_pcb',content:'(kicad_pcb (version 20260101))'},{path:'board/main.kicad_pro',content:'{}'}],assets:[{path:'model.step',base64:'c3RlcA=='}]});}
function note(id='first',state='open',file='board/main.kicad_sch',projectId='phone'){
 return comments.validateComment({id,text:'Check pin one',state,severity:'major',tags:['connector'],createdAt:time,updatedAt:time,anchor:{repository:'android/'+projectId,ref,file,reference:'J1',uuid:'object-1',objectId:'pin-1',sheetUuid:'sheet-1',sheetName:'Power',instancePath:'/root/sheet-1',position:{x:2.5,y:-3},area:{x:1,y:2,width:3,height:4}}});
}
const key=(id,file)=>'android-notes:'+id+':'+file;
function seed(store,value,projectId='phone'){const k=key(projectId,value.anchor.file),old=JSON.parse(store.getItem(k)||'[]');old.push(value);store.setItem(k,JSON.stringify(old));}
test('review sidecar roundtrip preserves all marker states, severity and exact point/area references across import IDs',async()=>{
 const source=project(),from=storage(),to=storage();for(const [i,state]of comments.stateOptions.entries())seed(from,{...note('state-'+i,state.value,i%2?'board/main.kicad_pcb':'board/main.kicad_sch'),severity:comments.severityOptions[i].value});
 const text=await review.create(source,from).exportText(),value=JSON.parse(text);assert.equal(value.notes.length,5);assert.match(value.source.fingerprint,/^[a-f0-9]{64}$/);assert.equal(value.source.files.length,4);assert.equal(text.includes('android/phone'),false);
 const destination=project('tablet'),api=review.create(destination,to),preview=await api.previewImport(text);assert.equal(preview.added,5);assert.equal(to.data.size,0);assert.throws(()=>api.applyImport(preview),/confirmation/);assert.deepEqual(api.applyImport(preview,{confirmed:true}),{added:5,unchanged:0});assert.throws(()=>api.applyImport(preview,{confirmed:true}),/Preview/);
 for(const portable of value.notes){const saved=JSON.parse(to.getItem(key('tablet',portable.anchor.file))).find(n=>n.id===portable.id);assert.deepEqual(saved,{...portable,anchor:{...portable.anchor,repository:'android/tablet',ref}});assert.equal(saved.severity,portable.severity);assert.deepEqual(saved.anchor.position,{x:2.5,y:-3});assert.deepEqual(saved.anchor.area,{x:1,y:2,width:3,height:4});}
 assert.equal(await api.exportText(),text);const repeated=await api.previewImport(text);assert.equal(repeated.added,0);assert.equal(repeated.unchanged,5);
});
test('exact source identity rejects content, asset, file set, path and foreign project changes',async()=>{
 const p=project(),s=storage();seed(s,note());const text=await review.create(p,s).exportText();
 for(const mutate of [q=>q.files[0].content+=' ',q=>q.assets[0].base64='b3RoZXI=',q=>q.files.pop(),q=>q.files[0].path='renamed.kicad_sch']){const other=project('other');mutate(other);await assert.rejects(review.create(other,storage()).previewImport(text),/exact imported project/);}
 const reordered=project('same');reordered.files.reverse();assert.equal((await review.create(reordered,storage()).previewImport(text)).added,1);
 for(const field of ['github','remote'])assert.throws(()=>review.create({...p,[field]:{}},storage()),/local project/);
});
test('malformed and malicious sidecars fail before mutating existing notes',async()=>{
 const s=storage();seed(s,note());const api=review.create(project(),s),original=await api.exportText(),before=[...s.data];
 const mutate=fn=>{const value=JSON.parse(original);fn(value);return JSON.stringify(value);};
 for(const bad of [
  '{"__proto__":{}}','{"constructor":{}}','{',
  mutate(v=>v.version=2),mutate(v=>v.extra='field'),mutate(v=>v.notes={}),
  mutate(v=>v.source.files[0].path='../board.kicad_sch'),mutate(v=>v.source.files[0].path='C:/board.kicad_sch'),mutate(v=>v.source.files[0].path='board\\main.kicad_sch'),mutate(v=>v.source.files.push(v.source.files[0])),
  mutate(v=>v.source.files[0].sha256='x'.repeat(64)),mutate(v=>v.source.files[0].size=-1),
  mutate(v=>v.notes[0].anchor.repository='android/foreign'),mutate(v=>v.notes[0].anchor.ref='b'.repeat(40)),mutate(v=>v.notes[0].anchor.file='../main.kicad_sch'),mutate(v=>v.notes[0].anchor.file='not-imported.kicad_sch'),mutate(v=>v.notes[0].anchor.host='https://evil.example'),mutate(v=>v.notes[0].anchor.provider='github'),
  mutate(v=>v.notes[0].state='deleted'),mutate(v=>v.notes[0].severity='urgent'),mutate(v=>v.notes[0].anchor.position.x=1e7),mutate(v=>v.notes[0].anchor.area.width=-1),mutate(v=>v.notes.push(v.notes[0])),
  mutate(v=>v.notes[0].createdAt='not-a-date'),mutate(v=>v.notes[0].text=''),
  ' '.repeat(review.MAX_BYTES+1),JSON.stringify({text:'é'.repeat(review.MAX_BYTES/2)})
 ]){await assert.rejects(api.previewImport(bad));assert.deepEqual([...s.data],before);}
});
test('imports preserve unrelated notes and reject stale divergent states regardless of timestamps',async()=>{
 const original=storage(),destination=storage();seed(original,note());const text=await review.create(project(),original).exportText();seed(destination,note('retained','closed'));
 const api=review.create(project(),destination);api.applyImport(await api.previewImport(text),{confirmed:true});assert.deepEqual(JSON.parse(destination.getItem(key('phone','board/main.kicad_sch'))).map(n=>n.id),['retained','first']);
 for(const change of [n=>n.state='resolved',n=>n.text='Different review',n=>n.updatedAt='2026-11-05T00:00:00Z']){const saved=note();change(saved);const store=storage();seed(store,saved);await assert.rejects(review.create(project(),store).previewImport(text),/conflict/);assert.deepEqual(JSON.parse(store.getItem(key('phone',saved.anchor.file))),[saved]);}
});
test('preview detects intervening edits and project switches before commit',async()=>{
 const source=storage();seed(source,note());const text=await review.create(project(),source).exportText();const p=project(),destination=storage();let active=p;const api=review.create(p,destination,{getProject:()=>active}),plan=await api.previewImport(text);seed(destination,note('later'));assert.throws(()=>api.applyImport(plan,{confirmed:true}),/changed after preview/);assert.equal(JSON.parse(destination.getItem(key('phone','board/main.kicad_sch')))[0].id,'later');
 const next=await api.previewImport(text);active=project('new');assert.throws(()=>api.applyImport(next,{confirmed:true}),/active project changed/);await assert.rejects(api.exportText(),/active project changed/);
});
test('storage failure restores additions already written and keeps the sidecar reusable',async()=>{
 const source=storage();seed(source,note('schematic'));seed(source,note('pcb','skipped','board/main.kicad_pcb'));const text=await review.create(project(),source).exportText(),destination=storage();seed(destination,note('retained','closed','board/main.kicad_pcb'));
 const before=[...destination.data],set=destination.setItem;let writes=0;destination.setItem=(k,v)=>{if(++writes===2)throw Error('Quota');set(k,v);};const api=review.create(project(),destination),plan=await api.previewImport(text);assert.throws(()=>api.applyImport(plan,{confirmed:true}),/previous notes were restored/);assert.deepEqual([...destination.data],before);
 destination.setItem=set;assert.equal(api.applyImport(await api.previewImport(text),{confirmed:true}).added,2);
});
test('export rejects invalid existing scope and oversized notes; unreadable sources fail closed',async()=>{
 const s=storage();seed(s,{...note(),anchor:{...note().anchor,repository:'android/foreign'}});await assert.rejects(review.create(project(),s).exportText(),/another project/);
 const p=project();delete p.files[0].content;await assert.rejects(review.create(p,storage()).exportText(),/Source contents are unavailable/);
 const many=storage();many.setItem(key('phone','board/main.kicad_sch'),' '.repeat(review.MAX_BYTES+1));await assert.rejects(review.create(project(),many).exportText(),/budget/);
});
test('disk-backed cloud imports hash bounded appassets sources and match the same portable project',async()=>{
 const original=project(),payload=new Map();let index=0;
 const diskEntry=entry=>{const content=entry.content!==undefined?Buffer.from(entry.content):Buffer.from(entry.base64,'base64'),diskPath='/assets/viewer/downloaded/'+'b'.repeat(32)+'/'+index++;payload.set('https://appassets.androidplatform.net'+diskPath,content);return{path:entry.path,size:content.length,diskPath};};
 const disk=local.validate({id:'cloud',diskBacked:true,files:original.files.map(diskEntry),assets:original.assets.map(diskEntry)}),calls=[];
 const reader=review.createDiskReader(disk,{fetch:async(url,options)=>{calls.push({url,options});return new Response(payload.get(url));}}),store=storage();seed(store,note());const text=await review.create(original,store).exportText();
 const target=storage(),api=review.create(disk,target,{readSource:reader});assert.equal((await api.previewImport(text)).added,1);assert.equal(calls.length,4);assert.ok(calls.every(call=>call.url.startsWith('https://appassets.androidplatform.net/assets/viewer/downloaded/')&&call.options.redirect==='error'&&call.options.credentials==='omit'));assert.equal(api.applyImport(await api.previewImport(text),{confirmed:true}).added,1);assert.equal(await api.exportText(),text);
 await assert.rejects(reader({...disk.files[0]}),/not in the imported project/);
 const originalPath=disk.files[0].diskPath;disk.files[0].diskPath='https://foreign.example/board.kicad_sch';await assert.rejects(reader(disk.files[0]),/not in the imported project/);assert.throws(()=>review.createDiskReader(disk,{fetch:async()=>{throw Error('Must not fetch');}}),/Invalid/);disk.files[0].diskPath=originalPath;
 const redirected=review.createDiskReader(disk,{fetch:async()=>({ok:true,redirected:true,url:'https://foreign.example/'})});await assert.rejects(redirected(disk.files[0]),/redirected/);
 let cancelled=false;const oversized=review.createDiskReader(disk,{fetch:async()=>({ok:true,headers:{get:()=>null},body:{getReader:()=>({read:async()=>({done:false,value:new Uint8Array(disk.files[0].size+1)}),cancel:async()=>{cancelled=true;},releaseLock(){}})}})});await assert.rejects(oversized(disk.files[0]),/declared size/);assert.equal(cancelled,true);
 const truncated=review.createDiskReader(disk,{fetch:async()=>new Response('')});await assert.rejects(truncated(disk.files[0]),/size changed/);
 const temporary={...disk,temporary:true,expiresAt:Date.now()+10000,files:disk.files.map(entry=>({...entry,diskPath:entry.diskPath.replace('/downloaded/','/temporary-downloads/')})),assets:[]},temporaryReader=review.createDiskReader(temporary,{fetch:async()=>{throw Error('Expired source must not be fetched');}});temporary.expiresAt=Date.now()-1;await assert.rejects(temporaryReader(temporary.files[0]),/expired/);await assert.rejects(review.create(temporary,storage(),{readSource:temporaryReader}).exportText(),/expired/);
 disk.files[0].size=65*1024*1024;assert.throws(()=>review.createDiskReader(disk,{fetch:async()=>{}}),/oversized/);
});

function uiFixture({loading=false}={}){
 const fs=require('node:fs'),vm=require('node:vm'),events={},store=storage(),saved=[];
 const walk=node=>[node,...node.children.flatMap(walk)];
 const make=tag=>({tagName:tag.toUpperCase(),children:[],hidden:false,value:'',textContent:'',listeners:{},append(...nodes){this.children.push(...nodes);},setAttribute(){},addEventListener(name,fn){this.listeners[name]=fn;},showModal(){this.open=true;},close(){this.open=false;this.listeners.close?.();},click(){return this.onclick?.();}});
 const body=make('body'),picker=make('details');picker.id='projectPicker';body.append(picker);
 const document={body,readyState:loading?'loading':'complete',getElementById:id=>walk(body).find(node=>node.id===id),createElement:make,addEventListener:(name,fn)=>events[name]=fn};
 const context={document,localStorage:store,KiCadAndroidProject:project(),KiCadReviewComments:comments,crypto:globalThis.crypto,TextEncoder,Uint8Array,atob,Event:class{constructor(type){this.type=type;}},addEventListener:(name,fn)=>events[name]=fn,dispatchEvent:event=>events[event.type]?.(),AndroidKiCad:{exportText:(...args)=>saved.push(args)}};
 vm.runInNewContext(fs.readFileSync('android-app/web/local-review-file.js','utf8'),context);if(loading)events.DOMContentLoaded();
 const launch=document.getElementById('androidLocalReviewFile'),dialog=body.children.find(node=>node.tagName==='DIALOG'),section=dialog.children[1],button=text=>section.children.find(node=>node.textContent===text),input=section.children.find(node=>node.tagName==='INPUT'),status=section.children.at(-1);
 return{context,store,saved,events,launch,dialog,input,status,save:button('Export review JSON'),load:button('Import review JSON'),confirm:button('Import notes')};
}
test('UI installs once after DOM ready, previews bounded file imports and exports through Android save picker',async()=>{
 const f=uiFixture({loading:true});assert.equal(f.context.KiCadAndroidLocalReviewFile.install(),false);f.launch.click();assert.equal(f.dialog.open,true);
 const original=storage();seed(original,note());const text=await review.create(project(),original).exportText();f.input.files=[{size:Buffer.byteLength(text),text:async()=>text}];await f.input.onchange();assert.equal(f.confirm.hidden,false);assert.equal(f.store.data.size,0);assert.match(f.status.textContent,/1 new notes/);
 await f.confirm.click();assert.equal(f.confirm.hidden,true);assert.equal(JSON.parse(f.store.getItem(key('phone','board/main.kicad_sch')))[0].id,'first');await f.save.click();assert.equal(f.saved.length,1);assert.equal(f.saved[0][0],'kicad-local-review.json');assert.equal(f.saved[0][2],'application/json');assert.equal(f.saved[0][1],text);
 let read=false;f.input.files=[{size:review.MAX_BYTES+1,text:async()=>{read=true;return text;}}];await f.input.onchange();assert.equal(read,false);assert.match(f.status.textContent,/1 MiB/);
 f.context.KiCadAndroidProject={...project(),github:{}};f.events['kicad-project-opened']();assert.equal(f.launch.hidden,true);assert.equal(f.dialog.open,false);
});
