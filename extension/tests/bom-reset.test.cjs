const test=require('node:test'),assert=require('node:assert/strict'),api=require('../bom-manager.js');
const part=(reference,extra={})=>({id:reference,kind:'symbol',path:'main.kicad_sch',reference,properties:{Value:'10k',Footprint:'0603'},...extra});
function ui(objects,records={}){
 class Element{
  constructor(tag){this.tag=tag;this.children=[];this.events={};this.dataset={};this.value='';this.textContent='';this.checked=false;}
  append(...items){for(const n of items){if(n instanceof Element){n.remove();n.parent=this;n.parentElement=this;}this.children.push(n);}}
  prepend(n){n.parent=this;this.children.unshift(n);}replaceChildren(...items){this.children=[];this.append(...items);}
  addEventListener(k,fn){this.events[k]=fn;}setAttribute(){}focus(){}showModal(){this.open=true;}close(){this.open=false;this.events.close?.();}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
 }
 const original=global.document,body=new Element('body');global.document={body,createElement:t=>new Element(t)};
 const walk=(node,p)=>{if(node instanceof Element&&p(node))return node;for(const n of node.children||[]){const r=walk(n,p);if(r)return r;}};
 let value=api.metadataJSON('reset-scope',records),writes=0,fail=false;const changes=[];
 const dialog=api.open({objects,scope:'reset-scope',storage:{getItem:()=>value,setItem:(_,v)=>{if(fail)throw Error('quota');writes++;value=v;}},onMetadataChanged:parts=>changes.push(parts)});
 return{body,dialog,find:p=>walk(body,p),button:label=>walk(body,n=>n.tag==='button'&&n.textContent===label),get records(){return JSON.parse(value).parts;},get writes(){return writes;},changes,set fail(v){fail=v;},done(){dialog.close();global.document=original;}};
}
test('reset modes preserve unrelated parts and fields without mutating input metadata',()=>{
 const saved={a:{Assembly:'verified',MPN:'custom',status:'ordered',Notes:'keep'},b:{Assembly:'soldered'}};
 const one=api.resetMetadata(saved,['a','a']);assert.equal(one.a.Assembly,'not started');assert.equal(one.a.MPN,'custom');assert.equal(one.a.status,'ordered');assert.equal(one.b,saved.b);assert.equal(saved.a.Assembly,'verified');
 assert.deepEqual(api.resetMetadata(saved,['a'],'procurement').a,{...saved.a,status:'not ordered'});
 assert.deepEqual(api.resetMetadata(saved,['a'],'all').a,{Assembly:'not started',status:'not ordered'});
 assert.throws(()=>api.resetMetadata(saved,['a'],'source'),/fields to reset/);
});
test('single-part reset requires acknowledgement, defaults safely and leaves source and other metadata unchanged',()=>{
 const a=part('R1'),b=part('R2'),id=api.identity(a),other=api.identity(b),f=ui([a,b],{[id]:{Assembly:'verified',MPN:'keep',Notes:'keep'},[other]:{Assembly:'soldered'}});
 try{
  f.button('Manage').events.click();f.button('Reset saved fields…').events.click();assert.equal(f.writes,0);
  const confirm=f.button('Reset 1 part');assert.equal(confirm.disabled,true);confirm.events.click();assert.equal(f.writes,0);
  const ack=f.find(n=>n.tag==='label'&&n.className==='bom-reset-ack').children[0];ack.checked=true;ack.events.change();assert.equal(confirm.disabled,false);confirm.events.click();
  assert.equal(f.records[id].Assembly,'not started');assert.equal(f.records[id].MPN,'keep');assert.equal(f.records[other].Assembly,'soldered');assert.equal(f.changes.length,1);assert.equal(a.properties.Assembly,undefined);assert.equal(f.find(n=>n.className==='bom-reset-confirmation'),undefined);
 }finally{f.done();}
});
test('bulk matching reset snapshots all matching parts beyond the row page, preserves hidden parts and supports cancellation',()=>{
 const objects=Array.from({length:205},(_,i)=>part('R'+(i+1),{properties:{Value:'resistor-batch',Footprint:'0603'}}));objects.push(part('D1',{populated:false}));const records=Object.fromEntries(objects.map(o=>[api.identity(o),{Assembly:'verified'}])),f=ui(objects,records);
 try{
  const search=f.find(n=>n.type==='search');search.value='resistor-batch';search.events.input();f.button('Reset matching parts…').events.click();assert.ok(f.button('Reset 205 parts'));assert.equal(f.writes,0);f.find(n=>n.className==='bom-reset-confirmation').close();assert.equal(f.writes,0);
  f.button('Reset matching parts…').events.click();const ack=f.find(n=>n.className==='bom-reset-ack').children[0];ack.checked=true;ack.events.change();f.button('Reset 205 parts').events.click();
  assert.equal(f.records[api.identity(objects[204])].Assembly,'not started');assert.equal(f.records[api.identity(objects[205])].Assembly,'verified');assert.equal(f.writes,1);
 }finally{f.done();}
});
test('all-fields bulk reset includes excluded parts, renews acknowledgement on mode changes and survives a storage failure',()=>{
 const a=part('R1',{properties:{Value:'10k',MPN:'original'}}),b=part('R2',{excludeFromBom:true}),id=api.identity(a),f=ui([a,b],{[id]:{Assembly:'verified',MPN:'override',Notes:'local'},[api.identity(b)]:{Assembly:'placed'}});
 try{
  f.button('Reset entire source…').events.click();const ack=f.find(n=>n.className==='bom-reset-ack').children[0],mode=f.find(n=>n.tag==='select'&&n.parent?.textContent==='Fields to reset'),confirm=f.button('Reset 2 parts');ack.checked=true;ack.events.change();mode.value='all';mode.events.change();assert.equal(ack.checked,false);assert.equal(confirm.disabled,true);
  ack.checked=true;ack.events.change();f.fail=true;confirm.events.click();assert.equal(f.writes,0);assert.equal(f.records[id].MPN,'override');assert.ok(f.find(n=>n.className==='bom-reset-confirmation'));assert.ok(f.find(n=>n.textContent.includes('quota')));
  f.fail=false;confirm.events.click();assert.deepEqual(f.records[id],{Assembly:'not started',status:'not ordered'});assert.equal(f.records[api.identity(b)].Assembly,'not started');assert.equal(a.properties.MPN,'original');assert.equal(api.model([a],'symbol',f.records)[0].management.MPN,'original');
 }finally{f.done();}
});
