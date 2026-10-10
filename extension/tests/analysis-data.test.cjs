const test=require('node:test'),assert=require('node:assert/strict');
const data=require('../analysis-data.js');
test('KiCad exported semicolon CSV retains trace names, units, and event timestamps',()=>{
 const r=data.parse('transient.csv','time;V(out);\r\n0;0;\r\n1e-6;0.25;\r\n1e-6;0.5;\r\n');
 assert.deepEqual(r.tables[0].columns,['time','V(out)']);assert.deepEqual(r.plots[0].series[0].points.map(p=>p.x),[0,1e-6,1e-6]);
});
test('CSV quoted text stays inert, malformed rows are rejected',()=>{
 const r=data.parse('mechanical.csv','id,summary,severity\n1,"<script>x()</script>, quoted",warning\n');assert.equal(r.tables[0].rows[0][1],'<script>x()</script>, quoted');assert.equal(r.plots.length,0);
 assert.throws(()=>data.parse('bad.csv','x,y\n1,2,3'),/column counts/);assert.throws(()=>data.parse('bad.csv','x,y\n"1,2'),/quoted/);
});
test('JSON workbook accepts comments and preserves tabs but never invents samples',()=>{
 const r=data.parse('test.wbk','{ "version":7, // saved settings\n "tabs":[{"commands":[".tran 1n 1u"],"traces":[{"signal":"V(out)","color":"#aabbcc"}]}]}');
 assert.equal(r.plots.length,0);assert.ok(r.fields.some(f=>f.value==='.tran 1n 1u'));assert.match(r.warnings.join(),/not waveform samples/);
});
test('legacy workbook displays commands and signals and rejects truncation',()=>{
 const r=data.parse('old.wbk','version 5\n1\n9\n.tran 1n 1u\n1\n1\nV(out)\nrgb(0,0,255)\n1\nMAX V(out)\n%.2f\n0\n.tran 1n 1u\n');
 assert.ok(r.fields.some(f=>f.value==='V(out)'));assert.equal(r.plots.length,0);assert.throws(()=>data.parse('broken.wbk','version 5\n1\n9'),/Incomplete/);
});
test('ASCII SPICE real and complex samples parse; binary is explicitly rejected',()=>{
 const head='Title: Test\nFlags: real\nNo. Variables: 2\nNo. Points: 2\nVariables:\n0 time time\n1 v(out) voltage\nValues:\n';
 const r=data.parse('wave.raw',head+'0 0\n0.5\n1 1e-6\n1\n');assert.equal(r.plots[0].series[0].points[1].y,1);
 const complex=data.parse('ac.raw',head.replace('real','complex')+'0 1,0\n2,3\n1 10,0\n4,5\n');assert.equal(complex.plots[0].series.length,2);
 assert.throws(()=>data.parse('bad.raw',head.replace('Values:','Binary:')+'junk'),/Binary/);assert.throws(()=>data.parse('bad.raw',head+'0 0\n.5'),/Incomplete/);
});
test('WayriCAD PI fields validate saved mesh indices and retain disconnected gaps',()=>{
 const value={mesh:{points_mm:[[0,0,0],[1,0,0],[0,1,0]],triangles:[[0,1,2]]},result:{potential_V:[1,null,2],cell_power_W:[.1],cell_J_A_mm2:[[3,4]]}};
 const r=data.parse('pi-report.json',JSON.stringify(value));assert.equal(r.plots.filter(p=>p.type==='mesh-field').length,3);assert.deepEqual(r.plots[0].values,[1,null,2]);assert.equal(r.plots[2].values[0],5);
 value.mesh.triangles=[[0,1,30]];assert.equal(data.parse('pi.json',JSON.stringify(value)).plots.length,0);
});
test('WayriCAD thermal distinguishes illustrative and physical field with null cells',()=>{
 const field={x_centers_mm:[0,1],y_centers_mm:[0],values_c:[[25,null]]};const r=data.parse('thermal-report.json',JSON.stringify({board_thermal_view:{field},thermal_network:{board_field:field}}));
 assert.equal(r.plots.length,2);assert.match(r.plots[0].title,/Illustrative/);assert.equal(r.plots[1].values[0][1],null);assert.equal(r.plots[1].unit,'°C');
});
test('QuickSI eye, PI and thermal transient preserve units and missing samples',()=>{
 const r=data.parse('sim-report.json',JSON.stringify({eye:{schema:'wayricad.illustrative-eye/v1',time_ui:[0,1],traces_v:[[0,.5]]},transient:{times_s:[0,1,1],source_voltage_V:[1,null,2],components:[{reference:'U1',temperature_c:[25,30,35]}]}}));
 assert.ok(r.plots.some(p=>p.title==='Illustrative eye diagram'));assert.ok(r.plots.some(p=>p.xLabel==='Time (s)'&&p.series[0].points.some(p=>Number.isNaN(p.y))));assert.ok(r.plots.some(p=>p.title.includes('U1')));
});
test('mechanical meshes remain in saved scene coordinates with bounded valid faces',()=>{
 const r=data.parse('mechanical-report.json',JSON.stringify({bodies:[{name:'Case',mesh:{vertices:[[0,0,0],[1,0,0],[0,1,0]],faces:[[0,1,2]]}}],findings:[{severity:'warning',summary:'Gap'}],source_sha256:'hash'}));assert.equal(r.plots[0].type,'mechanical');assert.ok(r.tables.some(t=>t.title==='findings'));assert.ok(r.fields.some(f=>f.path==='source_sha256'));
});
test('HTML is kept as inert source, arbitrary report schemas retain searchable metadata',()=>{
 const r=data.parse('thermal.html','<script>fetch("https://evil.invalid")</script><table><tr><td>25°C</td></tr></table>');assert.ok(r.html.includes('<script>'));assert.equal(r.plots.length,0);assert.match(r.warnings[0],/never executed/);
 const report=data.parse('heater.json','{"schema":"unknown/v1","assumptions":{"airflow":"still"},"temperature_max_c":80}');assert.ok(report.fields.some(f=>f.path==='assumptions.airflow'&&f.value==='still'));assert.equal(report.plots.length,0);
});
test('analysis adapters preserve SI bases, complete eye contexts and malformed metadata',()=>{
 assert.equal(data.numeric('1e309'),null);
 const traces=Array.from({length:127},(_,i)=>[i,i+1]);
 const r=data.parse('report.json',JSON.stringify({path:{segments:[null,{length_mm:2,impedance_ohm:45},{length_mm:3,screening_z0_ohm:60}]},eye:{time_ui:[0,1],traces_v:traces},samples:[null,{frequency_Hz:1,v:2}],bodies:[null],status:'saved'}));
 assert.equal(r.plots.find(p=>p.title==='Illustrative eye diagram').series.length,127);
 const route=r.plots.find(p=>p.title==='Saved route impedance');assert.equal(route.series.length,2);assert.equal(route.series[0].points[1].y,45);assert.ok(Number.isNaN(route.series[0].points[2].y));assert.equal(route.series[1].points[2].y,60);
 assert.ok(r.fields.some(f=>f.path==='status'));
 const field=data.parse('thermal.json',JSON.stringify({x_centers_mm:['1'],y_centers_mm:['2'],values_c:[['25']]})).plots[0];assert.deepEqual(field.x,[1]);assert.deepEqual(field.y,[2]);assert.deepEqual(field.values,[[25]]);
});
