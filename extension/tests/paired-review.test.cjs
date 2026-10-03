const test=require('node:test'),assert=require('node:assert/strict');
const {validSelection,relatedPart,symbolUuid}=require('../paired-review.js');
const part=(kind,ref,uuid,path='root.kicad_sch',linked)=>({kind,reference:ref,uuid,path,saved:{tree:[kind,...(linked?[["path",{quoted:'/root/'+linked}]]:[])]}});
test('cross-probing prefers saved PCB schematic identity over renamed reference',()=>{
 const fp=part('footprint','R9','fp','board.kicad_pcb','sym');
 assert.equal(symbolUuid(fp),'sym');
 assert.equal(relatedPart([fp],{kind:'part',path:'root.kicad_sch',reference:'R1',uuid:'sym'}).object,fp);
 const sym=part('symbol','R1','sym');
 assert.equal(relatedPart([sym],{kind:'part',path:'board.kicad_pcb',reference:'R9',symbolUuid:'sym'}).object,sym);
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
