const test=require('node:test'),assert=require('node:assert/strict');
const {limits,clamp,peek,viewportGeometry,install}=require('../../android-app/web/resizable-sheets.js');
test('sheet sizes are bounded by phone viewport, including keyboard-sized space',()=>{
 assert.deepEqual(limits(800),{min:320,max:752});assert.equal(clamp(9999,800),752);assert.equal(clamp(1,800),320);assert.equal(clamp(400,200),188);
});
function fixture(raf=false){
 class Node extends EventTarget{constructor(){super();this.children=[];this.attrs={};this.values={};this.style={setProperty:(k,v)=>this.values[k]=v,removeProperty:k=>delete this.values[k]};this.classes=new Set();this.classList={add:k=>this.classes.add(k),remove:k=>this.classes.delete(k),contains:k=>this.classes.has(k)};this.isConnected=true;}setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this.attrs[k];}append(n){this.children.push(n);}prepend(n){this.children.unshift(n);}getBoundingClientRect(){return{height:Number.parseFloat(this.values.height)||400};}setPointerCapture(){}releasePointerCapture(){}}
 const panel=new Node(),doc={body:{},createElement:()=>new Node(),querySelectorAll:()=>[panel]},listeners={};
 const host={innerWidth:400,innerHeight:800,MutationObserver:class{observe(){}disconnect(){}},addEventListener:(k,v)=>listeners[k]=v,removeEventListener(){}};
 const frames=new Map();let nextFrame=0,now=0;
 if(raf){host.requestAnimationFrame=fn=>{frames.set(++nextFrame,fn);return nextFrame;};host.cancelAnimationFrame=id=>frames.delete(id);}
 const api=install(doc,host),handle=panel.children[0];
 const fire=(type,fields={})=>{const e=new Event(type,{cancelable:true});const {timeStamp,...rest}=fields;Object.assign(e,{pointerId:1,button:0,clientY:400,...rest});Object.defineProperty(e,'timeStamp',{value:fields.timeStamp??(now+=16)});handle.dispatchEvent(e);return e;};return{panel,handle,api,host,doc,listeners,fire,frames,flush(){const jobs=[...frames.values()];frames.clear();for(const job of jobs)job();}};
}
test('handle drag grows continuously, clamps, suppresses ghost click and supports tap expansion',()=>{
 const f=fixture();f.fire('pointerdown');f.fire('pointermove',{clientY:200});assert.equal(f.panel.values.height,'536px');f.fire('pointerup',{clientY:200});f.fire('click');assert.equal(f.panel.values.height,'752px');
 f.fire('click');assert.equal(f.panel.values.height,'336px');assert.equal(f.handle.getAttribute('aria-expanded'),'false');f.fire('click');assert.equal(f.panel.values.height,'752px');
 f.fire('pointerdown');f.fire('pointermove',{clientY:-2000});assert.equal(f.panel.values.height,'752px');f.fire('pointercancel');
 f.api.scan();assert.equal(f.panel.children.length,2);
});
test('keyboard arrows resize; viewport change reclamps and desktop removes phone sizing',()=>{
 const f=fixture();f.fire('keydown',{key:'ArrowUp'});assert.equal(f.panel.values.height,'416px');
 f.host.innerHeight=300;f.listeners.resize();assert.equal(f.panel.values.height,'282px');f.host.innerWidth=900;f.listeners.resize();assert.equal(f.panel.values.height,undefined);assert.equal(f.panel.values['max-height'],undefined);
});

test('expanded sheet follows viewport changes instead of becoming a partial-height popup',()=>{
 const f=fixture();f.fire('click');f.host.innerHeight=1000;f.listeners.resize();assert.equal(f.panel.values.height,'940px');assert.equal(f.handle.getAttribute('aria-expanded'),'true');
 f.host.innerHeight=300;f.listeners.resize();assert.equal(f.panel.values.height,'282px');
});

