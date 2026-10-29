const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {bomRows}=require('../draftsman-workspace.js'),model=require('../design-model.js');
test('Draftsman BoM uses canonical saved value/footprint properties and physical part identities',()=>{
 const file='inspection.kicad_pcb',source=fs.readFileSync(path.join(__dirname,'fixtures/net3d',file),'utf8'),objects=model.buildProject([{path:file,content:source}]).objects,rows=bomRows(objects,file);
 assert.equal(rows.length,2);assert.deepEqual(rows.find(row=>row.reference==='J1'),{reference:'J1',value:'Test',footprint:'Test:Terminal',quantity:1});
 const sameReference={...objects.find(o=>o.kind==='footprint'),uuid:'different-part',id:'different-part'};assert.equal(bomRows([...objects,sameReference],file).length,3);
});
test('Draftsman fitted BoM deduplicates multiunit symbols and excludes saved DNP and excluded parts',()=>{
 const part=(reference,extra={})=>({id:reference,kind:'symbol',reference,path:'root.kicad_sch',properties:{Value:'10k',Footprint:'R_0402'},...extra});
 const parts=[part('R1'),part('R1',{id:'other-unit'}),part('R2',{populated:false}),part('R3',{excludeFromBom:true}),part('R4',{path:'other.kicad_sch'})];
 assert.deepEqual(bomRows(parts,'root.kicad_sch'),[{reference:'R1',value:'10k',footprint:'R_0402',quantity:1}]);
});
