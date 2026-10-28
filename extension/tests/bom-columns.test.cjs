const test=require('node:test'),assert=require('node:assert/strict');
const api=require('../bom-manager.js');
function harness(){
 class Element{
  constructor(tag){this.tag=tag;this.children=[];this.events={};this.dataset={};this.attributes={};this.value='';this.textContent='';}
  append(...nodes){for(const n of nodes){if(n instanceof Element){n.remove();n.parent=this;n.parentElement=this;}this.children.push(n);}}
  prepend(n){n.remove();this.children.unshift(n);n.parent=this;n.parentElement=this;}addEventListener(name,fn){this.events[name]=fn;}
  setAttribute(k,v){this.attributes[k]=v;}focus(){this.focused=true;}showModal(){}replaceChildren(){this.children=[];}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}close(){this.events.close?.();}
 }
 const previous=global.document;global.document={createElement:t=>new Element(t),body:new Element('body')};
 const find=(n,p)=>{if(n instanceof Element&&p(n))return n;for(const c of n.children||[]){const r=find(c,p);if(r)return r;}};
 const byLabel=(n,label)=>find(n,c=>c.attributes?.['aria-label']===label);
 const header=n=>find(n,c=>c.className==='bom-manager-field-grid').children[0].children[0].children.map(c=>c.textContent);
 const toggle=(n,label,value)=>{const c=byLabel(n,label);assert.ok(c,label);c.checked=value;c.events.change();};
 return{find,byLabel,header,toggle,restore:()=>{global.document=previous;}};
}
const objects=[{id:'sch-r1',reference:'R1',kind:'symbol',path:'main.kicad_sch',properties:{Value:'10k',Footprint:'0603',Tolerance:'1%'}},{id:'pcb-r1',uuid:'pcb-r1',reference:'R1',kind:'footprint',path:'main.kicad_pcb',properties:{Value:'10k',Footprint:'0603',Tolerance:'1%'}}];
test('column chooser persists standard/custom/Actions choices separately from metadata, revision and source',()=>{
 const h=harness(),saved=new Map(),storage={getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)},exports=[];
 try{
  let dialog=api.open({objects,scope:'columns',storage,onExport:(...args)=>exports.push(args)});
  const button=h.byLabel(dialog,'Choose BoM columns');button.events.click();assert.equal(h.find(dialog,n=>n.className==='bom-manager-field-options').open,true);assert.equal(h.byLabel(dialog,'Find BoM column').focused,true);
  assert.equal(h.byLabel(dialog,'Show Reference').disabled,true);
  h.toggle(dialog,'Show Tolerance',true);h.toggle(dialog,'Show Value',false);h.toggle(dialog,'Show Actions',false);
  assert.ok(h.header(dialog).includes('Tolerance'));assert.ok(!h.header(dialog).includes('Value'));assert.ok(!h.header(dialog).includes('Actions'));
  h.find(dialog,n=>n.textContent==='Export visible CSV').events.click();assert.match(exports[0][1],/"Tolerance"/);assert.doesNotMatch(exports[0][1].split('\r\n')[0],/"Value"/);
  const source=h.find(dialog,n=>n.tag==='label'&&n.textContent==='Source').children[0];source.value='footprint';source.events.change();assert.ok(h.header(dialog).includes('Value'));assert.ok(!h.header(dialog).includes('Tolerance'));assert.ok(h.header(dialog).includes('Actions'));
  source.value='symbol';source.events.change();assert.ok(h.header(dialog).includes('Tolerance'));assert.ok(!h.header(dialog).includes('Value'));assert.ok(!h.header(dialog).includes('Actions'));dialog.close();
  dialog=api.open({objects,scope:'columns',storage});assert.ok(h.header(dialog).includes('Tolerance'));assert.ok(!h.header(dialog).includes('Value'));assert.ok(!h.header(dialog).includes('Actions'));dialog.close();
  dialog=api.open({objects,scope:'another-revision',storage});assert.ok(h.header(dialog).includes('Value'));assert.ok(!h.header(dialog).includes('Tolerance'));dialog.close();
  assert.equal(saved.has('kicad-bom-manager:v1:columns'),false,'column preferences never alter procurement metadata');assert.equal(objects[0].properties.Value,'10k');
 }finally{h.restore();}
});
test('column presets, filtering and storage failures preserve a usable selectable table',()=>{
 const h=harness();try{
  const dialog=api.open({objects,scope:'unavailable-storage',storage:{getItem:()=>null,setItem(){throw Error('quota');}}});
  h.toggle(dialog,'Show Tolerance',true);assert.ok(h.header(dialog).includes('Tolerance'));assert.match(h.find(dialog,n=>n.className==='bom-manager-feedback').textContent,/changed for this session/);
  h.find(dialog,n=>n.textContent==='Show all columns').events.click();assert.ok(h.header(dialog).includes('MPN'));
  h.find(dialog,n=>n.textContent==='Reset columns').events.click();assert.ok(!h.header(dialog).includes('MPN'));assert.ok(h.header(dialog).includes('Reference'));assert.ok(h.header(dialog).includes('Actions'));
  const search=h.byLabel(dialog,'Find BoM column');search.value='toler';search.events.input();const row=h.find(dialog,n=>n.tag==='tr'&&n.dataset.column==='tolerance'),value=h.find(dialog,n=>n.tag==='tr'&&n.dataset.column==='value');assert.equal(row.hidden,false);assert.equal(value.hidden,true);
  dialog.close();
 }finally{h.restore();}
});
