const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const local=require('../local-project.js'),MiB=1024*1024;
const project=files=>({files,assets:[]}),text=(name,content)=>({path:name,content}),store={getItem:()=>null,setItem(){}};

test('in-memory PCB accepts Marble-sized source above32MiB and remains bounded at64MiB',()=>{
 const content='(kicad_pcb)'+ ' '.repeat(44059775-11),valid=local.validate(project([text('Marble.kicad_pcb',content)]));
 assert.equal(Buffer.byteLength(valid.files[0].content),44059775);
 assert.equal(local.validate(project([text('limit.kicad_pcb',' '.repeat(64*MiB))])).files.length,1);
 assert.throws(()=>local.validate(project([text('too-large.kicad_pcb',' '.repeat(64*MiB+1))])),/64 MiB/);
});

test('format limits use UTF8 bytes and maintain96MiB aggregate bound',()=>{
 assert.throws(()=>local.validate(project([text('multi.kicad_pcb','é'.repeat(32*MiB+1))])),/64 MiB/);
 assert.throws(()=>local.validate(project([text('root.sch','é'.repeat(4*MiB+1))])),/8 MiB/);
 assert.throws(()=>local.validate(project([text('root.kicad_sch',' '.repeat(8*MiB+1))])),/8 MiB/);
 assert.throws(()=>local.validate(project([text('root.lib',' '.repeat(8*MiB+1))])),/8 MiB/);
 assert.throws(()=>local.validate(project([text('report.txt',' '.repeat(32*MiB+1))])),/32 MiB/);
 const content=' '.repeat(32*MiB);assert.equal(local.validate(project(['a.txt','b.txt','c.txt'].map(p=>text(p,content)))).files.length,3);
 assert.throws(()=>local.validate(project([...['a.txt','b.txt','c.txt'].map(p=>text(p,content)),text('d.txt','é')])),/96 MiB/);
});

test('PDF/model bounds and disk256MiB perfile/1GiB aggregate remain unchanged',()=>{
 const diskFile=(name,size,index)=>({path:name,size,diskPath:'/assets/viewer/downloaded/'+'a'.repeat(32)+'/'+index}),base={diskBacked:true,assets:[]};
 assert.equal(local.validate({...base,files:[diskFile('board.kicad_pcb',256*MiB,0)]}).files[0].size,256*MiB);
 assert.throws(()=>local.validate({...base,files:[diskFile('board.kicad_pcb',256*MiB+1,0)]}),/disk project/);
 const files=Array.from({length:4},(_,i)=>diskFile(i+'.kicad_pcb',256*MiB,i));assert.equal(local.validate({...base,files}).files.length,4);
 assert.throws(()=>local.validate({...base,files:[...files,diskFile('extra.kicad_pcb',1,4)]}),/1 GiB/);
 assert.throws(()=>local.validate({...base,files:[],assets:[diskFile('manual.pdf',32*MiB+1,0)]}),/PDF exceeds32 MiB|PDF exceeds 32 MiB/);
 for(const name of ['part.step','manual.pdf'])assert.throws(()=>local.validate({files:[text('board.kicad_pcb','(kicad_pcb)')],assets:[{path:name,base64:'A'.repeat(44*MiB+4)}]}),/Invalid model asset/);
});

test('legacy production transport discovers sheets and binds saved cache library without network',async()=>{
 globalThis.KiCadBrowserData=require('../browser-data.js');
 const content=fs.readFileSync(path.join(__dirname,'fixtures/legacy-vna2/vna2.sch'),'utf8'),library=fs.readFileSync(path.join(__dirname,'fixtures/legacy-vna2/vna2-cache.lib'),'utf8'),value=local.validate(project([text('hw/vna2.sch',content),text('hw/vna2-cache.lib',library),text('hw/vna2.pro','[general]'),text('hw/transmitter.sch','EESchema Schematic File Version 2\n$EndSCHEMATC\n')])),transport=local.transport(value,store,{local:true});
 const reply=await transport.send({type:'project',file:'hw/vna2.sch'});assert.equal(reply.ok,true,reply.error);const root=reply.result.find(f=>f.path==='hw/vna2.sch');assert.equal(root.legacyLibraries[0].path,'hw/vna2-cache.lib');assert.equal(root.legacyLibraries[0].content,library);assert.ok(reply.result.some(f=>f.path==='hw/transmitter.sch'));
 const built=require('../design-diff.js').prepareProject(reply.result);assert.ok(require('../design-model.js').buildProject(reply.result,null,built).objects.length>47);
 const drawings=await transport.send({type:'drawing-files'});assert.deepEqual(drawings.result.files,['hw/vna2.sch','hw/transmitter.sch']);
 const search=await transport.send({type:'project-search-files'});assert.equal(search.result.settings[0].path,'hw/vna2.pro');assert.equal(search.result.totalDrawings,2);
 const inventory=await local.transport(local.validate(project([text('note.txt','é漢')])),store,{local:true}).send({type:'project-inventory'});assert.equal(inventory.result.files[0].size,5);
 assert.equal(local.drawing('hw/vna2-cache.lib'),false);assert.equal(local.drawing('hw/vna2.sch'),true);assert.equal(local.validate(project([text('only.pro','[general]')])).files.length,1);
});
