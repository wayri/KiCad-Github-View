const test=require('node:test'),assert=require('node:assert/strict');
const comments=require('../review-comments.js'),{createStore}=require('../review-file-store.js');
const note=(url='https://github.com/upstream/board/pull/12#issuecomment-45')=>({id:'review',text:'Review layout',createdAt:'2026-10-28T00:00:00Z',anchor:{repository:'fork/board',ref:'a'.repeat(40),file:'board.kicad_pcb'},remoteRefs:[{kind:'pull-request',repository:'upstream/board',number:12,url,publishedAt:'2026-10-28T00:00:00Z'}]});
test('GitHub PR anchors round-trip safely and preserve original upstream provenance',()=>{
 for(const suffix of ['','#issuecomment-45','#discussion_r123','#pullrequestreview-12']){const value=comments.validateComment(note('https://github.com/upstream/board/pull/12'+suffix));assert.deepEqual(comments.parseSidecar(comments.serializeSidecar([value])),[value]);assert.equal(comments.commentType(value),'issue');}
 for(const url of ['https://evil.test/upstream/board/pull/12','https://github.com/upstream/other/pull/12','https://github.com/upstream/board/issues/12','https://github.com/upstream/board/pull/13','https://github.com/upstream/board/pull/12?token=x','https://user@github.com/upstream/board/pull/12','https://github.com/upstream/board/pull/12#discussioncomment-1'])assert.throws(()=>comments.validateComment(note(url)),/reference URL/);
});
test('complete PR cache refresh supports upstream thread on a fork-scoped drawing',async()=>{
 let text=comments.serializeSidecar([]),handle;const file={kind:'file',name:'.kicad-review.json',queryPermission:async()=>'granted',getFile:async()=>({size:text.length,text:async()=>text}),createWritable:async()=>({write:async value=>{text=value;},close:async()=>{}})};
 // Use a staged writer to match the File System Access API commit contract.
 file.createWritable=async()=>{let staged;return{write:async value=>{staged=value;},close:async()=>{text=staged;},abort:async()=>{}};};
 const store=createStore({getHandle:async()=>handle,setHandle:async value=>{handle=value;},lock:async fn=>fn(),validator:comments});await store.connect(file);
 await store.sync(note().anchor,[note()],{complete:true,sourceUrl:'https://github.com/upstream/board/pull/12'});assert.equal((await store.readSnapshot()).synced.length,1);
 await store.sync(note().anchor,[],{complete:true,sourceUrl:'https://github.com/upstream/board/pull/12'});assert.deepEqual((await store.readSnapshot()).synced,[]);
});
