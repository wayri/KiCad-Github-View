const test=require('node:test'),assert=require('node:assert/strict');
const {validSelection,relatedPart,symbolUuid,qualifiedNetName,relatedNet}=require('../paired-review.js');
const part=(kind,ref,uuid,path='root.kicad_sch',linked)=>({kind,reference:ref,uuid,path,saved:{tree:[kind,...(linked?[["path",{quoted:'/root/'+linked}]]:[])]}});
test('cross-probing prefers saved PCB schematic identity over renamed reference',()=>{
 const fp=part('footprint','R9','fp','board.kicad_pcb','sym');
 assert.equal(symbolUuid(fp),'sym');
 assert.equal(relatedPart([fp],{kind:'part',path:'root.kicad_sch',reference:'R1',uuid:'sym'}).object,fp);
 const sym=part('symbol','R1','sym');
 assert.equal(relatedPart([sym],{kind:'part',path:'board.kicad_pcb',reference:'R9',symbolUuid:'sym'}).object,sym);
});
test('saved sheet names cross-highlight qualified PCB nets in both directions',()=>{
 const objects=[{kind:'sheet',path:'design/root.kicad_sch',properties:{Sheetname:'Power supply',Sheetfile:'sub/power.kicad_sch'}}];
 const schematic={kind:'schematic',path:'design/sub/power.kicad_sch',name:'ENABLE',names:['ENABLE']};
 const pcb={kind:'pcb',path:'design/main.kicad_pcb',name:'/Power supply/ENABLE'};
 assert.equal(qualifiedNetName(schematic,objects),'/Power supply/ENABLE');
 assert.equal(relatedNet([pcb],[],{kind:'net',path:schematic.path,netName:'ENABLE',qualifiedNetName:qualifiedNetName(schematic,objects)},pcb.path).net,pcb);
 assert.equal(relatedNet([schematic],objects,{kind:'net',path:pcb.path,netName:pcb.name},'design/root.kicad_sch').net,schematic);
});
test('net cross-highlight refuses reused sheets and same-named ambiguous targets',()=>{
 const objects=['A','B'].map(Sheetname=>({kind:'sheet',path:'root.kicad_sch',properties:{Sheetname,Sheetfile:'child.kicad_sch'}}));
 const a={kind:'schematic',path:'child.kicad_sch',name:'BUS'},b={...a,path:'other.kicad_sch'};
 assert.equal(qualifiedNetName(a,objects),null);
 assert.match(relatedNet([a,b],objects,{kind:'net',path:'board.kicad_pcb',netName:'BUS'},'root.kicad_sch').error,/ambiguous/);
 assert.match(relatedNet([{kind:'pcb',name:'BUS'},{kind:'pcb',name:'/A/BUS'}],[],{kind:'net',path:'child.kicad_sch',netName:'BUS',qualifiedNetName:'/A/BUS'}).error,/ambiguous/);
 assert.match(relatedNet([a],objects,{kind:'net',path:'board.kicad_pcb',netName:'/A/BUS'}).error,/No matching/);
 assert.equal(validSelection({kind:'net',path:'child.kicad_sch',netName:'BUS',qualifiedNetName:'bad\n'}),false);
});
test('qualified net lookup resolves relative nested sheets and saved label aliases without guessing basenames',()=>{
 const objects=[{kind:'sheet',path:'design/root.kicad_sch',properties:{Sheetname:'Controller',Sheetfile:'sub/controller.kicad_sch'}},
  {kind:'sheet',path:'design/sub/controller.kicad_sch',properties:{'Sheet name':'IO','Sheet file':'../io.kicad_sch'}}];
 const net={kind:'schematic',path:'design/io.kicad_sch',name:'ENABLE',names:['ENABLE','EN']};
 assert.equal(qualifiedNetName(net,objects),'/Controller/IO/ENABLE');
 assert.equal(relatedNet([net],objects,{kind:'net',path:'board.kicad_pcb',netName:'/Controller/IO/EN'}).net,net);
 assert.match(relatedNet([net],objects,{kind:'net',path:'board.kicad_pcb',netName:'/Different/ENABLE'}).error,/No matching/);
 objects.push({kind:'sheet',path:'design/io.kicad_sch',properties:{Sheetname:'Loop',Sheetfile:'root.kicad_sch'}});
 assert.equal(qualifiedNetName(net,objects),null);
});
test('reference-only fallback rejects repeated sheet identities and conflicting saved links',()=>{
 const selection={kind:'part',path:'board.kicad_pcb',reference:'R1'};
 const a=part('symbol','R1','a'),b=part('symbol','R1','b','other.kicad_sch');
 assert.equal(relatedPart([a],selection).object,a);
 assert.match(relatedPart([a,b],selection).error,/ambiguous/);
 assert.match(relatedPart([a],{...selection,symbolUuid:'wrong'}).error,/does not match/);
 assert.match(relatedPart([],{...selection}).error,/No matching/);
});
test('cross selection is bounded and rejects malformed or control-bearing messages',()=>{
 assert.equal(validSelection({kind:'net',netName:'VCC',path:'root.kicad_sch'}),true);
 for(const value of [null,{kind:'net',netName:'VCC'},{kind:'net',netName:'a'.repeat(501),path:'root.kicad_sch'},{kind:'part',reference:'R1\n',path:'root.kicad_sch'},{kind:'unknown',path:'root.kicad_sch'}])assert.equal(validSelection(value),false);
});
