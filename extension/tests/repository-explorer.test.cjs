const test=require('node:test'),assert=require('node:assert/strict');
const {pathOK,fileKind,treeRows,graphRows,sourceURL}=require('../repository-explorer.js');
const sha=n=>n.toString(16).padStart(40,'0');
test('tree retains ancestry, folder-first order and expansion without unsafe paths',()=>{
 const entries=[{path:'z.txt',type:'blob'},{path:'src/board.kicad_pcb',type:'blob'},{path:'src/a.kicad_sch',type:'blob'},{path:'../secret',type:'blob'}];
 assert.deepEqual(treeRows(entries,new Set()).map(x=>x.path),['src','z.txt']);
 const rows=treeRows(entries,new Set(['src']));assert.equal(rows[1].depth,1);assert.equal(rows[1].kind,'schematic');
 assert.deepEqual(treeRows(entries,new Set(),'board').map(x=>x.path),['src','src/board.kicad_pcb']);
 for(const p of ['/etc/a','a/../b','a\\b','a//b','a\u0000b',''])assert.equal(pathOK(p),false);
});
test('symlink and submodule metadata never masquerade as drawings',()=>{
 assert.equal(fileKind({path:'x.kicad_pcb',type:'blob',mode:'120000'}),'symlink');
 assert.equal(fileKind({path:'sub',type:'commit'}),'submodule');
 assert.equal(fileKind({path:'models/a.step',type:'blob'}),'model');
});
test('merge graph follows real parents, joins shared ancestry and reports unloaded continuation',()=>{
 const graph=graphRows([{sha:sha(1),parents:[sha(2),sha(3)]},{sha:sha(2),parents:[sha(4)]},{sha:sha(3),parents:[sha(4)]},{sha:sha(4),parents:[sha(5)]}]);
 assert.equal(graph.rows[0].segments.length,2);assert.equal(graph.rows[1].lanes,2);
 assert.equal(graph.rows[2].segments.filter(x=>!x.through).length,1);
 assert.deepEqual(graph.continuations.map(x=>x.sha),[sha(5)]);
});
test('out-of-order history points explicitly above instead of inventing a descending edge',()=>{
 const g=graphRows([{sha:sha(1),parents:[]},{sha:sha(2),parents:[sha(1)]}]);
 assert.deepEqual(g.rows[1].earlier,[sha(1)]);assert.equal(g.rows[1].segments.length,0);assert.equal(g.continuations.length,0);
});
test('source links encode paths, pin revision and reject untrusted/local scopes',()=>{
 const opts={repository:'team/repo',provider:'github'};
 assert.equal(sourceURL(opts,sha(1),'folder/a b.txt'),'https://github.com/team/repo/blob/'+sha(1)+'/folder/a%20b.txt');
 assert.equal(sourceURL({...opts,provider:'gitlab',host:'https://git.example'},sha(1),'a'),'https://git.example/team/repo/-/blob/'+sha(1)+'/a');
 for(const value of [{...opts,local:true},{...opts,repository:'../repo'},{...opts,provider:'gitlab',host:'http://git.example'},{...opts,provider:'gitlab',host:'https://user:secret@git.example'}])assert.equal(sourceURL(value,sha(1),'a'),null);
 assert.equal(sourceURL(opts,'main','a'),null);
});
const fs=require('node:fs'),vm=require('node:vm');
function harness(request,local=false){
 let document;
 class E{
  constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.attrs={};this.style={setProperty(){}};this.value='';this.scrollTop=0;this.inert=false;this._text='';}
  append(...items){for(const x of items){this.children.push(x);x.parent=this;}}
  prepend(...items){this.children.unshift(...items);for(const x of items)x.parent=this;}
  replaceChildren(...items){this.children=[];this.append(...items);}
  set textContent(v){this._text=String(v);this.children=[];}get textContent(){return this._text+this.children.map(x=>x.textContent).join(' ');}
  setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k]??null;}
  addEventListener(){}removeEventListener(){}focus(){document.activeElement=this;}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
  querySelectorAll(sel){const all=this.children.flatMap(x=>[x,...x.querySelectorAll(sel)]);return all.filter(x=>sel==='button'?x.tagName==='button':sel==='.repo-file-row'?x.className==='repo-file-row':false);}
  querySelector(sel){return this.querySelectorAll(sel)[0]||null;}closest(){return this.className==='repo-file-row'?this:this.parent?.closest?.();}
  get options(){return this.children;}click(){return this.onclick?.();}
 }
 document={createElement:t=>new E(t),createElementNS:(ns,t)=>new E(t),addEventListener(){},removeEventListener(){},body:new E('body'),activeElement:null};
 const underlying=new E('main');document.body.append(underlying);
 const context={document,URL,console,Option:class extends E{constructor(text,value){super('option');this.textContent=text;this.value=value;}},open(){}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../repository-explorer.js'),'utf8'),context);
 const opened=context.KiCadRepositoryExplorer.open({repository:'team/repo',ref:local?'workspace':'main',local,request});
 const find=text=>opened.page.querySelectorAll('button').find(x=>x.textContent===text);
 return{...opened,find,context,underlying};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('runtime pins later remote pages and restores underlying focus access on close',async()=>{
 const requests=[];const h=harness(async(type,fields)=>{requests.push({type,...fields});if(type==='repository-tree')return{sha:sha(1),entries:[{path:'a.txt',type:'blob'}]};if(type==='repository-branches')return{branches:[]};return{sha:sha(1),commits:[{sha:sha(fields.page),parents:[sha(fields.page+1)],message:'Commit '+fields.page}],hasMore:fields.page===1,nextPage:2};});
 await tick();assert.equal(h.underlying.inert,true);await h.find('Load older commits').click();await tick();
 const next=requests.find(x=>x.type==='repository-history'&&x.page===2);assert.equal(next.sha,sha(1));assert.equal(next.ref,sha(1));
 assert.match(h.page.textContent,/Commit 2/);h.close();assert.equal(h.underlying.inert,false);
});
test('runtime preserves VS Code workspace scope while selecting a historical SHA',async()=>{
 const requests=[];const h=harness(async(type,fields)=>{requests.push({type,...fields});return type==='repository-tree'?{workingTree:true,sha:sha(1),entries:[]}:type==='repository-branches'?{branches:[]}:{sha:sha(1),commits:[{sha:sha(2),parents:[],message:'Older commit'}]};},true);
 await tick();h.find('Browse files').click();await tick();const selected=requests.filter(x=>x.type==='repository-tree').at(-1);
 assert.equal(selected.ref,'workspace');assert.equal(selected.sha,sha(2));assert.match(h.page.textContent,/Working files/);h.close();
});
test('runtime discards late responses after close',async()=>{
 const pending=[];const h=harness((type)=>new Promise(resolve=>pending.push(()=>resolve(type==='repository-tree'?{entries:[{path:'late',type:'blob'}]}:type==='repository-history'?{commits:[]}:{branches:[]}))));
 h.close();for(const resolve of pending)resolve();await tick();assert.equal(h.context.document.body.children.length,1);assert.equal(h.underlying.inert,false);
});
test('truncated recursive tree fetches pinned root and exposes root pagination',async()=>{
 const requests=[];const h=harness(async(type,fields)=>{requests.push({type,...fields});if(type!=='repository-tree')return type==='repository-history'?{commits:[]}:{branches:[]};if(fields.directory===undefined)return{sha:sha(3),entries:[],truncated:true};return{sha:sha(3),entries:[{path:fields.page===1?'folder':'other',type:'tree'}],hasMore:fields.page===1,nextPage:2};});
 await tick();await tick();const first=requests.find(x=>x.directory==='');assert.equal(first.ref,sha(3));assert.equal(first.sha,sha(3));
 await h.find('More root files and folders').click();await tick();assert.match(h.page.textContent,/other/);h.close();
});
test('initial remote history uses the tree snapshot even if the branch advances',async()=>{
 const requests=[];const h=harness(async(type,fields)=>{requests.push({type,...fields});if(type==='repository-tree')return{sha:sha(7),entries:[]};if(type==='repository-history')return{sha:fields.sha||sha(8),commits:[]};return{branches:[]};});
 await tick();await tick();const history=requests.find(x=>x.type==='repository-history');assert.equal(history.ref,sha(7));assert.equal(history.sha,sha(7));h.close();
});
test('GitLab source link rejects host query and fragment',()=>{
 for(const host of ['https://git.example/?x=1','https://git.example/#section'])assert.equal(sourceURL({provider:'gitlab',host,repository:'team/repo'},sha(1),'a'),null);
});
test('local no-Git directory requests omit a non-SHA workspace revision',async()=>{
 const requests=[];const h=harness(async(type,fields)=>{requests.push({type,...fields});if(type==='repository-tree')return fields.directory===undefined?{entries:[{path:'folder',type:'tree'}],truncated:true}:{entries:[],workingTree:true};return type==='repository-history'?{commits:[]}:{branches:[]};},true);
 await tick();await tick();const directory=requests.find(x=>x.directory==='');assert.equal(directory.ref,'workspace');assert.equal(directory.sha,undefined);h.close();
});
test('mismatched directory snapshots are rejected without merging foreign files',async()=>{
 const h=harness(async(type,fields)=>type==='repository-tree'?(fields.directory===undefined?{sha:sha(3),entries:[],truncated:true}:{sha:sha(4),entries:[{path:'foreign',type:'blob'}]}):type==='repository-history'?{sha:sha(3),commits:[]}:{branches:[]});
 await tick();await tick();assert.match(h.page.textContent,/revision changed unexpectedly/);assert.doesNotMatch(h.page.textContent,/foreign/);h.close();
});
