'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),comments=require('../review-comments.js');
const stamp='2026-10-27T00:00:00Z',scope={repository:'owner/repo',ref:'main',file:'board.kicad_pcb',kind:'issue'};
const row=(number=1,extra={})=>({number,iid:number,project_id:9,title:'Conversation',state:'open',closed:false,user:{login:'author'},author:{login:'author',username:'author'},updated_at:stamp,updatedAt:stamp,body:'DO NOT EXPOSE',html_url:'https://evil.example',web_url:'https://evil.example',...extra});
async function harness(provider,handler=()=>undefined){
 const stores={local:new Map(),session:new Map()},calls=[];const area=map=>({get:async k=>({[k]:map.get(k)}),set:async values=>{for(const[k,v]of Object.entries(values))map.set(k,v);},remove:async keys=>[].concat(keys).forEach(k=>map.delete(k))});
 const context=vm.createContext({URL,URLSearchParams,TextEncoder,TextDecoder,AbortController,setTimeout,clearTimeout,atob,btoa,crypto:require('node:crypto').webcrypto,KiCadReviewComments:comments,chrome:{storage:{local:area(stores.local),session:area(stores.session)}},fetch:async(url,init)=>{calls.push({url,init});let value=await handler(url,init);if(value===undefined)value=url.endsWith('/projects/owner%2Frepo')?{id:9,path_with_namespace:'owner/repo'}:provider==='github'?[row()]:[row(1,{state:'opened'})];return new Response(JSON.stringify(value));}});
 vm.runInContext(fs.readFileSync(require.resolve('../'+provider+'-review-api.js'),'utf8'),context);const api=context[provider==='github'?'KiCadGitHubReviewApi':'KiCadGitLabReviewApi'];
 await(provider==='github'?api.setToken('github_pat_01234567890123456789'):api.setToken('https://gitlab.com','glpat_01234567890123456789'));
 return{api,calls,list:extra=>api.chatThreadList({...scope,provider,...(provider==='gitlab'?{host:'https://gitlab.com'}:{}),...extra})};
}
for(const provider of ['github','gitlab']){
 test(provider+' conversation metadata excludes body and constructs trusted links',async()=>{
  const h=await harness(provider),result=await h.list();assert.equal(result.threads.length,1);assert.equal(result.threads[0].author,'author');assert.equal(result.threads[0].url,provider==='github'?'https://github.com/owner/repo/issues/1':'https://gitlab.com/owner/repo/-/issues/1');assert.equal(JSON.stringify(result).includes('DO NOT EXPOSE'),false);assert.equal(JSON.stringify(result).includes('evil.example'),false);assert.equal(result.hasMore,false);assert.ok(h.calls.every(c=>c.init.method==='GET'&&c.init.redirect==='error'));
 });
 test(provider+' listing rejects invalid scope, pagination and overlarge provider pages',async()=>{
  const h=await harness(provider);for(const extra of [{page:0},{page:6},{page:'2'},{cursor:'arbitrary'},{file:'../board.kicad_pcb'},{kind:'pull'}])await assert.rejects(h.list(extra));assert.equal(h.calls.length,0);
  const oversized=await harness(provider,url=>url.includes('/issues?')?Array.from({length:21},(_,i)=>row(i+1,{state:provider==='github'?'open':'opened'})):undefined);await assert.rejects(oversized.list(),/invalid/);
 });
 test(provider+' bounded pagination exposes next page and omits invalid identities',async()=>{
  const h=await harness(provider,url=>url.includes('/issues?')?Array.from({length:20},(_,i)=>row(i+1,{state:provider==='github'?'open':'opened',...(i===1?{number:0,iid:0}:{})})):undefined);
  const first=await h.list();assert.equal(first.threads.length,19);assert.equal(first.hasMore,true);assert.equal(first.nextPage,2);assert.equal(first.warnings.length,1);
  const last=await h.list({page:5});assert.equal(last.hasMore,false);assert.equal(last.truncated,true);assert.ok(h.calls.some(c=>c.url.endsWith('page=5')));
 });
}
test('GitHub Issue listing excludes pull requests and Discussion listing validates opaque cursors',async()=>{
 const h=await harness('github',()=>[row(1,{pull_request:{url:'ignored'}}),row(2)]);assert.deepEqual(Array.from((await h.list()).threads,r=>r.number),[2]);
 const d=await harness('github',(url,init)=>{const query=JSON.parse(init.body);assert.equal(query.variables.cursor,'previous');return{data:{repository:{discussions:{nodes:[row(3)],pageInfo:{hasNextPage:true,endCursor:'next'}}}}};});
 const result=await d.list({kind:'discussion',page:2,cursor:'previous'});assert.equal(result.cursor,'next');assert.equal(result.nextPage,3);assert.equal(result.threads[0].url,'https://github.com/owner/repo/discussions/3');
 const bad=await harness('github',()=>({data:{repository:{discussions:{nodes:[],pageInfo:{hasNextPage:true,endCursor:'same'}}}}}));await assert.rejects(bad.list({kind:'discussion',cursor:'same'}),/pagination/);
});
test('GitLab Discussion discovery is explicitly unsupported and rejects foreign project rows',async()=>{
 const h=await harness('gitlab');assert.equal((await h.list({kind:'discussion'})).supported,false);assert.equal(h.calls.length,0);
 const wrong=await harness('gitlab',url=>url.includes('/issues?')?[row(1,{state:'opened',project_id:10})]:undefined);assert.equal((await wrong.list()).threads.length,0);
});
