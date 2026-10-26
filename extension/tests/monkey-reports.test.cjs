const test=require('node:test'),assert=require('node:assert/strict');
const data=require('../analysis-data.js');
// Synthetic report matching upstream kicad_design_json.py a0 field contracts,
// commit bc6796c1b8ce55bfbcb8b1771f3ecbc70658d34d (not a private project export).
const fixture=(schema='kicad_monkey.design.a0')=>({schema,generator:'kicad_monkey',project:{name:'Sensor',filename:'sensor.kicad_pro'},components:[{designator:'R1',value:'4.7k',footprint:'Resistor_SMD:R_0603',library_ref:'Device:R',description:'Sensor resistor',hierarchy:{sheet_path:'/Sensor/'},parameters:{Tolerance:'1%','Empty field':''}}],nets:[{uid:'000000000001',name:'SENSE',auto_named:false,source_sheets:['/Sensor/'],terminals:[{designator:'R1',pin:'1',pin_name:'',pin_type:'PASSIVE'}],graphical:{},aliases:[],endpoints:[],driver_priority:0,driver_kind:'label',net_class:'Analog'}]});
const read=value=>data.parse('design.json',JSON.stringify(value));
test('Monkey a0 design projects saved component/net/terminal/custom fields into named tables',()=>{
 const result=read(fixture());assert.equal(result.kind,'KiCad Monkey saved design');
 assert.deepEqual(result.tables.find(t=>t.title==='Components').rows[0],['R1','4.7k','Resistor_SMD:R_0603','Device:R','Sensor resistor','/Sensor/']);
 assert.deepEqual(result.tables.find(t=>t.title==='Nets').rows[0],['SENSE','Analog','/Sensor/',1]);
 assert.deepEqual(result.tables.find(t=>t.title==='Net terminals').rows[0],['SENSE','R1','1','','PASSIVE']);
 assert.ok(result.tables.find(t=>t.title==='Component properties').rows.some(row=>row[1]==='Empty field'&&row[2]===''));
 assert.ok(result.fields.some(field=>field.value==='kicad_monkey.design.a0'));assert.equal(result.plots.length,0);assert.match(result.warnings.join(),/not recomputed/);
});
test('Monkey netlist a0 supports raw components without design hierarchy',()=>{
 const value=fixture('kicad_monkey.netlist.a0');delete value.components[0].hierarchy;
 const result=read(value);assert.equal(result.kind,'KiCad Monkey saved netlist');assert.equal(result.tables[0].rows[0].at(-1),'');
});
test('Monkey source strings remain inert and executable-looking graph fields are ignored',()=>{
 const value=fixture();value.components[0].value='<img src=x onerror=alert(1)>';value.indexes={script:'fetch(secret)'};value.compiled_schematic_graph={script:'eval(source)'};
 const result=read(value);assert.equal(result.tables[0].rows[0][1],value.components[0].value);assert.equal(result.plots.length,0);assert.ok(!result.fields.some(field=>/script/.test(field.path)));
});
test('Monkey unsupported schemas and malformed projection fields fail explicitly',()=>{
 for(const mutate of [v=>v.generator='other',v=>v.components={},v=>v.nets[0].terminals={},v=>v.nets[0].terminals[0].pin=1,v=>v.components[0].value={},v=>v.nets[0].source_sheets=[{}]]){const value=fixture();mutate(value);assert.throws(()=>read(value),/Invalid KiCad Monkey/);}
 const future=fixture('kicad_monkey.design.a1');assert.throws(()=>read(future),/Unsupported KiCad Monkey export schema/);
 const generic=data.parse('report.json',JSON.stringify({components:[{designator:'R1'}],nets:[]}));assert.equal(generic.kind,'Saved analysis report');
});
test('Monkey projections enforce collection, text and total row budgets before expensive table construction',()=>{
 let value=fixture();value.components=Array(20001).fill({designator:'R1'});assert.throws(()=>read(value),/20,000 components or nets/);
 value=fixture();value.nets[0].terminals=Array(200000).fill(null);assert.throws(()=>read(value),/200,000 table rows/);
 value=fixture();value.components[0].description='x'.repeat(16385);assert.throws(()=>read(value),/Invalid KiCad Monkey/);
});
