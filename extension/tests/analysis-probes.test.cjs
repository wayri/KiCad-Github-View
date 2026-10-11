const test=require('node:test'),assert=require('node:assert/strict'),data=require('../analysis-data.js');
test('waveform probes use nearest saved sample and retain missing event data',()=>{
 const plot={xLabel:'Time (s)',series:[{name:'Load (V)',points:[{x:0,y:1},{x:1,y:NaN},{x:1,y:3},{x:2,y:5}]}]};
 assert.equal(data.probe(plot,.1,undefined,'Load (V)').value,1);
 assert.equal(data.probe(plot,1,undefined,'Load (V)').value,null);
 assert.equal(data.probe(plot,-1),null);assert.equal(data.probe(plot,3),null);
 const a=data.probe(plot,0),b=data.probe(plot,2);assert.deepEqual(data.probeDifference(a,b),{dx:2,delta:4});
 assert.equal(data.probeDifference(a,data.probe(plot,1)).delta,null);
 assert.equal(data.probeDifference(a,{...b,name:'Another signal'}),null);
});
test('thermal probes follow nonuniform cell edges, reversed axes and missing cells',()=>{
 const plot={type:'heatmap',title:'Temperature',unit:'°C',x:[0,2,8],y:[2,0],values:[[25,null,40],[20,30,35]]};
 assert.deepEqual(data.cellBounds(plot.x,1),[1,5]);
 assert.equal(data.probe(plot,4,2).value,null);assert.equal(data.probe(plot,7,2).value,40);
 assert.equal(data.probe(plot,0,2.9).value,25);assert.equal(data.probe(plot,0,3.1),null);
 assert.equal(data.probe(plot,12,0),null);
 assert.deepEqual(data.probeDifference(data.probe(plot,0,0),data.probe(plot,8,2)),{dx:8,dy:2,distance:Math.hypot(8,2),delta:20});
});
test('PI nodal probe interpolates inside triangle and never fills missing nodes or mesh holes',()=>{
 const plot={type:'mesh-field',title:'Potential',unit:'V',points:[[0,0],[2,0],[0,2]],triangles:[[0,1,2]],values:[0,2,4],nodal:true};
 const p=data.probe(plot,.5,.5);assert.equal(p.value,1.5);assert.equal(p.method,'Interpolated saved nodes');
 assert.equal(data.probe(plot,1.5,1.5),null);
 assert.equal(data.probe({...plot,values:[0,null,4]},.5,.5).value,null);
 assert.equal(data.probe({...plot,triangles:[[0,0,0]]},0,0),null);
 assert.equal(data.probe({...plot,nodal:false,values:[7]},.5,.5).value,7);
});
test('mechanical scene coordinates and invalid pointers are not numerical field probes',()=>{
 assert.equal(data.probe({type:'mechanical'},0,0),null);assert.equal(data.probe({},NaN,0),null);
 assert.equal(data.probeDifference(null,null),null);
});
test('saved thermal frames retain layer indexing and holes and reject invalid coordinates',()=>{
 const v={spatial_index:{x_centers_mm:[0,1],y_centers_mm:[0,1],cells:[[0,0],[1,1]],layers:[{name:'Top'},{name:'Bottom'}],active_cells_per_layer:2},frames:[{time_s:0,temperatures_c:[20,null,30,40,999]},{time_s:1,temperatures_c:[21,22,31,42,999]}]};
 const plots=data.parse('frames.json',JSON.stringify(v)).plots;assert.equal(plots.length,2);
 assert.deepEqual(data.frameValues(plots[1],0),[[30,null],[null,40]]);
 assert.deepEqual(data.frameValues(plots[0],0),[[20,null],[null,null]]);
 assert.deepEqual(plots[1].values,[[31,null],[null,42]]);
 assert.equal(data.frameValues(plots[0],-1),null);
 v.spatial_index.cells[1]=[10,1];assert.equal(data.parse('bad.json',JSON.stringify(v)).plots.length,0);
});
