'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
global.KiCadBrowserData=require('../browser-data.js');global.KiCadGitHub=require('../parsing.js');global.KiCadReviewComments=require('../review-comments.js');global.KiCadGitLabProvider=require('../gitlab-provider.js');
let listener,sidecarChecks=0;const store=new Map();global.KiCadReviewFileStore={status:async()=>{sidecarChecks++;return {connected:true};}};global.KiCadGitHubReviewApi={tokenStatus:()=>{throw new Error('GitHub token accessed');}};
global.importScripts=()=>{};global.chrome={runtime:{id:'test',getURL:path=>'chrome-extension://test/'+path,onMessage:{addListener:callback=>listener=callback}},action:{onClicked:{addListener(){}}},storage:{local:{get:async key=>({[key]:store.get(key)}),set:async items=>{for(const [key,value]of Object.entries(items))store.set(key,value);}}}};
const worker=require('../background.js'),viewer={id:'test',url:'chrome-extension://test/browser-viewer.html'},tab={id:'test',url:'https://gitlab.com/group/board/-/blob/main/board.kicad_pcb'};
const message=(request,sender=viewer)=>new Promise(resolve=>{if(!listener(request,sender,resolve))resolve({ignored:true});});
test('GitLab worker permits only exact host and explicit provider, rejects token and remote publication routes',async()=>{
 assert.equal(worker.senderAllowed(tab),true);assert.equal(worker.senderAllowed({...tab,url:'https://gitlab.com.evil.test/group/board'}),false);
 assert.equal((await message({type:'github-auth-status',provider:'gitlab'})).ok,false);
 assert.equal((await message({type:'github-publish-comment',provider:'gitlab'})).ok,false);
 assert.match((await message({type:'project',provider:'other'})).error,/Unsupported/);
 assert.match((await message({type:'github-auth-status'},tab)).error,/must specify/);
 assert.match((await message({type:'github-auth-status',provider:'gitlab'},{id:'test',url:'https://github.com/group/board'})).error,/does not match/);
 assert.equal((await message({type:'comment-list',provider:'gitlab'},tab)).ok,false);
});
test('GitLab annotations remain local, provider-isolated and bypass the GitHub sidecar',async()=>{
 const now=new Date().toISOString(),scope={provider:'gitlab',repository:'group/sub/board',ref:'main',file:'board.kicad_pcb'};
 const note={id:'note',text:'Check board',severity:'minor',state:'open',createdAt:now,updatedAt:now,anchor:scope};
 const saved=await message({type:'comment-save',provider:'gitlab',comment:note});assert.equal(saved.ok,true, saved.error);assert.equal(saved.result.anchor.provider,'gitlab');assert.equal(sidecarChecks,0);
 assert.equal((await message({type:'comment-list',...scope})).result.length,1);assert.equal(store.size,1);assert.match([...store.keys()][0],/^review-comments:gitlab:/);
 assert.match((await message({type:'comment-save',provider:'github',comment:note})).error,/must use/);
 assert.equal((await message({type:'comment-delete',...scope,id:'note'})).result.deleted,true);assert.equal((await message({type:'comment-list',...scope})).result.length,0);assert.equal(sidecarChecks,0);
});
test('GitLab project hierarchy retrieval uses immutable revision and subgroup namespace',async t=>{
 const previous=global.fetch,sha='a'.repeat(40),calls=[];global.fetch=async url=>{calls.push(url);if(url.includes('/commits/'))return new Response(JSON.stringify({id:sha}));if(url.includes('/tree?'))return new Response('[]');assert.equal(new URL(url).searchParams.get('ref'),sha);return new Response('(kicad_pcb)');};t.after(()=>global.fetch=previous);
 const result=await message({type:'project',provider:'gitlab',repository:'group/sub/board',ref:'feature/pcb',file:'board.kicad_pcb'},tab);assert.equal(result.ok,true,result.error);assert.equal(result.result[0].content,'(kicad_pcb)');assert.ok(calls.every(url=>url.startsWith('https://gitlab.com/api/v4/projects/group%2Fsub%2Fboard/')));
});

test('GitLab leaf discovery finds roots across folders from one pinned recursive tree',async t=>{
 const previous=global.fetch,sha='a'.repeat(40),calls=[];
 const sources=new Map([
  ['design/main.kicad_sch','(kicad_sch (sheet (property "Sheetfile" "../shared/leaf.kicad_sch")))'],
  ['shared/leaf.kicad_sch','(kicad_sch)'],['another/root.kicad_sch','(kicad_sch)']
 ]);
 global.fetch=async url=>{calls.push(url);if(url.includes('/commits/'))return new Response(JSON.stringify({id:sha}));const parsed=new URL(url);assert.equal(parsed.searchParams.get('ref'),sha);
  if(url.includes('/tree?')){assert.equal(parsed.searchParams.get('recursive'),'true');return new Response(JSON.stringify([...sources.keys()].map(path=>({path,type:'blob',mode:'100644'}))));}
  const path=decodeURIComponent(parsed.pathname.split('/files/')[1].replace(/\/raw$/,''));assert.ok(sources.has(path));return new Response(sources.get(path));
 };t.after(()=>global.fetch=previous);
 const result=await message({type:'project',provider:'gitlab',repository:'group/sub/board',ref:'feature/sheets',file:'shared/leaf.kicad_sch'});
 assert.equal(result.ok,true,result.error);assert.deepEqual(result.result.map(file=>file.path),['design/main.kicad_sch','shared/leaf.kicad_sch']);
 assert.equal(calls.filter(url=>url.includes('/tree?')).length,1);assert.equal(calls.filter(url=>url.includes('/commits/')).length,1);
 assert.equal(result.result[0].discoveryWarning,undefined);
});


test('GitLab saved rule reports are pinned to the resolved drawing revision',async t=>{
 const previous=global.fetch,sha='c'.repeat(40),calls=[];global.fetch=async url=>{calls.push(url);if(url.includes('/commits/'))return new Response(JSON.stringify({id:sha}));assert.equal(new URL(url).searchParams.get('ref'),sha);return new Response('{"violations":[]}');};t.after(()=>global.fetch=previous);
 const result=await message({type:'rule-report',provider:'gitlab',repository:'group/sub/board',ref:'main',file:'board.kicad_pcb',reportPath:'reports/drc.json'});
 assert.equal(result.ok,true,result.error);assert.equal(result.result.path,'reports/drc.json');assert.equal(calls.length,2);
});
