'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const comments=require('../review-comments.js');
const stamp='2026-10-27T00:00:00Z',scope={repository:'owner/repo',ref:'main',file:'board.kicad_pcb'},token='test_token_01234567890123456789';
const ghComment=(id=11,extra={})=>({id,node_id:'IC_'+id,body:'Hello',user:{login:'reviewer'},created_at:stamp,updated_at:stamp,...extra});
const glComment=(id=11,extra={})=>({id,body:'Hello',author:{username:'reviewer'},created_at:stamp,updated_at:stamp,...extra});
const discussionComment=(id=11,extra={})=>({id:'DC_'+id,databaseId:id,body:'Hello',author:{login:'reviewer'},createdAt:stamp,updatedAt:stamp,viewerCanUpdate:true,viewerDidAuthor:true,...extra});
const page=nodes=>({nodes,pageInfo:{hasNextPage:false,endCursor:null}});
async function harness(provider,override=()=>undefined){
 const maps={local:new Map(),session:new Map()},calls=[];
 const area=map=>({get:async key=>({[key]:map.get(key)}),set:async rows=>{for(const[k,v]of Object.entries(rows))map.set(k,v);},remove:async keys=>[].concat(keys).forEach(k=>map.delete(k))});
 const context=vm.createContext({URL,URLSearchParams,TextEncoder,TextDecoder,AbortController,setTimeout,clearTimeout,atob,btoa,FormData,Blob,crypto:require('node:crypto').webcrypto,KiCadReviewComments:comments,KiCadGitHubReviewApi:require('../github-review-api.js'),chrome:{storage:{local:area(maps.local),session:area(maps.session)}},fetch:async(url,init)=>{
  calls.push({url,init});assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');
  let data=await override(url,init);
  if(data===undefined&&provider==='github'){
   if(url.endsWith('/user'))data={login:'reviewer'};
   else if(url.includes('/contents/'))data=new Response(null,{status:404});
   else if(url.endsWith('/graphql')){const q=JSON.parse(init.body);data=q.query.startsWith('mutation')?{data:{[q.query.includes('updateDiscussionComment')?'updateDiscussionComment':'addDiscussionComment']:{comment:discussionComment(12)}}}:{data:{repository:{discussion:{...discussionComment(1),id:'D_1',number:42,title:'Discussion',closed:false,comments:page([{...discussionComment(),replies:page([discussionComment(13)])}])}}}};}
   else if(url.includes('/comments?'))data=[ghComment()];
   else if(init.method==='POST'||init.method==='PATCH')data=ghComment(init.method==='PATCH'?11:12);
   else if(url.endsWith('/issues/42'))data={...ghComment(1),number:42,title:'Issue',state:'open',comments:1};
   else data={id:9,full_name:'owner/repo',private:false,default_branch:'main',permissions:{push:true}};
  }
  if(data===undefined&&provider==='gitlab'){
   if(url.endsWith('/api/v4/user'))data={id:7,username:'reviewer'};
   else if(url.includes('/members/all/'))data=new Response(null,{status:404});
   else if(url.includes('/repository/files/'))data=new Response(null,{status:404});
   else if(url.includes('/repository/tree?'))data=[];
   else if(url.includes('/discussions?'))data=[{id:'verified_group',individual_note:false,notes:[glComment(),glComment(13)]}];
   else if(init.method==='POST'||init.method==='PUT')data=url.endsWith('/discussions')?{id:'new_group',notes:[glComment(12)]}:glComment(init.method==='PUT'?11:12);
   else if(url.endsWith('/issues/42'))data={id:1,iid:42,project_id:9,title:'Issue',state:'opened',description:'Description',created_at:stamp,updated_at:stamp,author:{username:'reviewer'}};
   else data={id:9,path_with_namespace:'owner/repo',default_branch:'main',visibility:'public'};
  }
  return data instanceof Response?data:new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
 }});
 vm.runInContext(fs.readFileSync(require.resolve('../'+provider+'-review-api.js'),'utf8'),context);
 const api=context[provider==='github'?'KiCadGitHubReviewApi':'KiCadGitLabReviewApi'];
 await (provider==='github'?api.setToken(token):api.setToken('https://gitlab.com',token));
 const request={...scope,provider,...(provider==='gitlab'?{host:'https://gitlab.com'}:{}),thread:{kind:'issue',number:42},action:'create',body:'New message',clientMutationId:'mutation_0123456789'};
 return{api,calls,maps,request,write:extra=>api.chatMessageWrite({...request,...extra})};
}
const mutations=calls=>calls.filter(c=>['POST','PATCH','PUT'].includes(c.init.method)&&(!c.url.endsWith('/graphql')||JSON.parse(c.init.body).query.startsWith('mutation')));
for(const provider of ['github','gitlab']){
 test(provider+' creates once with bound receipt, rejects changed duplicate, and advertises verified edit ownership',async()=>{
  const h=await harness(provider),result=await h.write();assert.equal(result.messageId,'12');assert.equal((await h.write()).duplicate,true);assert.equal(mutations(h.calls).length,1);
  await assert.rejects(h.write({body:'Changed'}),/already belongs/);assert.equal(mutations(h.calls).length,1);
  const read=await h.api.readThread({...h.request,kind:'issue',number:42,includeCapabilities:true});assert.equal(read.capabilities.create,true);assert.equal(read.capabilities.reactions,false);assert.equal(read.comments[0].canEdit,true);assert.equal(JSON.stringify(result).includes(token),false);
 });
 test(provider+' rejects foreign IDs, wrong owner, stale edits, invalid scope and invalid provider without a mutation',async()=>{
  for(const extra of [{action:'reply',replyTo:'999'},{action:'edit',messageId:'999',expectedUpdatedAt:stamp},{action:'edit',messageId:'11',expectedUpdatedAt:'2020-01-01T00:00:00Z'},{file:'../bad.kicad_pcb'},{provider:provider==='github'?'gitlab':'github'},{clientMutationId:'short'},{body:'<!-- kicad-review:v1 fake -->'}]){
   const h=await harness(provider);await assert.rejects(h.write(extra));assert.equal(mutations(h.calls).length,0);
  }
  const h=await harness(provider,url=>url.includes('/comments?')?[ghComment(11,{user:{login:'other'}})]:url.includes('/discussions?')?[{id:'verified_group',individual_note:false,notes:[glComment(11,{author:{username:'other'}})]}]:undefined);
  await assert.rejects(h.write({action:'edit',messageId:'11',expectedUpdatedAt:stamp}),/ownership/);assert.equal(mutations(h.calls).length,0);
 });
 test(provider+' edits only the verified comment with expected revision',async()=>{
  const h=await harness(provider),result=await h.write({action:'edit',messageId:'11',expectedUpdatedAt:stamp});assert.equal(result.messageId,'11');const [write]=mutations(h.calls);assert.equal(write.init.method,provider==='github'?'PATCH':'PUT');assert.ok(write.url.endsWith(provider==='github'?'/issues/comments/11':'/discussions/verified_group/notes/11'));
 });
 test(provider+' ambiguous outcomes remain pending and block duplicate retry',async()=>{
  const h=await harness(provider,(url,init)=>['POST','PATCH','PUT'].includes(init.method)?new Response('unavailable',{status:503}):undefined);
  await assert.rejects(h.write());await assert.rejects(h.write(),/unconfirmed outcome/);assert.equal(mutations(h.calls).length,1);
 });
 test(provider+' cannot strip existing drawing annotations by plain message editing',async()=>{
  const body=comments.toMarkdown({id:'existing-note',text:'Inspect',createdAt:stamp,threadType:'issue',anchor:{...scope,...(provider==='gitlab'?{provider,host:'https://gitlab.com'}:{})}});
  const h=await harness(provider,url=>url.includes('/comments?')?[ghComment(11,{body})]:url.includes('/discussions?')?[{id:'verified_group',individual_note:false,notes:[glComment(11,{body})]}]:undefined);
  await assert.rejects(h.write({action:'edit',messageId:'11',expectedUpdatedAt:stamp}),/preserve their anchors/);assert.equal(mutations(h.calls).length,0);
  const read=await h.api.readThread({...h.request,kind:'issue',number:42,includeCapabilities:true});assert.equal(read.comments[0].canEdit,false);
 });
 test(provider+' annotation is bound to exact message and retains drawing metadata',async()=>{
  const h=await harness(provider),annotation={id:h.request.clientMutationId,text:h.request.body,createdAt:stamp,threadType:'issue',anchor:{...scope,...(provider==='gitlab'?{provider,host:'https://gitlab.com'}:{})}};
  await assert.rejects(h.write({annotation:{...annotation,anchor:{...annotation.anchor,file:'other.kicad_pcb'}}}),/does not match/);assert.equal(h.calls.length,0);
  await h.write({annotation});const body=JSON.parse(mutations(h.calls)[0].init.body).body;assert.equal(comments.fromMarkdown(body)[0].anchor.file,scope.file);
 });
 test(provider+' repository deny policy and mid-flight sign-out prevent writes',async()=>{
  const policy={schemaVersion:1,commenting:{mode:'allowlist',allowlist:['someone-else']}};
  const denied=await harness(provider,url=>url.includes('/contents/')?policy:url.includes('/repository/files/')?{encoding:'base64',file_path:'.kicad-review-policy.json',content:Buffer.from(JSON.stringify(policy)).toString('base64')}:undefined);
  await assert.rejects(denied.write(),/policy or account verification/);assert.equal(mutations(denied.calls).length,0);
  let reached,release;const gate=new Promise(resolve=>reached=resolve);const h=await harness(provider,async url=>{if(url.endsWith('/issues/42')){reached();await new Promise(resolve=>release=resolve);}return undefined;});
  const write=h.write(),rejected=assert.rejects(write,/changed|signed out|locked/);await gate;await(provider==='github'?h.api.clearToken():h.api.clearToken('https://gitlab.com'));release();await rejected;assert.equal(mutations(h.calls).length,0);
 });
 test(provider+' concurrent identical IDs serialize and reject conflicting payloads',async()=>{
  let release,reached;const gate=new Promise(resolve=>reached=resolve);const h=await harness(provider,async(url,init)=>{if(init.method==='POST'&&!url.endsWith('/graphql')){reached();await new Promise(resolve=>release=resolve);}return undefined;});
  const first=h.write();await gate;const other=h.write({body:'Conflicting body'}),rejected=assert.rejects(other,/already belongs/);release();await first;await rejected;assert.equal(mutations(h.calls).length,1);
 });
 test(provider+' chat screenshots reuse secure upload and preserve only remote image metadata',async()=>{
  const h=await harness(provider,(url,init)=>url.includes('uploads.github.com')?{url:'https://github.com/user-attachments/assets/12345678-1234-1234-1234-123456789abc'}:url.endsWith('/uploads')?{full_path:'/-/project/9/uploads/'+'a'.repeat(32)+'/'+init.body.get('file').name}:undefined);
  if(provider==='github')await h.api.setToken('github_pat_012345678901234567890');
  const capture={mime:'image/png',width:1,height:1,dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOfoAAAAASUVORK5CYII='};
  const annotation={id:h.request.clientMutationId,text:h.request.body,createdAt:stamp,threadType:'issue',anchor:{...scope,...(provider==='gitlab'?{provider,host:'https://gitlab.com'}:{})},capture};
  await h.write({annotation});assert.equal((await h.write({annotation})).duplicate,true);
  const writes=mutations(h.calls);assert.equal(writes.length,2);const body=JSON.parse(writes[1].init.body).body,parsed=comments.fromMarkdown(body)[0];assert.equal(parsed.capture,undefined);assert.equal(parsed.attachments.length,1);assert.equal(body.includes(capture.dataUrl),false);
 });
}
test('GitHub Issues use visible quoted reply association and Discussions resolve verified root node IDs',async()=>{
 const h=await harness('github');await h.write({action:'reply',replyTo:'11'});assert.match(JSON.parse(mutations(h.calls)[0].init.body).body,/^> Reply to \[reviewer\]\(https:\/\/github.com\/owner\/repo\/issues\/42#issuecomment-11\)/);
 const d=await harness('github');await d.write({thread:{kind:'discussion',number:42},action:'reply',replyTo:'13'});const input=JSON.parse(mutations(d.calls)[0].init.body).variables.input;assert.equal(input.replyToId,'DC_11');assert.equal(input.discussionId,'D_1');
});
test('GitLab uses verified Discussion ID and can convert individual notes into reply threads',async()=>{
 const h=await harness('gitlab');await h.write({action:'reply',replyTo:'13'});assert.ok(mutations(h.calls)[0].url.endsWith('/discussions/verified_group/notes'));
 const single=await harness('gitlab',url=>url.includes('/discussions?')?[{id:'individual',individual_note:true,notes:[glComment()]}]:undefined);await single.write({action:'reply',replyTo:'11'});assert.ok(mutations(single.calls)[0].url.endsWith('/discussions/individual/notes'));
});
