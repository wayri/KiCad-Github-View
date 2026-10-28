const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {validate,create}=require('../provider-oauth.js');
const publicConfig={version:1,gitlab:{'https://gitlab.com':{clientId:'publisher-public-client'}}};
test('packaged provider config contains exact host mappings and public IDs only',()=>{
 assert.equal(validate(publicConfig).gitlab['https://gitlab.com'].clientId,'publisher-public-client');
 for(const value of [{...publicConfig,token:'secret'},{...publicConfig,gitlab:{'https://gitlab.com':{clientId:'publisher-public-client',clientSecret:'secret'}}},{...publicConfig,gitlab:{'https://gitlab.com/':{clientId:'publisher-public-client'}}},{...publicConfig,gitlab:{'https://gitlab.com/path':{clientId:'publisher-public-client'}}},{...publicConfig,gitlab:{'http://gitlab.com':{clientId:'publisher-public-client'}}},{...publicConfig,gitlab:{'https://user@gitlab.com':{clientId:'publisher-public-client'}}},{...publicConfig,gitlab:{'https://gitlab.com':{clientId:'short'}}}])assert.throws(()=>validate(value));
});
test('loader fetches only its trusted packaged resource once and never falls back across hosts',async()=>{
 const calls=[],url='chrome-extension://publisher/provider-oauth.json';const api=create({getURL:name=>{assert.equal(name,'provider-oauth.json');return url;},fetchResource:async(...args)=>{calls.push(args);return new Response(JSON.stringify(publicConfig));}});
 assert.deepEqual(await Promise.all([api.clientId('https://gitlab.com'),api.clientId('https://other.example')]),['publisher-public-client','']);assert.equal(await api.clientId('https://gitlab.com'),'publisher-public-client');assert.equal(calls.length,1);assert.equal(calls[0][0],url);assert.deepEqual(calls[0][1],{credentials:'omit',redirect:'error',cache:'no-store'});assert.equal(await api.clientId('https://gitlab.com/'),'');
});
test('malformed, oversized, redirected and unavailable config fail closed without retries',async()=>{
 for(const fetchResource of [async()=>new Response('x'.repeat(16385)),async()=>new Response('{bad'),async()=>new Response(JSON.stringify({...publicConfig,secret:'bad'})),async()=>{throw Error('Unavailable');},async()=>({ok:true,url:'https://attacker.test/config',headers:new Headers(),body:new Response('{}').body})]){
  let calls=0;const api=create({getURL:()=> 'chrome-extension://publisher/provider-oauth.json',fetchResource:async(...args)=>{calls++;return fetchResource(...args);}});assert.equal(await api.clientId('https://gitlab.com'),'');assert.equal(await api.clientId('https://gitlab.com'),'');assert.equal(calls,1);
 }
});
test('GitLab auth uses publisher config without a user override and retains advanced host-specific overrides',async()=>{
 const local=new Map(),session=new Map(),area=map=>({get:async key=>({[key]:map.get(key)}),set:async values=>{for(const [key,value]of Object.entries(values))map.set(key,value);},remove:async keys=>{for(const key of [].concat(keys))map.delete(key);}});
 const context={URL,Map,Set,Promise,Date,TextEncoder,TextDecoder,module:{exports:{}},chrome:{storage:{local:area(local),session:area(session)},identity:{launchWebAuthFlow(){},getRedirectURL:()=> 'https://publisher.chromiumapp.org/gitlab'}},KiCadProviderOAuth:{clientId:async host=>host==='https://gitlab.com'?'publisher-public-client':''}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../gitlab-review-api.js'),'utf8'),context);const api=context.module.exports;
 const status=await api.authStatus('https://gitlab.com');assert.equal(status.clientId,'publisher-public-client');assert.equal(status.releaseConfigured,true);assert.equal(status.clientSource,'publisher');assert.equal((await api.authStatus('https://self.example')).clientId,'');
 await assert.rejects(api.startOAuth('https://unconfigured.example'),/publisher or server administrator/);
 await api.setClientId('https://self.example','admin-public-client');assert.equal((await api.authStatus('https://self.example')).clientSource,'override');assert.equal((await api.authStatus('https://gitlab.com')).clientId,'publisher-public-client');
 await api.resetAuth('https://gitlab.com');assert.equal((await api.authStatus('https://gitlab.com')).clientId,'publisher-public-client');
});
