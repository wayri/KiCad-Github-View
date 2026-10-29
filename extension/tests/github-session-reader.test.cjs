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

test('HEAD discovery reuses embedded repository page data without any network request',async()=>{
 let calls=0;
 const api=create({location:{href:'https://github.com/owner/private'},parseDocument:()=>tree('',[{path:'design',contentType:'directory'}]),fetch:async()=>{calls++;throw Error('No fetch expected');}});
 assert.deepEqual(await api.read({repository:repo,ref:'HEAD',action:'resolve'}),{sha,items:[{path:'design',type:'directory'}]});
 assert.equal(calls,0);
 const stale=create({location:{href:'https://github.com/owner/private'},parseDocument:()=>tree(),parseHTML:()=>tree(),fetch:async(url)=>{calls++;return response('html',url);}});
 await assert.rejects(stale.read({repository:repo,ref:'b'.repeat(40),action:'resolve'}),/different revision/);
 assert.equal(calls,1);
});

test('session binary assets preserve exact bytes and reject unrelated redirect destinations',async()=>{
 const bytes=new Uint8Array([0,255,128,10]);
 const api=create({location:{href:'https://github.com/owner/private'},fetch:async()=>response(bytes,'https://raw.githubusercontent.com/owner/private/'+sha+'/model.step')});
 assert.deepEqual(await api.read({repository:repo,ref:sha,action:'asset',path:'model.step',limit:16}),{base64:'AP+ACg==',sha});
 const wrong=create({location:{href:'https://github.com/owner/private'},fetch:async()=>response(bytes,'https://evil.example/model.step')});
 await assert.rejects(wrong.read({repository:repo,ref:sha,action:'asset',path:'model.step',limit:16}),/download/);
});

test('HEAD never reuses a feature-branch tab as the default branch',async()=>{
 let calls=0;const feature=tree();feature[0].payload.codeViewTreeRoute.refInfo={name:'feature/board',currentOid:'b'.repeat(40)};
 const main=tree();main[0].payload.codeViewTreeRoute.refInfo={name:'main',currentOid:sha};
 const api=create({location:{href:'https://github.com/owner/private/tree/feature/board'},parseDocument:()=>feature,parseHTML:()=>main,fetch:async url=>{calls++;assert.equal(url,'https://github.com/owner/private');return response('html',url);}});
 assert.equal((await api.read({repository:repo,ref:'HEAD',action:'resolve'})).sha,sha);assert.equal(calls,1);
});

test('repository-root payload variants are read without treating root data as a subfolder',()=>{
 const route=tree()[0].payload.codeViewTreeRoute;
 for(const payload of [{codeViewRepoRoute:route},{refInfo:route.refInfo,tree:route.tree}]){
  assert.equal(treeData([{payload}],'HEAD','').sha,sha);
  assert.throws(()=>treeData([{payload}],sha,'design'),/readable/);
 }
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
test('session Stop aborts its raw fetch and cancels a stalled response body',async()=>{
 const controller=new AbortController();let cancelled=0,transportSignal;
 const api=create({location:{href:'https://github.com/owner/private'},signal:controller.signal,fetch:async(url,init)=>{transportSignal=init.signal;const r=new Response(new ReadableStream({start(){},cancel(){cancelled++;}}));Object.defineProperty(r,'url',{value:'https://raw.githubusercontent.com/owner/private/'+sha+'/board.kicad_pcb'});return r;}});
 const pending=api.read({repository:repo,ref:sha,action:'file',path:'board.kicad_pcb',limit:1024});await new Promise(r=>setImmediate(r));controller.abort();await assert.rejects(pending,/cancelled/);assert.equal(cancelled,1);assert.equal(transportSignal.aborted,true);
});
