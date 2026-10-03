const test=require('node:test'),assert=require('node:assert/strict');
const {parse,MAX_BYTES,validFile}=require('../rule-reports.js');
const uuid='11111111-2222-3333-4444-555555555555',child='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const item=()=>({uuid,description:'Pad 1 [GND]',pos:{x:100,y:200}});
const violation=()=>({type:'clearance',description:'Clearance violation',severity:'error',items:[item()],excluded:false});
const report=(kind='drc',units='mm')=>({$schema:`https://schemas.kicad.org/${kind}.v1.json`,source:`sensor.kicad_${kind==='erc'?'sch':'pcb'}`,date:'2026-10-04T12:30:00Z',kicad_version:'10.0.0',coordinate_units:units,...(kind==='drc'?{violations:[violation()],unconnected_items:[],schematic_parity:[]}:{sheets:[{path:'/',uuid_path:'/'+uuid,violations:[violation()]},{path:'/Power/',uuid_path:'/'+uuid+'/'+child,violations:[violation()]}]})});
const read=(value,options)=>parse(JSON.stringify(value),options);
test('official DRC categories and provenance survive import without claiming revision verification',()=>{
 const value=report();value.unconnected_items=[{...violation(),severity:'warning'}];value.schematic_parity=[{...violation(),excluded:true,comment:'Intentional'}];value.included_severities=['error','warning','exclusion'];value.ignored_checks=[{key:'via_dangling',description:'Dangling via'}];
 const result=read(value,{file:'boards/sensor.kicad_pcb',reportPath:'checks/sensor-drc.json',revision:'abc123'});
 assert.equal(result.findings.length,3);assert.deepEqual(result.findings.map(v=>v.category),['violations','unconnected_items','schematic_parity']);assert.equal(new Set(result.findings.map(v=>v.id)).size,3);
 assert.deepEqual(result.findings[0].items[0].position,{x:100,y:200});assert.equal(result.findings[0].items[0].file,'boards/sensor.kicad_pcb');assert.equal(result.findings[2].excluded,true);assert.equal(result.findings[2].comment,'Intentional');
 assert.equal(result.metadata.source,value.source);assert.equal(result.metadata.date,value.date);assert.equal(result.metadata.kicadVersion,'10.0.0');assert.equal(result.metadata.associationVerified,false);assert.equal(result.metadata.reportPath,'checks/sensor-drc.json');assert.equal(result.metadata.revision,'abc123');assert.deepEqual(result.metadata.ignoredChecks,value.ignored_checks);assert.match(result.warnings[0],/unverified/);
});
test('all official coordinate units convert correctly to millimetres including negative coordinates',()=>{
 for(const [unit,scale] of [['mm',1],['mils',0.0254],['in',25.4]]){const value=report('drc',unit);value.violations[0].items[0].pos={x:-2,y:4};const result=read(value);assert.equal(result.findings[0].items[0].position.x,-2*scale);assert.equal(result.findings[0].items[0].position.y,4*scale);assert.equal(result.metadata.coordinateUnits,unit);}
});
test('ERC preserves sheet hierarchy and unassociated positions until explicit file mapping',()=>{
 const value=report('erc'),result=read(value,{file:'root/sensor.kicad_sch'});
 assert.equal(result.findings[0].file,'root/sensor.kicad_sch');assert.equal(result.findings[1].file,null);assert.equal(result.findings[1].items[0].file,null);assert.deepEqual(result.findings[1].items[0].position,{x:100,y:200});assert.equal(result.findings[1].sheetPath,'/Power/');assert.equal(result.findings[1].sheetUuidPath,'/'+uuid+'/'+child);assert.equal(result.sheets[1].uuidPath,result.findings[1].sheetUuidPath);assert.match(result.warnings.join(' '),/display names are not filenames/);
 const mapped=read(value,{file:'root/sensor.kicad_sch',sheetFiles:{['/'+uuid+'/'+child]:'root/power-circuit.kicad_sch'}});assert.equal(mapped.findings[1].items[0].file,'root/power-circuit.kicad_sch');
});
test('missing positions remain unlocated and no source basename is guessed as file association',()=>{
 const value=report();delete value.violations[0].items[0].pos;delete value.violations[0].items[0].uuid;const result=read(value);assert.equal(result.findings[0].items[0].position,null);assert.equal(result.findings[0].file,null);assert.match(result.warnings.join(' '),/no position/);
 assert.match(read(report(),{file:'other.kicad_pcb'}).warnings.join(' '),/filename differs/);
});
test('recognized reports without schema are flagged and unknown schemas or fields fail closed',()=>{
 const value=report();delete value.$schema;assert.match(read(value).warnings.join(' '),/no schema/);
 for(const mutate of [v=>v.$schema='https://schemas.kicad.org/drc.v2.json',v=>v.sheets=[],v=>v.violations[0].rule='unrecognized',v=>v.violations[0].items[0].pos.z=1,v=>v.violations[0].items[0].unexpected=true]){const bad=report();mutate(bad);assert.throws(()=>read(bad),/KiCad check report/);}
});
test('malformed JSON metadata severities coordinates and identities are rejected',()=>{
 assert.throws(()=>parse('{'),/Invalid JSON/);
 for(const mutate of [v=>delete v.coordinate_units,v=>v.coordinate_units='inch',v=>v.date='yesterday',v=>v.violations[0].severity='critical',v=>v.violations[0].excluded='yes',v=>v.violations[0].items[0].uuid='R1',v=>v.violations[0].items[0].pos.x='100',v=>v.violations[0].items[0].pos.y=1e9,v=>delete v.violations[0].items]){const bad=report();mutate(bad);assert.throws(()=>read(bad),/KiCad check report/);}
 assert.throws(()=>read(report(),{kind:'erc'}),/kind/);assert.throws(()=>read(report('erc'),{sheetFiles:{'/Power/':'power.kicad_sch'}}),/sheet association/);
 const erc=report('erc');erc.sheets.push(erc.sheets[0]);assert.throws(()=>read(erc),/Duplicate/);
});
test('bounded paths payload and finding/item counts prevent unbounded import work',()=>{
 for(const path of ['/board.kicad_pcb','../board.kicad_pcb','a//board.kicad_pcb','a\\board.kicad_pcb','C:board.kicad_pcb','board.kicad_sch'])assert.equal(validFile(path,'drc'),false);
 assert.equal(validFile('project/board.kicad_pcb','drc'),true);assert.throws(()=>read(report(),{file:'../board.kicad_pcb'}),/association/);
 assert.throws(()=>parse(' '.repeat(MAX_BYTES+1)),/5 MiB/);
 const tooMany=report();tooMany.violations=Array(10001).fill(violation());assert.throws(()=>read(tooMany),/10000/);
 const tooManyItems=report();tooManyItems.violations[0].items=Array(101).fill(item());assert.throws(()=>read(tooManyItems),/100/);
});
