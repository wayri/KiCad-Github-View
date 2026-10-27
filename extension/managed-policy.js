/* Administrator-owned controls. Ordinary local/session preferences cannot override them. */
((root)=>{'use strict';
 const keys=['NetworkEnabled','ProviderWritesEnabled'];
 const safeLocal=new Set(['managed-policy-status','open-options','load-cancel','comment-list','comment-save','comment-delete','comment-store-status','github-auth-clear','github-auth-reset','github-device-cancel','gitlab-auth-clear','gitlab-auth-reset','gitlab-host-list','gitlab-host-remove']);
 const writes=new Set(['github-publish-comment','comment-publish','chat-message-write','chat-reaction','open-comment-draft','claim-comment-draft']);
 const fail=message=>Object.assign(Error(message),{definitive:true,code:'MANAGED_POLICY'});
 async function read(){
  const area=root.chrome?.storage?.managed;
  if(area===undefined)return {available:false,valid:true,networkEnabled:true,providerWritesEnabled:true};
  let timer;
  try{
   if(!area||typeof area.get!=='function')throw Error('Invalid managed storage API.');
   const value=await Promise.race([area.get(null),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Managed policy timed out.')),3000);})]);
   if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key))||keys.some(key=>Object.hasOwn(value,key)&&typeof value[key]!=='boolean'))throw Error('Invalid managed policy.');
   return {available:true,valid:true,networkEnabled:value.NetworkEnabled!==false,providerWritesEnabled:value.ProviderWritesEnabled!==false};
  }catch{return {available:true,valid:false,networkEnabled:false,providerWritesEnabled:false};}
  finally{clearTimeout(timer);}
 }
 function network(policy){if(!policy.valid)throw fail('Administrator policy is unavailable or invalid. Network and provider writes are disabled.');if(!policy.networkEnabled)throw fail('Network access is disabled by administrator policy.');}
 async function assertNetwork(){network(await read());}
 async function assertWrites(){const policy=await read();network(policy);if(!policy.providerWritesEnabled)throw fail('Provider writes are disabled by administrator policy.');}
 async function authorize(message){
  const policy=await read();
  if(safeLocal.has(message?.type))return;
  network(policy);
  if(writes.has(message?.type)&&!policy.providerWritesEnabled)throw fail('Provider writes are disabled by administrator policy.');
 }
 function readOnlyPost(url,init){
  if(url.origin==='https://github.com'&&['/login/device/code','/login/oauth/access_token'].includes(url.pathname)||url.protocol==='https:'&&url.pathname==='/oauth/token')return true;
  if(url.origin!=='https://api.github.com'||url.pathname!=='/graphql'||typeof init.body!=='string')return false;
  try{const body=JSON.parse(init.body),query=body.query;return typeof query==='string'&&/^\s*(?:query\b|\{)/.test(query)&&! /\b(?:mutation|subscription)\b/.test(query);}catch{return false;}
 }
 async function authorizeFetch(input,init={}){
  const policy=await read();network(policy);
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  const method=String(init.method||input?.method||'GET').toUpperCase();
  if(!policy.providerWritesEnabled&&!['GET','HEAD'].includes(method)&&!(method==='POST'&&readOnlyPost(url,init)))throw fail('Provider writes are disabled by administrator policy.');
 }
 function installFetch(){
  const original=root.fetch;if(typeof original!=='function'||original.kicadManagedPolicy)return;
  const guarded=async(input,init)=>{await authorizeFetch(input,init);return original.call(root,input,init);};
  Object.defineProperty(guarded,'kicadManagedPolicy',{value:true});root.fetch=guarded;
 }
 const api={read,assertNetwork,assertWrites,authorize,authorizeFetch,installFetch};root.KiCadManagedPolicy=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
