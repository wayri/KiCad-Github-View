const test=require('node:test'),assert=require('node:assert/strict');
const api=require('../bom-field-table.js');
const part=(reference,extra={})=>({reference,value:'10k',footprint:'0603',path:'main.kicad_sch',populated:true,excluded:false,properties:{},management:{Assembly:'not started'},...extra});
test('field descriptors match the bulk field grid and discover custom and management fields without duplicates',()=>{
 const columns=api.fields([part('R1',{properties:{reference:'R1',VALUE:'10k','Library ID':'0603',Tolerance:'1%',Manufacturer:'ACME'},management:{MPN:'123'}})]);
 assert.deepEqual(columns.slice(0,7).map(c=>c.key),['Reference','Value','Footprint','Qty','DNP','Exclude from BoM','Assembly']);
 assert.deepEqual(columns.filter(c=>c.groupBy).map(c=>c.key),['Value','Footprint']);
 assert.equal(columns.filter(c=>c.key==='Manufacturer').length,1);
 assert.equal(columns.some(c=>c.key==='VALUE'||c.key==='reference'||c.key==='Library ID'),false);
 assert.equal(columns.find(c=>c.key==='Tolerance').show,false);
});
test('default groups aggregate references and quantity while retaining exact source parts',()=>{
 const parts=[part('R1'),part('R2'),part('R3',{value:'22k'})];
 const result=api.rows(parts,api.fields(parts),true);
 assert.equal(result.length,2);assert.equal(result[0].reference,'R1, R2');assert.equal(result[0].quantity,2);
 assert.equal(result[0].values.Qty,'2');assert.equal(result[0].parts[1],parts[1]);
 assert.equal(api.rows(parts,api.fields(parts),false).length,3);
});
test('DNP, exclusion and saved source identity are mandatory group boundaries',()=>{
 const parts=[part('R1'),part('R2',{populated:false}),part('R3',{excluded:true}),part('R4',{path:'child.kicad_sch'}),part('R5',{object:{kind:'footprint'}})];
 assert.equal(api.rows(parts,api.fields(parts),true).length,5);
 assert.equal(api.value(parts[1],'DNP'),'Yes');assert.equal(api.value(parts[2],'Exclude from BoM'),'Yes');
});
test('differing fields remain explicit even if their columns are hidden; custom group checks split rows',()=>{
 const parts=[part('R1',{properties:{Tolerance:'1%'},management:{Assembly:'placed',MPN:'A'}}),part('R2',{properties:{Tolerance:'5%'},management:{Assembly:'verified',MPN:'B'}})];
 const columns=api.fields(parts),group=api.rows(parts,columns,true)[0];
 assert.equal(group.values.Tolerance,'<mixed>');assert.equal(group.values.MPN,'<mixed>');assert.equal(group.values.Assembly,'<mixed>');
 columns.find(c=>c.key==='Tolerance').groupBy=true;
 assert.equal(api.rows(parts,columns,true).length,2);
});
test('saved management values take precedence, absent fields stay empty, and reference grouping is supported',()=>{
 const p=part('R1',{properties:{MPN:'old',Custom:'yes'},management:{mpn:'new',Assembly:'placed'}});
 assert.equal(api.value(p,'MPN'),'new');assert.equal(api.value(p,'Custom'),'yes');assert.equal(api.value(p,'Absent'),'');
 const columns=api.fields([p]);columns.find(c=>c.key==='Reference').groupBy=true;
 assert.equal(api.rows([p,part('R2')],columns,true).length,2);
});
test('part bound rejects excessive inputs and empty tables are valid',()=>{
 assert.deepEqual(api.rows([],api.fields([]),true),[]);
 assert.throws(()=>api.fields(new Array(100001)),/limit/);
 assert.throws(()=>api.rows(new Array(100001),[],false),/limit/);
});
