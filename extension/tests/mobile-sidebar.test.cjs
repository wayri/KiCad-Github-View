const test=require('node:test'),assert=require('node:assert/strict');
const {install,phone,KEY}=require('../mobile-sidebar.js');
function fixture(storage=new Map(),width=393,height=852){
 const nodes=new Map(),events={},classes=new Set();
 class Node{constructor(){this.children=[];this.hidden=false;this.attributes={};this.textContent='';this.classList={contains:()=>false};}set id(v){this._id=v;nodes.set(v,this);}get id(){return this._id;}append(...n){for(const child of n){child.parentElement=this;this.children.push(child);}}prepend(n){if(n.parentElement)n.parentElement.children=n.parentElement.children.filter(child=>child!==n);n.parentElement=this;this.children.unshift(n);}setAttribute(k,v){this.attributes[k]=v;}querySelectorAll(){return [];}click(){this.onclick?.();}}
 for(const id of ['reviewWorkspace','androidViewToolbar','designNavigator','designInspector','commentsSidebar','partsButton','closeNavigator','closeInspector','closeComments']){const n=new Node();n.id=id;}
 for(const [panel,close]of [['designNavigator','closeNavigator'],['designInspector','closeInspector'],['commentsSidebar','closeComments']]){nodes.get(panel).hidden=true;nodes.get(close).onclick=()=>nodes.get(panel).hidden=true;}
 nodes.get('partsButton').onclick=()=>nodes.get('designNavigator').hidden=false;
 const doc={body:{classList:{toggle:(key,value)=>value?classes.add(key):classes.delete(key)}},getElementById:id=>nodes.get(id),createElement:()=>new Node(),querySelectorAll:()=>[]};
 const host={innerWidth:width,innerHeight:height,MutationObserver:class{observe(){}},localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},addEventListener:(key,fn)=>events[key]=fn};
 return{api:install(doc,host),nodes,events,storage,classes,host,doc};
}
test('phone button opens Explorer and hiding closes all sidebars through their controls',()=>{
 const f=fixture(),b=f.nodes.get('phoneSidebarToggle');assert.equal(b.hidden,false);assert.equal(b.attributes['aria-label'],'Show sidebar');b.onclick();assert.equal(f.nodes.get('designNavigator').hidden,false);assert.equal(b.attributes['aria-expanded'],'true');
 f.nodes.get('designInspector').hidden=f.nodes.get('commentsSidebar').hidden=false;b.onclick();for(const id of ['designNavigator','designInspector','commentsSidebar'])assert.equal(f.nodes.get(id).hidden,true);assert.equal(b.attributes['aria-label'],'Show sidebar');assert.equal(f.storage.get(KEY),'0');
});
test('visibility is retained when another drawing frame starts and storage updates propagate',()=>{
 const storage=new Map(),layout=fixture(storage);layout.api.set(true);const schematic=fixture(storage);assert.equal(schematic.api.get(),true);assert.equal(schematic.nodes.get('phoneSidebarToggle').attributes['aria-pressed'],'true');schematic.events.storage({key:KEY,newValue:'0'});assert.equal(schematic.api.get(),false);
});
test('desktop panes remain available and short phone landscape retains its toggle',()=>{
 assert.equal(phone(800,390),true);assert.equal(phone(800,1000),false);const desktop=fixture(new Map(),1200,900);assert.equal(desktop.nodes.get('phoneSidebarToggle').hidden,true);desktop.nodes.get('designInspector').hidden=false;desktop.api.set(false);assert.equal(desktop.nodes.get('designInspector').hidden,false);
});
test('the same control follows the phone toolbar when it is mounted after the shared toolbar',()=>{
 const f=fixture(),button=f.nodes.get('phoneSidebarToggle'),desktop=f.doc.createElement('nav');desktop.id='frameControls';f.nodes.delete('androidViewToolbar');f.api.scan();assert.equal(button.parentElement,desktop);
 const mobile=f.doc.createElement('nav');mobile.id='androidViewToolbar';f.api.scan();assert.equal(button.parentElement,mobile);assert.equal(f.nodes.get('phoneSidebarToggle'),button);button.onclick();assert.equal(f.nodes.get('designNavigator').hidden,false);
});
