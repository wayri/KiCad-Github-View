const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function harness(){
 class Element{
  constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.value='';this.clientWidth=800;this.clientHeight=600;this.style={};}
  append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=[...nodes];}setAttribute(key,value){this[key]=value;}addEventListener(){}getContext(){return {};}focus(){}click(){return this.onclick?.();}getBoundingClientRect(){return {left:0,top:0};}
 }
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};get('track').value='.15';get('drill').value='.3';
 const fits=[],realCamera=require('../gerber-camera.js');let calls=0;const analysis=require('../gerber-analysis.js'),document={body:new Element('body'),getElementById:get,createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text})},context={document,location:{search:''},URLSearchParams,TextEncoder,crypto:require('node:crypto').webcrypto,matchMedia:()=>({matches:false,addEventListener(){}}),requestAnimationFrame:()=>1,cancelAnimationFrame(){},ResizeObserver:class{observe(){}},addEventListener(){},KiCadGerberCamera:{...realCamera,fit(bounds,size){const camera=realCamera.fit(bounds,size);fits.push({bounds,size,camera});return camera;}},KiCadGerberRenderer:require('../gerber-renderer.js'),KiCadGerberAnalysis:{...analysis,analyze(...args){calls++;return analysis.analyze(...args);}},KiCadLayerColors:{fabricationLayer:()=>null},console};
 context.window=context;context.globalThis=context;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../gerber-viewer.js'),'utf8'),context);
 return {get,calls:()=>calls,fits};
}
test('viewer reuses geometry analysis across fit, visibility, opacity and repeated criteria',async()=>{
 const app=harness(),initial=app.calls(),text='%FSLAX24Y24*%%MOMM*%%ADD10C,1*%D10*X000000Y000000D03*M02*';
 app.get('files').files=[{name:'top.gtl',size:text.length,text:async()=>text}];app.get('files').onchange();
 for(let i=0;i<50&&!/files loaded/.test(app.get('status').textContent||'');i++)await new Promise(resolve=>setTimeout(resolve,5));
 assert.match(app.get('status').textContent,/1 files loaded/);assert.equal(app.calls(),initial+1);
 const afterLoad=app.calls();app.get('fit').onclick();app.get('analyze').onclick();assert.equal(app.calls(),afterLoad);
 const row=app.get('layers').children[0],checkbox=row.children[0].children[0].children[0];checkbox.checked=false;checkbox.onchange();checkbox.checked=true;checkbox.onchange();app.get('fit').onclick();assert.equal(app.calls(),afterLoad);
 const opacity=row.children[2].children[1];opacity.value='.5';opacity.oninput();assert.equal(app.calls(),afterLoad);
 app.get('track').value='.2';app.get('analyze').onclick();assert.equal(app.calls(),afterLoad+1);app.get('analyze').onclick();assert.equal(app.calls(),afterLoad+1);
});

test('fit passes complete merged extents to the real camera and keeps visible geometry on screen',async()=>{
 const app=harness(),camera=require('../gerber-camera.js'),names=['sensor-F_Cu.gbr','sensor-B_Cu.gbr','sensor-Edge_Cuts.gbr'];
 app.get('files').files=names.map(name=>{const text=fs.readFileSync(path.join(__dirname,'fixtures/gerbers',name),'utf8');return {name,size:Buffer.byteLength(text),text:async()=>text};});app.get('files').onchange();
 for(let i=0;i<50&&!/3 files loaded/.test(app.get('status').textContent||'');i++)await new Promise(resolve=>setTimeout(resolve,5));
 assert.match(app.get('status').textContent,/3 files loaded/);
 const check=()=>{const fitted=app.fits.at(-1);assert.ok(fitted.bounds.width>0);assert.ok(fitted.bounds.height>0);assert.equal(fitted.bounds.width,fitted.bounds.maxX-fitted.bounds.minX);assert.equal(fitted.bounds.height,fitted.bounds.maxY-fitted.bounds.minY);
  assert.ok(Object.values(fitted.camera).every(Number.isFinite));
  for(const point of [{x:fitted.bounds.minX,y:fitted.bounds.minY},{x:fitted.bounds.maxX,y:fitted.bounds.maxY}]){const screen=camera.screen(fitted.camera,point,fitted.size);assert.ok(screen.x>=0&&screen.x<=fitted.size.width);assert.ok(screen.y>=0&&screen.y<=fitted.size.height);}
 };check();
 app.get('fit').onclick();check();const firstRow=app.get('layers').children[0],checkbox=firstRow.children[0].children[0].children[0];checkbox.checked=false;checkbox.onchange();app.get('fit').onclick();check();
});
