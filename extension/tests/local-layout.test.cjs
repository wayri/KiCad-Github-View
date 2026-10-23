const test=require('node:test'),assert=require('node:assert/strict');
const {install}=require('../local-layout.js');
function fixture(saved,stacked=false){
 const events={},attrs={},styles={},classes=new Set(),writes=[];let capture=null;
 const media={matches:stacked,addEventListener:(_,fn)=>events.media=fn};
 const panes={style:{setProperty:(k,v)=>styles[k]=v},classList:{add:k=>classes.add(k),remove:k=>classes.delete(k)},getBoundingClientRect:()=>({left:10,top:20,width:1008,height:608})};
 const divider={setAttribute:(k,v)=>attrs[k]=v,addEventListener:(k,fn)=>events[k]=fn,setPointerCapture:id=>capture=id,hasPointerCapture:id=>capture===id,releasePointerCapture:()=>capture=null};
 install(panes,divider,{getItem:()=>saved,setItem:(k,v)=>writes.push(v)},{matchMedia:()=>media});
 const fire=(type,props={})=>events[type]({pointerId:1,button:0,preventDefault(){},...props});
 return{fire,attrs,styles,classes,writes,media};
}
test('divider drags across frames with capture, clamps sizes and persists on completion',()=>{
 const f=fixture('50');f.fire('pointerdown');assert.ok(f.classes.has('resizing'));
 f.fire('pointermove',{clientX:764,clientY:20});assert.equal(f.attrs['aria-valuenow'],'75');
 f.fire('pointermove',{pointerId:2,clientX:0});assert.equal(f.attrs['aria-valuenow'],'75');
 f.fire('pointermove',{clientX:5000});assert.equal(f.attrs['aria-valuenow'],'80');assert.equal(f.writes.length,0);
 f.fire('pointerup');assert.ok(!f.classes.has('resizing'));assert.deepEqual(f.writes,['80']);
});
test('cancelled pointer operation restores prior size and releases iframe shield without saving',()=>{
 const f=fixture('35');f.fire('pointerdown');f.fire('pointermove',{clientX:764});f.fire('pointercancel');assert.equal(f.attrs['aria-valuenow'],'35');assert.ok(!f.classes.has('resizing'));assert.equal(f.writes.length,0);
});
test('keyboard separator supports horizontal stacked layouts and responsive orientation',()=>{
 const f=fixture('50',true);assert.equal(f.attrs['aria-orientation'],'horizontal');f.fire('keydown',{key:'ArrowDown'});assert.equal(f.attrs['aria-valuenow'],'52');
 f.fire('pointerdown');f.fire('pointermove',{clientY:474});assert.equal(f.attrs['aria-valuenow'],'75');f.fire('pointerup');
 f.media.matches=false;f.fire('media');assert.equal(f.attrs['aria-orientation'],'vertical');f.fire('keydown',{key:'ArrowLeft',shiftKey:true});assert.equal(f.attrs['aria-valuenow'],'65');f.fire('dblclick');assert.equal(f.attrs['aria-valuenow'],'50');
});
test('invalid saved layout falls back safely; end/home cannot collapse a drawing',()=>{
 const f=fixture('NaN');assert.equal(f.attrs['aria-valuenow'],'50');f.fire('keydown',{key:'End'});assert.equal(f.attrs['aria-valuenow'],'80');f.fire('keydown',{key:'Home'});assert.equal(f.attrs['aria-valuenow'],'20');
});
