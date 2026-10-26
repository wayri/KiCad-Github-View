/* Shared review UI adapter. Native transports own credentials and HTTP. */
((root)=>{
'use strict';
function create(project,request,comments,storage){
 const remote=project.remote||{provider:'github',host:'https://github.com',repository:project.github?.repository,sha:project.github?.sha};
 const provider=remote.provider,repository=remote.repository,host=remote.host,pending=new Map();
 const call=(action,fields={})=>request({type:action,repository,...(provider==='gitlab'?{host}:{}),...fields});
 const check=message=>{if(!repository)throw Error('Open a GitHub or GitLab project first.');if(message.repository&&message.repository.toLowerCase()!==repository.toLowerCase()||message.provider&&message.provider!==provider||message.host&&message.host!==host)throw Error('Review request belongs to another project or server.');};
 const hash=async value=>Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),v=>v.toString(16).padStart(2,'0')).join('');
 const prepareChatAuth=async()=>{if(provider==='gitlab')await call('auth-status');};
 const thread=async(kind,number,fields={})=>{if(fields.includeCapabilities)await prepareChatAuth();return call(provider==='github'?'review-thread':'thread',{kind,number,...fields});};
 async function chatWrite(message){
  if(message.ref!==remote.sha||!project.files.some(file=>file.path===message.file))throw Error('Chat belongs to another saved project revision or drawing.');
  if(!message.thread||!['issue','discussion'].includes(message.thread.kind)||!Number.isSafeInteger(message.thread.number)||message.thread.number<1||!['create','reply','edit'].includes(message.action))throw Error('Invalid chat destination or action.');
  if(typeof message.body!=='string'||!message.body.trim()||new TextEncoder().encode(message.body).length>60000||message.body.includes('\0')||typeof message.clientMutationId!=='string'||! /^[A-Za-z0-9_-]{16,100}$/.test(message.clientMutationId))throw Error('Enter a message up to 60000 bytes with a valid operation identity.');
  const fields={ref:message.ref,file:message.file,thread:message.thread,messageAction:message.action,body:message.body,clientMutationId:message.clientMutationId};
  for(const key of ['messageId','replyTo','expectedUpdatedAt'])if(message[key]!==undefined)fields[key]=message[key];
  await prepareChatAuth();
  if(message.annotation){if(message.action==='edit')throw Error('Drawing annotations cannot be edited as plain chat messages.');let note=comments.validateComment(message.annotation),anchor=note.anchor;
   if(note.id!==message.clientMutationId||note.text!==message.body||note.threadType!==message.thread.kind||(anchor.provider||'github')!==provider||anchor.repository!==repository||anchor.ref!==message.ref||anchor.file!==message.file||provider==='gitlab'&&anchor.host!==host)throw Error('Drawing context belongs to another chat.');
   if(note.capture){const value=await call(provider==='github'?'review-upload':'upload',{capture:note.capture,ref:message.ref,file:message.file,chatContext:true});note=comments.validateComment({...note,attachments:[comments.validateAttachment(value.attachment||value)]});}
   fields.annotation=note;fields.renderedBody=comments.toMarkdown(note);
  }
  return call('chat-message-write',fields);
 }
 async function annotations(message){
  const notes=[],warnings=[],seen=new Set(),selected=message.discussionNumber||message.issueNumber||message.pullNumber;
  const add=(body,meta)=>{let parsed;try{parsed=comments.fromMarkdown(body||'');}catch{warnings.push('An oversized annotation body was skipped.');return;}for(const note of parsed){if(notes.length>=500)break;const a=note.anchor,key=meta.url+':'+note.id;if((a.provider||'github')!==provider||a.repository.toLowerCase()!==repository.toLowerCase()||a.ref!==message.ref||a.file!==message.file||provider==='gitlab'&&a.host!==host||seen.has(key))continue;seen.add(key);notes.push({...note,github:meta});}};
  const kinds=message.discussionNumber?['discussion']:message.includeDiscussions&&provider==='github'?['issue','discussion']:['issue'];
  for(const kind of kinds){
   let targets;if(selected)targets=[{number:selected}];else{const listing=await call(provider==='github'?'review-list':'threads',{kind,page:1});targets=listing.threads||[];if(listing.hasMore)warnings.push('Only the first page of recent threads was scanned.');}
   // Bound network work. Selected threads always include their replies.
   for(const item of targets.slice(0,10)){const value=await thread(kind,item.number);const meta={source:kind,number:value.number,state:value.state,author:value.author||'unknown',url:value.url,createdAt:value.createdAt,updatedAt:value.updatedAt};add(value.body,meta);for(const reply of value.comments||[])add(reply.body,{...meta,author:reply.author||'unknown',url:reply.url||value.url,createdAt:reply.createdAt,updatedAt:reply.updatedAt});warnings.push(...(value.warnings||[]));}
   if(targets.length>10)warnings.push('Recent annotation scan is limited to ten threads; enter a thread number to load an older conversation.');
  }
  return{notes,warnings};
 }
 async function publish(message){
  let note=comments.validateComment(message.comment);
  if(note.anchor.repository.toLowerCase()!==repository.toLowerCase()||(note.anchor.provider||'github')!==provider||note.anchor.ref!==remote.sha||provider==='gitlab'&&note.anchor.host!==host)throw Error('Comment belongs to another revision or server.');
  if(!project.files.some(f=>f.path===note.anchor.file))throw Error('Comment drawing is not in this project.');
  let destination=message.destination||'new-issue';if(provider==='gitlab'&&message.discussion)destination='discussion';
  const identity=JSON.stringify([provider,host,repository,note.id,note.updatedAt,destination,message.number||0,message.categoryId||'',message.title||'']);
  const operationId=await hash(identity),key='android-publication:'+operationId;
  const stored=storage.getItem(key);if(stored)return JSON.parse(stored);
  if(pending.has(operationId))return pending.get(operationId);
  const task=(async()=>{
   if(note.capture){const value=await call(provider==='github'?'review-upload':'upload',{capture:note.capture});const attachment=comments.validateAttachment(value.attachment||value);note=comments.validateComment({...note,attachments:[attachment]});}
   const body=comments.toMarkdown(note),title=String(message.title||note.text.split(/\r?\n/)[0]).slice(0,provider==='github'?200:255);
   const result=await call(provider==='github'?'review-publish':'publish',{destination,body,title,operationId,...(message.number?{number:message.number}:{}),...(message.categoryId?{categoryId:message.categoryId}:{})});
   const remoteRef=result.remoteRef||{provider:'gitlab',host,repository,kind:destination==='discussion'?'discussion':'issue',number:result.number,url:result.url,publishedAt:new Date().toISOString()};
   // Validate the native receipt before recording it in the local note.
   comments.validateComment({...note,remoteRefs:[remoteRef]});
   const receipt={remoteRef,...(note.attachments?.length?{attachments:note.attachments}:{}),...(result.recovered?{recovered:true}:{})};storage.setItem(key,JSON.stringify(receipt));return receipt;
  })();pending.set(operationId,task);try{return await task;}finally{pending.delete(operationId);}
 }
 return{async send(message){try{check(message);let result;switch(message.type){
  case 'github-auth-status':{const value=await call('auth-status');result={...value,configured:value.connected};break;}
  case 'comment-policy-status':result=await call(provider==='github'?'review-policy':'policy');break;
  case 'comment-mention-users':result=await call(provider==='github'?'review-contributors':'contributors',{query:message.query||'',source:message.source||'all'});break;
  case 'github-discussion-categories':if(provider!=='github')throw Error('GitLab conversations belong to issues.');result=(await call('review-categories')).categories;break;
  case 'github-thread-read':{if(message.includeCapabilities!==undefined&&typeof message.includeCapabilities!=='boolean')throw Error('Invalid conversation capability request.');result=await thread(message.kind,message.number,message.includeCapabilities?{includeCapabilities:true,ref:message.ref,file:message.file}:{});break;}
  case 'chat-message-write':result=await chatWrite(message);break;
  case 'chat-thread-list':{const cursor=message.cursor==null?undefined:message.cursor;if(message.ref!==remote.sha||!project.files.some(file=>file.path===message.file)||!['issue','discussion'].includes(message.kind)||message.page!==undefined&&(!Number.isSafeInteger(message.page)||message.page<1||message.page>5)||cursor!==undefined&&(provider==='gitlab'||message.kind==='issue'||typeof cursor!=='string'||!cursor||cursor.length>1024||/[\x00-\x1f\x7f]/.test(cursor)))throw Error('Invalid chat list scope or pagination.');await prepareChatAuth();result=await call('chat-thread-list',{ref:message.ref,file:message.file,kind:message.kind,...(message.page!==undefined?{page:message.page}:{}),...(cursor!==undefined?{cursor}:{})});break;}
  case 'github-annotations':case 'comment-remote-list':result=await annotations(message);break;
  case 'github-publish-comment':case 'comment-publish':result=await publish(message);break;
  case 'github-recover-publication':throw Error('An uncertain publication is protected against automatic reposting. Inspect the remote thread before creating another draft.');
  default:throw Error('Unsupported remote review action.');
 }return{ok:true,result};}catch(error){return{ok:false,error:error.message,authExpired:Boolean(error.authExpired)};}}};
}
root.KiCadAndroidRemote={create};if(typeof module==='object'&&module.exports)module.exports=root.KiCadAndroidRemote;
})(globalThis);
