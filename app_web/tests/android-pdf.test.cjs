const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const local=require('../../android-app/web/local-project.js');
globalThis.KiCadReviewComments=require('../../extension/review-comments.js');
const storage={getItem:()=>null,setItem(){throw Error('Binary read must not write.');}};
test('standalone imported PDF preserves binary bytes, encoding and immutable source scope',async()=>{
 const bytes=Buffer.from([37,80,68,70,45,49,46,55,10,0,255,128]),base64=bytes.toString('base64');
 const project=local.validate({id:'pdf',files:[],assets:[{path:'reports/layout.PDF',base64}]}),api=local.transport(project,storage);
 const response=await api.send({type:'pdf-file',repository:api.scope,ref:api.ref,file:'reports/layout.PDF'});
 assert.equal(response.ok,true);assert.equal(response.result.encoding,'base64');assert.deepEqual(Buffer.from(response.result.base64,'base64'),bytes);
 assert.equal((await api.send({type:'pdf-file',file:'reports/layout.PDF',ref:'b'.repeat(40)})).ok,false);
 assert.equal((await api.send({type:'pdf-file',file:'../layout.PDF'})).ok,false);
 assert.equal((await api.send({type:'repo-asset',file:'reports/layout.PDF'})).ok,false);
 assert.deepEqual((await api.send({type:'repo-model-index'})).result.paths,[]);
 assert.equal((await api.send({type:'project-file',file:'reports/layout.PDF'})).ok,false);
 assert.equal(local.pdfFile('reports/layout.PDF'),true);assert.equal(local.analysisFile('reports/layout.PDF'),false);
});
test('PDF manifests enforce binary and 32 MiB limits and disk transport loads only requested bytes',async()=>{
 const diskPath='/assets/viewer/downloaded/'+'a'.repeat(32)+'/0',entry={path:'report.pdf',size:12,diskPath};
 assert.throws(()=>local.validate({files:[],assets:[{path:'report.pdf',base64:'not-binary'}]}));
 assert.throws(()=>local.validate({diskBacked:true,files:[],assets:[{...entry,size:32*1024*1024+1}]}),/32 MiB/);
 const project=local.validate({diskBacked:true,files:[],assets:[entry]});let calls=0;const original=globalThis.fetch;
 globalThis.fetch=async path=>{calls++;assert.equal(path,diskPath);return{ok:true,arrayBuffer:async()=>new Uint8Array([0,255,128]).buffer};};
 try{const api=local.transport(project,storage);assert.equal(calls,0);const response=await api.send({type:'pdf-file',file:entry.path});assert.equal(response.ok,true);assert.equal(response.result.encoding,'base64');assert.deepEqual([...Buffer.from(response.result.base64,'base64')],[0,255,128]);assert.equal(calls,1);assert.equal((await api.send({type:'pdf-file',file:'missing.pdf'})).ok,false);assert.equal(calls,1);}finally{globalThis.fetch=original;}
});
test('standalone PDF project and navigation open the packaged PDF tool',()=>{
 const nodes=new Map(),opened=[];const get=id=>{if(!nodes.has(id))nodes.set(id,{value:'',hidden:true,children:[],addEventListener(n,f){this[n]=f;},removeAttribute(n){delete this[n];},replaceChildren(){this.children=[];this.value='';},append(n){this.children.push(n);if(!this.value)this.value=n.value;}});return nodes.get(id);};
 const context={URLSearchParams,Event,KiCadAndroidLocal:local,document:{getElementById:get,createElement:()=>({})},dispatchEvent(){}};context.window=context;
 vm.runInNewContext(fs.readFileSync(require.resolve('../../android-app/web/index.js'),'utf8'),context);
 context.KiCadAndroid.openTools=(...args)=>opened.push(args);
 context.KiCadAndroid.receiveProject({id:'pdf',files:[],assets:[{path:'manual.pdf',base64:'JVBERg=='}]});
 assert.deepEqual(opened,[['pdf-viewer.html','manual.pdf']]);context.KiCadAndroid.openDrawing('manual.pdf');assert.equal(opened.length,2);context.KiCadAndroid.openDrawing('missing.pdf');assert.equal(opened.length,2);
});

test('PDF-only GitLab import preserves provider and server scope',()=>{
 const remote={provider:'gitlab',host:'https://gitlab.example.com',repository:'team/repo',sha:'a'.repeat(40)};
 const project=local.validate({files:[],assets:[{path:'r.pdf',base64:'JVBERg=='}],remote});assert.deepEqual(project.remote,remote);
});
