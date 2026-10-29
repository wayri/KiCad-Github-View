'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
let configuration={},readFailure=false,listener,networkCalls=0,credentialCalls=0;
const local=new Map(),session=new Map();
const area=store=>({get:async key=>typeof key==='string'?{[key]:store.get(key)}:Object.fromEntries(store),set:async value=>{for(const [k,v]of Object.entries(value))store.set(k,v);},remove:async key=>{for(const k of Array.isArray(key)?key:[key])store.delete(k);}});
const managed={get:async()=>{if(readFailure)throw Error('unavailable');return configuration;}};
global.chrome={runtime:{id:'test',getURL:path=>'chrome-extension://test/'+path,onMessage:{addListener:fn=>listener=fn}},storage:{local:area(local),session:area(session),managed},action:{onClicked:{addListener(){}}}};
global.fetch=async()=>{networkCalls++;return new Response('{}');};
global.importScripts=()=>{};
global.KiCadGitHubReviewApi={tokenStatus:async()=>{credentialCalls++;return {configured:true};}};
const policy=require('../managed-policy.js');
require('../background.js');
const viewer={id:'test',url:chrome.runtime.getURL('browser-viewer.html')},options={id:'test',url:chrome.runtime.getURL('options.html')};
const message=(value,sender=viewer)=>new Promise(resolve=>{if(!listener(value,sender,resolve))resolve({ignored:true});});
test.beforeEach(()=>{configuration={};readFailure=false;chrome.storage.managed=managed;});

test('managed controls default normally only when API is absent or a valid empty policy is returned',async()=>{
 assert.deepEqual(await policy.read(),{available:true,valid:true,networkEnabled:true,providerWritesEnabled:true});
 delete chrome.storage.managed;assert.equal((await policy.read()).available,false);await policy.assertNetwork();await policy.assertWrites();
});
test('malformed, unreadable and partially available policy fails closed without network',async()=>{
 const before=networkCalls;
 for(const value of [null,[],false,{NetworkEnabled:'false'},{ProviderWritesEnabled:1},{NetworkEnabled:true,UnexpectedOverride:true}]){
  configuration=value;assert.equal((await policy.read()).valid,false);await assert.rejects(()=>fetch('https://api.github.com/repos/owner/repo'),/policy/);
 }
 configuration={};readFailure=true;await assert.rejects(()=>policy.assertNetwork(),/policy/);
 chrome.storage.managed={};assert.equal((await policy.read()).valid,false);assert.equal(networkCalls,before);
});
test('offline dispatcher denies repository reads, authentication, diagnostics and publication before credentials or network',async()=>{
 const types=['draftsman-save','project','githubPull','githubFiles','repository-detect','project-inventory','project-file','repo-asset','pdf-file','github-annotations','github-thread-read','chat-thread-list','github-auth-set','github-auth-status','github-device-start','github-device-poll','github-access-test','viewer-diagnostics','gitlab-auth-set','gitlab-oauth-start','gitlab-auth-status','github-publish-comment','comment-publish','chat-message-write','chat-thread-state','chat-reaction','open-comment-draft'];
 configuration={NetworkEnabled:false};const before=networkCalls,credentials=credentialCalls;
 for(const type of types)for(const provider of ['github','gitlab']){
  const result=await message({type,provider,repository:'owner/repo'},options);assert.equal(result.ok,false,type);assert.match(result.error,/administrator policy/,type);
 }
 assert.equal(networkCalls,before);assert.equal(credentialCalls,credentials);
 const status=await message({type:'managed-policy-status'},options);assert.equal(status.result.networkEnabled,false);
 assert.equal((await message({type:'managed-policy-status'})).ok,false);
});
test('policy changes override an already configured account and cannot be changed by local preferences or message fields',async()=>{
 assert.equal((await message({type:'github-auth-status'},options)).result.configured,true);
 const credentials=credentialCalls;configuration={NetworkEnabled:false};local.set('NetworkEnabled',true);
 const response=await message({type:'github-auth-status',NetworkEnabled:true,policy:{NetworkEnabled:true}},options);
 assert.equal(response.ok,false);assert.equal(credentialCalls,credentials);
 configuration={NetworkEnabled:true,ProviderWritesEnabled:false};await policy.authorize({type:'project'});
 for(const type of ['draftsman-save','repository-fork-revision','github-publish-comment','comment-publish','chat-message-write','chat-thread-state','chat-reaction','open-comment-draft','claim-comment-draft'])assert.equal((await message({type})).ok,false,type);
 for(const type of ['comment-list','comment-save','comment-delete','github-auth-clear','gitlab-auth-reset'])await policy.authorize({type});
});
test('transport rechecks managed policy for reads, uploads, mutations, OAuth and GraphQL query requests',async()=>{
 configuration={ProviderWritesEnabled:false};const before=networkCalls;
 await fetch('https://api.github.com/repos/owner/repo');
 await fetch('https://api.github.com/graphql',{method:'POST',body:JSON.stringify({query:'query { viewer { login } }'})});
 await fetch('https://github.com/login/device/code',{method:'POST',body:'client_id=public'});
 assert.equal(networkCalls,before+3);
 for(const [url,init]of [['https://api.github.com/repos/owner/repo/issues',{method:'POST'}],['https://uploads.github.com/user-attachments/assets',{method:'POST'}],['https://gitlab.com/api/v4/projects/123/issues/1',{method:'DELETE'}],['https://api.github.com/graphql',{method:'POST',body:JSON.stringify({query:'query Read { viewer { login } } mutation Write { attack }',operationName:'Write'})}]])await assert.rejects(()=>fetch(url,init),/writes/);
 configuration={NetworkEnabled:false};await assert.rejects(()=>fetch('https://github.com/login/device/code',{method:'POST'}),/Network/);assert.equal(networkCalls,before+3);
});
test('provider API guards prevent token retrieval, reconnect and direct write calls after policy changes',async()=>{
 const github=require('../github-review-api.js'),gitlab=require('../gitlab-review-api.js');
 await github.setToken('github_'+ 'x'.repeat(30));await gitlab.setToken('https://gitlab.com','gitlab_'+ 'x'.repeat(30));
 assert.ok((await github.authorizationHeaders()).Authorization);assert.ok((await gitlab.authorizationHeaders('https://gitlab.com')).Authorization);
 configuration={NetworkEnabled:false};
 for(const call of [()=>github.authorizationHeaders(),()=>gitlab.authorizationHeaders('https://gitlab.com'),()=>github.setToken('x'.repeat(30)),()=>gitlab.setToken('https://gitlab.com','x'.repeat(30)),()=>gitlab.startOAuth('https://gitlab.com')])await assert.rejects(call,/Network/);
 configuration={ProviderWritesEnabled:false};for(const api of [github,gitlab])for(const method of ['publish','chatMessageWrite'])await assert.rejects(()=>api[method]({}),/writes/);
 configuration={NetworkEnabled:false};assert.equal((await github.clearToken()).configured,false);assert.equal((await gitlab.clearToken('https://gitlab.com')).configured,false);
});
