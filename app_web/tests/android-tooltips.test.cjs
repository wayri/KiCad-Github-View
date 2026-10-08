const test=require('node:test'),assert=require('node:assert/strict');
const {install}=require('../../android-app/web/touch-tooltips.js');
function fixture(){
 const listeners={},timers=new Map();let serial=0,tip;
 const button={textContent:'Fit',attrs:{title:'Fit drawing', 'aria-describedby':'existing'},getAttribute(k){return this.attrs[k]??null;},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},closest(selector){return selector==='dialog[open]'?null:this;},getBoundingClientRect:()=>({left:10,top:10,bottom:50,width:48})};
 const doc={addEventListener(name,fn){listeners[name]=fn;},body:{append(node){tip=node;}},createElement(){return {style:{},setAttribute(){},remove(){tip=null;},getBoundingClientRect:()=>({width:120,height:40})};}};
 const host={innerWidth:300,innerHeight:600,setTimeout(fn){timers.set(++serial,fn);return serial;},clearTimeout(id){timers.delete(id);}};
 const api=install(doc,host);const fire=(name,values={})=>{const e={target:button,pointerType:'touch',pointerId:1,clientX:20,clientY:20,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...values};listeners[name](e);return e;};
 return{fire,button,timers,api,get tip(){return tip;},hold(){const first=[...timers.values()][0];first();}};
}
test('hold shows help without activating button and restores its accessibility description',()=>{
 const f=fixture();f.fire('pointerdown');f.hold();assert.equal(f.tip.textContent,'Fit drawing');assert.match(f.button.attrs['aria-describedby'],/existing androidTouchTooltip/);
 assert.equal(f.fire('pointerup').prevented,true);assert.equal(f.fire('click').stopped,true);assert.equal(f.api.dismiss(),true);assert.equal(f.tip,null);assert.equal(f.button.attrs['aria-describedby'],'existing');
});
test('scrolling and movement cancel tooltip; a regular tap still activates normally',()=>{
 const f=fixture();f.fire('pointerdown');f.fire('pointermove',{clientX:50});assert.equal(f.timers.size,0);assert.equal(f.tip,undefined);
 f.fire('pointerdown');f.fire('scroll');assert.equal(f.timers.size,0);f.fire('pointerdown');f.fire('pointerup');assert.equal(f.fire('click').prevented,undefined);
});
test('dialog help uses accessible label fallback and next deliberate tap is not swallowed',()=>{
 const f=fixture();delete f.button.attrs.title;f.button.attrs['aria-label']='Open drawing tools';f.fire('pointerdown');f.hold();assert.equal(f.tip.textContent,'Open drawing tools');assert.equal(f.fire('contextmenu').prevented,true);f.fire('pointerup');
 f.fire('pointerdown');f.fire('pointerup');assert.equal(f.fire('click').prevented,undefined);
});
