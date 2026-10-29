const test=require('node:test'),assert=require('node:assert/strict');
const model=require('../draftsman-model.js'),repository=require('../draftsman-repository.js');
const sha='a'.repeat(40),tree='b'.repeat(40),blob='c'.repeat(40),newTree='d'.repeat(40),commit='e'.repeat(40);
function input(provider='github'){const host=provider==='github'?'https://github.com':'https://gitlab.example',repo=provider==='github'?'wayri/board':'group/sub/board';return{confirmed:true,provider,host,repository:repo,ref:sha,branch:'draftsman/fabrication-1',path:'docs/draftsman/fabrication.kivi-draft.json',document:model.create({provider,host,repository:repo,ref:sha,hashes:{'board.kicad_pcb':'f'.repeat(64)}},'Board fabrication')};}
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
function fixture(provider='github',hooks={}){const calls=[];let auth='Bearer private-token',checks=0,headerCalls=0;const value=input(provider);const api=repository.create({model,headers:async(...args)=>{headerCalls++;await hooks.onHeaders?.(headerCalls,args);return {Authorization:auth};},assertWrites:async()=>{checks++;await hooks.onPolicy?.(checks);},fetch:async(url,options)=>{const body=options.body?JSON.parse(options.body):undefined;calls.push({url,options,body});const custom=await hooks.response?.(calls.length,url,options,body);if(custom)return custom;
 if(provider==='github'){if(url.includes('/git/ref/heads/'))return reply({},404);if(url.endsWith('/git/commits/'+sha))return reply({sha,tree:{sha:tree}});if(url.endsWith('/git/blobs'))return reply({sha:blob});if(url.endsWith('/git/trees'))return reply({sha:newTree});if(url.endsWith('/git/commits'))return reply({sha:commit});if(url.endsWith('/git/refs'))return reply({ref:'refs/heads/'+value.branch,object:{sha:commit}});}
 else{if(url.includes('/repository/branches/'))return reply({},404);if(url.endsWith('/repository/commits/'+sha))return reply({id:sha});if(url.endsWith('/repository/branches'))return reply({name:value.branch,commit:{id:sha}});if(url.endsWith('/repository/commits'))return reply({id:commit,parent_ids:[sha]});}
 throw Error('Unexpected mock request '+url);
 }});return{value,api,calls,setAuth:value=>{auth=value;},get checks(){return checks;},get headerCalls(){return headerCalls;}};}
