const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const spatial=require('../analysis-spatial.js'),data=require('../analysis-data.js');
const fixture=name=>JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/wayricad',name),'utf8'));
test('heatmap follows nonuniform saved cell midpoint bounds and leaves missing cells empty',()=>{
 const s=spatial.toSurface({type:'heatmap',x:[0,2,8],y:[1],values:[[5,null,9]],layerZmm:1.58,unit:'°C',title:'Layer'});
 assert.equal(s.triangles.length,4);assert.deepEqual(s.points[0],[-1,.5,1.58]);assert.deepEqual(s.points[4],[5,.5,1.58]);assert.deepEqual(s.values,[5,5,9,9]);assert.equal(s.zKnown,true);
 assert.equal(spatial.toSurface({type:'heatmap',x:[0],y:[0],values:[[1]]}).zKnown,false);
});
test('mesh retains explicit XYZ and nodal samples including null rather than fabricating data',()=>{
 const plot={type:'mesh-field',points:[[0,0,2],[1,0,3],[0,1,4]],triangles:[[0,1,2]],values:[2,null,6],nodal:true,layerName:'F.Cu',zBasis:'front-depth'};
 assert.deepEqual(spatial.toSurface(plot).points,plot.points);assert.deepEqual(spatial.toSurface(plot).values,[2,null,6]);assert.equal(spatial.toSurface(plot).zKnown,true);
 assert.equal(spatial.toSurface(plot).layer,'F.Cu');assert.equal(spatial.toSurface(plot).zBasis,'front-depth');
 assert.equal(spatial.toSurface({...plot,triangles:[[0,1,3]]}),null);assert.equal(spatial.toSurface({...plot,values:[1]}),null);
});
test('actual QuickPI report geometry and normalized mesh are supported',()=>{
 const r=fixture('quickpi-dc.json'),plot=data.parse('report.json',JSON.stringify(r)).plots.find(p=>p.type==='mesh-field');
 const s=spatial.toSurface(plot);assert.equal(s.points.length,r.mesh.points_mm.length);assert.equal(s.triangles.length,r.mesh.triangles.length);assert.equal(s.nodal,true);assert.equal(s.zKnown,true);
 const context=spatial.contextGeometry(r);assert.equal(context.length,1);assert.deepEqual(context[0].points[1],{x:10,y:0});assert.deepEqual(spatial.sourceBindings(r),[]);
});
test('saved geometry loops include holes as strokes with bounded components and tracks',()=>{
 const c=spatial.contextGeometry({thermal_geometry:{outline:[{outer_mm:[[0,0],[2,0],[2,2]],holes_mm:[[[.1,.1],[.2,.1],[.2,.2]]]}],layers:[{polygons_mm:[{outer:[[0,0],[1,0],[1,1]],holes:[]}]}],tracks:[{start_mm:[0,0],end_mm:[1,1],width_mm:.3}],components:[{bbox_mm:[0,0,1,1]}]}});
 assert.equal(c.length,5);assert.equal(c.filter(p=>p.type==='line').length,1);assert.ok(c.every(p=>!p.fill));
});
test('source bindings use exact producer path/hash pairs and exclude unrelated hash provenance',()=>{
 const sha='ab'.repeat(32),r={source_sha256:sha,request:{board_path:'C:\\boards\\a.kicad_pcb'},geometry:{source_path:'pcb/a.kicad_pcb',source_sha256:sha},model_sha256:sha,study_file_sha256:sha};
 assert.deepEqual(spatial.sourceBindings(r),[{path:'C:\\boards\\a.kicad_pcb',sha256:sha},{path:'pcb/a.kicad_pcb',sha256:sha}]);
 assert.deepEqual(spatial.sourceBindings({board_path:'a.kicad_pcb',model_sha256:sha}),[]);
 assert.deepEqual(spatial.sourceBindings({source_path:'aXkicad_pcb',source_sha256:sha}),[]);
 assert.deepEqual(spatial.sourceBindings({board_path:'a.kicad_pcb',source_sha256:'not-a-digest'}),[]);
});
test('probe history links one saved active cell across real multilayer frames and retains gaps',()=>{
 const r=fixture('quicktherm-multilayer-transient.json'),plot=data.parse('thermal.json',JSON.stringify(r)).plots.find(p=>p.type==='heatmap'&&p.frames);
 assert.ok(plot);const cell=plot.cells[0],x=plot.x[cell[0]],y=plot.y[cell[1]],history=spatial.pointHistory(plot,x,y);
 assert.equal(history.series[0].points.length,plot.frames.length);assert.equal(history.series[0].points[0].y,plot.frames[0].temperatures_c[plot.layerIndex*plot.cells.length]);
 assert.equal(spatial.pointHistory(plot,1e6,1e6),null);
 const sparse={type:'heatmap',x:[0,2],y:[0],values:[[1,null]],cells:[[0,0]],layerIndex:0,frames:[{time_s:0,temperatures_c:[1]},{time_s:1,temperatures_c:[null]}],title:'Saved'};
 assert.ok(Number.isNaN(spatial.pointHistory(sparse,0,0).series[0].points[1].y));assert.equal(spatial.pointHistory(sparse,2,0),null);
});
test('surface rejects excessive triangle budgets rather than silently dropping coverage',()=>{
 const x=Array.from({length:100001},(_,i)=>i);assert.equal(spatial.toSurface({type:'heatmap',x,y:[0],values:[x]}),null);
});
test('generic malformed report geometry is skipped without breaking result inspection',()=>{
 assert.deepEqual(spatial.contextGeometry({geometry:{outline:[null,3,{outer:[[0,0],[1,0],[1,1]],holes:{bad:true}}],layers:[null,3,{polygons:{bad:true}}],tracks:[null,3,{}],components:[null,3,{}]}}).length,1);
 assert.deepEqual(spatial.contextGeometry({geometry:{outline:{},layers:{},tracks:{},components:{},polygons:{}}}),[]);
});
test('mesh probes interpolate saved elevation rather than assuming the first node height',()=>{
 const p=data.probe({type:'mesh-field',points:[[0,0,2],[1,0,3],[0,1,4]],triangles:[[0,1,2]],values:[2,4,6],nodal:true},.25,.25);
 assert.equal(p.z,2.75);assert.equal(p.value,3.5);
});
