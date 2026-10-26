const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function runtime(){
 let now=0,id=0;const timers=new Map();
 class Element{constructor(){this.children=[];this.attributes={};}append(...items){this.children.push(...items);}setAttribute(k,v){this.attributes[k]=v;}removeAttribute(k){delete this.attributes[k];}remove(){}}
 const later=(fn,ms,repeat=false)=>{timers.set(++id,{fn,at:now+ms,ms,repeat});return id;},body=new Element();
 const context={URL,Promise,Date:{now:()=>now},document:{body,createElement:()=>new Element()},location:{href:'https://local.test/'},setTimeout:(fn,ms)=>later(fn,ms),setInterval:(fn,ms)=>later(fn,ms,true),clearTimeout:id=>timers.delete(id),clearInterval:id=>timers.delete(id)};
 vm.runInNewContext(fs.readFileSync('extension/loading-ui.js','utf8'),context);
 function advance(ms){const end=now+ms;for(;;){const due=[...timers.entries()].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;const[key,timer]=due;now=timer.at;timers.delete(key);timer.fn();if(timer.repeat)timers.set(key,{...timer,at:now+timer.ms});}now=end;}
 return{api:context.KiCadLoading,body,advance,timers};
}
test('300 ms delay prevents flashes and stage updates do not restart the delay',()=>{
 const r=runtime(),ui=r.api.indicator(r.body),pane=r.body.children[0];ui.show('Reading');r.advance(299);assert.equal(pane.hidden,true);ui.show('Parsing');r.advance(1);assert.equal(pane.hidden,false);assert.equal(pane.children[1].children[1].textContent,'Parsing');r.advance(1000);assert.equal(pane.children[1].children[2].textContent,'1 s');ui.hide();assert.equal(pane.hidden,true);assert.equal(r.timers.size,0);
 ui.show('Fast');r.advance(200);ui.hide();r.advance(300);assert.equal(pane.hidden,true);assert.equal(r.timers.size,0);
});
test('overlapping operations stay visible until all settle, including failure',async()=>{
 const r=runtime();let finish,fail;const first=r.api.track(new Promise(resolve=>finish=resolve),'First'),second=r.api.track(new Promise((_,reject)=>fail=reject),'Second');r.advance(300);const pane=r.body.children[0];assert.equal(pane.hidden,false);finish();await first;assert.equal(pane.hidden,false);fail(Error('failed'));await assert.rejects(second,/failed/);assert.equal(pane.hidden,true);assert.equal(r.timers.size,0);
});
test('measured progress clamps to real bounds and can return to indeterminate',()=>{
 const r=runtime(),task=r.api.activity('Download');task.update('Half',.5);const bar=r.body.children[0].children[0];assert.equal(bar.value,.5);task.update('Done',2);assert.equal(bar.value,1);task.update('Parsing');task.end();assert.equal(r.body.attributes['aria-busy'],'false');
});
