const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
global.KiCadGitHub=require('../parsing.js');const launch=require('../project-launch.js');
async function ui(response,search='?source=https%3A%2F%2Fgithub.com%2Fowner%2Frepo&ref=HEAD'){
 const nodes=new Map(),requests=[],replaced=[];
 const node=()=>({textContent:'',hidden:false,className:'',children:[],replaceChildren(){this.children=[];},append(n){this.children.push(n);},addEventListener(type,fn){this[type]=fn;}});
 const document={getElementById:id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},createElement:node};
 vm.runInNewContext(fs.readFileSync(require.resolve('../project-launcher.js'),'utf8'),{document,location:{search,replace:url=>replaced.push(url)},URLSearchParams,KiCadProjectLaunch:launch,chrome:{runtime:{getURL:p=>'moz-extension://test/'+p,sendMessage:async m=>{requests.push(m);return response;}}}});
 await new Promise(setImmediate);return{nodes,requests,replaced};
}
test('single detected project replaces launcher with pinned standalone viewer',async()=>{
 const view=await ui({ok:true,result:{sha:'a'.repeat(40),projects:['design/board.kicad_pro']}});
 assert.equal(view.replaced.length,1);const url=new URL(view.replaced[0]);assert.equal(url.pathname,'/project-viewer.html');assert.equal(url.searchParams.get('head'),'a'.repeat(40));assert.equal(url.searchParams.get('file'),'design/board.kicad_pro');
 assert.equal(view.requests[0].type,'repository-detect');assert.equal(view.requests[0].source,'https://github.com/owner/repo');
});
test('multiple projects and partial listings remain selectable without hiding omissions',async()=>{
 for(const result of [{sha:'b'.repeat(40),projects:['a.kicad_pro','b.kicad_pro']},{sha:'b'.repeat(40),projects:['a.kicad_pro'],truncated:true}]){
  const view=await ui({ok:true,result});assert.equal(view.replaced.length,0);assert.equal(view.nodes.get('launchProjects').children.length,result.projects.length);assert.match(view.nodes.get('launchTitle').textContent,/Choose/);
  assert.ok(view.nodes.get('launchProjects').children.every(n=>n.href.startsWith('moz-extension://test/project-viewer.html?')));
 }
});
test('empty, denied and malformed discovery have distinct visible feedback',async()=>{
 const empty=await ui({ok:true,result:{sha:'a'.repeat(40),projects:[]}});assert.equal(empty.nodes.get('launchTitle').textContent,'No KiCad project detected');
 const denied=await ui({ok:false,error:'Network disabled by administrator policy'});assert.match(denied.nodes.get('launchStatus').textContent,/administrator/);assert.equal(denied.nodes.get('launchStatus').className,'error');assert.equal(denied.nodes.get('launchRetry').hidden,false);
 const unsafe=await ui({ok:true,result:{sha:'a'.repeat(40),projects:['../bad.kicad_pro']}});assert.equal(unsafe.replaced.length,0);assert.equal(unsafe.nodes.get('launchProjects').children.length,0);assert.equal(unsafe.nodes.get('launchStatus').className,'error');
 const elsewhere=await ui(null,'');assert.equal(elsewhere.requests.length,0);assert.equal(elsewhere.nodes.get('launchTitle').textContent,'No KiCad project detected');
});
