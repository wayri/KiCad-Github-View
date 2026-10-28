const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../local-viewer.js'),'utf8'),renderer=source.slice(source.indexOf('function list(){'),source.indexOf('async function install('));
function fixture(paths){
 class Node{constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.attributes={};this.value='';this.textContent='';}append(...nodes){this.children.push(...nodes);}replaceChildren(){this.children=[];}setAttribute(key,value){this.attributes[key]=value;}}
 const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,new Node('div'));return elements.get(id);},opened=[],folderState=new Map(),context={active:{paths:new Set(paths)},folderState,document:{createElement:tag=>new Node(tag)},$:get,openDrawing:file=>opened.push(file)};
 vm.runInNewContext(renderer+';globalThis.render=list;',context);get('primaryFile').value=paths[0];context.render();return{get,opened,folderState,render:context.render};
}
const flatten=node=>[node,...node.children.flatMap(flatten)];
test('local tree preserves physical folders and opens only the individually selected imported path',()=>{
 const f=fixture(['schematics/main.kicad_sch','schematics/sub/power.kicad_sch','board.kicad_pcb','models/part.step']);
 const nodes=flatten(f.get('fileList')),main=nodes.find(node=>node.tag==='button'&&node.textContent==='main.kicad_sch');assert.equal(main.attributes['aria-current'],'page');assert.equal(main.title,'schematics/main.kicad_sch');
 const power=nodes.find(node=>node.tag==='button'&&node.textContent==='power.kicad_sch');power.onclick();assert.deepEqual(f.opened,['schematics/sub/power.kicad_sch']);assert.ok(nodes.some(node=>node.tag==='summary'&&node.textContent==='schematics'));assert.ok(nodes.some(node=>node.tag==='summary'&&node.textContent==='sub'));
 const model=nodes.find(node=>node.tag==='button'&&node.textContent==='part.step');assert.equal(model.disabled,true);assert.match(model.title,/model asset/);
});
test('search temporarily expands matches without overwriting folder collapse preferences or reading sources',()=>{
 const f=fixture(['schematics/main.kicad_sch','schematics/sub/power.kicad_sch','board.kicad_pcb']);f.folderState.set('schematics/',false);f.render();
 let folder=flatten(f.get('fileList')).find(node=>node.tag==='details');assert.equal(folder.open,false);
 f.get('fileFilter').value='power';f.render();folder=flatten(f.get('fileList')).find(node=>node.tag==='details');assert.equal(folder.open,true);folder.ontoggle();assert.equal(f.folderState.get('schematics/'),false);assert.equal(flatten(f.get('fileList')).filter(node=>node.tag==='button').length,1);
 f.get('fileFilter').value='';f.render();assert.equal(flatten(f.get('fileList')).find(node=>node.tag==='details').open,false);assert.equal(f.opened.length,0);
 f.get('fileFilter').value='not imported';f.render();assert.equal(f.get('fileList').children[0].textContent,'No imported file matches this filter.');
});
test('large inventories stay bounded and hostile-looking filenames remain literal text',()=>{
 const paths=['<img>.kicad_sch',...Array.from({length:250},(_,index)=>'folder/part-'+index+'.kicad_pcb')],f=fixture(paths),nodes=flatten(f.get('fileList'));
 assert.equal(nodes.filter(node=>node.tag==='button').length,200);assert.ok(nodes.some(node=>node.textContent==='Showing 200 of 251 files. Filter to find another path.'));assert.ok(nodes.some(node=>node.tag==='button'&&node.textContent==='<img>.kicad_sch'));
});
