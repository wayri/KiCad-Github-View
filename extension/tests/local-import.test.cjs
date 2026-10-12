const test=require('node:test'),assert=require('node:assert/strict'),api=require('../local-import.js'),local=require('../local-project.js');
const file=(name,text)=>({name,size:Buffer.byteLength(text),arrayBuffer:async()=>Uint8Array.from(Buffer.from(text)).buffer});
test('selected folder keeps hierarchy/model paths and imports only supported inert files',async()=>{
 const result=await api.readFiles([{path:'project/root.kicad_sch',file:file('root.kicad_sch','(kicad_sch)')},{path:'project/child/power.kicad_sch',file:file('power.kicad_sch','(kicad_sch)')},{path:'project/models/part.wrl',file:file('part.wrl','#VRML')},{path:'project/readme.md',file:file('readme.md','ignore')}],{stripFolder:true});
 assert.deepEqual(result.project.files.map(f=>f.path),['root.kicad_sch','child/power.kicad_sch']);assert.equal(result.project.assets[0].path,'models/part.wrl');assert.equal(Buffer.from(result.project.assets[0].base64,'base64').toString(),'#VRML');assert.equal(result.ignored,1);
});
test('local import rejects unsafe paths, collisions, oversized and non-UTF8 sources before install',async()=>{
 for(const path of ['../root.kicad_sch','/root.kicad_sch','C:/root.kicad_sch'])await assert.rejects(api.readFiles([{path,file:file('x','(kicad_sch)')}]),/Invalid local path/);
 await assert.rejects(api.readFiles([file('root.kicad_sch','a'),file('root.kicad_sch','b')]),/Duplicate/);
 let read=false;await assert.rejects(api.readFiles([{name:'board.kicad_pcb',size:33*1024*1024,arrayBuffer:async()=>{read=true;}}]),/32 MiB/);assert.equal(read,false);
 await assert.rejects(api.readFiles([{name:'root.kicad_sch',size:1,arrayBuffer:async()=>Uint8Array.of(255).buffer}]),/UTF-8/);
 await assert.rejects(api.readFiles([{name:'root.kicad_sch',size:3,arrayBuffer:async()=>Uint8Array.of(1).buffer}]),/changed/);
 await assert.rejects(api.readFiles([file('README.md','not a design')]),/Choose a KiCad/);
});
test('source scope fingerprints are stable for file ordering and change with saved contents',async()=>{
 const {project}=await api.readFiles([file('root.kicad_sch','(kicad_sch)'),file('board.kicad_pcb','(kicad_pcb)')]);const a=await api.identify(project),b=await api.identify({...project,files:[...project.files].reverse()});assert.equal(a.ref,b.ref);
 const c=await api.identify({...project,files:project.files.map(f=>({...f,content:f.content+' '}))});assert.notEqual(a.ref,c.ref);
 const storage={getItem:()=>null,setItem(){}};const transport=local.transport(a.project,storage,{local:true,ref:a.ref});assert.equal(transport.scope,'local/'+a.project.id);assert.equal(transport.ref,a.ref);
 assert.equal((await transport.send({type:'project-file',repository:transport.scope,ref:c.ref,file:'root.kicad_sch'})).ok,false);
 assert.equal((await transport.send({type:'github-publish-comment',repository:transport.scope,ref:a.ref})).ok,false);
});
test('folder drop consumes paginated directory entries and normalizes a single folder root',async()=>{
 const leaf=(name,text)=>({name,isFile:true,file:ok=>ok(file(name,text))});let reads=0;const directory={name:'project',isDirectory:true,createReader:()=>({readEntries:ok=>ok(++reads===1?[leaf('root.kicad_sch','(kicad_sch)')]:reads===2?[leaf('board.kicad_pcb','(kicad_pcb)')]:[])})};
 const result=await api.dropped({items:[{kind:'file',webkitGetAsEntry:()=>directory}]});assert.equal(reads,3);assert.deepEqual(result.project.files.map(f=>f.path),['root.kicad_sch','board.kicad_pcb']);
 const plain=await api.dropped({files:[file('root.kicad_sch','(kicad_sch)')]});assert.equal(plain.project.files[0].path,'root.kicad_sch');
});
