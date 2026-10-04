const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const comments=require('../review-comments.js');
function harness({metadata={private:true,full_name:'owner/private',default_branch:'main'},policy={schemaVersion:1,commenting:{mode:'allowlist',allowlist:['reviewer']}},root=[],profile='reviewer'}={}){
 const session=new Map([['github-review-token','github_pat_private_1234567890']]),local=new Map(),calls=[];
 const area=map=>({get:async key=>({[key]:map.get(key)}),set:async values=>{for(const [key,value]of Object.entries(values))map.set(key,value);},remove:async keys=>{for(const key of [].concat(keys))map.delete(key);}});
 const json=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
 const response=value=>typeof value==='number'?new Response(null,{status:value}):json(value);
 const context=vm.createContext({TextEncoder,TextDecoder,URLSearchParams,AbortController,setTimeout,clearTimeout,atob,KiCadReviewComments:comments,
 chrome:{storage:{session:area(session),local:area(local)}},fetch:async(url,init)=>{
  calls.push({url,init});assert.ok(url.startsWith('https://api.github.com/'));assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');
  if(url==='https://api.github.com/repos/owner/private')return response(metadata);
  if(url.includes('/contents/.kicad-review-policy.json?'))return response(policy);
  if(url.includes('/contents?ref='))return response(root);
  if(url==='https://api.github.com/user')return typeof profile==='number'?response(profile):json({login:profile});
  if(url.endsWith('/issues'))return json({number:23,node_id:'I_valid'});
  if(url.endsWith('/graphql')){const body=JSON.parse(init.body);return body.query.includes('mutation')?json({data:{createDiscussion:{discussion:{id:'D_valid',number:24}}}}):json({data:{repository:{id:'R_valid',discussionCategories:{nodes:[{id:'C_valid',name:'Review'}]}}}});}
  throw new Error('Unexpected URL '+url);
 }});
 vm.runInContext(fs.readFileSync(require.resolve('../github-review-api.js'),'utf8'),context);
 return{api:context.KiCadGitHubReviewApi,calls,local};
}
const note=type=>({id:'note-'+type,text:'Check component',threadType:type,createdAt:'2026-10-03T09:20:00.000Z',anchor:{repository:'owner/private',ref:'a'.repeat(40),file:'Hardware/HPBM.kicad_pcb',reference:'U3'}});
const mutations=h=>h.calls.filter(({url,init})=>url.endsWith('/issues')||url.endsWith('/graphql')&&JSON.parse(init.body).query.includes('mutation'));
test('authorized private Issue and Discussion posts read policy with session token on exact API host',async()=>{
 for(const type of ['issue','discussion']){
  const h=harness();const result=await h.api.publish({comment:note(type),destination:'new-'+type,...(type==='discussion'?{categoryId:'C_valid'}:{})});
  assert.equal(result.remoteRef.kind,type);assert.equal(mutations(h).length,1);
  const policy=h.calls.find(call=>call.url.includes('/contents/.kicad-review-policy.json?'));
  assert.equal(policy.init.headers.Authorization,'Bearer github_pat_private_1234567890');
  assert.equal(policy.url,'https://api.github.com/repos/owner/private/contents/.kicad-review-policy.json?ref=main');
 }
});
test('private policy absence defaults only after an accessible complete root listing',async()=>{
 const h=harness({policy:404,root:[{name:'Hardware',path:'Hardware',type:'dir'}]});
 assert.equal((await h.api.commentPolicyStatus('owner/private')).allowed,true);
 assert.equal(h.calls.find(call=>call.url.includes('/contents?ref=')).init.headers.Authorization,'Bearer github_pat_private_1234567890');
});
test('concealed missing Contents permission and ambiguous private policy 404 fail closed before either publication',async()=>{
 for(const type of ['issue','discussion'])for(const root of [404,403,[{name:'.kicad-review-policy.json',path:'.kicad-review-policy.json'}],Array.from({length:1000},(_,i)=>({name:'p'+i,path:'p'+i}))]){
  const h=harness({policy:404,root});await assert.rejects(h.api.publish({comment:note(type),destination:'new-'+type,...(type==='discussion'?{categoryId:'C_valid'}:{})}),/policy/);
  assert.equal(mutations(h).length,0);assert.equal(h.local.size,0);
 }
});
test('metadata identity, private flag, policy denial and unverified identity block private publication',async()=>{
 for(const type of ['issue','discussion'])for(const options of [{metadata:404},{metadata:{private:'true',full_name:'owner/private',default_branch:'main'}},{metadata:{private:true,full_name:'other/private',default_branch:'main'}},{policy:403},{profile:403},{profile:'outsider'}]){
  const h=harness(options);await assert.rejects(h.api.publish({comment:note(type),destination:'new-'+type,...(type==='discussion'?{categoryId:'C_valid'}:{})}));assert.equal(mutations(h).length,0);
 }
});
test('public policy reads remain anonymous even with configured token',async()=>{
 const h=harness({metadata:{private:false,full_name:'owner/private',default_branch:'main'}});
 assert.equal((await h.api.commentPolicyStatus('owner/private')).allowed,true);
 assert.equal(h.calls.find(call=>call.url.includes('/contents/.kicad-review-policy.json?')).init.headers.Authorization,undefined);
});
