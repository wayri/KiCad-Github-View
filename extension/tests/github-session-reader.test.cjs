const test=require('node:test'),assert=require('node:assert/strict');
const {create,treeData}=require('../github-session-reader.js');
const sha='a'.repeat(40),repo='owner/private';
const tree=(path='',items=[])=>[{payload:{codeViewTreeRoute:{path:path||'/',refInfo:{name:'feature/board',currentOid:sha},tree:{items,totalCount:items.length}}}}];
const response=(text,url,type='text/plain')=>{const r=new Response(text,{headers:{'content-type':type}});Object.defineProperty(r,'url',{value:url});return r;};
test('session reads stay in the repository tab, pin branch revisions and strip page metadata',async()=>{
 const calls=[],api=create({location:{href:'https://github.com/owner/private/blob/feature/board/main.kicad_pcb'},parseHTML:()=>tree(),fetch:async(url,init)=>{calls.push({url,init});return response('html',url);}});
 const result=await api.read({repository:repo,ref:'feature/board',action:'resolve'});
 assert.deepEqual(result,{sha,items:[]});assert.match(calls[0].url,/tree\/feature%2Fboard$/);assert.equal(calls[0].init.credentials,'same-origin');assert.equal(calls[0].init.redirect,'error');assert.equal(calls[0].init.headers,undefined);
 await assert.rejects(api.read({repository:'someone/else',ref:sha,action:'resolve'}),/tab/);
 await assert.rejects(api.read({repository:repo,ref:'main',action:'file',path:'main.kicad_pcb'}),/pinned/);
});
test('directory parsing rejects stale commits, incomplete listings and traversal, preserving symlink identity for exclusion',()=>{
 assert.throws(()=>treeData(tree(),'b'.repeat(40),''),/different revision/);
 const incomplete=tree();incomplete[0].payload.codeViewTreeRoute.tree.totalCount=1;assert.throws(()=>treeData(incomplete,sha,''),/incomplete/);
 assert.throws(()=>treeData(tree('',[{path:'../secret',contentType:'file'}]),sha,''),/unsafe/);
 const result=treeData(tree('',[{path:'link',contentType:'symlink'}]),sha,'');assert.equal(result.items[0].type,'symlink');
});
test('raw download accepts only the exact pinned source and never returns signed URLs',async()=>{
 let init;
 const api=create({location:{href:'https://github.com/owner/private'},fetch:async(url,options)=>{init=options;return response('(kicad_pcb)','https://raw.githubusercontent.com/owner/private/'+sha+'/board.kicad_pcb?token=temporary');}});
 assert.deepEqual(await api.read({repository:repo,ref:sha,action:'file',path:'board.kicad_pcb',limit:1024}),{content:'(kicad_pcb)',sha});assert.equal(init.credentials,'same-origin');assert.equal(init.headers,undefined);
 for(const path of ['../secret','/secret','a\\secret'])await assert.rejects(api.read({repository:repo,ref:sha,action:'file',path}),/read|file/);
});
test('login pages, unrelated redirects, invalid UTF8 and oversized bodies fail visibly',async()=>{
 for(const [body,url,type] of [['login','https://github.com/login','text/html'],['wrong','https://evil.test/file','text/plain'],['large data','https://raw.githubusercontent.com/owner/private/'+sha+'/board.kicad_pcb','text/plain']]){
  const api=create({location:{href:'https://github.com/owner/private'},fetch:async()=>response(body,url,type)});
  await assert.rejects(api.read({repository:repo,ref:sha,action:'file',path:'board.kicad_pcb',limit:2}),/download|size/);
 }
 const api=create({location:{href:'https://github.com/owner/private'},fetch:async()=>response(new Uint8Array([255]),'https://raw.githubusercontent.com/owner/private/'+sha+'/board.kicad_pcb')});
 await assert.rejects(api.read({repository:repo,ref:sha,action:'file',path:'board.kicad_pcb',limit:1024}),/encoded data/);
});
