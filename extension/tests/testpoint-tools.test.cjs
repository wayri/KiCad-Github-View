const test=require('node:test');
const assert=require('node:assert/strict');
const tools=require('../testpoint-tools.js');
const design=require('../design-model.js');
const net=require('../net-model.js');
const diff=require('../design-diff.js');
const pcb=require('../pcb-renderer.js');
const sch=require('../schematic-renderer.js');
const board=(path,body)=>({path,content:`(kicad_pcb (version 20240108) (layers (0 "F.Cu" signal) (31 "B.Cu" signal)) ${body})`});
const footprint=(ref,id,extra='')=>`(footprint "TestPoint:TestPoint_2Pads" (at 100 100 90) (property "Reference" "${ref}") (property "Value" "Probe") (uuid "${id}")
 (pad "1" smd circle (at 2 3) (size 1 1) (layers "F.Cu") (net 1 "VCC") (uuid "${id}-1"))
 (pad "2" smd circle (at 4 3) (size 1 1) (layers "F.Cu") (net 2 "GND") (uuid "${id}-2"))
 (pad "3" smd circle (at 6 3) (size 1 1) (layers "F.Cu") (net 0 "") (uuid "${id}-3")) ${extra})`;
function model(files){const designs=new Map(files.map(f=>[f.path,(f.path.endsWith('_pcb')?pcb:sch).build(diff.parse(f.content),f.path)]));return {...design.buildProject(files),...net.build(files,designs),designs};}
test('native multi-pad testpoints retain each saved net and rotated absolute pad position',()=>{
 const source=board('hardware/a.kicad_pcb','(net 1 "VCC") (net 2 "GND")'+footprint('TP1','tp'));
 const result=tools.summarize(model([source]));assert.equal(result.rows.length,3);
 assert.deepEqual(result.rows.map(r=>[r.reference,r.padNumber,r.netName,r.status]),[['TP1','1','VCC','saved net'],['TP1','2','GND','saved net'],['TP1','3','','no net']]);
 assert.deepEqual(result.rows[0].position,{x:103,y:98});assert.equal(result.rows[0].padUuid,'tp-1');assert.equal(result.rows[0].classification,'inferred');
 assert.ok(result.rows[0].netId.startsWith('hardware/a.kicad_pcb/'));
});
test('duplicate references and UUIDs across files keep their source scope and never join by reference',()=>{
 const result=tools.summarize(model([board('a.kicad_pcb',footprint('TP1','same')),board('child/b.kicad_pcb',footprint('TP1','same').replaceAll('"VCC"','"OTHER"'))]));
 assert.equal(result.rows.length,6);assert.equal(new Set(result.rows.map(r=>r.id)).size,6);
 assert.equal(result.rows.find(r=>r.path==='a.kicad_pcb'&&r.padNumber==='1').netName,'VCC');
 assert.equal(result.rows.find(r=>r.path==='child/b.kicad_pcb'&&r.padNumber==='1').netName,'OTHER');
});
test('saved explicit marker has priority; testpoint library/value inference avoids arbitrary TP substrings',()=>{
 assert.equal(tools.classify({reference:'J1',properties:{Testpoint:'Yes'}}).classification,'explicit');
 assert.equal(tools.classify({reference:'J1',properties:{'Library ID':'TestPoint:TestPoint_Pad'}}).classification,'inferred');
 assert.equal(tools.classify({reference:'J1',properties:{Value:'Test Point'}}).classification,'inferred');
 assert.equal(tools.classify({reference:'HTTP12',properties:{Value:'FTP'}}),null);
 assert.equal(tools.classify({reference:'TP1',properties:{Testpoint:'No'}}).classification,'inferred');
});
const schematic=(path='root.kicad_sch',wire=true)=>({path,content:`(kicad_sch (version 20250114)
 (lib_symbols (symbol "Connector:TestPoint" (property "Reference" "TP") (property "Value" "TestPoint")
 (symbol "TestPoint_0_1" (circle (center 0 0) (radius 1) (stroke (width 0) (type default)) (fill (type none))))
 (symbol "TestPoint_1_1" (pin passive line (at 0 0 0) (length 2.54) (name "~" (effects (font (size 1 1)))) (number "1" (effects (font (size 1 1)))))
 (pin passive line (at 0 5 0) (length 2.54) (name "~" (effects (font (size 1 1)))) (number "2" (effects (font (size 1 1)))))
 (pin passive line (at 0 10 0) (length 2.54) (name "~" (effects (font (size 1 1)))) (number "3" (effects (font (size 1 1))))))))
 (symbol (lib_id "Connector:TestPoint") (at 20 30 0) (unit 1) (uuid "point") (property "Reference" "TP2") (property "Value" "TestPoint"))
 ${wire?'(wire (pts (xy 20 30) (xy 30 30)) (uuid "wire")) (label "SIGNAL" (at 30 30 0) (uuid "label"))':''}
 (no_connect (at 20 25) (uuid "nc")))`});
