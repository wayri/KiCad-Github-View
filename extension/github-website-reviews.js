/* Worker-side website reviews: bounded reads, explicit writes, durable receipts.
 * Transport only returns normalized data; no website credentials are received. */
((root)=>{'use strict';
 function create({call,storage,assertWrites,reserve,comments,crypto=root.crypto,now=()=>Date.now()}={}){
  const locks=new Map(),cache=new Map(),confirmed=new Map(),catalogs=new Map(),scans=new Map();
  const key=(repository,number)=>JSON.stringify([repository.toLowerCase(),number]);
  async function snapshot(store,id,ttl,load){
   const old=store.get(id);if(old&&(old.pending||now()-old.at<ttl))return old.promise;
   const entry={at:now(),pending:true,promise:Promise.resolve().then(load)};store.set(id,entry);
   if(store.size>16)store.delete(store.keys().next().value);
   try{return await entry.promise;}catch(error){if(store.get(id)===entry)store.delete(id);throw error;}finally{entry.pending=false;entry.at=now();}
  }
  function list(repository){return snapshot(catalogs,repository.toLowerCase(),60000,()=>call({repository,action:'list'}));}
  async function annotations(value,{repository,number}={}){
   const scope=comments.normalizeScope(value);if(scope.repository!==repository)throw Error('Review annotation repository does not match.');
   let threads,warnings=[],coverage;
   if(Number.isSafeInteger(number)&&number>0){threads=[await read(repository,number)];coverage={kind:'thread',url:threads[0].url};}
   else {
    const scan=await snapshot(scans,repository.toLowerCase(),30000,async()=>{
     const catalog=await list(repository),rows=(catalog.threads||[]).filter(n=>n.kind==='issue'&&Number.isSafeInteger(n.number)&&n.number>0),result=[],messages=[...(catalog.warnings||[])];
     if((catalog.warnings||[]).length)messages.push('Incomplete annotation coverage: website listing may omit other Issues. Existing drawing markers are retained.');
     const selected=[...new Map(rows.map(n=>[n.number,n])).values()].slice(0,8);
     if(rows.length>8||catalog.hasMore)messages.push('Incomplete annotation scan: first 8 listed Issues only. Open an Issue to read its remaining drawing comments.');
     for(const row of selected){try{const thread=await read(repository,row.number);result.push(thread);messages.push(...(thread.warnings||[]));}catch{messages.push('Incomplete annotation scan: an Issue could not be read through the website session.');}}
     return {threads:result,warnings:messages};
    });threads=scan.threads;warnings=scan.warnings;
   }
   const notes=comments.mergeAnnotations([],threads.flatMap(thread=>comments.threadAnnotations(thread,scope,{repository})));
   if(notes.length>500)warnings.push('Incomplete annotation coverage: first 500 drawing markers shown. Open the relevant Issue for its annotations.');
   return {notes:notes.slice(0,500),warnings:[...new Set([...warnings,...threads.flatMap(thread=>thread.warnings||[])])],...(coverage?{coverage}:{})};
  }
  async function read(repository,number,force=false){
   const id=key(repository,number),saved=cache.get(id);
   if(!force&&saved&&now()-saved.at<10000)return saved.promise;
   const promise=call({repository,number,action:'read'});cache.set(id,{at:now(),promise});
   if(cache.size>32)cache.delete(cache.keys().next().value);
   try{return await promise;}catch(error){if(cache.get(id)?.promise===promise)cache.delete(id);throw error;}
  }
  async function send({repository,number,body,clientMutationId,confirmedSend}){
   if(confirmedSend!==true||typeof clientMutationId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(clientMutationId)||typeof body!=='string'||!body.trim()||new TextEncoder().encode(body).length>59000)throw Error('Explicit Send and a valid review message are required.');
   const operation='website-review:'+JSON.stringify([repository.toLowerCase(),number,clientMutationId]);
   if(locks.has(operation))throw Error('This message is already being sent.');
   const work=(async()=>{
    await assertWrites();
    const thread=await read(repository,number,true);
    if(!thread.capabilities?.create||typeof thread.account!=='string')throw Error('GitHub website does not allow this comment.');
    const fingerprint=JSON.stringify([repository.toLowerCase(),number,body,thread.account]);
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(fingerprint))),n=>n.toString(16).padStart(2,'0')).join('');
    const marked=body.replace(/\r\n?/g,'\n')+'\n\n<!-- pocket-kiview-session:'+clientMutationId+' -->';
    const record=confirmed.get(operation)||(await storage.get(operation))[operation];
    if(record){
     if(record.digest!==digest)throw Error('This send ID belongs to a different message or website account.');
     if(record.status==='done')return {...record.result,duplicate:true};
     const matches=thread.comments.filter(n=>n.author===thread.account&&n.body===marked);
     if(matches.length===1){const item=matches[0],result={provider:'github',kind:'issue',number,messageId:item.id,author:item.author,url:item.url,createdAt:item.createdAt,updatedAt:item.updatedAt,replyTo:null,transport:'website-session',recovered:true};const receipt={status:'done',digest,result};confirmed.set(operation,receipt);try{await storage.set({[operation]:receipt});}catch{}return result;}
     throw Error('A previous Send has an unconfirmed outcome. Inspect GitHub before retrying; automatic resends are blocked.');
    }
    await reserve();
    const prepared=await call({repository,number,action:'prepare',body:marked});
    if(prepared.account!==thread.account||prepared.repository!==repository||prepared.number!==number||typeof prepared.ticket!=='string')throw Error('GitHub website account or draft changed. Nothing sent.');
    const checked=await call({repository,number,action:'verify',ticket:prepared.ticket});
    if(checked?.verified!==true||checked.account!==thread.account)throw Error('GitHub website account changed. Nothing sent.');
    await assertWrites();
    await storage.set({[operation]:{status:'pending',digest,startedAt:new Date(now()).toISOString()}});
    await assertWrites();
    let result;
    try{result=await call({repository,number,action:'commit',ticket:prepared.ticket});}
    catch{throw Error('Send was attempted but not confirmed. Inspect GitHub before retrying; this message will not be resent automatically.');}
    const target=new URL(result?.url||'about:blank');
    if(result?.author!==thread.account||result.number!==number||result.kind!=='issue'||target.origin!=='https://github.com'||target.pathname!=='/'+repository+'/issues/'+number||!/^#issuecomment-[0-9]+$/.test(target.hash))throw Error('GitHub did not confirm the matching comment. Inspect the issue before retrying.');
    cache.delete(key(repository,number));scans.delete(repository.toLowerCase());
    const receipt={status:'done',digest,result};confirmed.set(operation,receipt);if(confirmed.size>64)confirmed.delete(confirmed.keys().next().value);
    try{await storage.set({[operation]:receipt});}catch{result={...result,receiptWarning:'Posted on GitHub; the local receipt could not be saved.'};}
    return result;
   })();locks.set(operation,work);try{return await work;}finally{locks.delete(operation);}
  }
  async function chat(message){
   const scope=comments.normalizeScope(message),{kind,number}=message.thread||{};
   if(kind!=='issue'||!Number.isSafeInteger(number)||number<1||!['create','reply'].includes(message.action))throw Error('Browser-session chat currently supports creating and replying to issue comments.');
   let body=message.body;
   if(typeof body!=='string'||body.includes('<!-- kicad-review:')&&!message.annotation)throw Error('Use validated drawing context for review metadata.');
   if(message.annotation){
    const note=comments.validateComment(message.annotation);
    if(note.id!==message.clientMutationId||note.text!==body||note.anchor.repository!==scope.repository||note.anchor.ref!==scope.ref||note.anchor.file!==scope.file||note.threadType!=='issue'||note.capture)throw Error('Review context does not match this message, or includes an unsupported screenshot upload.');
    body=comments.toMarkdown(note);
   }
   if(message.action==='reply'){
    const thread=await read(scope.repository,number),target=thread.comments.find(n=>n.id===message.replyTo);
    if(!target)throw Error('Reload the conversation before replying to this message.');
    body='> Reply to ['+(target.author||'message')+']('+target.url+')\n\n'+body;
   }
   return send({...message,repository:scope.repository,number,body});
  }
  return {read,list,annotations,send,chat};
 }
 root.KiCadGitHubWebsiteReviews={create};if(typeof module==='object'&&module.exports)module.exports=root.KiCadGitHubWebsiteReviews;
})(globalThis);