test('GitHub saves a document on a new branch from exactly the selected source SHA without updating any ref',async()=>{
 const f=fixture(),result=await f.api.save(f.value);assert.equal(result.sha,commit);assert.equal(result.branch,f.value.branch);assert.match(result.url,new RegExp('/blob/'+commit+'/docs/draftsman/'));assert.equal(f.calls.length,6);assert.ok(f.calls.every(c=>c.url.startsWith('https://api.github.com/repos/wayri/board/')));assert.ok(f.calls.every(c=>c.options.credentials==='omit'&&c.options.redirect==='error'&&c.options.cache==='no-store'));assert.ok(f.calls.every(c=>c.options.method!=='PATCH'&&c.options.method!=='PUT'&&c.options.method!=='DELETE'));
 assert.deepEqual(f.calls[3].body,{base_tree:tree,tree:[{path:f.value.path,mode:'100644',type:'blob',sha:blob}]});assert.deepEqual(f.calls[4].body.parents,[sha]);assert.deepEqual(f.calls[5].body,{ref:'refs/heads/'+f.value.branch,sha:commit});assert.equal(model.validate(f.calls[2].body.content).source.ref,sha);assert.ok(!JSON.stringify(f.calls[2].body).includes('private-token'));
});
test('GitLab sends a create-only document action pinned to the exact selected commit and configured host',async()=>{
 const f=fixture('gitlab'),result=await f.api.save(f.value);assert.equal(result.sha,commit);assert.equal(f.calls.length,4);assert.ok(f.calls.every(c=>c.url.startsWith('https://gitlab.example/api/v4/projects/group%2Fsub%2Fboard/')));const body=f.calls.at(-1).body;assert.equal(body.branch,f.value.branch);assert.deepEqual(f.calls[2].body,{branch:f.value.branch,ref:sha});assert.equal(body.start_sha,undefined);assert.deepEqual(body.actions.map(v=>[v.action,v.file_path]),[['create',f.value.path]]);assert.equal(body.force,undefined);assert.equal(model.validate(body.actions[0].content).source.ref,sha);
});
test('malformed scope, path, host, document or missing confirmation fails before credentials and network',async()=>{
 for(const mutate of [v=>v.confirmed=false,v=>v.provider='local',v=>v.ref='main',v=>v.ref='a'.repeat(39),v=>v.branch='main',v=>v.branch='draftsman/../main',v=>v.path='../board.kicad_pcb',v=>v.path='docs/draftsman/a.svg',v=>v.path='docs/draftsman/%2e%2e.kivi-draft.json',v=>v.repository='../board',v=>v.document.source.ref='other',v=>v.document.source.repository='someone/else',v=>v.document.source.host='https://evil.example',v=>v.document.source.token='secret']){const f=fixture();mutate(f.value);await assert.rejects(f.api.save(f.value));assert.equal(f.calls.length,0);assert.equal(f.headerCalls,0);}
 for(const host of ['http://gitlab.example','https://user:pass@gitlab.example','https://gitlab.example/path','https://gitlab.example?token=x']){const f=fixture('gitlab');f.value.host=host;await assert.rejects(f.api.save(f.value));assert.equal(f.calls.length,0);assert.equal(f.headerCalls,0);}
});
test('existing branches and unverifiable source commits never reach repository writes',async()=>{
 for(const provider of ['github','gitlab']){const f=fixture(provider,{response:async index=>index===1?reply({name:'exists'}):undefined});await assert.rejects(f.api.save(f.value),/already exists/);assert.equal(f.calls.length,1);assert.ok(f.calls.every(c=>c.options.method==='GET'));}
 const f=fixture('github',{response:async index=>index===2?reply({sha:'f'.repeat(40),tree:{sha:tree}}):undefined});await assert.rejects(f.api.save(f.value),/verified/);assert.equal(f.calls.length,2);
});
test('policy and account changes stop subsequent writes and release the in-flight reservation',async()=>{
 const blocked=fixture('github',{onPolicy:async()=>{throw Error('Managed policy denies writes');}});await assert.rejects(blocked.api.save(blocked.value),/policy/);assert.equal(blocked.calls.length,0);await assert.rejects(blocked.api.save(blocked.value),/policy/);
 let f;f=fixture('github',{onHeaders:async count=>{if(count===4)f.setAuth('Bearer other-account');}});await assert.rejects(f.api.save(f.value),/account changed/);assert.equal(f.calls.length,2);assert.ok(f.calls.every(c=>c.options.method==='GET'));
 const disconnected=fixture();disconnected.setAuth('');await assert.rejects(disconnected.api.save(disconnected.value),/Connect/);assert.equal(disconnected.calls.length,0);
});
test('concurrent saves are rejected before a second authorization or mutation can begin',async()=>{
 let release,entered;const gate=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});const f=fixture('github',{onHeaders:async count=>{if(count===1){entered();await gate;}}});const first=f.api.save(f.value);await started;await assert.rejects(f.api.save({...f.value,branch:'draftsman/other'}),/already running/);assert.equal(f.headerCalls,1);release();await first;assert.equal(f.calls.length,6);
});
test('oversized response streams are cancelled and HTTP errors never expose provider bodies or credentials',async()=>{
 let cancelled=0;const oversized=fixture('github',{response:async index=>index===2?new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(1024*1024));controller.enqueue(new Uint8Array(1024*1024));controller.enqueue(new Uint8Array(1));},cancel(){cancelled++;}})):undefined});await assert.rejects(oversized.api.save(oversized.value),/safety limit/);assert.equal(cancelled,1);assert.equal(oversized.calls.length,2);
 for(const status of [401,403,409,429,500]){const f=fixture('github',{response:async()=>reply({message:'private-token secret project text'},status)});await assert.rejects(f.api.save(f.value),error=>/HTTP/.test(error.message)&&!error.message.includes('private-token')&&!error.message.includes('secret project'));assert.equal(f.calls.length,1);}
 const invalid=fixture('github',{response:async index=>index===2?new Response('not JSON'):undefined});await assert.rejects(invalid.api.save(invalid.value),/Invalid repository response/);
});
test('invalid object confirmations stop the operation without trying to update or force a branch',async()=>{
 const f=fixture('github',{response:async index=>index===6?reply({ref:'refs/heads/main',object:{sha:commit}}):undefined});await assert.rejects(f.api.save(f.value),/did not confirm/);assert.equal(f.calls.length,6);assert.ok(f.calls.every(c=>c.options.method!=='PATCH'));const malformed=fixture('github',{response:async index=>index===3?reply({sha:'malformed'}):undefined});await assert.rejects(malformed.api.save(malformed.value),/blob/);assert.equal(malformed.calls.length,3);
});


