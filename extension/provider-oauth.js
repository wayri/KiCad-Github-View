/* Trusted packaged public OAuth client IDs. Never credentials or project data. */
((root)=>{
 'use strict';
 const LIMIT=16384,CLIENT=/^[A-Za-z0-9_-]{10,200}$/;
 function origin(value){
  if(typeof value!=='string'||value.length>300)throw Error('Invalid OAuth provider origin.');
  let url;try{url=new URL(value);}catch{throw Error('Invalid OAuth provider origin.');}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||url.hostname.endsWith('.')||url.origin!==value)throw Error('Invalid OAuth provider origin.');return value;
 }
 function validate(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==1||Object.keys(value).some(key=>!['version','gitlab'].includes(key))||!value.gitlab||typeof value.gitlab!=='object'||Array.isArray(value.gitlab)||Object.keys(value.gitlab).length>32)throw Error('Invalid packaged OAuth configuration.');
  const hosts=Object.create(null);
  for(const [host,entry]of Object.entries(value.gitlab)){
   origin(host);if(!entry||typeof entry!=='object'||Array.isArray(entry)||Object.keys(entry).length!==1||!Object.hasOwn(entry,'clientId')||typeof entry.clientId!=='string'||!CLIENT.test(entry.clientId))throw Error('Packaged OAuth configuration accepts public client IDs only.');
   hosts[host]=Object.freeze({clientId:entry.clientId});
  }
  return Object.freeze({version:1,gitlab:Object.freeze(hosts)});
 }
 function create({fetchResource=(...args)=>root.fetch(...args),getURL=path=>root.chrome.runtime.getURL(path)}={}){
  let pending;
  async function load(){
   if(!pending)pending=(async()=>{
    const target=getURL('provider-oauth.json'),response=await fetchResource(target,{credentials:'omit',redirect:'error',cache:'no-store'});
    if(!response.ok||response.url&&response.url!==target||Number(response.headers?.get('content-length'))>LIMIT||!response.body?.getReader)throw Error('Packaged OAuth configuration is unavailable.');
    const reader=response.body.getReader(),chunks=[];let total=0;
    try{for(;;){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>LIMIT)throw Error('Packaged OAuth configuration exceeds the size limit.');chunks.push(value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
    const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    return validate(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
   })().catch(()=>validate({version:1,gitlab:{}}));
   return pending;
  }
  return{async clientId(host){try{origin(host);return(await load()).gitlab[host]?.clientId||'';}catch{return'';}}};
 }
 root.KiCadProviderOAuth={...create(),create,validate,origin};if(typeof module==='object'&&module.exports)module.exports=root.KiCadProviderOAuth;
})(globalThis);
