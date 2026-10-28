'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
global.KiCadRevisionFork=require('../revision-fork.js');global.KiCadReviewComments=require('../review-comments.js');
const area=()=>{const state={};return {get:async key=>({[key]:state[key]}),set:async value=>Object.assign(state,value),remove:async keys=>{for(const key of [].concat(keys))delete state[key];}};};
global.chrome={storage:{local:area(),session:area()}};
let denied=false;global.KiCadManagedPolicy={assertNetwork:async()=>{},assertWrites:async()=>{if(denied)throw Error('Provider writes disabled');}};
global.KiCadGitLabHosts={allowed:async()=>true};
const github=require('../github-review-api.js'),gitlab=require('../gitlab-review-api.js'),sha='a'.repeat(40),input={repository:'owner/board',ref:'main',file:'board.kicad_pcb',sha,name:'new-board',confirmed:true};
test('credential-owning adapters preserve provider origins, strict redirects and actual fork response status',async t=>{
 const previous=global.fetch;t.after(()=>global.fetch=previous);
 for(const [provider,api,host]of [['github',github,'https://api.github.com'],['gitlab',gitlab,'https://gitlab.com']]){
  const token=provider+'_fork_test_'+ 'x'.repeat(25);if(provider==='github')await api.setToken(token);else await api.setToken(host,token);
  let created=false,writes=0;global.fetch=async(url,options)=>{
   const u=new URL(url);assert.equal(u.origin,host);assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.headers.Authorization,'Bearer '+token);
   const p=u.pathname,gh=provider==='github';let data,status=200;
   if(p===(gh?'/user':'/api/v4/user'))data={id:1,...(gh?{login:'reader'}:{username:'reader'})};
   else if(p===(gh?'/repos/owner/board':'/api/v4/projects/owner%2Fboard'))data={id:10,...(gh?{full_name:'owner/board'}:{path_with_namespace:'owner/board'})};
   else if(p.endsWith('/commits/'+sha))data=gh?{sha}:{id:sha};
   else if(p===(gh?'/repos/owner/board/forks':'/api/v4/projects/10/fork')){created=true;writes++;status=gh?202:201;data={id:20,...(gh?{full_name:'reader/new-board',fork:true,parent:{id:10}}:{path_with_namespace:'reader/new-board',forked_from_project:{id:10}})};}
   else if(p===(gh?'/repos/reader/new-board':'/api/v4/projects/reader%2Fnew-board')&&!created){status=404;data={};}
   else if(p===(gh?'/repos/reader/new-board':'/api/v4/projects/20'))data={id:20,default_branch:'main',import_status:'finished',...(gh?{full_name:'reader/new-board'}:{path_with_namespace:'reader/new-board'})};
   else if(options.method==='GET'&&p.includes(gh?'/git/ref/heads/':'/repository/branches/')){status=404;data={};}
   else if(p===(gh?'/repos/reader/new-board/git/refs':'/api/v4/projects/20/repository/branches')){writes++;status=201;data=gh?{ref:'refs/heads/review/aaaaaaaaaaaa',object:{sha}}:{name:'review/aaaaaaaaaaaa',commit:{id:sha}};}
   else throw Error('Unexpected endpoint '+p);
   return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
  };
  const result=await api.forkRevision({...input,provider,...(provider==='gitlab'?{host}:{})});assert.equal(result.partial,false);assert.equal(writes,2);
 }
 denied=true;let requested=false;global.fetch=async()=>{requested=true;throw Error('Unexpected request');};
 await assert.rejects(github.forkRevision(input),/writes disabled/);await assert.rejects(gitlab.forkRevision({...input,host:'https://gitlab.com'}),/writes disabled/);assert.equal(requested,false);denied=false;
});
