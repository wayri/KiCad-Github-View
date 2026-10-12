const test=require('node:test'),assert=require('node:assert/strict');
const {create,validate}=require('../gitlab-session-reader.js');
const host='https://gitlab.example.org',repository='group/sub/private',sha='a'.repeat(40);
const location={href:`${host}/${repository}/-/blob/main/board.kicad_pcb`};
const endpoint=`${host}/api/v4/projects/${encodeURIComponent(repository)}`;
const request=(tail,extra={})=>({host,repository,url:endpoint+tail,limit:1024,...extra});
test('GitLab session reads use the matching server and full subgroup namespace',async()=>{
 let init;
 const reader=create({location,fetch:async(url,options)=>{init=options;return new Response(JSON.stringify({id:sha}),{headers:{'content-type':'application/json','set-cookie':'private-session'}});}});
 const result=await reader.read(request('/repository/commits/feature%2Fboard'));
 assert.deepEqual(JSON.parse(atob(result.base64)),{id:sha});assert.equal(init.method,'GET');assert.equal(init.credentials,'same-origin');assert.equal(init.redirect,'error');assert.equal(init.headers,undefined);assert.deepEqual(Object.keys(result).sort(),['base64','link','next']);
});
test('session endpoint validation rejects other hosts, projects, mutation endpoints and credential parameters',()=>{
 for(const message of [request('/repository/tree',{host:'https://evil.example.org'}),request('/repository/tree',{repository:'group/sub/other'}),request('/issues'),request('/uploads'),request('/repository/tree?sudo=root'),request('/repository/tree?private_token=secret'),request('/repository/tree?ref=a&ref=b'),request('/repository/tree?path=..%2Fsecret'),request('/repository/files/..%2Fsecret/raw?ref='+sha),request('/repository/tree',{url:host+'/api/v4/projects/group%2Fsub%2Fother/repository/tree'})])assert.throws(()=>validate(message,location));
 assert.throws(()=>validate(request('/repository/tree'),{href:host+'/group/sub/private-evil/-/blob/main/x'}),/tab/);
 assert.throws(()=>validate(request('/repository/tree',{host:host+'/gitlab'}),location),/tab/);
});
test('read-only metadata resolves MR forks while file access stays bound to its project tab',()=>{
 assert.equal(validate(request('',{url:host+'/api/v4/projects/42'}),location),host+'/api/v4/projects/42');
 assert.throws(()=>validate(request('/repository/tree',{url:host+'/api/v4/projects/42/repository/tree'}),location),/project/);
 assert.equal(validate(request('/merge_requests/12'),location),endpoint+'/merge_requests/12');
});
test('binary model and PDF bytes are preserved and pagination headers are reduced to safe metadata',async()=>{
 const bytes=Uint8Array.from([0,255,128,10,13]),reader=create({location,fetch:async()=>new Response(bytes,{headers:{'x-next-page':'2','link':'<https://evil.test/?token=secret>; rel="next"'}})});
 const result=await reader.read(request('/repository/files/board.glb/raw?ref='+sha));
 assert.deepEqual(Uint8Array.from(atob(result.base64),c=>c.charCodeAt(0)),bytes);assert.equal(result.next,'2');assert.equal(result.link,'<next>; rel="next"');assert.ok(!JSON.stringify(result).includes('token'));
});
test('expired login, login HTML, missing files, bad pagination and oversized streams fail safely',async()=>{
 for(const response of [new Response('denied',{status:401}),new Response('login',{headers:{'content-type':'text/html'}}),new Response('huge',{headers:{'content-length':'9999'}}),new Response('huge'),new Response('x',{headers:{'x-next-page':'https://evil.test'}})]){
  const reader=create({location,fetch:async()=>response});await assert.rejects(reader.read(request('/repository/tree',{limit:2})));
 }
 const reader=create({location,fetch:async()=>new Response(null,{status:404})});assert.equal(await reader.read(request('/repository/tree')),null);
});
