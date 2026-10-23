const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const handoff=require('../review-handoff.js');
const design=require('../design-model.js');
const bom=require('../bom-manager.js');
const path='hardware/board.kicad_pcb';
const files=()=>[{path,content:'(kicad_pcb (version 20240108) (layers (0 "F.Cu" signal) (31 "B.Cu" signal)) (footprint "Resistor:R_0603" (layer "F.Cu") (at 20 30) (uuid "r1-uuid") (property "Reference" "R1") (property "Value" "10k") (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu") (net 1 "GND"))))'}];
const scope=()=>({repository:'owner/board',ref:'a'.repeat(40),file:path});
const partId=()=>bom.model(design.buildProject(files()).objects,'footprint')[0].id;
function state(extra={}){const s=scope();return{scope:s,variant:'default',config:null,bom:{scope:handoff.bomScope(s),parts:{[partId()]:{Assembly:'verified',Notes:'Checked on bench'}}},comments:[{id:'bench-note',text:'Confirm R1',createdAt:'2026-10-11T08:00:00.000Z',anchor:{...s,uuid:'r1-uuid',reference:'R1',kind:'footprint',position:{x:20,y:30}}}],view:{file:path,camera:{x:20,y:30,zoom:2},selection:{uuid:'r1-uuid',kind:'footprint'},ruler:{kind:'distance',points:[{x:20,y:30},{x:22,y:30}]}},...extra};}
const target=(s=scope(),variant='default',config=null)=>({scope:s,bomScope:handoff.bomScope(s,variant),activeFile:path,config});
const encoded=async(extra={})=>handoff.create(state(extra),files());
test('fingerprints bind exact UTF-8 contents and paths, independent of source ordering',async()=>{
 const board=files()[0],sheet={path:'hardware/root.kicad_sch',content:'(kicad_sch (version 20250114) (uuid "sheet-1") (text "µA 测试" (at 1 1) (effects (font (size 1 1)))))'};
 const actual=await handoff.fingerprints([sheet,board,{path:'README.md',content:'not a drawing'}]);
 assert.deepEqual(actual,await handoff.fingerprints([board,sheet]));assert.equal(actual[0].sha256,crypto.createHash('sha256').update(board.content).digest('hex'));
 assert.equal(actual[1].sha256,crypto.createHash('sha256').update(sheet.content,'utf8').digest('hex'));assert.notDeepEqual(actual,await handoff.fingerprints([board,{...sheet,content:sheet.content+'\n'}]));
 const text=await encoded();assert.equal((await handoff.prepare(text,target(),files())).parts[partId()].Assembly,'verified');
 await assert.rejects(handoff.prepare(text,target(),[{...board,content:board.content+' '}]),/paths or contents differ/);
 await assert.rejects(handoff.prepare(text,target(),[{...board,path:'other/board.kicad_pcb'}]),/paths or contents differ/);
 await assert.rejects(handoff.prepare(text,target(),[board,sheet]),/paths or contents differ/);
});
test('cross-repository/provider/ref transfer rebases anchors and clears publication data, retaining embedded evidence',async()=>{
 const s=state(),note=s.comments[0];note.mentions=['alice'];note.remoteRefs=[{kind:'issue',repository:'owner/board',number:7,url:'https://github.com/owner/board/issues/7',publishedAt:note.createdAt}];note.attachments=[{provider:'github',repository:'owner/board',mime:'image/png',url:'https://github.com/user-attachments/assets/01234567-89ab-cdef-0123-456789abcdef',width:200,height:100}];note.capture={mime:'image/png',width:200,height:100,dataUrl:'data:image/png;base64,iVBORw0KGgo='};
 const text=await handoff.create(s,files()),newScope={provider:'gitlab',host:'https://gitlab.example',repository:'group/subgroup/board',ref:'b'.repeat(40),file:path};
 const prepared=await handoff.prepare(text,target(newScope),files()),rebased=prepared.comments[0];
 assert.equal(prepared.translated,true);for(const field of ['provider','host','repository','ref','file'])assert.equal(rebased.anchor[field],newScope[field]);assert.deepEqual(rebased.remoteRefs,[]);assert.deepEqual(rebased.mentions,[]);assert.equal(rebased.attachments?.length||0,0);assert.deepEqual(rebased.capture,note.capture);assert.equal(rebased.id,note.id);
 assert.equal(JSON.parse(text).comments[0].remoteRefs.length,1,'prepare does not mutate the exported file');
 const local={repository:'android/local-board',ref:'c'.repeat(40),file:path};assert.equal((await handoff.prepare(text,target(local),files())).comments[0].anchor.repository,local.repository);
});
test('existing variants merge only when matching definitions agree and conflicts remain unchanged',async()=>{
 const config={schemaVersion:1,variants:[{id:'proto',name:'Prototype',parts:[{path,reference:'R1',populated:false}]}]},normalized=design.parseVariantConfig(JSON.stringify(config),'variants.json');
 const text=await encoded({variant:'proto',config,bom:{scope:handoff.bomScope(scope(),'proto'),parts:{}}});
 assert.equal((await handoff.prepare(text,target(scope(),'proto',normalized),files())).config.variants[0].id,'proto');
 const conflict=design.parseVariantConfig(JSON.stringify({...config,variants:[{...config.variants[0],name:'Conflicting prototype'}]}),'variants.json'),before=JSON.stringify(conflict);
 await assert.rejects(handoff.prepare(text,target(scope(),'proto',conflict),files()),/conflicts with existing metadata/);assert.equal(JSON.stringify(conflict),before);
 const extended=design.parseVariantConfig(JSON.stringify({...config,variants:[...config.variants,{id:'production',name:'Production',parts:[]}]}),'variants.json');assert.equal((await handoff.prepare(text,target(scope(),'proto',extended),files())).config.variants.length,2);
});
test('unknown BoM identities and inconsistent root, active view or assembly scopes cannot import',async()=>{
 const data=JSON.parse(await encoded());data.bom.parts['unknown-part']={Assembly:'verified'};
 await assert.rejects(handoff.prepare(JSON.stringify(data),target(),files()),/unknown saved part/);
 const text=await encoded();await assert.rejects(handoff.prepare(text,{...target(),scope:{...scope(),file:'other.kicad_pcb'}},files()),/same root/);
 await assert.rejects(handoff.prepare(text,{...target(),activeFile:'other.kicad_pcb'},files()),/Open hardware/);
 await assert.rejects(handoff.prepare(text,{...target(),bomScope:'wrong'},files()),/target assembly scope/);
});
test('malformed, oversized, duplicate and missing source data are rejected',async()=>{
 assert.throws(()=>handoff.parse('{'),/JSON/);assert.throws(()=>handoff.parse('x'.repeat(4*1024*1024+1)),/4 MiB/);
 await assert.rejects(handoff.fingerprints([]),/requires.*drawings/);await assert.rejects(handoff.fingerprints(Array.from({length:129},(_,i)=>({path:`board-${i}.kicad_pcb`,content:'(kicad_pcb)'}))),/requires.*drawings/);await assert.rejects(handoff.fingerprints([...files(),...files()]),/Duplicate/);await assert.rejects(handoff.fingerprints([{path,content:null}]),/unavailable/);await assert.rejects(handoff.fingerprints([{path:'../board.kicad_pcb',content:'x'}]),/file/);
 const original=JSON.parse(await encoded());for(const mutate of [d=>{d.sources=[];},d=>d.sources.push({...d.sources[0]}),d=>{d.sources[0].sha256='bad';},d=>{d.sources[0].path='another.kicad_pcb';},d=>{d.unexpected='value';},d=>{d.variant='absent';}]){const d=structuredClone(original);mutate(d);assert.throws(()=>handoff.parse(JSON.stringify(d)));}
});
test('portable view fields obey finite camera, selection and ruler bounds',async()=>{
 const original=JSON.parse(await encoded());for(const mutate of [d=>{d.view.file='missing.kicad_pcb';},d=>{d.view.camera.zoom=0;},d=>{d.view.camera.x=1e7;},d=>{d.view.camera.extra=true;},d=>{d.view.selection.uuid='';},d=>{d.view.selection.kind=42;},d=>{d.view.selection.netCode=42;},d=>{d.view.selection.command='execute';},d=>{d.view.ruler.points.pop();},d=>{d.view.ruler.kind='arc';},d=>{d.view.ruler.points[0].x=1e7;},d=>{d.view.ruler.points[0].z=1;}]){const d=structuredClone(original);mutate(d);assert.throws(()=>handoff.parse(JSON.stringify(d)));}
 const empty=structuredClone(original);empty.view.camera=empty.view.selection=empty.view.ruler=null;assert.equal(handoff.parse(JSON.stringify(empty)).view.camera,null);
});
