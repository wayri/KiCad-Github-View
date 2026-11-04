const test=require('node:test'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const api=require('../github-website-reviews.js');
test('website annotations scan bounded Issues, coalesce refreshes, filter exact source and retain partial warnings',async()=>{
 const comments=require('../review-comments.js'),scope={repository:'owner/repo',ref:'main',file:'board.kicad_pcb'},at='2026-11-04T00:00:00Z',calls=[];let time=0;
 const adapter=api.create({comments,now:()=>time,call:async m=>{
  calls.push(m);if(m.action==='list')return {threads:Array.from({length:10},(_,i)=>({kind:'issue',number:i+1})),warnings:['Website listing is limited to the current result page.']};
  if(m.number===2)throw Error('session unavailable');
  const anchor={...scope,position:{x:10,y:20},area:{x:8,y:18,width:4,height:4}};
  if(m.number===3)anchor.file='other.kicad_sch';if(m.number===4)anchor.ref='other';
  return {kind:'issue',state:'open',number:m.number,url:`https://github.com/owner/repo/issues/${m.number}`,body:comments.toMarkdown({id:'note-'+m.number,text:'Review '+m.number,createdAt:at,anchor}),comments:[],warnings:[]};
 }});
 const [a,b]=await Promise.all([adapter.annotations(scope,{repository:scope.repository}),adapter.annotations(scope,{repository:scope.repository})]);
 assert.equal(calls.filter(m=>m.action==='list').length,1);assert.equal(calls.filter(m=>m.action==='read').length,8);
 assert.deepEqual(a,b);assert.equal(a.notes.length,5);assert.ok(a.notes.every(n=>n.anchor.file===scope.file&&n.anchor.ref===scope.ref));assert.match(a.warnings.join(' '),/Incomplete/);
 await adapter.annotations(scope,{repository:scope.repository});assert.equal(calls.length,9);
 time=31000;await adapter.annotations(scope,{repository:scope.repository});assert.equal(calls.filter(m=>m.action==='list').length,1);assert.equal(calls.filter(m=>m.action==='read').length,16);
 const targeted=await adapter.annotations(scope,{repository:scope.repository,number:1});assert.deepEqual(targeted.coverage,{kind:'thread',url:'https://github.com/owner/repo/issues/1'});assert.equal(targeted.notes.length,1);
 await assert.rejects(adapter.annotations(scope,{repository:'other/repo'}),/does not match/);
});
function harness({commitFails=false,storageFails=false,pendingFails=false,revokeAfterPending=false}={}){
 const data={},calls=[],thread={account:'reviewer',capabilities:{create:true},comments:[]};let reserved=0,allowed=true;
 const transport=api.create({crypto:webcrypto,assertWrites:async()=>{if(!allowed)throw Error('Provider writes disabled');},reserve:async()=>{reserved++;},storage:{get:async k=>({[k]:data[k]}),set:async value=>{const status=Object.values(value)[0].status;if(storageFails&&status==='done'||pendingFails&&status==='pending')throw Error('full');Object.assign(data,value);if(revokeAfterPending&&status==='pending')allowed=false;}},call:async message=>{
  calls.push(message);if(message.action==='read')return thread;
  if(message.action==='prepare')return {ticket:'private-ticket',account:'reviewer',repository:message.repository,number:message.number};
  if(message.action==='verify')return {verified:true,account:'reviewer'};
  if(commitFails)throw Error('unconfirmed');
  return {provider:'github',kind:'issue',number:message.number,author:'reviewer',messageId:'123',url:'https://github.com/owner/repo/issues/1#issuecomment-123',createdAt:'2026-11-04T06:00:00Z'};
 }});
 return {transport,calls,data,thread,get reserved(){return reserved;}};
}
const message={repository:'owner/repo',number:1,body:'QA message',clientMutationId:'12345678-1234-1234-1234-123456789abc',confirmedSend:true};
test('website Send reserves, persists pending, and confirms exactly one mutation without connector credentials',async()=>{
 const h=harness();const result=await h.transport.send(message);assert.equal(result.messageId,'123');assert.equal(h.reserved,1);
 assert.deepEqual(h.calls.map(n=>n.action),['read','prepare','verify','commit']);assert.match(h.calls[1].body,/pocket-kiview-session:12345678/);
 assert.equal(Object.values(h.data)[0].status,'done');const duplicate=await h.transport.send(message);assert.equal(duplicate.duplicate,true);assert.equal(h.calls.filter(n=>n.action==='commit').length,1);
 await assert.rejects(h.transport.send({...message,body:'changed'}),/different message/);
});
test('uncertain website completion cannot auto-resend, including after worker recreation',async()=>{
 const h=harness({commitFails:true});await assert.rejects(h.transport.send(message),/not confirmed/);assert.equal(Object.values(h.data)[0].status,'pending');
 await assert.rejects(h.transport.send(message),/unconfirmed outcome/);assert.equal(h.calls.filter(n=>n.action==='commit').length,1);
});
test('receipt persistence failure still returns success and retains duplicate protection',async()=>{
 const h=harness({storageFails:true}),result=await h.transport.send(message);assert.match(result.receiptWarning,/Posted/);
 assert.equal((await h.transport.send(message)).duplicate,true);assert.equal(h.calls.filter(n=>n.action==='commit').length,1);
});
test('Send requires explicit intent, unchanged website account and writable issue',async()=>{
 const h=harness();await assert.rejects(h.transport.send({...message,confirmedSend:false}),/Explicit/);assert.equal(h.calls.length,0);
 h.thread.capabilities.create=false;await assert.rejects(h.transport.send(message),/does not allow/);assert.equal(h.calls.filter(n=>n.action==='prepare').length,0);
});
test('website reverse reads coalesce for ten seconds and force refresh does not hide failures',async()=>{
 const h=harness();await Promise.all([h.transport.read('owner/repo',1),h.transport.read('owner/repo',1)]);assert.equal(h.calls.length,1);
 await h.transport.read('owner/repo',1,true);assert.equal(h.calls.length,2);
});
test('failed pending persistence and policy revocation after persistence cause zero commits',async()=>{
 for(const options of [{pendingFails:true},{revokeAfterPending:true}]){const h=harness(options);await assert.rejects(h.transport.send(message));assert.equal(h.calls.filter(n=>n.action==='commit').length,0);}
});
test('pending publication can recover a newly confirmed matching marker without a second click',async()=>{
 const h=harness({commitFails:true});await assert.rejects(h.transport.send(message));
 const body=h.calls.find(n=>n.action==='prepare').body;h.thread.comments.push({id:'123',author:'reviewer',body,url:'https://github.com/owner/repo/issues/1#issuecomment-123',createdAt:'2026-11-04T06:00:00Z',updatedAt:'2026-11-04T06:00:00Z'});
 const result=await h.transport.send(message);assert.equal(result.recovered,true);assert.equal(h.calls.filter(n=>n.action==='commit').length,1);
});
