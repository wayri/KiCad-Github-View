'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../extension.js'),'utf8'),SHA='a'.repeat(40),OLD='b'.repeat(40);
class Uri{
 constructor(value){const u=new URL(value);Object.assign(this,{scheme:u.protocol.slice(0,-1),authority:u.host,path:u.pathname,query:u.search.slice(1),fragment:''});}
 static joinPath(base,...parts){return base.with({path:path.posix.join(base.path,...parts)});}
 get fsPath(){return this.path;}
 with(changes){return Object.assign(Object.create(Uri.prototype),this,changes);}
 toString(){return `${this.scheme}://${this.authority}${this.path}${this.query?'?'+this.query:''}`;}
}
function harness(){
 const root=new Uri('file:///repo'),boundary=new Uri('file:///repo/hardware'),uri=Uri.joinPath(boundary,'root.kicad_sch');
 const data=new Map([['hardware/root.kicad_sch','(kicad_sch (sheet (property "Sheetfile" "sub/child.kicad_sch")))'],['hardware/sub/child.kicad_sch','(kicad_sch)'],['hardware/models/part.step','SAVED MODEL'],['hardware/drc.json','{"saved":true}'],['hardware/board.kicad_pcb','(kicad_pcb)'],['hardware/board.kicad_pro','{}']]);
 const reads=[],panels=[],states=new Map();let created;
 const reader={async read(request){reads.push(request);assert.ok([SHA,OLD].includes(request.sha));if(!data.has(request.path))throw Error('Missing historical source');return{bytes:new TextEncoder().encode(data.get(request.path))};},async inventory({sha,directory}){return{sha,source:'git-object',workingTree:false,warnings:[],entries:[...data.keys()].filter(p=>p.startsWith(directory+'/')).map(p=>({path:p,name:p.split('/').at(-1),kind:'file',type:'blob',size:data.get(p).length}))};},async tree(request){return{...await this.inventory(request),treeRef:request.sha,hasMore:false,nextPage:null};}};
 const repo={rootUri:root,state:{HEAD:{commit:SHA},refs:[]},getCommit:async sha=>({hash:sha}),log:async options=>[{hash:options.refNames[0],parents:[],message:'Saved commit message',authorName:'Fixture'}]};
 const vscode={Uri,FileType:{File:1,Directory:2,SymbolicLink:64},ViewColumn:{Beside:2},workspace:{isTrusted:true,getWorkspaceFolder:()=>({uri:boundary}),fs:{async readFile(target){assert.ok(target.path.startsWith('/extension/'),'working source must never be read');return new TextEncoder().encode('<html><head></head><section id="commentsPane"><h2>Comments</h2><p class="hint">Notes</p></section></html>');},async stat(){throw Error('Working-tree stat forbidden');},async writeFile(){throw Error('Writes forbidden');}}},extensions:{getExtension:()=>({isActive:true,exports:{getAPI:()=>({git:{path:'/official/git'},repositories:[repo]})}})},window:{createWebviewPanel(type,title,column,options){const panel={title,options,webview:{cspSource:'test:',asWebviewUri:x=>x,onDidReceiveMessage:fn=>(panel.receive=fn,{dispose(){}}),postMessage:async message=>{panel.messages.push(message);}},messages:[],onDidDispose:fn=>panel.onDispose=fn,dispose(){this.onDispose?.();}};panels.push(panel);return panel;}},commands:{executeCommand(){throw Error('Working file open forbidden');}}};
 const sandbox={module:{exports:{}},require(name){if(name==='vscode')return vscode;if(name==='./media/parsing.js')return require('../../extension/parsing.js');if(name==='./media/review-comments.js')return require('../../extension/review-comments.js');if(name==='./remote-collaboration.js')return{createHost:()=>({operations:new Set(['comment-publish']),publicContext:async()=>null,dispatch:async()=>{throw Error('Historical remote publication reached provider');}})};if(name==='./git-history-tree.js')return{createGitHistoryReader(options){created=options;return reader;}};throw Error('Unexpected module '+name);},TextDecoder,TextEncoder,Uint8Array,URLSearchParams,crypto:require('node:crypto').webcrypto};
 vm.runInNewContext(source,sandbox);const api=sandbox.module.exports._test,context={extensionUri:new Uri('file:///extension'),workspaceState:{get:k=>states.get(k),update:async(k,v)=>states.set(k,v)}};
 const session=api.createSession(uri,{scope:{boundary,rootFile:'root.kicad_sch',repository:'local/workspace',ref:'workspace'},files:[{path:'root.kicad_sch',content:'WORKING'}]},context,'c'.repeat(48));
 let id=0;async function send(request){let reply;await api.handleMessage({channel:api.CHANNEL,token:session.token,id:++id,request:{repository:session.scope.repository,ref:session.scope.ref,...request}},session,message=>{reply=message.reply;});return reply;}
 return{api,vscode,session,send,panels,data,reads,reader,get created(){return created;}};
}
test('selected commit trees use official Git root and immutable entries with workspace prefix removed',async()=>{
 const h=harness(),reply=await h.send({type:'repository-tree',sha:OLD,directory:''});
 assert.equal(reply.ok,true);assert.equal(reply.result.workingTree,false);assert.equal(reply.result.canOpenHistorical,true);assert.equal(reply.result.treeRef,OLD);assert.ok(reply.result.entries.some(e=>e.path==='root.kicad_sch'));
 assert.equal(h.created.gitPath,'/official/git');assert.equal(h.created.rootPath,'/repo');assert.equal(h.created.isTrusted(),true);
 h.vscode.workspace.isTrusted=false;const denied=await h.send({type:'repository-tree',sha:OLD,directory:''});assert.equal(denied.ok,false);assert.match(denied.error,/trusted desktop/);
});
test('opening saved source creates an independent SHA-pinned session with saved hierarchy and assets',async()=>{
 const h=harness(),reply=await h.send({type:'repository-open-file',path:'root.kicad_sch',sha:OLD});assert.equal(reply.ok,true);assert.equal(reply.result.workingTree,false);
 const panel=h.panels[0],bootstrap=JSON.parse(panel.webview.html.match(/globalThis.KiCadVSCodeContext=(.*?);<\/script>/)[1]);assert.equal(bootstrap.historical,true);assert.match(bootstrap.search,new RegExp(OLD));assert.match(panel.title,/bbbbbbbb/);
 let id=0;async function saved(request){await panel.receive({channel:h.api.CHANNEL,token:bootstrap.token,id:++id,request:{repository:'local/workspace',ref:OLD,file:'root.kicad_sch',...request}});return panel.messages.at(-1).reply;}
 const project=await saved({type:'project'});assert.equal(project.ok,true);assert.deepEqual(Array.from(project.result,f=>f.path),['root.kicad_sch','sub/child.kicad_sch']);assert.ok(!project.result.some(f=>f.content==='WORKING'));
 const history=await saved({type:'repository-history'});assert.equal(history.ok,true);assert.equal(history.result.commits[0].sha,OLD);assert.equal(history.result.commits[0].message,'Saved commit message');
 assert.equal((await saved({type:'project-file',file:'board.kicad_pcb'})).result.content,'(kicad_pcb)');
 assert.equal((await saved({type:'repo-asset',file:'models/part.step'})).result.base64,Buffer.from('SAVED MODEL').toString('base64'));
 assert.equal((await saved({type:'repo-model-index'})).result.paths[0],'models/part.step');
 assert.equal((await saved({type:'rule-report',reportPath:'drc.json'})).result.content,'{"saved":true}');
 assert.equal((await saved({type:'project-inventory'})).result.snapshotRef,OLD);
 const search=await saved({type:'project-search-files'});assert.equal(search.ok,true);assert.equal(search.result.settings[0].path,'board.kicad_pro');assert.ok(h.reads.every(read=>read.sha===OLD));
 for(const type of ['comment-save','comment-delete','comment-publish']){const denied=await saved({type});assert.equal(denied.ok,false);assert.match(denied.error,/read-only/);}
 assert.equal((await saved({type:'comment-list'})).result.length,0);
 const missing=await saved({type:'project-file',file:'missing.kicad_pcb'});assert.equal(missing.ok,false);assert.match(missing.error,/Missing historical source/);
 panel.dispose();
});
test('historical open rejects traversal, missing sources and unavailable Git without working fallback',async()=>{
 const h=harness();for(const file of ['../outside.kicad_pcb','missing.kicad_pcb'])assert.equal((await h.send({type:'repository-open-file',sha:OLD,path:file})).ok,false);
 assert.equal(h.panels.length,0);h.vscode.extensions.getExtension=()=>undefined;
 const missing=await h.send({type:'repository-tree',sha:OLD,directory:''});assert.equal(missing.ok,false);assert.match(missing.error,/No working files were substituted/);
});
