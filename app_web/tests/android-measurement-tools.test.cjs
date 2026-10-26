const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function fixture(){
 const nodes=new Map(),observers=new Map();
 const make=tag=>({tagName:tag.toUpperCase(),children:[],attrs:{},listeners:{},hidden:false,append(...children){this.children.push(...children);for(const child of children)if(child.id)nodes.set(child.id,child);},insertBefore(child,before){this.children.splice(this.children.indexOf(before),0,child);if(child.id)nodes.set(child.id,child);},after(child){nodes.set(child.id,child);},setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k];},addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);},dispatchEvent(e){this.onchange?.(e);for(const fn of this.listeners[e.type]||[])fn(e);},click(){this.onclick?.();for(const fn of this.listeners.click||[])fn();}});
 const toolbar=make('nav');toolbar.append(make('button'));const original=make('button');original.setAttribute('aria-pressed','false');let points=[];
 original.onclick=()=>{original.setAttribute('aria-pressed',String(original.getAttribute('aria-pressed')!=='true'));points=[];};
 for(const[id,node]of [['androidViewToolbar',toolbar],['measureButton',original],['rulerControls',make('section')],['measurementStatus',make('span')],['rulerKind',make('select')],['rulerUnits',make('select')]])nodes.set(id,node);
 nodes.get('rulerKind').value='distance';nodes.get('rulerUnits').value='mm';let changes=0;nodes.get('rulerUnits').onchange=()=>changes++;
 let closes=0;nodes.set('androidToolsSheet',{close(){closes++;}});
 const document={readyState:'loading',body:{classList:{remove(){}}},getElementById:id=>nodes.get(id),createElement:make,addEventListener(){}};
 const context={document,module:{exports:{}},Event:class{constructor(type){this.type=type;}},MutationObserver:class{constructor(fn){this.fn=fn;}observe(node){observers.set(node,this.fn);}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('android-app/web/measurement-tools.js','utf8'),context);
 return{nodes,observers,api:context.KiCadAndroidMeasurements,original,get changes(){return changes;},get closes(){return closes;},pin(value){points=value;},get points(){return points;}};
}
test('touch Measure invokes the existing engine and exposes its original controls and pinned status',()=>{
 const f=fixture(),controls=f.nodes.get('rulerControls'),status=f.nodes.get('measurementStatus');assert.equal(f.api.mount(),true);assert.equal(f.api.mount(),false);
 assert.equal(f.nodes.get('androidMeasurementPanel').hidden,true);f.nodes.get('androidMeasure').click();assert.equal(f.original.getAttribute('aria-pressed'),'true');assert.equal(f.nodes.get('androidMeasurementPanel').hidden,false);assert.equal(f.closes,1,'launch closes blocking More modal');
 const panel=f.nodes.get('androidMeasurementPanel'),options=panel.children.at(-1);assert.ok(options.children.includes(controls));assert.ok(panel.children.includes(status),'status remains the engine-owned live/pinned readout');
 f.pin([{x:0,y:0},{x:2,y:1}]);const units=f.nodes.get('androidMeasurementUnits');units.value='mil';units.dispatchEvent({type:'change'});assert.equal(f.nodes.get('rulerUnits').value,'mil');assert.equal(f.changes,1);assert.equal(f.points.length,2,'unit display changes preserve pinned endpoints');
});
test('angle guidance, original disabled state and Back follow the shared ruler lifecycle',()=>{
 const f=fixture();f.api.mount();f.nodes.get('androidMeasure').click();f.nodes.get('rulerKind').value='angle';f.nodes.get('rulerKind').dispatchEvent({type:'change'});assert.match(f.nodes.get('androidMeasurementInstructions').textContent,/vertex/);
 assert.equal(f.api.handleBack(),true);assert.equal(f.original.getAttribute('aria-pressed'),'false');assert.equal(f.nodes.get('androidMeasurementPanel').hidden,true);assert.equal(f.api.handleBack(),false);
 f.original.disabled=true;f.observers.get(f.original)();assert.equal(f.nodes.get('androidMeasure').disabled,true,'3D engine disables measurement action');
});
test('views without the shared measurement engine remain untouched',()=>{const f=fixture();f.nodes.delete('measureButton');assert.equal(f.api.mount(),false);assert.equal(f.api.handleBack(),false);assert.equal(f.nodes.has('androidMeasure'),false);});
test('3D measurements use their own surface panel without opening duplicate 2D controls',()=>{
 const f=fixture(),mode={...f.original,attrs:{'aria-pressed':'true'}};f.nodes.set('mode3d',mode);f.api.mount();f.nodes.get('androidMeasure').click();
 assert.equal(f.original.getAttribute('aria-pressed'),'true');assert.equal(f.nodes.get('androidMeasure').getAttribute('aria-label'),'Measure 3D surface distance');assert.equal(f.nodes.get('androidMeasurementPanel').hidden,true);
 assert.equal(f.api.handleBack(),true);assert.equal(f.original.getAttribute('aria-pressed'),'false');
 mode.setAttribute('aria-pressed','false');f.observers.get(mode)();f.nodes.get('androidMeasure').click();assert.equal(f.nodes.get('androidMeasurementPanel').hidden,false);
});
