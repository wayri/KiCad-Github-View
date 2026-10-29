const test=require('node:test'),assert=require('node:assert/strict');
const api=require('../draftsman-model.js');
const source={provider:'github',host:'https://github.com',repository:'wayri/board',ref:'a'.repeat(40),hashes:{'board.kicad_pcb':'b'.repeat(64)}};
const view=()=>({id:'top',type:'view',file:'board.kicad_pcb',side:'top',layers:['F.Cu','Edge.Cuts'],x:30,y:30,width:100,height:80,rotation:0,scale:'fit',caption:'Top assembly'});
const bounds={x:10,y:20,width:50,height:30};
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7wAAAABJRU5ErkJggg==';
function doc(){const result=api.create(source,'Board fabrication');result.pages[0].items.push(view());return result;}
const assets={top:{image:png,bounds}};
test('revision-bound document roundtrips without changing callers and supports standard paper sizes',()=>{
 const value=doc(),copy=api.validate(value,source);assert.deepEqual(copy,value);copy.title='Changed';assert.equal(value.title,'Board fabrication');assert.deepEqual(api.validate(api.serialize(value)),value);assert.deepEqual(api.pageSize(value),{width:297,height:210});value.orientation='portrait';value.paper='Letter';assert.deepEqual(api.pageSize(value),{width:215.9,height:279.4});
 assert.throws(()=>api.validate(value,{...source,ref:'c'.repeat(40)}),/different source/);assert.throws(()=>api.validate(value,{...source,hashes:{'board.kicad_pcb':'d'.repeat(64)}}),/fingerprint/);const unbound=doc();delete unbound.source.hashes;assert.throws(()=>api.validate(unbound,source),/fingerprint/);
});
test('strict schemas reject unknown fields, arbitrary paths, unbounded text and malformed quantities',()=>{
 for(const change of [v=>v.version=2,v=>v.schema='other',v=>v.pages[0].items[0].onclick='alert(1)',v=>v.source.token='secret',v=>v.source.host='https://github.com@evil.example',v=>v.source.hashes['../x.kicad_pcb']='c'.repeat(64),v=>v.pages[0].items[0].file='../secret.kicad_pcb',v=>v.pages[0].items[0].x=500,v=>v.pages[0].items[0].scale=0,v=>v.pages[0].items[0].layers=['F.Cu','F.Cu'],v=>v.title='x'.repeat(201),v=>v.accent='url(https://evil)',v=>v.pages[0].items.push({id:'bom',type:'bom',x:10,y:20,width:100,rows:[{reference:'R1',value:'1k',footprint:'R',quantity:-1}]})]){const value=doc();change(value);assert.throws(()=>api.validate(value));}
 const value=doc();value.pages=Array.from({length:21},(_,i)=>({id:'p'+i,title:'',items:[]}));assert.throws(()=>api.validate(value),/1–20/);assert.throws(()=>api.validate(' '.repeat(api.MAX_BYTES+1)),/4 MiB/);value.pages=[{id:'p',title:'',items:Array.from({length:201},(_,i)=>({...view(),id:'v'+i}))}];assert.throws(()=>api.validate(value),/200/);
});
test('all mirrored and rotated source transforms invert exactly and preserve true measured scale',()=>{
 for(const side of ['top','bottom'])for(const rotation of [0,90,180,270])for(const scale of ['fit',1,2]){const v={...view(),side,rotation,scale},t=api.viewTransform(v,bounds),center=t.toPage({x:35,y:35});assert.ok(Math.abs(center.x-80)<1e-9);assert.ok(Math.abs(center.y-70)<1e-9);
  for(const p of [{x:10,y:20},{x:60,y:50},{x:26.7,y:42.3}]){const q=t.toWorld(t.toPage(p));assert.ok(Math.abs(q.x-p.x)<1e-8);assert.ok(Math.abs(q.y-p.y)<1e-8);}
  const a=t.toPage({x:10,y:20}),b=t.toPage({x:11,y:20});assert.ok(Math.abs(Math.hypot(b.x-a.x,b.y-a.y)-t.scale)<1e-9);
 }
 assert.throws(()=>api.viewTransform(view(),{...bounds,width:0}));assert.throws(()=>api.viewTransform({...view(),rotation:10},bounds));
});
test('automatic dimensions are source-derived and manual dimensions preserve units independent of scale',()=>{
 const value=doc(),dims=api.autoDimensions(view(),bounds);assert.deepEqual(dims.map(v=>v.kind),['horizontal','vertical']);assert.deepEqual(dims[0].a,{x:10,y:50});assert.deepEqual(dims[0].b,{x:60,y:50});assert.equal(dims[0].offset,8);value.pages[0].items.push(...dims);let svg=api.svg(value,0,assets);assert.match(svg,/50\.00 mm/);assert.match(svg,/30\.00 mm/);const bottom=api.autoDimensions({...view(),side:'bottom'},bounds);assert.equal(bottom[0].offset,-8);assert.equal(bottom[1].offset,8);value.units='in';value.precision=3;svg=api.svg(value,0,assets);assert.match(svg,/1\.969 in/);assert.match(svg,/1\.181 in/);value.pages[0].items[0].scale=1;assert.match(api.svg(value,0,assets),/1\.969 in/);
 const aligned={id:'aligned',type:'dimension',viewId:'top',kind:'aligned',a:{x:10,y:20},b:{x:13,y:24},offset:10};value.units='mm';value.pages[0].items.push(aligned);assert.match(api.svg(value,0,assets),/5\.000 mm/);
});
test('dimensions cannot detach, collapse or draw beyond the paper boundary',()=>{
 const value=doc();value.pages[0].items.push({id:'d',type:'dimension',viewId:'missing',kind:'horizontal',a:{x:0,y:0},b:{x:1,y:1},offset:8});assert.throws(()=>api.validate(value),/missing view/);value.pages[0].items[1].viewId='top';value.pages[0].items[1].b.x=0;assert.throws(()=>api.validate(value),/distinct/);value.pages[0].items[1].b.x=1;value.pages[0].items[1].a={x:0,y:1000};value.pages[0].items[1].b={x:1,y:1000};assert.throws(()=>api.svg(value,0,assets),/outside/);
});
test('SVG escapes all input text, embeds only bounded PNG data and exposes saved source provenance',()=>{
 const value=doc();value.title='<script>alert("x")</script>';value.pages[0].items.push({id:'note',type:'note',x:20,y:140,width:180,text:'<img onerror="fetch(secret)"> & "quotes"'});const svg=api.svg(value,0,{top:{...assets.top,warnings:['Unsupported <zone> source']}});assert.ok(svg.startsWith('<svg '));assert.ok(!svg.includes('<script>'));assert.ok(!svg.includes('<img'));assert.match(svg,/&lt;script&gt;/);assert.match(svg,/&lt;img onerror=&quot;/);assert.match(svg,/&lt;zone&gt;/);assert.match(svg,/Raster views \/ vector dimensions/);assert.match(svg,/source SHA-256 fingerprints retained/);assert.match(svg,/source.*repository/);assert.throws(()=>api.svg(value,0,{top:{image:'https://evil.example/a.png',bounds}}),/PNG/);assert.throws(()=>api.svg(value,0,{top:{image:'data:image/svg+xml;base64,PHNjcmlwdD4=',bounds}}),/PNG/);assert.throws(()=>api.svg(value,20,assets),/sheet number/);
});
test('missing images and overlong BoM tables are visibly disclosed instead of silently substituted',()=>{
 const value=doc();value.pages[0].items.push({id:'bom',type:'bom',x:150,y:30,width:130,rows:Array.from({length:100},(_,i)=>({reference:'R'+i,value:'10k',footprint:'Resistor_SMD:R_0402',quantity:1}))});const svg=api.svg(value,0,{});assert.match(svg,/Source preview unavailable/);assert.match(svg,/BoM rows not shown/);assert.match(svg,/R0/);
});

test('source view identifiers are globally unique across sheets to prevent preview identity collisions',()=>{
 const value=doc();value.pages.push({id:'sheet-2',title:'Other sheet',items:[view()]});assert.throws(()=>api.validate(value),/unique across sheets/);value.pages[1].items[0].id='other-view';assert.doesNotThrow(()=>api.validate(value));
});
