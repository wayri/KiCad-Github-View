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

 test('dimension placement chooses the visible view under the first pointer instead of a stale selected view',()=>{
 const {dimensionTarget}=require('../draftsman-workspace.js');
 const left={id:'left',type:'view',x:10,y:20,width:80,height:60},right={...left,id:'right',x:120,rotation:90};
 assert.equal(dimensionTarget([left,right],{x:140,y:40}),right);assert.equal(dimensionTarget([left,right],{x:20,y:40}),left);assert.equal(dimensionTarget([left,right],{x:100,y:40}),null);
 assert.equal(dimensionTarget([left,{id:'note',type:'note',x:10,y:20,width:80,height:60}],{x:20,y:40}),left);
 });

test('mechanical 2D layer selection keeps physical drill holes drawn and snappable',()=>{
 const {visiblePrimitives}=require('../draftsman-workspace.js'),mechanical=require('../draftsman-mechanical.js'),renderer=require('../pcb-renderer.js'),diff=require('../design-diff.js'),snap=require('../draftsman-snap.js');
 const file='inspection.kicad_pcb',design=renderer.build(diff.parse(fs.readFileSync(path.join(__dirname,'fixtures/net3d',file),'utf8')),file),visible=visiblePrimitives(mechanical.primitives(design.primitives),{layers:['Edge.Cuts']});
 assert.ok(visible.some(p=>p.hole&&p.x===16&&p.y===9));assert.ok(!visible.some(p=>!p.hole&&p.layer==='F.SilkS'));
 const result=snap.create(visible).snap({x:16.01,y:9.01},{zoom:100});assert.equal(result.kind,'hole center');assert.deepEqual(result.point,{x:16,y:9});
});
