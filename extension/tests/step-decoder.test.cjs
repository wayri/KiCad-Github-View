const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {meshes,Client}=require('../step-decoder.js');
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
