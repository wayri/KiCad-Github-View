const test=require('node:test');
const assert=require('node:assert/strict');
const {analyze,role,LIMITS}=require('../gerber-analysis.js');
const {build}=require('../gerber-renderer.js');
const model=primitives=>({units:'mm',primitives,warnings:[],attributes:{}});
const layer=(path,primitives)=>({path,model:model(primitives)});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
test('parsed Gerber dimensions include aperture radii and clear operation extents',()=>{
 const m=build('%FSLAX24Y24*%%MOMM*%%TF.FileFunction,Copper,L1,Top*%%ADD10C,0.4*%D10*X000000Y000000D02*X100000Y000000D01*%LPC*%X100000Y100000D03*M02*','test.gtl');
 const a=analyze([{path:'test.gtl',model:m}],{minTrack:.5});
 assert.deepEqual(a.totals,{layers:1,primitives:2,dark:1,clear:1,drillHits:0,drillSlots:0});
 assert.equal(a.layers[0].role.source,'x2');assert.equal(a.layers[0].role.name,'Copper,L1,Top');
 close(a.bounds.minX,-.2);close(a.bounds.maxX,10.2);close(a.bounds.minY,-10.2);close(a.bounds.maxY,.2);
 assert.equal(a.layers[0].minStroke,.4);assert.equal(a.diagnostics[0].code,'stroke-below-criterion');
 assert.match(a.disclaimer,/before polarity subtraction/);
});
test('arc bounds include cardinal extrema only on the selected sweep',()=>{
 const q={type:'arc',start:{x:1,y:0},mid:{x:0,y:1},end:{x:-1,y:0},width:.2};
 const a=analyze([layer('arc.gbr',[q])]);close(a.bounds.minX,-1.1);close(a.bounds.maxX,1.1);close(a.bounds.minY,-.1);close(a.bounds.maxY,1.1);
 const reverse={...q,mid:{x:0,y:-1}};const b=analyze([layer('arc.gbr',[reverse])]);close(b.bounds.minY,-1.1);close(b.bounds.maxY,.1);
 const major={...q,end:{x:0,y:-1}};const c=analyze([layer('arc.gbr',[major])]);close(c.bounds.minX,-1.1);close(c.bounds.maxY,1.1);close(c.bounds.minY,-1.1);
});
test('drill statistics aggregate diameters, duplicates and user threshold',()=>{
 const m=build('M48\nMETRIC\nT1C0.6\nT2C0.8\n%\nT1\nX1.0Y2.0\nX1.0Y2.0\nT2\nX3.0Y4.0\nM30','holes.drl');
 const a=analyze([{path:'holes.drl',model:m}],{minDrill:.7});
 assert.deepEqual(a.layers[0].drillDiameters,[{diameter:.6,count:2},{diameter:.8,count:1}]);
 assert.equal(a.totals.drillHits,3);assert.equal(a.diagnostics.filter(x=>x.code==='drill-below-criterion').length,2);
 const d=a.diagnostics.find(x=>x.code==='duplicate-drill-hit');assert.equal(d.x,1);assert.equal(d.y,-2);
});
test('drill slots count tool diameter without being reported as duplicate hits',()=>{
 const a=analyze([layer('holes.drl',[{kind:'drill',type:'line',points:[{x:1,y:2},{x:4,y:2}],width:.6}])]);
 assert.equal(a.totals.drillSlots,1);assert.equal(a.totals.drillHits,0);assert.deepEqual(a.layers[0].drillDiameters,[{diameter:.6,count:1}]);close(a.bounds.width,3.6);
});
test('file naming inference is explicit and X2 metadata wins',()=>{
 assert.deepEqual(role('board-F_Cu.gbr',model([])),{name:'Top copper',source:'filename'});
 assert.deepEqual(role('board.gbs',model([])),{name:'Bottom solder mask',source:'filename'});
 assert.equal(role('board.gbr',model([])).source,'unknown');
 assert.equal(role('board.gtl',{attributes:{FileFunction:'Soldermask,Bot'}}).name,'Soldermask,Bot');
});
test('parser omissions and duplicate X2 roles are exposed',()=>{
 const m=model([{type:'circle',x:1,y:2,r:1,fill:true}]);m.attributes.FileFunction='Copper,L1,Top';m.warnings=['Unsupported macro; geometry omitted.'];
 const a=analyze([{path:'a.gbr',model:m},{path:'b.gbr',model:m}]);
 assert.equal(a.coverage,'partial');assert.equal(a.layers[0].coverage,'partial');assert.equal(a.diagnostics.filter(x=>x.code==='parser-warning').length,2);assert.ok(a.diagnostics.some(x=>x.code==='duplicate-layer-role'));
});
test('empty geometry, invalid data, non-mm models, and excessive work are bounded',()=>{
 assert.equal(analyze([]).bounds,null);assert.equal(analyze([layer('empty.gbr',[])]).diagnostics[0].code,'empty-layer');
 assert.throws(()=>analyze([layer('bad',[{type:'circle',x:NaN,y:1,r:1}])]),/Invalid circle/);
 assert.throws(()=>analyze([{path:'inch',model:{units:'in',primitives:[]}}]),/in mm/);
 assert.throws(()=>analyze([layer('arc',[{type:'arc',start:{x:0,y:0},mid:{x:1,y:0},end:{x:2,y:0}}])]),/Degenerate arc/);
 assert.throws(()=>analyze(Array.from({length:LIMITS.layers+1},()=>layer('x',[]))),/64/);
 assert.throws(()=>analyze([layer('x',Array(LIMITS.primitives+1).fill({}))]),/primitive limit/);
 for(const minTrack of [-1,Infinity,'bad'])assert.throws(()=>analyze([],{minTrack}),/criterion/);
});
test('diagnostic growth is bounded and reports suppression',()=>{
 const p={kind:'drill',type:'circle',x:0,y:0,r:.1,fill:true};const a=analyze([layer('hits',Array.from({length:1500},()=>({...p})))],{minDrill:1});
 assert.equal(a.diagnostics.length,LIMITS.diagnostics+1);assert.equal(a.diagnostics.at(-1).code,'diagnostics-truncated');
});