test('new phone sheets show a preview and reopening resets the expanded sheet',()=>{
 const f=fixture();assert.equal(f.panel.values.height,'336px');assert.equal(f.panel.getAttribute('data-sheet-stage'),'peek');
 f.fire('click');assert.equal(f.panel.values.height,'752px');f.panel.hidden=true;f.api.scan();f.panel.hidden=false;f.api.scan();
 assert.equal(f.panel.values.height,'336px');assert.equal(f.handle.getAttribute('aria-expanded'),'false');
});
test('nested drawing keyboard geometry clips to the root visible viewport',()=>{
 const top={innerHeight:800,visualViewport:{height:400,offsetTop:0}};top.parent=top;
 const middle={parent:top,frameElement:{getBoundingClientRect:()=>({top:40})}};
 const drawing={innerHeight:700,parent:middle,visualViewport:{height:700,offsetTop:0},frameElement:{getBoundingClientRect:()=>({top:44})}};
 assert.deepEqual(viewportGeometry(drawing),{height:316,bottom:384});
 top.visualViewport.height=800;assert.deepEqual(viewportGeometry(drawing),{height:700,bottom:0});
});
test('focusing a comment expands the sheet and keeps it within keyboard space',()=>{
 const f=fixture();const textarea=new EventTarget();textarea.matches=()=>true;
 const e=new Event('focusin');Object.defineProperty(e,'target',{value:textarea});f.panel.dispatchEvent(e);
 assert.equal(f.panel.values.height,'752px');f.host.visualViewport={height:320,offsetTop:0};f.listeners.resize();
 assert.equal(f.panel.values.height,'300px');assert.equal(f.panel.values['--android-keyboard-bottom'],'480px');
});

test('reopening a pane with an already-focused editor keeps the expanded stage',()=>{
 const f=fixture();f.panel.hidden=true;f.api.scan();
 const textarea={matches:selector=>selector.includes('textarea')};f.doc.activeElement=textarea;f.panel.contains=node=>node===textarea;
 f.panel.hidden=false;const event=new Event('focusin');Object.defineProperty(event,'target',{value:textarea});f.panel.dispatchEvent(event);
 assert.equal(f.panel.getAttribute('data-sheet-stage'),'expanded');
 // Visibility mutations run after synchronous focus. They must not restore a peek over the keyboard.
 f.api.scan();assert.equal(f.panel.values.height,'752px');assert.equal(f.handle.getAttribute('aria-expanded'),'true');
 f.host.visualViewport={height:280,offsetTop:0};f.listeners.resize();assert.equal(f.panel.values.height,'263px');
});
test('nested keyboard clipping also follows an Android root resized without VisualViewport',()=>{
 const top={innerHeight:360};top.parent=top;
 const host={innerHeight:700,parent:top,frameElement:{getBoundingClientRect:()=>({top:80})}};
 assert.deepEqual(viewportGeometry(host),{height:280,bottom:420});
 top.innerHeight=800;assert.deepEqual(viewportGeometry(host),{height:700,bottom:0});
});

test('panel rebuild preserves the existing drag handle and its expansion behavior',()=>{
 const f=fixture();const original=f.handle;
 // The shared workspace rebuilds Properties with replaceChildren after startup.
 f.panel.children=[];f.api.scan();assert.equal(f.panel.children.length,2);assert.equal(f.panel.children[0],original);
 f.fire('click');assert.equal(f.panel.values.height,'752px');f.api.scan();assert.equal(f.panel.children.length,2);
});

test('shared workspace class replacement restores phone sheet sizing',()=>{
 const f=fixture();f.panel.classes.clear();f.api.scan();assert.ok(f.panel.classList.contains('android-resizable-sheet'));assert.equal(f.panel.children.length,2);
});

