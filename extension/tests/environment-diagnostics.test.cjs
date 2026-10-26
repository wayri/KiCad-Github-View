const {test}=require('node:test'),assert=require('node:assert/strict');
const {check,classifyAccessError}=require('../environment-diagnostics.js');
test('explicit diagnostics reveal missing permissions without sending credentials or project context',async()=>{
 const requests=[];const result=await check({version:'0.12.61',permissions:{contains:async({origins})=>!origins[0].includes('raw.')},fetch:async(url,options)=>{requests.push({url,options});return{status:200,body:{cancel:async()=>{}}};}});
 assert.equal(result.siteAccess[2].state,'not granted');assert.equal(result.connectivity.every(v=>v.reachable),true);
 assert.equal(requests.length,2);for(const request of requests){assert.equal(request.options.credentials,'omit');assert.equal(request.options.redirect,'error');assert.equal(request.options.headers.Authorization,undefined);assert.equal(request.options.body,undefined);}
});
test('blocked requests and unavailable permissions API produce usable, nonconclusive diagnostics',async()=>{
 const result=await check({fetch:async()=>{throw Error('SECRET proxy message');}});
 assert.equal(result.siteAccess.every(v=>v.state==='unknown'),true);assert.equal(result.connectivity.every(v=>!v.reachable),true);assert.doesNotMatch(JSON.stringify(result),/SECRET/);assert.match(result.note,/do not prove enterprise policy/);
});
test('HTTP 404 is reachable, not proof of a script error or access grant',async()=>{
 const result=await check({fetch:async()=>({status:404})});assert.equal(result.connectivity[0].status,404);assert.equal(result.connectivity[0].reachable,true);assert.match(result.note,/does not prove a particular file exists/);
});
test('only an explicit administrator block confirms organization policy',()=>{
 const admin=classifyAccessError(Error('net::ERR_BLOCKED_BY_ADMINISTRATOR private/source?token=SECRET'));
 assert.equal(admin.kind,'organization-block');assert.equal(admin.confirmed,true);assert.doesNotMatch(JSON.stringify(admin),/SECRET|private\/source/);
 const client=classifyAccessError(Error('net::ERR_BLOCKED_BY_CLIENT'));assert.equal(client.kind,'client-block');
 assert.match(client.action,/not confirmed/);
 for(const text of ['Failed to fetch','NetworkError when attempting to fetch resource.','net::ERR_NETWORK_ACCESS_DENIED']){const issue=classifyAccessError(Error(text));assert.equal(issue.kind,'connection');assert.equal(issue.confirmed,false);}
 assert.equal(classifyAccessError(Error('GitHub returned HTTP 404.')),null);
 assert.equal(classifyAccessError(Error('Incomplete KiCad S-expression.')),null);
 assert.equal(classifyAccessError(Object.assign(Error('The operation was aborted.'),{name:'AbortError'})),null);
 assert.equal(classifyAccessError(Error('GitHub denied this request (HTTP 403).')).kind,'forbidden');
 assert.equal(classifyAccessError(Error('GitHub denied this request (HTTP 403).')).confirmed,false);
});
test('connection checks surface explicit policy blocks and missing permissions as separate warning types',async()=>{
 const policy=await check({permissions:{contains:async()=>true},fetch:async()=>{throw Error('net::ERR_BLOCKED_BY_ADMINISTRATOR');}});
 assert.equal(policy.accessIssue.kind,'organization-block');
 const permission=await check({permissions:{contains:async()=>false},fetch:async()=>({status:200})});
 assert.equal(permission.accessIssue.kind,'site-access');assert.match(permission.accessIssue.action,/If it is locked/);
 const missing=await check({permissions:{contains:async()=>true},fetch:async()=>({status:404})});assert.equal(missing.accessIssue,null);
 const denied=await check({permissions:{contains:async()=>true},fetch:async()=>({status:403})});assert.equal(denied.connectivity[0].reachable,true);assert.equal(denied.accessIssue.kind,'forbidden');assert.equal(denied.accessIssue.confirmed,false);
});
