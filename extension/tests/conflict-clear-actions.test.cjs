const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

async function fixture(){
 const controls=new Map(),views=[];
 class Node{
  constructor(){this.children=[];this.attributes={};this.classList={toggle(){}};this.value='';}
  setAttribute(key,value){this.attributes[key]=String(value);}getAttribute(key){return this.attributes[key];}
  append(...nodes){this.children.push(...nodes);}replaceChildren(){this.children=[];}addEventListener(){}
 }
 const get=id=>{if(!controls.has(id))controls.set(id,new Node());return controls.get(id);};
 for(const id of ['toggleChanges','toggleChangeLabels','toggleMovement'])get(id).setAttribute('aria-pressed','true');
 const ctx=new Proxy({measureText:()=>({width:10})},{get:(object,key)=>key in object?object[key]:()=>{}});
 const context={document:{getElementById:get,createElement:()=>new Node(),querySelector:()=>null,body:{classList:{toggle(){}}}},addEventListener(){},
  chrome:{runtime:{sendMessage:async()=>({ok:true,result:{path:'board.kicad_pcb',source:'source'}})}},
  KiCadMergeConflicts:{analyze:()=>({count:1,current:'a',incoming:'b',candidates:{current:{valid:true,source:'a'},incoming:{valid:true,source:'b'}}})},
  KiCadDesignDiff:{parse:()=>[],compareProjects:()=>({changes:[{status:'modified',label:'R1',before:{uuid:'part'},after:{uuid:'part'}}],counts:{added:0,removed:0,modified:1}})},
  KiCadConflictProperties:{objects:()=>[{uuid:'part',label:'R1',fields:[]}],rows:()=>[],presence:require('../conflict-properties.js').presence,annotations:()=>({fields:[]})},
  KiCadPCBRenderer:{build:()=>({primitives:[{uuid:'part'}]})},
  KiCadOwnedCanvas:{bounds:()=>null,mount(){const view={pcb:true,ctx,canvas:{clientWidth:800,clientHeight:600},viewport:{camera:{}},addEventListener(){},draw(){},setDocument(design){this.primitives=design.primitives;},setNetHighlights(groups){this.highlights=groups;}};views.push(view);return view;}}
 };
 vm.runInNewContext(fs.readFileSync('extension/conflict-viewer.js','utf8'),context);await new Promise(resolve=>setImmediate(resolve));return {get,views};
}

test('conflict Unselect clears both picks and inspectors while keeping change highlights',async()=>{
 const f=await fixture();assert.equal(f.views.length,2);for(const view of f.views){view.selected={uuid:'part'};assert.equal(view.highlights.length,1);}
 f.get('unselect').onclick();for(const view of f.views){assert.equal(view.selected,null);assert.equal(view.highlights.length,1);}
 for(const side of ['current','incoming'])assert.equal(f.get(side+'Object').textContent,'Properties');
 assert.equal(f.get('toggleChanges').getAttribute('aria-pressed'),'true');
});

test('conflict Clear highlights removes both drawings highlights and change labels and preserves resolution choice',async()=>{
 const f=await fixture();f.get('acceptIncoming').onclick();const choice=f.get('chosenVersion').textContent;
 for(const view of f.views)view.selected={uuid:'part'};f.get('clearHighlights').onclick();
 for(const view of f.views){assert.equal(view.selected,null);assert.equal(view.highlights.length,0);}
 assert.equal(f.get('toggleChanges').getAttribute('aria-pressed'),'false');assert.equal(f.get('toggleChangeLabels').getAttribute('aria-pressed'),'false');
 assert.equal(f.get('chosenVersion').textContent,choice);assert.equal(f.get('saveCopy').disabled,false);
 f.get('toggleChanges').onclick();for(const view of f.views)assert.equal(view.highlights.length,1);
});
