const test=require('node:test'),assert=require('node:assert/strict'),V=require('../variant-manager.js'),B=require('../bom-manager.js');
const part=(reference,path='a.kicad_pcb',more={})=>({kind:'footprint',reference,path,uuid:reference+path,properties:{Value:'10k',Footprint:'0603',MPN:'BASE'},populated:true,...more});
test('authored variants retain saved source and only alter exact part identity',()=>{
 const objects=[part('R1'),part('R1','b.kicad_pcb'),part('R2')];const base={schemaVersion:1,variants:[{id:'eco',name:'Economy',parts:[]}]};
 const config=V.setPart(base,'eco',objects[0],{populated:false,properties:{MPN:'ALT',Value:'20k'}}),result=V.apply(objects,config,'eco');
 assert.equal(base.variants[0].parts.length,0);assert.equal(objects[0].properties.MPN,'BASE');assert.equal(result.objects[0].properties.Value,'20k');assert.equal(result.objects[0].populated,false);assert.equal(result.objects[1].populated,true);assert.equal(result.warnings.length,0);
 assert.equal(B.totals(B.model(result.objects,'footprint'),3).buildParts,6);assert.equal(V.setPart(config,'eco',objects[0],{}).variants[0].parts.length,0);
});
test('CSV variants with ambiguous references do not bleed into another board',()=>{
 const objects=[part('R1'),part('R1','b.kicad_pcb')],config={schemaVersion:1,format:'csv',variants:[{id:'eco',name:'Eco',parts:[{reference:'R1',populated:false}]}]};
 const result=V.apply(objects,config,'eco');assert.ok(result.objects.every(o=>o.populated));assert.match(result.warnings[0],/Ambiguous/);
 assert.throws(()=>V.validate({schemaVersion:1,variants:[{id:'x',name:'X',parts:[{path:'a.kicad_pcb',reference:'R1',properties:{constructor:'bad'}}]}]}),/property/);
 assert.throws(()=>V.apply(objects,config,'missing'),/Unknown/);
});
test('variant custom fields affect BoM grouping and saved population is reversible',()=>{
 const objects=[part('R1'),part('R2')],config={schemaVersion:1,variants:[{id:'v',name:'V',parts:[{path:'a.kicad_pcb',reference:'R1',properties:{MPN:'ALT'}}]}]};
 assert.equal(B.group(B.model(V.apply(objects,config,'v').objects,'footprint')).length,2);assert.equal(B.group(B.model(V.apply(objects,config,'default').objects,'footprint')).length,1);
});
test('imported iBOM and CSV identities support variant drafts without broadening drawing traversal',()=>{
 const o=part('R1','ibom.html'),config={schemaVersion:1,variants:[{id:'eco',name:'Economy',parts:[]}]},next=V.setPart(config,'eco',o,{populated:false});assert.equal(V.apply([o],next,'eco').objects[0].populated,false);
 assert.throws(()=>V.setPart(config,'eco',part('R1','../ibom.html'),{populated:false}),/safe file path/);
 assert.throws(()=>require('../design-model.js').buildProject([{path:'ibom.html',content:''}]),/unsupported KiCad path/);
});
