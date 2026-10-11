const test=require('node:test'),assert=require('node:assert/strict');
const diff=require('../design-diff.js'),model=require('../design-model.js'),nets=require('../net-model.js'),pcb=require('../pcb-renderer.js'),sch=require('../schematic-renderer.js');
for(const [path,content,renderer] of [
 ['board.kicad_pcb','(kicad_pcb (layers (0 "F.Cu" signal)) (net 1 "GND") (segment (start 0 0) (end 10 0) (width .2) (layer "F.Cu") (net 1) (uuid "track")))',pcb],
 ['root.kicad_sch','(kicad_sch (global_label "SIGNAL" (at 0 0) (uuid "label")) (wire (pts (xy 0 0) (xy 10 0)) (uuid "wire")))',sch]
])test(`shared preparation preserves objects, drawing and connectivity: ${path}`,()=>{
 const files=[{path,content}],snapshot=diff.prepareProject(files),ast=diff.preparedFile(snapshot,path),before=JSON.stringify(ast);
 const baseline=renderer.build(diff.parse(content),path),prepared=renderer.build(ast,path);
 assert.deepEqual(prepared,baseline);
 assert.deepEqual(model.buildProject(files,null,snapshot),model.buildProject(files));
 assert.deepEqual(nets.build(files,new Map([[path,prepared]]),snapshot),nets.build(files,new Map([[path,baseline]])));
 assert.equal(JSON.stringify(ast),before);
 let callbackAst;diff.projectObjects(files,(_,root)=>callbackAst=root,snapshot);assert.equal(callbackAst,ast);
 const records=diff.projectObjects(files,null,snapshot);records[0].id='changed';assert.notEqual(diff.projectObjects(files,null,snapshot)[0].id,'changed');
});
test('prepared sources reject changes, invalid handles and invalid input',()=>{
 const files=[{path:'root.kicad_sch',content:'(kicad_sch)'}],snapshot=diff.prepareProject(files);
 for(const changed of [[],[{...files[0],path:'other.kicad_sch'}],[{...files[0],content:'(kicad_sch (uuid "new"))'}]])assert.throws(()=>diff.projectObjects(changed,null,snapshot),/differs from source/);
 assert.throws(()=>diff.projectObjects(files,null,{}),/differs from source/);
 assert.throws(()=>diff.preparedFile(snapshot,'absent.kicad_sch'),/unavailable/);
 assert.throws(()=>diff.prepareProject([...files,...files]),/duplicate/);
 assert.throws(()=>diff.prepareProject([{...files[0],content:'(kicad_sch'}]),/Incomplete/);
});
