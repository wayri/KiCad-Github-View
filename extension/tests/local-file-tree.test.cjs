const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../local-viewer.js'),'utf8'),renderer=source.slice(source.indexOf('function list(){'),source.indexOf('async function install('));
function fixture(paths,listed=[]){
 class Node{constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.attributes={};this.value='';this.textContent='';}append(...nodes){this.children.push(...nodes);}replaceChildren(){this.children=[];}setAttribute(key,value){this.attributes[key]=value;}}
 const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,new Node('div'));return elements.get(id);},opened=[],folderState=new Map(),context={active:{paths:new Set(paths),treePaths:new Set([...paths,...listed])},folderState,document:{createElement:tag=>new Node(tag)},$:get,openDrawing:file=>opened.push(file)};
 vm.runInNewContext(renderer+';globalThis.render=list;globalThis.folders=setFolders;',context);get('primaryFile').value=paths[0];context.render();return{get,opened,folderState,render:context.render,folders:context.folders};
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
 f.get('fileFilter').value='not imported';f.render();assert.equal(f.get('fileList').children[0].textContent,'No project file matches this filter.');
});
test('large inventories stay bounded and hostile-looking filenames remain literal text',()=>{
 const paths=['<img>.kicad_sch',...Array.from({length:250},(_,index)=>'folder/part-'+index+'.kicad_pcb')],f=fixture(paths),nodes=flatten(f.get('fileList'));
 assert.equal(nodes.filter(node=>node.tag==='button'&&node.className!=='file-tree-more').length,200);const more=nodes.find(node=>node.className==='file-tree-more');assert.ok(more);assert.match(more.textContent,/51 remaining/);more.onclick();assert.equal(flatten(f.get('fileList')).filter(node=>node.tag==='button').length,251);assert.ok(nodes.some(node=>node.tag==='button'&&node.textContent==='<img>.kicad_sch'));
});

test('all selected filenames appear in foldable folders without granting unsupported source reads',()=>{
 const f=fixture(['board.kicad_pcb'],['docs/README.md','firmware/nested/program.bin']);
 const readme=flatten(f.get('fileList')).find(n=>n.tag==='button'&&n.textContent==='README.md');assert.equal(readme.disabled,true);assert.match(readme.title,/contents were not imported/);readme.onclick();assert.equal(f.opened.length,0);
 f.folders(true);assert.ok(flatten(f.get('fileList')).filter(n=>n.tag==='details').every(n=>n.open));
 f.folders(false);assert.ok(flatten(f.get('fileList')).filter(n=>n.tag==='details').every(n=>!n.open));
 f.get('fileFilter').value='program';f.render();assert.ok(flatten(f.get('fileList')).some(n=>n.tag==='button'&&n.textContent==='program.bin'));assert.ok(flatten(f.get('fileList')).filter(n=>n.tag==='details').every(n=>n.open));
 f.get('fileFilter').value='';f.render();assert.ok(flatten(f.get('fileList')).filter(n=>n.tag==='details').every(n=>!n.open));
});