test('schematic pins retain source connectivity, explicit no-connect and isolated unresolved states',()=>{
 const result=tools.summarize(model([schematic()]));assert.equal(result.rows.length,3);
 assert.equal(result.rows.find(r=>r.padNumber==='1').netName,'SIGNAL');
 assert.equal(result.rows.find(r=>r.padNumber==='1').status,'source connectivity');
 assert.equal(result.rows.find(r=>r.padNumber==='2').status,'no connect');
 assert.equal(result.rows.find(r=>r.padNumber==='3').status,'unresolved');
 assert.match(result.warnings.join(' '),/Cross-sheet/);
});
test('same schematic TP reference in child sheets remains separate',()=>{
 const result=tools.summarize(model([schematic('root.kicad_sch'),schematic('sub/child.kicad_sch')]));
 assert.equal(result.rows.length,6);assert.equal(new Set(result.rows.map(r=>r.id)).size,6);assert.equal(new Set(result.rows.filter(r=>r.netId).map(r=>r.netId)).size,2);
});
test('pad declaration fallback preserves unresolved names instead of guessing nearby nets',()=>{
 const m=design.buildProject([board('b.kicad_pcb',footprint('TP1','tp').replace('(net 1 "VCC")','(net 9)'))]);
 const result=tools.summarize(m);assert.equal(result.rows[0].status,'unresolved name');assert.equal(result.rows[0].netCode,'9');assert.equal(result.rows[0].netName,'');
});
test('CSV escapes quotes, newlines and spreadsheet formulas, including leading whitespace',()=>{
 const output=tools.csv([{reference:' =HYPERLINK("evil")',value:'line\nnext',position:{x:2,y:-3}}]);
 assert.match(output,/"' =HYPERLINK\(""evil""\)"/);assert.match(output,/"line\nnext"/);assert.match(output,/"'-3"/);
});
test('bounded model inputs reject excess work',()=>{
 assert.throws(()=>tools.summarize({objects:new Array(tools.LIMITS.objects+1)}),/object limit/);
 assert.throws(()=>tools.summarize({}),/saved design model/);
 const m={objects:[],nets:[{members:new Array(tools.LIMITS.members+1).fill({})}]};assert.throws(()=>tools.summarize(m),/member limit/);
});

test('testpoint search combines terms and supports scoped fields and quoted net names',()=>{
 const rows=[{reference:'TP1',padNumber:'1',netName:'POWER GOOD',path:'power/main.kicad_pcb',value:'Probe',status:'saved net'},
  {reference:'TP2',padNumber:'2',netName:'POWER GOOD',path:'logic.kicad_pcb',value:'Probe',status:'saved net'},
  {reference:'TP3',padNumber:'1',netName:'GND',path:'power/main.kicad_pcb',value:'Probe',status:'saved net'}];
 assert.deepEqual(tools.filterRows(rows,'ref:tp net:"power good" pad:1 file:power'),[rows[0]]);
 assert.deepEqual(tools.filterRows(rows,'POWER GOOD logic'),[rows[1]]);
 assert.deepEqual(tools.filterRows(rows,'pad:2'),[rows[1]]);
 assert.equal(tools.filterRows(rows,'net:GND file:logic').length,0);
 assert.deepEqual(tools.filterRows(rows,''),rows);
});

test('connectivity, source and detection filters retain unresolved evidence instead of treating it as resolved',()=>{
 const rows=[{kind:'footprint',classification:'explicit',netId:'a/net:1',status:'saved net'},
  {kind:'symbol',classification:'inferred',netId:'b/net:1',status:'source connectivity'},
  {kind:'footprint',classification:'inferred',netId:'a/net:9',status:'unresolved name'},
  {kind:'symbol',classification:'explicit',netId:'',status:'no connect'},
  {kind:'footprint',classification:'inferred',netId:'',status:'no net'}];
 assert.deepEqual(tools.filterRows(rows,'',{connectivity:'connected'}),rows.slice(0,2));
 assert.deepEqual(tools.filterRows(rows,'',{connectivity:'unresolved'}),rows.slice(2));
 assert.deepEqual(tools.filterRows(rows,'',{source:'symbol',detection:'explicit'}),[rows[3]]);
 assert.deepEqual(tools.filterRows(rows,'',{source:'footprint',detection:'explicit',connectivity:'connected'}),[rows[0]]);
});

