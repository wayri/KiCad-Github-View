const test=require('node:test');
const assert=require('node:assert/strict');
const validator=require('../review-comments.js');
const {createStore}=require('../review-file-store.js');
const note=()=>validator.validateComment({id:'one',text:'Check clearance',createdAt:'2026-10-04T00:00:00.000Z',severity:'major',state:'open',tags:['assembly'],anchor:{repository:'wayri/demo',ref:'main',file:'board.kicad_pcb',position:{x:4,y:9}}});
function fixture(initial=validator.serializeSidecar([])){
 let contents=initial,selected=null,aborted=false,permission='granted',stageHook=()=>{};
 const handle={kind:'file',name:'.kicad-review.json',queryPermission:async()=>permission,getFile:async()=>({size:contents.length,text:async()=>contents}),createWritable:async()=>{let staged;return{write:async value=>{staged=value;stageHook();},close:async()=>{contents=staged;},abort:async()=>{aborted=true;}};}};
 const store=createStore({validator,getHandle:async()=>selected,setHandle:async h=>{selected=h;},lock:async fn=>fn()});
 return{store,handle,get contents(){return contents;},get aborted(){return aborted;},external:value=>{contents=value;},stage:fn=>{stageHook=fn;},deny:()=>{permission='denied';}};
}
test('Git sidecar preserves anchors, metadata and remote thread links without credentials',async()=>{
 const f=fixture();await f.store.connect(f.handle);const value={...note(),token:'secret',remoteRefs:[{kind:'issue',repository:'wayri/demo',number:3,url:'https://github.com/wayri/demo/issues/3#issuecomment-45',publishedAt:'2026-10-04T00:00:00.000Z'}]};
 await f.store.save(value);assert.deepEqual(await f.store.read(),[validator.validateComment(value)]);assert.ok(!f.contents.includes('secret'));
 assert.deepEqual(await f.store.remove(value.anchor,value.id),{deleted:true});assert.deepEqual(await f.store.read(),[]);
});
test('invalid existing files are never overwritten or connected',async()=>{
 const f=fixture('{"schemaVersion":2,"annotations":[]}');await assert.rejects(f.store.connect(f.handle));assert.equal(f.contents,'{"schemaVersion":2,"annotations":[]}');assert.equal((await f.store.status()).connected,false);
});
test('external change during staging aborts and preserves the external file',async()=>{
 const f=fixture();await f.store.connect(f.handle);const external=validator.serializeSidecar([{...note(),id:'external'}]);f.stage(()=>f.external(external));await assert.rejects(f.store.save(note()),/externally/);assert.equal(f.contents,external);assert.equal(f.aborted,true);
});
test('stale editor timestamp cannot replace a newer note',async()=>{
 const f=fixture();await f.store.connect(f.handle);await f.store.save({...note(),updatedAt:'2026-10-04T01:00:00.000Z'});const before=f.contents;await assert.rejects(f.store.save(note(),note().updatedAt),/changed/);assert.equal(f.contents,before);
});
test('permission loss fails closed and empty selected files initialize',async()=>{
 const f=fixture('');await f.store.connect(f.handle);assert.deepEqual(await f.store.read(),[]);f.deny();await assert.rejects(f.store.save(note()),/permission/);assert.deepEqual(validator.parseSidecar(f.contents),[]);
});
test('sidecar validates duplicate scopes, metadata and unsafe remote links',()=>{
 assert.throws(()=>validator.serializeSidecar([note(),note()]),/Duplicate/);
 assert.throws(()=>validator.validateComment({...note(),state:'closed'}));
 assert.throws(()=>validator.validateComment({...note(),remoteRefs:[{kind:'issue',repository:'wayri/demo',number:3,url:'https://evil.example/issues/3',publishedAt:note().createdAt}]}));
 const normalized=validator.validateComment({...note(),tags:[' assembly ','assembly','review']});assert.deepEqual(normalized.tags,['assembly','review']);assert.deepEqual(validator.fromMarkdown(validator.toMarkdown(normalized)),[normalized]);
});