test('pulling below the preview dismisses; small drags and cancelled gestures stay open',()=>{
 const f=fixture();f.fire('pointerdown');f.fire('pointermove',{clientY:430});f.fire('pointerup',{clientY:430});assert.notEqual(f.panel.hidden,true);
 f.fire('pointerdown');f.fire('pointermove',{clientY:520});f.fire('pointercancel',{clientY:520});assert.notEqual(f.panel.hidden,true);
 f.fire('pointerdown');f.fire('pointermove',{clientY:520});f.fire('pointerup',{clientY:520});assert.equal(f.panel.hidden,true);f.fire('click');assert.equal(f.panel.hidden,true);
});
test('dedicated close dismisses headerless panels and remains after a content rebuild',()=>{
 const f=fixture(),close=f.panel.children.find(n=>n.getAttribute('aria-label')==='Close panel');assert.ok(close);close.onclick();assert.equal(f.panel.hidden,true);
 f.panel.children=[];f.api.scan();assert.ok(f.panel.children.includes(close));
});
test('dismissal uses the existing sidebar close action, retaining workspace state handling',()=>{
 const f=fixture();let closed=0;f.panel.id='commentsSidebar';f.doc.getElementById=id=>id==='closeComments'?{click(){closed++;}}:null;
 f.fire('pointerdown');f.fire('pointermove',{clientY:520});f.fire('pointerup',{clientY:520});assert.equal(closed,1);assert.notEqual(f.panel.hidden,true);
});

test('pointer events coalesce to one paint per frame and release flushes the last movement',()=>{
 const f=fixture(true);f.fire('pointerdown');
 for(let y=390;y>=250;y-=10)f.fire('pointermove',{clientY:y});
 assert.equal(f.frames.size,1);assert.equal(f.panel.values.height,'336px');
 f.flush();assert.equal(f.panel.values.height,'486px');assert.equal(f.frames.size,0);
 f.fire('pointermove',{clientY:100});assert.equal(f.frames.size,1);f.fire('pointerup',{clientY:100});
 assert.equal(f.frames.size,0);assert.equal(f.panel.values.height,'752px');
});
test('slow drag snaps to nearest stage while cancelled capture restores original height',()=>{
 const f=fixture(true);f.fire('pointerdown',{timeStamp:100});f.fire('pointermove',{clientY:240,timeStamp:1000});f.fire('pointerup',{clientY:240,timeStamp:1500});
 assert.equal(f.panel.values.height,'336px');f.fire('click');
 f.fire('pointerdown',{timeStamp:2000});f.fire('pointermove',{clientY:120,timeStamp:3000});f.fire('pointerup',{clientY:120,timeStamp:3500});assert.equal(f.panel.values.height,'752px');f.fire('click');
 f.fire('pointerdown');f.fire('pointermove',{clientY:1000});f.flush();assert.notEqual(f.panel.values['--android-sheet-pull'],'0px');f.fire('lostpointercapture');assert.equal(f.panel.values.height,'752px');assert.equal(f.panel.values['--android-sheet-pull'],undefined);
});
test('content interactions never resize a sheet and disposal cancels queued movement',()=>{
 const f=fixture(true);f.panel.dispatchEvent(new Event('pointermove'));assert.equal(f.panel.values.height,'336px');
 f.fire('pointerdown');f.fire('pointermove',{clientY:100});assert.equal(f.frames.size,1);f.api.dispose();assert.equal(f.frames.size,0);
});

test('rotation to a wide drawer keeps the focused comment visible without phone sizing',()=>{
 const f=fixture(true);let revealed=0;
 const textarea={matches:()=>true,scrollIntoView(){revealed++;}};
 f.doc.activeElement=textarea;f.panel.contains=node=>node===textarea;
 f.host.innerWidth=915;f.host.innerHeight=412;f.listeners.resize();f.flush();f.flush();
 assert.equal(f.panel.values.height,undefined);
 assert.equal(revealed,1);
});
test('keyboard viewport updates coalesce and pending updates are cancelled on disposal',()=>{
 const f=fixture(true);f.host.visualViewport={height:320,offsetTop:0,removeEventListener(){}};
 f.listeners.resize();f.listeners.resize();assert.equal(f.frames.size,1);f.flush();
 assert.equal(f.panel.values['--android-keyboard-bottom'],'480px');assert.equal(f.panel.values['max-height'],'300px');
 f.listeners.resize();f.api.dispose();assert.equal(f.frames.size,0);
});
