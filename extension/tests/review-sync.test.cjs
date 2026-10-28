const test=require('node:test'),assert=require('node:assert/strict');
const {create,participants}=require('../review-sync.js');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(load){let visible=true,online=true,id=0;const timers=new Map(),updates=[],states=[];const sync=create({load,onUpdate:(data,meta)=>updates.push({data,meta}),onState:s=>states.push(s),isVisible:()=>visible,isOnline:()=>online,setTimer:(fn,ms)=>{const key=++id;timers.set(key,{fn:()=>{timers.delete(key);fn();},ms});return key;},clearTimer:id=>timers.delete(id),now:()=>123});return{sync,timers,updates,states,visible:v=>{visible=v;},online:v=>{online=v;}};}
test('refresh serializes requests and rejects a late response from an old scope',async()=>{
 const waits=[],calls=[];const f=fixture(scope=>{calls.push(scope);return new Promise(resolve=>waits.push(resolve));});
 f.sync.start('a');f.sync.setScope('b');assert.deepEqual(calls,['a']);waits.shift()({messages:[{author:{login:'old'}}]});await tick();assert.equal(f.updates.length,0);
 const timer=[...f.timers.values()][0];assert.equal(timer.ms,0);timer.fn();assert.deepEqual(calls,['a','b']);waits.shift()({messages:[{author:{login:'alice'}}]});await tick();assert.equal(f.updates[0].meta.scope,'b');assert.equal(f.updates[0].meta.participants[0].login,'alice');f.sync.dispose();assert.equal(f.timers.size,0);
});
test('hidden and disposed views never apply late results or keep polling',async()=>{
 let done;const f=fixture(()=>new Promise(resolve=>done=resolve));f.sync.start('a');f.visible(false);f.sync.visibilityChanged();done({});await tick();assert.equal(f.updates.length,0);assert.equal(f.timers.size,0);f.sync.dispose();await f.sync.refresh();assert.equal(f.sync.snapshot().status,'stopped');
});
test('offline pauses requests and failures back off within the limit',async()=>{
 let calls=0;const f=fixture(async()=>{calls++;throw Error('network');});f.online(false);f.sync.start('a');await tick();assert.equal(calls,0);assert.equal([...f.timers.values()][0].ms,120000);f.online(true);await f.sync.refresh();assert.equal(calls,1);assert.equal([...f.timers.values()][0].ms,20000);await f.sync.refresh();assert.equal([...f.timers.values()][0].ms,40000);f.sync.dispose();
});
test('participants are bounded deduplicated observed authors, never inferred presence',()=>{
 assert.deepEqual(participants({comments:[{author:{login:'Alice',name:'A'}},{user:{username:'alice',name:'Alice'}},{author:'bob'},{author:{login:'<bad>'}}]}),[{login:'alice',name:'Alice'},{login:'bob',name:'bob'}]);
});
