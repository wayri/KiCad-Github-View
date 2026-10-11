const test=require('node:test'),assert=require('node:assert/strict');
const {reservePublication}=require('../review-comments.js');
function store(){const data=new Map();return{data,async get(key){return{[key]:data.get(key)};},async set(values){for(const[k,v]of Object.entries(values))data.set(k,v);}};}
const scope=JSON.stringify(['github','https://github.com']);
test('parallel publication reservations cannot race the persistent posting budget',async()=>{
 const storage=store(),start=Date.now();const results=await Promise.allSettled(Array.from({length:12},()=>reservePublication(storage,scope,start)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(storage.data.values().next().value.length,1);assert.ok(results.filter(r=>r.status==='rejected').every(r=>r.reason.retryAfterSeconds===3));
 await reservePublication(storage,scope,start+3000);assert.equal(storage.data.values().next().value.length,2);
});
test('posting budget enforces minute/hour limits and expires only elapsed windows',async()=>{
 const storage=store(),start=Date.now();for(let i=0;i<5;i++)await reservePublication(storage,scope,start+i*3000);
 await assert.rejects(reservePublication(storage,scope,start+15000),e=>e.retryAfterSeconds===45);
 await reservePublication(storage,scope,start+60000);
 const hourly=store();for(let i=0;i<20;i++)await reservePublication(hourly,scope,start+i*60000);
 await assert.rejects(reservePublication(hourly,scope,start+20*60000),e=>e.retryAfterSeconds===2400);
 await reservePublication(hourly,scope,start+3600000);assert.equal(hourly.data.values().next().value.length,20);
});
test('persistent reservations survive context restart and do not reset on clock rollback',async()=>{
 const storage=store(),start=Date.now();await reservePublication(storage,scope,start);
 await assert.rejects(reservePublication(storage,scope,start-1),/clock moved backwards/);
 const context={module:{exports:{}}};require('node:vm').runInNewContext(require('node:fs').readFileSync(require.resolve('../review-comments.js'),'utf8'),context);
 await assert.rejects(context.module.exports.reservePublication(storage,scope,start+1),/Posting too quickly/);
});
test('corrupt or unwritable quota history fails closed without recording a successful attempt',async()=>{
 for(const bad of ['x',{},[NaN],Array(21).fill(0),[-1]]){
  const storage=store();storage.data.set('kivi:publication-budget:'+scope,bad);await assert.rejects(reservePublication(storage,scope,Date.now()),/history is invalid/);
 }
 const storage=store();storage.set=async()=>{throw Error('storage failed');};await assert.rejects(reservePublication(storage,scope,Date.now()),/Nothing posted/);assert.equal(storage.data.size,0);
});
test('quota keys isolate provider hosts but share repositories and account switches',async()=>{
 const storage=store(),start=Date.now();await reservePublication(storage,scope,start);await reservePublication(storage,JSON.stringify(['gitlab','https://gitlab.example']),start);
 await assert.rejects(reservePublication(storage,scope,start),/Posting too quickly/);assert.equal(storage.data.size,2);
});
