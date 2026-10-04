const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness({releaseClientId='',grantedScope='repo'}={}){
 const session=new Map(),local=new Map(),requests=[];
 const area=map=>({get:async key=>({[key]:map.get(key)}),set:async values=>{for(const [key,value]of Object.entries(values))map.set(key,value);},remove:async keys=>{for(const key of [].concat(keys))map.delete(key);}});
 const context=vm.createContext({TextEncoder,TextDecoder,URLSearchParams,AbortController,setTimeout,clearTimeout,crypto:require('node:crypto').webcrypto,
 chrome:{storage:{session:area(session),local:area(local)}},fetch:async(url,init)=>{
  requests.push({url,init});return{ok:true,text:async()=>JSON.stringify(url.endsWith('/login/device/code')?
   {device_code:'d'.repeat(40),user_code:'TEST-CODE',verification_uri:'https://github.com/login/device',expires_in:900,interval:5}:
   {access_token:'gho_'+ 't'.repeat(40),token_type:'bearer',scope:grantedScope})};
 }});
 let source=fs.readFileSync(require.resolve('../github-review-api.js'),'utf8');
 if(releaseClientId!==null)source=source.replace(/const RELEASE_OAUTH_CLIENT_ID = "[A-Za-z0-9_]*";/,`const RELEASE_OAUTH_CLIENT_ID = ${JSON.stringify(releaseClientId)};`);
 vm.runInContext(source,context);return{api:context.KiCadGitHubReviewApi,session,local,requests};
}
test('release App signs in without a user client ID or secret',async()=>{
 const h=harness({releaseClientId:'Ov23liPublisherClient'});
 assert.equal((await h.api.deviceStatus()).releaseConfigured,true);
 const result=await h.api.startDevice('', 'public_repo');
 assert.equal(result.scope,'public_repo');
 const fields=new URLSearchParams(h.requests[0].init.body);
 assert.equal(fields.get('client_id'),'Ov23liPublisherClient');assert.equal(fields.has('client_secret'),false);
 assert.equal(JSON.stringify(result).includes('d'.repeat(40)),false);
});
test('distributed build uses the registered public Client ID without advanced setup',async()=>{
 const h=harness({releaseClientId:null});
 const status=await h.api.deviceStatus();
 assert.equal(status.releaseConfigured,true);assert.equal(status.clientId,'Ov23li8RsSVZk2dHptN1');
 assert.equal((await h.api.startDevice()).state,'pending');
 const fields=new URLSearchParams(h.requests[0].init.body);
 assert.equal(fields.get('client_id'),'Ov23li8RsSVZk2dHptN1');assert.equal(fields.has('client_secret'),false);
});
test('blank publisher setup fails honestly without contacting GitHub',async()=>{
 const h=harness();await assert.rejects(h.api.startDevice(),/publisher must register an OAuth App/);
 assert.equal(h.requests.length,0);assert.equal(h.session.size,0);
});
test('private scope must be selected and granted before a session token is accepted',async()=>{
 const h=harness({grantedScope:'public_repo'});
 await h.api.startDevice('Ov23liDeveloperClient','repo');
 assert.equal(new URLSearchParams(h.requests[0].init.body).get('scope'),'repo');
 h.session.get('github-device-pending').nextPollAt=Date.now()-1;
 await assert.rejects(h.api.pollDevice(),/did not grant private repository access/);
 assert.equal(h.session.has('github-review-token'),false);assert.equal(h.session.has('github-device-pending'),false);
 const ok=harness({grantedScope:'repo'});await ok.api.startDevice('Ov23liDeveloperClient','repo');
 ok.session.get('github-device-pending').nextPollAt=Date.now()-1;
 assert.equal((await ok.api.pollDevice()).state,'connected');assert.ok(ok.session.has('github-review-token'));
 assert.equal(ok.local.has('github-review-token'),false);
});
test('repo includes public_repo and invalid scopes never initiate authorization',async()=>{
 const h=harness({grantedScope:'repo'});await h.api.startDevice('Ov23liDeveloperClient');
 h.session.get('github-device-pending').nextPollAt=Date.now()-1;
 assert.equal((await h.api.pollDevice()).state,'connected');
 const bad=harness();for(const scope of ['user','admin:org','repo public_repo',null])await assert.rejects(bad.api.startDevice('Ov23liDeveloperClient',scope),/Choose public repositories/);
 assert.equal(bad.requests.length,0);
});