test('GitLab branch-create conflicts never reach a commit, and partial saves or changed parents are explicit',async()=>{
 const conflict=fixture('gitlab',{response:async index=>index===3?reply({message:'Branch already exists'},400):undefined});await assert.rejects(conflict.api.save(conflict.value),/HTTP 400/);assert.equal(conflict.calls.length,3);assert.equal(conflict.calls.filter(c=>c.url.endsWith('/repository/commits')).length,0);
 const partial=fixture('gitlab',{response:async index=>index===4?reply({message:'write denied'},403):undefined});await assert.rejects(partial.api.save(partial.value),/may exist without all Draftsman outputs/);assert.equal(partial.calls.length,4);
 const moved=fixture('gitlab',{response:async index=>index===4?reply({id:commit,parent_ids:['f'.repeat(40)]}):undefined});await assert.rejects(moved.api.save(moved.value),/did not confirm/);assert.equal(moved.calls.length,4);
});
function renderedInput(f,sheets=1){
 const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7wAAAABJRU5ErkJggg==';
 f.value.rendered={assets:{},pages:[]};
 for(let i=0;i<sheets;i++){if(i)f.value.document.pages.push({id:'sheet-'+(i+1),title:'Sheet '+(i+1),items:[]});const id='view-'+(i+1);f.value.document.pages[i].items=[{id,type:'view',file:'board.kicad_pcb',side:'top',layers:['Edge.Cuts'],x:30,y:30,width:100,height:80,rotation:0,scale:'fit',caption:'Top assembly'}];f.value.rendered.assets[id]={image:png,bounds:{x:0,y:0,width:50,height:30},warnings:[]};f.value.rendered.pages.push({base64:Buffer.from([255,216,255,217]).toString('base64'),width:200,height:100});}
 return f;
}
test('GitHub renders safe SVGs and one multipage PDF into the same new branch with derived artifact paths',async()=>{
 const f=renderedInput(fixture(),2);f.value.document.title='<script>not executable</script>';const result=await f.api.save(f.value),blobs=f.calls.filter(c=>c.url.endsWith('/git/blobs')),tree=f.calls.find(c=>c.url.endsWith('/git/trees')).body.tree;
 assert.equal(blobs.length,4);assert.deepEqual(result.paths,['docs/draftsman/fabrication.kivi-draft.json','docs/draftsman/fabrication-sheet-1.svg','docs/draftsman/fabrication-sheet-2.svg','docs/draftsman/fabrication.pdf']);assert.deepEqual(tree.map(row=>row.path),result.paths);assert.ok(tree.every(row=>row.mode==='100644'&&row.type==='blob'));
 assert.equal(model.validate(blobs[0].body.content).pages.length,2);for(const entry of blobs.slice(1,3)){assert.equal(entry.body.encoding,'utf-8');assert.ok(entry.body.content.startsWith('<svg '));assert.ok(!entry.body.content.includes('<script>'));assert.match(entry.body.content,/&lt;script&gt;/);}
 assert.equal(blobs[3].body.encoding,'base64');const pdf=Buffer.from(blobs[3].body.content,'base64').toString('latin1');assert.ok(pdf.startsWith('%PDF-1.4'));assert.match(pdf,/\/Count 2/);assert.equal(f.calls.filter(c=>c.url.endsWith('/git/refs')).length,1);assert.equal(f.calls.filter(c=>c.url.endsWith('/git/commits')).length,1);
});
test('GitLab creates JSON, SVG and generated PDF together in a single create-only commit',async()=>{
 const f=renderedInput(fixture('gitlab'));const result=await f.api.save(f.value),body=f.calls.at(-1).body;assert.equal(f.calls.length,4);assert.deepEqual(body.actions.map(action=>action.file_path),result.paths);assert.deepEqual(body.actions.map(action=>action.encoding),['text','text','base64']);assert.ok(body.actions.every(action=>action.action==='create'));assert.ok(Buffer.from(body.actions[2].content,'base64').subarray(0,8).toString().startsWith('%PDF-1.4'));assert.equal(body.branch,f.value.branch);
});
test('rendered artifact injection, extra assets, invalid base64 and invalid JPEG geometry fail before authorization or network',async()=>{
 const changes=[v=>v.rendered.path='../../board.kicad_pcb',v=>v.rendered.svg='<script/>',v=>v.rendered.pdf='raw bytes',v=>v.rendered.assets.extra={...v.rendered.assets['view-1']},v=>delete v.rendered.assets['view-1'],v=>v.rendered.assets['view-1'].script='fetch(secret)',v=>v.rendered.assets['view-1'].image='https://evil.example/s.svg',v=>v.rendered.assets['view-1'].image='data:image/svg+xml;base64,PHNjcmlwdC8+',v=>v.rendered.assets['view-1'].bounds={x:0,y:0,width:NaN,height:30},v=>v.rendered.pages=[],v=>v.rendered.pages.push(v.rendered.pages[0]),v=>v.rendered.pages[0].path='docs/evil.js',v=>v.rendered.pages[0].base64=' /9j/2Q==',v=>v.rendered.pages[0].base64='/9j/2Q==\n',v=>v.rendered.pages[0].base64='/9j/2R==',v=>v.rendered.pages[0].base64='data:image/jpeg;base64,/9j/2Q==',v=>v.rendered.pages[0].base64='PHN2Zy8+',v=>v.rendered.pages[0].width=4097,v=>v.rendered.pages[0].height=0,v=>v.rendered.pages[0].width=3.2];
 for(const change of changes){const f=renderedInput(fixture());change(f.value);await assert.rejects(f.api.save(f.value));assert.equal(f.calls.length,0);assert.equal(f.headerCalls,0);}
});
test('rendered payload and cumulative output budgets are checked before any network activity',async()=>{
 const payload=renderedInput(fixture());payload.value.rendered.assets['view-1'].image='data:image/png;base64,iVBORw0KGgo'+'A'.repeat(16*1024*1024);await assert.rejects(payload.api.save(payload.value),/16 MiB/);assert.equal(payload.calls.length,0);assert.equal(payload.headerCalls,0);
 const cumulative=renderedInput(fixture(),3);
 for(const [i,asset]of Object.values(cumulative.value.rendered.assets).entries())asset.image='data:image/png;base64,iVBORw0KGgo'+'A'.repeat((i===0?6:4)*1024*1024);
 for(const page of cumulative.value.document.pages)for(let i=0;i<100;i++)page.items.push({id:'note-'+i,type:'note',x:10,y:12,width:260,text:'x'.repeat(4000)});
 // Input stays below 16 MiB; generated sheet text plus editable JSON pushes total output above it.
 await assert.rejects(cumulative.api.save(cumulative.value),/16 MiB/);assert.equal(cumulative.calls.length,0);assert.equal(cumulative.headerCalls,0);
 const jpeg=renderedInput(fixture()),bytes=Buffer.alloc(8*1024*1024+1);bytes[0]=255;bytes[1]=216;bytes[bytes.length-2]=255;bytes[bytes.length-1]=217;jpeg.value.rendered.pages[0].base64=bytes.toString('base64');await assert.rejects(jpeg.api.save(jpeg.value),/8|oversized/);assert.equal(jpeg.calls.length,0);
});


test('large valid base64 is scanned without recursive-regex stack growth and still has fixed PDF structure',async()=>{
 const f=renderedInput(fixture()),jpeg=Buffer.alloc(1024*1024);jpeg[0]=255;jpeg[1]=216;jpeg[jpeg.length-2]=255;jpeg[jpeg.length-1]=217;f.value.rendered.pages[0].base64=jpeg.toString('base64');const result=await f.api.save(f.value);assert.equal(result.paths.length,3);const pdf=Buffer.from(f.calls.filter(call=>call.url.endsWith('/git/blobs')).at(-1).body.content,'base64');assert.ok(pdf.subarray(0,8).toString().startsWith('%PDF-1.4'));assert.ok(pdf.length>jpeg.length);
});
