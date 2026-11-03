const {test}=require('node:test'),assert=require('node:assert/strict');
const {check,classifyAccessError}=require('../environment-diagnostics.js');
test('explicit diagnostics skip on-click hosts without persistent permission and send no credentials or project context',async()=>{
 const requests=[];const result=await check({version:'0.12.61',permissions:{contains:async({origins})=>!origins[0].includes('raw.')},fetch:async(url,options)=>{requests.push({url,options});return{status:200,body:{cancel:async()=>{}}};}});
 assert.equal(result.siteAccess[2].state,'on-click');assert.equal(result.connectivity.find(v=>v.host==='raw.githubusercontent.com').checked,false);assert.equal(result.connectivity.find(v=>v.host==='raw.githubusercontent.com').reachable,null);assert.equal(result.accessIssue,null);
 assert.equal(requests.length,2);assert.ok(requests.every(request=>!request.url.includes('raw.githubusercontent.com')));for(const request of requests){assert.equal(request.options.credentials,'omit');assert.equal(request.options.redirect,'error');assert.equal(request.options.headers.Authorization,undefined);assert.equal(request.options.body,undefined);}
});
test('unavailable permissions API produces skipped, nonconclusive diagnostics without leaking errors',async()=>{
 const result=await check({fetch:async()=>{throw Error('SECRET proxy message');}});
 assert.equal(result.siteAccess.every(v=>v.state==='unknown'),true);assert.equal(result.connectivity.every(v=>v.checked===false&&v.reachable===null),true);assert.doesNotMatch(JSON.stringify(result),/SECRET/);assert.match(result.note,/do not prove enterprise policy/);
});
test('HTTP 404 is reachable, not proof of a script error or access grant',async()=>{
 const result=await check({permissions:{contains:async()=>true},fetch:async()=>({status:404})});assert.equal(result.connectivity[0].status,404);assert.equal(result.connectivity[0].reachable,true);assert.match(result.note,/does not prove a particular file exists/);
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
test('connection checks distinguish explicit policy blocks from ordinary on-click permission defaults',async()=>{
 const policy=await check({permissions:{contains:async()=>true},fetch:async()=>{throw Error('net::ERR_BLOCKED_BY_ADMINISTRATOR');}});
 assert.equal(policy.accessIssue.kind,'organization-block');
 const permission=await check({permissions:{contains:async()=>false},fetch:async()=>({status:200})});
 assert.equal(permission.accessIssue,null);assert.equal(permission.accountAccessIssue,null);assert.equal(permission.siteAccess.find(item=>item.requiredForViewing).state,'on-click');
 const missing=await check({permissions:{contains:async()=>true},fetch:async()=>({status:404})});assert.equal(missing.accessIssue,null);
 const denied=await check({permissions:{contains:async()=>true},fetch:async()=>({status:403})});assert.equal(denied.connectivity[0].reachable,true);assert.equal(denied.accessIssue.kind,'forbidden');assert.equal(denied.accessIssue.confirmed,false);
});


test('website/raw viewing checks are independent of optional API permissions and API-only policy blocks',async()=>{
 const requests=[];const result=await check({permissions:{contains:async()=>true},fetch:async(url,options)=>{requests.push({url,options});if(url.startsWith('https://api.github.com/'))throw Error('net::ERR_BLOCKED_BY_ADMINISTRATOR');return {status:200};}});
 assert.equal(result.accessIssue,null);assert.equal(result.accountAccessIssue.kind,'organization-block');assert.equal(result.connectivity.filter(c=>c.requiredForViewing).every(c=>c.reachable),true);assert.ok(requests.some(r=>r.url==='https://github.com/'&&r.options.method==='HEAD'));assert.equal(result.siteAccess.find(s=>s.host.includes('api.github.com')).requiredForViewing,false);
});
test('blocked website or raw host is reported for viewing, without mistaking generic network errors for managed policy',async()=>{
 const result=await check({permissions:{contains:async()=>true},fetch:async(url)=>{if(url==='https://github.com/')throw Error('Failed to fetch SECRET proxy');return {status:200};}});
 assert.equal(result.accessIssue.kind,'connection');assert.equal(result.accessIssue.confirmed,false);assert.equal(result.accountAccessIssue,null);assert.doesNotMatch(JSON.stringify(result),/SECRET/);assert.equal(result.connectivity.find(c=>c.host==='github.com').requiredForViewing,true);
});
test('explicit extension managed-policy failures retain distinct disabled, unavailable and write-only states',()=>{
 const {classifyManagedPolicy}=require('../environment-diagnostics.js');
 const disabled=classifyAccessError(Object.assign(Error('Network access is disabled by administrator policy.'),{code:'MANAGED_POLICY'}));assert.equal(disabled.kind,'managed-network-disabled');assert.equal(disabled.confirmed,true);
 const invalid=classifyAccessError(Object.assign(Error('Administrator policy is unavailable or invalid. Network and provider writes are disabled.'),{code:'MANAGED_POLICY'}));assert.equal(invalid.kind,'managed-policy-unavailable');assert.notEqual(invalid.title,disabled.title);
 assert.equal(classifyAccessError('Network access is disabled by administrator policy.').kind,'managed-network-disabled');assert.equal(classifyAccessError('Provider writes are disabled by administrator policy.').kind,'managed-writes-disabled');
 assert.equal(classifyManagedPolicy({valid:true,networkEnabled:true,providerWritesEnabled:false}),null);assert.equal(classifyManagedPolicy({valid:true,networkEnabled:false}).kind,'managed-network-disabled');assert.equal(classifyManagedPolicy({valid:false}).kind,'managed-policy-unavailable');assert.equal(classifyManagedPolicy({valid:true}).kind,'managed-policy-unavailable');
 const unknown=classifyAccessError({code:'MANAGED_POLICY',message:'SECRET policy payload'});assert.equal(unknown.kind,'managed-policy-unavailable');assert.doesNotMatch(JSON.stringify(unknown),/SECRET/);
});


test('normal on-click installation performs no settings network probes and reports no view or account error',async()=>{
 let calls=0;const result=await check({permissions:{contains:async()=>false},fetch:async()=>{calls++;throw Error('No outgoing request is authorized');}});assert.equal(calls,0);assert.equal(result.accessIssue,null);assert.equal(result.accountAccessIssue,null);assert.ok(result.siteAccess.filter(item=>item.requiredForViewing).every(item=>item.state==='on-click'));assert.equal(result.siteAccess.find(item=>!item.requiredForViewing).state,'requires-connection');assert.ok(result.connectivity.every(item=>item.checked===false&&item.reachable===null));assert.match(result.connectivity.find(item=>item.feature==='account-review').note,/require a connection/);
});

test('website and raw diagnostics remain usable while optional account permission is absent',async()=>{
 const calls=[],result=await check({permissions:{contains:async({origins})=>!origins[0].includes('api.github.com')},fetch:async(url)=>{calls.push(url);return{status:200};}});assert.equal(calls.length,2);assert.ok(calls.every(url=>!url.includes('api.github.com')));assert.equal(result.accessIssue,null);assert.equal(result.accountAccessIssue,null);assert.ok(result.connectivity.filter(item=>item.requiredForViewing).every(item=>item.checked&&item.reachable));assert.equal(result.connectivity.find(item=>!item.requiredForViewing).state,'requires-connection');
});

test('unknown or unreadable permission state cannot authorize a settings probe or imply successful connectivity',async()=>{
 for(const permissions of [undefined,{contains:async()=>{throw Error('permission state unavailable');}}]){let calls=0;const result=await check({permissions,fetch:async()=>{calls++;return{status:200};}});assert.equal(calls,0);assert.ok(result.connectivity.every(item=>!item.checked&&item.reachable===null&&item.state==='unknown'));assert.equal(result.accessIssue,null);assert.equal(result.accountAccessIssue,null);}
});
