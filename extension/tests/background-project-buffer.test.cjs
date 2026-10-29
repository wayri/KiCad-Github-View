/* Actual worker dispatch + website snapshot transport, independent of legacy API helpers. */
const test=require('node:test'),assert=require('node:assert/strict');
const SHA='a'.repeat(40),origin='chrome-extension://buffer-test/';let listener,fixture;
global.KiCadGitHub=require('../parsing.js');global.KiCadBrowserData=require('../browser-data.js');global.KiCadGitHubSessionReader=require('../github-session-reader.js');global.KiCadGitHubProjectBuffer=require('../github-project-buffer.js');global.KiCadGitHubProjectView=require('../github-project-view.js');global.KiCadReviewComments=require('../review-comments.js');global.KiCadGitHubReviewApi=require('../github-review-api.js');global.KiCadProjectLaunch=require('../project-launch.js');
global.importScripts=()=>{};const storage=()=>{const entries=new Map();return {get:async key=>({[key]:entries.get(key)}),set:async values=>{for(const [k,v]of Object.entries(values))entries.set(k,v);},remove:async key=>entries.delete(key)};};
global.chrome={runtime:{id:'buffer-test',getURL:path=>origin+path,onMessage:{addListener:fn=>listener=fn}},storage:{local:storage(),session:storage()},action:{onClicked:{addListener(){}},setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{},setTitle:async()=>{}},tabs:{query:async()=>[{id:51,url:'https://github.com/'+fixture.repository+'/tree/main'}],sendMessage:async(id,message)=>{fixture.session.push(message);if(message.type!=='github-session-read')return {ok:true};if(fixture.sessionError)throw fixture.sessionError;if(message.action==='resolve')return {ok:true,result:{sha:SHA,items:fixture.tree('')}};if(message.action==='directory')return {ok:true,result:{sha:SHA,items:fixture.tree(message.path)}};if(message.action==='file')return {ok:true,result:{sha:SHA,content:fixture.sources.get(message.path)??null}};return {ok:true,result:null};}},windows:{create:async()=>({id:1})}};
global.fetch=async(url,options)=>{fixture.fetches.push({url:String(url),options});assert.equal(new URL(url).hostname,'raw.githubusercontent.com','default project route must not call GitHub API');assert.equal(options.credentials,'omit');assert.equal(options.headers?.Authorization,undefined);const prefix='https://raw.githubusercontent.com/'+fixture.repository+'/'+SHA+'/';assert.ok(String(url).startsWith(prefix));const path=decodeURIComponent(String(url).slice(prefix.length));if(fixture.private)return new Response('',{status:404});const source=fixture.sources.get(path);return source===undefined?new Response('',{status:404}):new Response(source);};
require('../background.js');
const viewer=(name='revision-viewer.html')=>({id:'buffer-test',url:origin+name,tab:{id:80},frameId:0,documentId:name});
function message(request,sender=viewer()){return new Promise(resolve=>{if(!listener(request,sender,resolve))resolve({ignored:true});});}
function setup(repository,sources){fixture={repository,sources:new Map(Object.entries(sources)),session:[],fetches:[],tree(directory){const result=new Map();for(const path of this.sources.keys()){const segments=path.split('/'),prefix=directory?directory+'/':'';if(!path.startsWith(prefix))continue;const tail=path.slice(prefix.length),first=tail.split('/')[0],entry=prefix+first;result.set(entry,{path:entry,type:tail.includes('/')?'directory':'file'});}return [...result.values()];}};return {repository,ref:SHA,file:[...fixture.sources.keys()].find(p=>p.endsWith('.kicad_pcb'))||[...fixture.sources.keys()][0]};}
test('owned viewers share pinned project source bytes across layout, 3D and detached requests with no GitHub API',async t=>{
 await KiCadGitHubReviewApi.setToken('github_pat_'+'z'.repeat(40));t.after(()=>KiCadGitHubReviewApi.clearToken());
 const scope=setup('buffer/shared',{'design/board.kicad_pcb':'(kicad_pcb)','design/board.kicad_sch':'(kicad_sch)','design/board.kicad_pro':'{}','models/body.step':'ISO-10303-21;'});
 const project=await message({...scope,type:'project'});assert.equal(project.ok,true,project.error);assert.equal(project.result[0].content,'(kicad_pcb)');
 const reads=fixture.fetches.length;
 const second=await message({...scope,type:'project'},viewer('pcb-viewer.html'));assert.equal(second.ok,true,second.error);assert.equal(fixture.fetches.length,reads,'second independent viewer reuses immutable bytes');
 const inventory=await message({...scope,type:'project-inventory'});assert.equal(inventory.ok,true,inventory.error);assert.ok(inventory.result.files.some(f=>f.path==='design/board.kicad_sch'));
 const models=await message({...scope,type:'repo-model-index'});assert.equal(models.ok,true,models.error);assert.deepEqual(models.result.paths,['models/body.step']);
 const raw=await message({...scope,type:'project-file',file:'design/board.kicad_pcb'});assert.equal(raw.ok,true,raw.error);assert.equal(fixture.fetches.length,reads);
 assert.ok(fixture.session.every(m=>!m.token&&!m.cookie&&!m.url));assert.ok(fixture.fetches.every(c=>!c.url.includes('api.github.com')));
});
test('session-only private snapshots do not request API tokens and reject foreign senders before reads',async()=>{
 const scope=setup('buffer/private',{'board.kicad_pcb':'(kicad_pcb)'});fixture.private=true;
 const bad=await message({...scope,type:'project'},{id:'other',url:origin+'revision-viewer.html'});assert.notEqual(bad.ok,true);assert.equal(fixture.session.length+fixture.fetches.length,0);
 const opened=await message({...scope,type:'project'});assert.equal(opened.ok,true,opened.error);assert.ok(fixture.session.some(m=>m.action==='file'));assert.equal(fixture.fetches.length,1);
 const count=fixture.session.length+fixture.fetches.length;assert.equal((await message({...scope,type:'project-file',file:'../secret'})).ok,false);assert.equal(fixture.session.length+fixture.fetches.length,count);
});
test('API-free commit and branch browsing returns explicit guidance without API history traffic',async()=>{
 const scope=setup('buffer/history',{'board.kicad_pcb':'(kicad_pcb)'});
 for(const type of ['repository-branches','revision-branches','repository-history','revision-commits']){const reply=await message({...scope,type});assert.equal(reply.ok,true,reply.error);assert.match(reply.result.warnings.join(' '),/API-free/);assert.deepEqual(reply.result.commits||reply.result.branches,[]);}
 assert.equal(fixture.fetches.length,0);assert.equal(fixture.session.length,0);
});