test('same-net navigation resolves absolute PCB pad position and never joins another source with equal names or UUIDs',()=>{
 const target='(footprint "Resistor:R" (at 10 20 90) (property "Reference" "R1") (uuid "resistor") (pad "1" smd circle (at 2 3) (size 1 1) (layers "F.Cu") (net 1 "VCC") (uuid "resistor-pad")))';
 const m=model([board('a.kicad_pcb',footprint('TP1','tp')+target),board('other/b.kicad_pcb',footprint('TP1','tp')+target)]);
 const row=tools.summarize(m).rows.find(r=>r.path==='a.kicad_pcb'&&r.padNumber==='1'),members=tools.connectedMembers(tools.connectionIndex(m),row);
 assert.equal(members.length,1);assert.equal(members[0].reference,'R1');assert.equal(members[0].path,'a.kicad_pcb');assert.equal(members[0].padNumber,'1');
 assert.equal(members[0].objectId,m.objects.find(o=>o.kind==='footprint'&&o.path==='a.kicad_pcb'&&o.reference==='R1').id);
 assert.deepEqual(members[0].position,{x:13,y:18});
 assert.equal(tools.connectedMembers(tools.connectionIndex(m),{...row,netId:''}).length,0);
});

test('same-net navigation preserves other pads of the same component and rejects ambiguous source UUIDs',()=>{
 const m={objects:[{id:'tp',path:'board',uuid:'tp',kind:'footprint',reference:'TP1'},
  {id:'p1',parentId:'tp',path:'board',uuid:'p1',kind:'pad',position:{x:1,y:2}},
  {id:'p2',parentId:'tp',path:'board',uuid:'p2',kind:'pad',position:{x:3,y:4}},
  {id:'bad1',path:'board',uuid:'ambiguous',kind:'symbol',reference:'U1'},
  {id:'bad2',path:'board',uuid:'ambiguous',kind:'symbol',reference:'U2'}],
  nets:[{id:'net',path:'board',name:'GND',members:[{kind:'pad',uuid:'p1',pad:'1'},{kind:'pad',uuid:'p2',pad:'2'},{kind:'pin',uuid:'ambiguous',pin:'1'}]}]};
 const members=tools.connectedMembers(tools.connectionIndex(m),{path:'board',netId:'net',objectId:'tp',padNumber:'1'});
 assert.deepEqual(members.map(r=>[r.objectId,r.padNumber,r.position]),[['tp','2',{x:3,y:4}]]);
 assert.throws(()=>tools.connectionIndex({objects:[],nets:[{members:new Array(tools.LIMITS.members+1).fill({})}]}),/member limit/);
});

test('dialog filters export the full matching set, clear to all rows and navigate same-net components',()=>{
 class Element extends EventTarget{
  constructor(tag){super();this.tag=tag;this.children=[];this.style={};this.attributes={};this.value='';this.text='';}
  set textContent(value){this.text=String(value);this.children=[];}get textContent(){return this.text+this.children.map(c=>c.textContent).join(' ');}
  append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}
  setAttribute(name,value){this.attributes[name]=value;}showModal(){this.open=true;}close(){this.open=false;this.dispatchEvent(new Event('close'));}remove(){this.removed=true;}
  click(){this.dispatchEvent(new Event('click'));}
 }
 const old=global.document,body=new Element('body');global.document={body,createElement:tag=>new Element(tag)};
 try{
  const extra='(footprint "Resistor:R" (at 10 20) (property "Reference" "R1") (uuid "r") (pad "1" smd circle (at 0 0) (size 1 1) (layers "F.Cu") (net 1 "VCC") (uuid "r-pad")))';
  const exports=[],located=[],view=tools.open({model:model([board('board.kicad_pcb',footprint('TP1','tp')+extra)]),onExport:(content,rows)=>exports.push({content,rows}),onLocate:row=>located.push(row)});
  const all=()=>{const nodes=[];const walk=n=>{nodes.push(n);n.children.forEach(walk);};walk(body);return nodes;},byLabel=label=>all().find(n=>n.attributes['aria-label']===label),button=label=>all().find(n=>n.tag==='button'&&n.textContent===label);
  assert.equal(all().find(n=>n.tag==='table').className,'testpoint-table');
  const firstRow=all().find(n=>n.tag==='tbody').children[0];assert.deepEqual(firstRow.children.map(n=>n.attributes['data-label']),['Testpoint','Pad / pin','Net','Connectivity','Source file','Location (mm)','Detection','Actions']);
  const connectivity=byLabel('Connectivity filter');connectivity.value='unresolved';connectivity.dispatchEvent(new Event('change'));button('Export CSV').click();
  assert.equal(exports[0].rows.length,1);assert.equal(exports[0].rows[0].padNumber,'3');assert.match(exports[0].content,/"no net"/);assert.doesNotMatch(exports[0].content,/"VCC"/);
  button('Clear filters').click();button('Export CSV').click();assert.equal(exports[1].rows.length,3);
  const search=all().find(n=>n.tag==='input');search.value='net:VCC';search.dispatchEvent(new Event('input'));
  const details=all().find(n=>n.tag==='details');details.open=true;details.dispatchEvent(new Event('toggle'));button('R1 · 1').click();assert.equal(located[0].reference,'R1');assert.equal(located[0].path,'board.kicad_pcb');
  search.value='missing-net';search.dispatchEvent(new Event('input'));assert.match(body.textContent,/No testpoints match these filters/);
  view.close();assert.equal(view.dialog.removed,true);
 }finally{if(old===undefined)delete global.document;else global.document=old;}
});
