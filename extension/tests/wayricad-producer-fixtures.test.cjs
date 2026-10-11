const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const data=require('../analysis-data.js');
const fixture=name=>{const text=fs.readFileSync(path.join(__dirname,'fixtures/wayricad',name),'utf8');return {source:JSON.parse(text),parsed:data.parse(name,text)};};

test('actual QuickPI analytical strip has saved potential, loss and density fields',()=>{
 const {source,parsed}=fixture('quickpi-dc.json');
 const plots=parsed.plots.filter(p=>p.type==='mesh-field');assert.equal(plots.length,3);
 assert.equal(plots[0].triangles.length,source.mesh.triangles.length);
 assert.deepEqual(plots[0].values,source.result.potential_V);
 assert.deepEqual(plots[1].values,source.result.cell_power_W);
 assert.ok(Math.abs(source.result.source_current_A-2)<1e-10);
});
test('actual QuickPI transient retains exact event samples and source/load values',()=>{
 const {source,parsed}=fixture('quickpi-transient.json');
 const load=parsed.plots.find(p=>p.title.includes('A'));assert.ok(load);
 const volts=load.series.find(s=>s.name==='voltage_V');assert.ok(volts);
 assert.equal(volts.points.length,source.times_s.length);
 assert.equal(volts.points.at(-1).y,source.loads[0].voltage_V.at(-1));
});
test('actual QuickTherm steady calculation retains component junction and provenance inputs',()=>{
 const {parsed}=fixture('quicktherm-steady.json');
 const table=parsed.tables.find(t=>t.title==='quick_therm.components');assert.ok(table);
 assert.equal(table.rows[0][table.columns.indexOf('junction_c')],45);
 assert.ok(parsed.fields.some(f=>f.path==='quick_therm.input_source'&&f.value.includes('Explicit values')));
});
test('actual QuickTherm RC transient carries temperature against seconds',()=>{
 const {source,parsed}=fixture('quicktherm-transient.json');
 const p=parsed.plots.find(p=>p.title.includes('U1'));assert.equal(p.xLabel,'Time (s)');
 const temp=p.series.find(s=>s.name==='temperature_c');assert.ok(temp);
 assert.equal(temp.points.at(-1).y,source.components[0].temperature_c.at(-1));
 assert.ok(Math.abs(temp.points.at(-1).y-(25+20*(1-Math.exp(-2))))<1e-10);
});
test('actual QuickSI screening retains status and evidence without fabricating a waveform',()=>{
 const {source,parsed}=fixture('quicksi-screen.json');assert.equal(source.schema,'wayricad.quick-si/v1');
 assert.ok(parsed.fields.some(f=>f.path==='status'&&f.value==='SCREENED'));
 assert.equal(source.source_reflection,0);assert.equal(source.load_reflection,0);
});
test('actual QuickSI eye retains all saved traces and sampled step response',()=>{
 const {source,parsed}=fixture('quicksi-eye.json');
 const eye=parsed.plots.find(p=>p.title==='Illustrative eye diagram');assert.equal(eye.series.length,source.traces_v.length);
 assert.deepEqual(eye.series[0].points.map(p=>p.y),source.traces_v[0]);
 const step=parsed.plots.find(p=>p.title==='Saved step response');assert.equal(step.series[0].points.at(-1).y,1);
});
test('newer QuickTherm network uses a physical saved temperature field',()=>{
 const {source,parsed}=fixture('quicktherm-board-network.json');
 const p=parsed.plots.find(p=>p.type==='heatmap');assert.equal(p.unit,'°C');assert.equal(p.title,'Saved board temperature field');
 assert.deepEqual(p.values,source.thermal_network.board_field.values_c);
});
test('newer coupled and spatial thermal outputs retain saved time and temperature metadata',()=>{
 for(const name of ['quicktherm-coupled-air.json','quicktherm-spatial-transient.json']){
  const {source,parsed}=fixture(name);assert.ok(parsed.fields.some(f=>/time_s/.test(f.path)));
  assert.ok(parsed.fields.some(f=>/temperatures_c/.test(f.path)));assert.ok(source.model);
 }
 const {source,parsed}=fixture('quicktherm-coupled-air.json');
 const board=source.history[0].boards[0];
 const thermal=parsed.plots.find(p=>p.title==='Saved thermal transient · '+board.name);assert.ok(thermal);
 for(const ref of Object.keys(board.temperatures_c)){const trace=thermal.series.find(s=>s.name===ref+' (°C)');assert.ok(trace);assert.equal(trace.points[0].y,board.temperatures_c[ref]);}
 assert.equal(fixture('quicktherm-spatial-transient.json').parsed.plots.filter(p=>p.type==='heatmap').length,0);
});
test('actual paired electrothermal result retains thermal-node values and qualification checks',()=>{
 const {source,parsed}=fixture('quickpi-electrothermal-transient.json');
 assert.equal(source.status,'completed');assert.equal(source.checks.balance_status,'PASSED');
 assert.equal(source.coupled.thermal_nodes[0].temperature_c.length,source.coupled.times_s.length);
 assert.ok(parsed.fields.some(f=>f.path==='coupled.thermal_nodes[0].id'&&f.value==='rail'));
 assert.ok(parsed.fields.some(f=>f.path==='checks.balance_status'&&f.value==='PASSED'));
 const node=source.coupled.thermal_nodes[0],p=parsed.plots.find(p=>p.title==='coupled · '+(node.label||node.id));assert.ok(p);
 assert.deepEqual(p.series.find(s=>s.name==='temperature_c').points.map(p=>p.y),node.temperature_c);
});
test('actual multilayer transient persists exact flattened cell geometry for each saved frame',()=>{
 const {source,parsed}=fixture('quicktherm-multilayer-transient.json');
 const t=source.thermal_network.transient,s=t.spatial_index;
 assert.equal(s.active_cells_per_layer,s.cells.length);assert.equal(s.layers.length,2);
 assert.equal(t.frames.length,3);assert.equal(t.frames[0].time_s,0);assert.equal(t.frames.at(-1).time_s,1);
 for(const frame of t.frames)assert.equal(frame.temperatures_c.length,s.layers.length*s.cells.length);
 for(const [x,y]of s.cells){assert.ok(x>=0&&x<s.x_centers_mm.length);assert.ok(y>=0&&y<s.y_centers_mm.length);}
 const fields=parsed.plots.filter(p=>p.frames);assert.equal(fields.length,s.layers.length);
 for(const [layerIndex,plot]of fields.entries())for(const index of [0,t.frames.length-1]){
  const values=data.frameValues(plot,index);
  for(const [i,[x,y]]of s.cells.entries())assert.equal(values[y][x],t.frames[index].temperatures_c[layerIndex*s.cells.length+i]);
 }
});
