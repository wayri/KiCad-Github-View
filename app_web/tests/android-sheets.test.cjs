const test=require('node:test'),assert=require('node:assert/strict');
const {limits,clamp,install}=require('../../android-app/web/resizable-sheets.js');
test('sheet sizes are bounded by phone viewport, including keyboard-sized space',()=>{
 assert.deepEqual(limits(800),{min:320,max:752});assert.equal(clamp(9999,800),752);assert.equal(clamp(1,800),320);assert.equal(clamp(400,200),188);
});
function fixture(){
 class Node extends EventTarget{constructor(){super();this.children=[];this.attrs={};this.values={};this.style={setProperty:(k,v)=>this.values[k]=v,removeProperty:k=>delete this.values[k]};this.classList={add(){},remove(){}};this.isConnected=true;}setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this.attrs[k];}append(n){this.children.push(n);}prepend(n){this.children.unshift(n);}getBoundingClientRect(){return{height:Number.parseFloat(this.values.height)||400};}setPointerCapture(){}releasePointerCapture(){}}
 const panel=new Node(),doc={body:{},createElement:()=>new Node(),querySelectorAll:()=>[panel]},listeners={};
 const host={innerWidth:400,innerHeight:800,MutationObserver:class{observe(){}disconnect(){}},addEventListener:(k,v)=>listeners[k]=v,removeEventListener(){}};
 const api=install(doc,host),handle=panel.children[0];
 const fire=(type,fields={})=>{const e=new Event(type,{cancelable:true});Object.assign(e,{pointerId:1,button:0,clientY:400,...fields});handle.dispatchEvent(e);return e;};return{panel,handle,api,host,listeners,fire};
}
test('handle drag grows continuously, clamps, suppresses ghost click and supports tap expansion',()=>{
 const f=fixture();f.fire('pointerdown');f.fire('pointermove',{clientY:200});assert.equal(f.panel.values.height,'600px');f.fire('pointerup',{clientY:200});f.fire('click');assert.equal(f.panel.values.height,'600px');
 f.fire('click');assert.equal(f.panel.values.height,'752px');assert.equal(f.handle.getAttribute('aria-expanded'),'true');f.fire('click');assert.equal(f.panel.values.height,'440.00000000000006px');
 f.fire('pointerdown');f.fire('pointermove',{clientY:-2000});assert.equal(f.panel.values.height,'752px');f.fire('pointercancel');
 f.api.scan();assert.equal(f.panel.children.length,1);
});
test('keyboard arrows resize; viewport change reclamps and desktop removes phone sizing',()=>{
 const f=fixture();f.fire('keydown',{key:'ArrowUp'});assert.equal(f.panel.values.height,'480px');
 f.host.innerHeight=300;f.listeners.resize();assert.equal(f.panel.values.height,'282px');f.host.innerWidth=900;f.listeners.resize();assert.equal(f.panel.values.height,undefined);assert.equal(f.panel.values['max-height'],undefined);
});

test('expanded sheet follows viewport changes instead of becoming a partial-height popup',()=>{
 const f=fixture();f.fire('click');f.host.innerHeight=1000;f.listeners.resize();assert.equal(f.panel.values.height,'940px');assert.equal(f.handle.getAttribute('aria-expanded'),'true');
 f.host.innerHeight=300;f.listeners.resize();assert.equal(f.panel.values.height,'282px');
});
