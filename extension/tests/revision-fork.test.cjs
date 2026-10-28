'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fork=require('../revision-fork.js');
const sha='a'.repeat(40),input={repository:'owner/board',ref:'main',file:'board.kicad_pcb',sha,confirmed:true,name:'new-board'};
function github(overrides={}){
 const calls=[],routes={
  'GET /user':{id:1,login:'reader'},'GET /repos/owner/board':{id:10,full_name:'owner/board'},
  ['GET /repos/owner/board/commits/'+sha]:{sha},'GET /repos/reader/new-board':null,
  'POST /repos/owner/board/forks':{status:202,data:{id:20,full_name:'reader/new-board',fork:true,parent:{id:10}}},
  ['GET /repos/reader/new-board/commits/'+sha]:{sha},'GET /repos/reader/new-board/git/ref/heads/review%2Faaaaaaaaaaaa':null,
  'POST /repos/reader/new-board/git/refs':{ref:'refs/heads/review/aaaaaaaaaaaa',object:{sha}},...overrides
 };let created=false;
 return {calls,authorize:async()=>{},sleep:async()=>{},request:async(method,path,body)=>{calls.push({method,path,body});const key=method+' '+path;if(!(key in routes))throw Error('Unexpected route: '+key);let data=routes[key];if(typeof data==='function')data=await data();if(key==='GET /repos/reader/new-board'&&created&&data===null)data={id:20,full_name:'reader/new-board',default_branch:'main'};if(method==='POST'&&path.endsWith('/forks'))created=true;return data?.status?data:{status:data?200:404,data};}};
}
test('GitHub creates only a new fork and exact SHA branch, never updates default branch',async()=>{
 const api=github(),result=await fork.create(input,api);assert.equal(result.partial,false);assert.equal(result.sha,sha);assert.equal(result.created,true);
 const writes=api.calls.filter(x=>x.method!=='GET');assert.equal(writes.length,2);assert.deepEqual(writes[0].body,{name:'new-board',default_branch_only:false});assert.deepEqual(writes[1].body,{ref:'refs/heads/review/aaaaaaaaaaaa',sha});
});
test('confirmation, source identity, SHA, branch and host validation reject before writes',async()=>{
 for(const change of [{confirmed:false},{sha:'main'},{branch:'../main'},{branch:'main.lock'},{file:'../secret'},{host:'https://evil.example'},{destinationNamespace:'other/user'}]){const api=github();await assert.rejects(fork.create({...input,...change},api));assert.equal(api.calls.length,0);}
 const api=github({'GET /repos/owner/board':{id:10,full_name:'other/repo'}});await assert.rejects(fork.create(input,api),/identity/);assert.equal(api.calls.some(x=>x.method==='POST'),false);
});
test('existing destination is never reused, even if it is already a fork',async()=>{
 const api=github({'GET /repos/reader/new-board':{id:20,fork:true}});await assert.rejects(fork.create(input,api),/already exists/);assert.equal(api.calls.some(x=>x.method==='POST'),false);
});
test('branch failure preserves the created fork and reports its recoverable URL',async()=>{
 const api=github({'POST /repos/reader/new-board/git/refs':()=>{throw Error('network');}}),result=await fork.create(input,api);
 assert.equal(result.partial,true);assert.equal(result.created,true);assert.equal(result.uncertain,false);assert.equal(result.url,'https://github.com/reader/new-board');assert.equal(api.calls.some(x=>['DELETE','PATCH','PUT'].includes(x.method)),false);
});
test('ambiguous fork creation never proceeds to branch creation',async()=>{
 const api=github({'POST /repos/owner/board/forks':{status:200,data:{id:20,full_name:'reader/new-board',fork:true,parent:{id:10}}}}),result=await fork.create(input,api);
 assert.equal(result.created,false);assert.equal(result.uncertain,true);assert.equal(api.calls.filter(x=>x.method==='POST').length,1);
});
test('policy is rechecked at each request and revocation after creation produces partial result',async()=>{
 const api=github();let n=0;api.authorize=async()=>{if(++n===6)throw Error('policy changed');};const result=await fork.create(input,api);assert.equal(result.created,true);assert.equal(result.partial,true);assert.equal(api.calls.length,5);
});
test('cancellation during readiness polling is bounded and retains fork result',async()=>{
 const controller=new AbortController(),api=github({['GET /repos/reader/new-board/commits/'+sha]:null});api.signal=controller.signal;api.sleep=async()=>controller.abort();
 const result=await fork.create(input,api);assert.equal(result.created,true);assert.equal(result.partial,true);assert.ok(api.calls.length<10);
});
test('GitLab resolves numeric namespace, waits for import and creates exact SHA branch',async()=>{
 const calls=[];let created=false,polls=0;
 const result=await fork.create({...input,provider:'gitlab',host:'https://gitlab.example',destinationNamespace:'8'},{authorize:async()=>{},sleep:async()=>{},request:async(method,path,body)=>{
  calls.push({method,path,body});let data,status=200;
  if(path==='/api/v4/user')data={id:1,username:'reader'};
  else if(path==='/api/v4/namespaces/8')data={id:8,kind:'group',full_path:'team/sub'};
  else if(path==='/api/v4/projects/owner%2Fboard')data={id:10,path_with_namespace:'owner/board'};
  else if(path==='/api/v4/projects/10/repository/commits/'+sha)data={id:sha};
  else if(path==='/api/v4/projects/10/fork'){created=true;status=201;data={id:20,path_with_namespace:'team/sub/new-board',forked_from_project:{id:10}};assert.equal(body.namespace_id,8);}
  else if(path==='/api/v4/projects/team%2Fsub%2Fnew-board')data=null;
  else if(path==='/api/v4/projects/20')data={id:20,path_with_namespace:'team/sub/new-board',import_status:++polls>1?'finished':'started',default_branch:'main'};
  else if(path.endsWith('/repository/commits/'+sha))data={id:sha};
  else if(method==='GET'&&path.endsWith('/repository/branches/review%2Faaaaaaaaaaaa'))data=null;
  else if(method==='POST'&&path.endsWith('/repository/branches')){assert.deepEqual(body,{branch:'review/aaaaaaaaaaaa',ref:sha});data={name:body.branch,commit:{id:sha}};}
  else throw Error('Unexpected route '+path);
  return {status:data?status:404,data};
 }});assert.equal(result.created,true);assert.equal(result.partial,false);assert.equal(result.repository,'team/sub/new-board');assert.equal(polls,2);
});
