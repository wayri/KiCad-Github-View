const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {meshes,Client,bundledWorker}=require('../step-decoder.js');
const valid=()=>({success:true,meshes:[{attributes:{position:{array:[0,0,0,1,0,0,0,1,0]}},index:{array:[0,1,2]},color:[1,0,0]}]});
test('STEP mesh contract rejects malformed and excessive tessellation',()=>{
 assert.equal(meshes(valid())[0].positions.constructor,Float32Array);
 for(const change of [r=>r.success=false,r=>r.meshes[0].index.array=[0,1,3],r=>r.meshes[0].attributes.position.array[0]=Infinity,r=>r.meshes[0].attributes.normal={array:[1]},r=>r.meshes[0].index.array=Array(1500003).fill(0)]){const r=valid();change(r);assert.throws(()=>meshes(r),/STEP/);}
});
test('actual pinned OCCT STEP decoder preserves millimetre cube dimensions and closed faces',async()=>{
 const occt=await require('../vendor/occt/occt-import-js.js')();
 const output=meshes(occt.ReadStepFile(fs.readFileSync(require.resolve('./fixtures/step/cube.stp')),{linearUnit:'millimeter',linearDeflectionType:'absolute_value',linearDeflection:.05,angularDeflection:.5}));
 assert.equal(output.length,1);const m=output[0];assert.equal(m.index.length/3,12);
 const bounds=[0,1,2].map(axis=>{const a=Array.from(m.positions).filter((_,i)=>i%3===axis);return[Math.min(...a),Math.max(...a)];});
 assert.deepEqual(bounds,[[0,300],[0,300],[0,300]]);
});
test('decoder serializes work, reuses its worker and terminates pending conversions on close',async()=>{
 const created=[];
 class Worker{constructor(url){this.url=url;created.push(this);}postMessage(data){this.messages||=[];this.messages.push(data);setImmediate(()=>this.onmessage?.({data:{ok:true,meshes:[]}}));}terminate(){this.closed=true;}}
 const client=new Client('step-worker.js',Worker);await Promise.all([client.decode(new Uint8Array([1])),client.decode(new Uint8Array([2]))]);assert.equal(created.length,1);assert.equal(created[0].messages.length,2);
 created[0].postMessage=()=>{};const pending=client.decode(new Uint8Array([3]));await new Promise(setImmediate);client.dispose();await assert.rejects(pending,/closed/);assert.equal(created[0].closed,true);await assert.rejects(client.decode(new Uint8Array([4])),/closed/);
});
test('empty and over-limit STEP data never starts a worker',async()=>{let calls=0;const client=new Client('step-worker.js',class{constructor(){calls++;}});await assert.rejects(client.decode(new Uint8Array()),/empty/);await assert.rejects(client.decode(new Uint8Array(8*1024*1024+1)),/8 MiB/);assert.equal(calls,0);});


test('blob worker loader reads only its supplied packaged script and revokes its temporary URL',async()=>{
 const events=[];const host={fetch:async(url,options)=>{events.push({url,options});return{ok:true,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer};},Blob:class{constructor(bytes,options){this.bytes=bytes;this.type=options.type;}},URL:{createObjectURL:blob=>{assert.equal(blob.type,'text/javascript');return'blob:owned-worker';},revokeObjectURL:url=>events.push({revoked:url})}};
 const controller=new AbortController();const worker=await bundledWorker('https://packaged.local/step-worker-vscode.js',class{constructor(url){this.url=url;}},host,controller.signal);
 assert.equal(worker.url,'blob:owned-worker');assert.equal(events[0].options.credentials,'omit');assert.equal(events[0].options.redirect,'error');assert.equal(events[0].options.signal,controller.signal);assert.equal(events[1].revoked,'blob:owned-worker');
 await assert.rejects(bundledWorker('https://packaged.local/worker',class{constructor(){throw Error('blocked');}},host),/blocked/);assert.equal(events.at(-1).revoked,'blob:owned-worker');
});

test('oversized or missing packaged worker bytes do not create a blob or worker',async()=>{
 let creations=0;const host={fetch:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(256*1024+1)}),URL:{createObjectURL(){creations++;}},Blob:class{}};
 await assert.rejects(bundledWorker('https://packaged.local/worker',class{},host),/256 KiB/);assert.equal(creations,0);host.fetch=async()=>({ok:false});await assert.rejects(bundledWorker('https://packaged.local/worker',class{},host),/could not be read/);
});


test('real STEP bindings operate when dynamic JavaScript construction is prohibited',async()=>{
 const vm=require('node:vm'),path=require('node:path'),{createRequire}=require('node:module');
 const file=require.resolve('../vendor/occt/occt-import-js.js');
 const context=vm.createContext({module:{exports:{}},exports:{},require:createRequire(file),__dirname:path.dirname(file),process,console,TextDecoder,TextEncoder,performance,WebAssembly,setTimeout,clearTimeout},{codeGeneration:{strings:false,wasm:true}});
 vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
 const occt=await context.module.exports();
 const result=meshes(occt.ReadStepFile(fs.readFileSync(require.resolve('./fixtures/step/cube.stp')),{linearUnit:'millimeter',linearDeflectionType:'absolute_value',linearDeflection:.05,angularDeflection:.5}));
 assert.equal(result.length,1);assert.equal(result[0].index.length/3,12);
});
