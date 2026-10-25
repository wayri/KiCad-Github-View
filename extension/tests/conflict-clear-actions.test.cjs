const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

async function fixture(){
 const controls=new Map(),views=[],events=new Map(),bodyClasses=new Set();
 class Node{
  constructor(){this.children=[];this.attributes={};this.classList={toggle(){}};this.value='';}
  setAttribute(key,value){this.attributes[key]=String(value);}getAttribute(key){return this.attributes[key];}
  append(...nodes){this.children.push(...nodes);}replaceChildren(){this.children=[];}addEventListener(){}
 }
 const get=id=>{if(!controls.has(id))controls.set(id,new Node());return controls.get(id);};
 for(const id of ['toggleChanges','toggleChangeLabels','toggleMovement'])get(id).setAttribute('aria-pressed','true');
 const ctx=new Proxy({measureText:()=>({width:10})},{get:(object,key)=>key in object?object[key]:()=>{}});
 const context={document:{getElementById:get,createElement:()=>new Node(),querySelector:()=>null,body:{classList:{toggle(name,value){if(value)bodyClasses.add(name);else bodyClasses.delete(name);}}}},addEventListener:(type,fn)=>{if(!events.has(type))events.set(type,[]);events.get(type).push(fn);},
  chrome:{runtime:{sendMessage:async()=>({ok:true,result:{path:'board.kicad_pcb',source:'source'}})}},
  KiCadMergeConflicts:{analyze:()=>({count:1,current:'a',incoming:'b',candidates:{current:{valid:true,source:'a'},incoming:{valid:true,source:'b'}}})},
  KiCadDesignDiff:{parse:()=>[],compareProjects:()=>({changes:[{status:'modified',label:'R1',before:{uuid:'part'},after:{uuid:'part'}}],counts:{added:0,removed:0,modified:1}})},
  KiCadConflictProperties:{objects:()=>[{uuid:'part',label:'R1',fields:[]}],rows:()=>[],presence:require('../conflict-properties.js').presence,annotations:()=>({fields:[]})},
  KiCadPCBRenderer:{build:()=>({primitives:[{uuid:'part'}]})},
  KiCadOwnedCanvas:{bounds:()=>null,mount(){const view={pcb:true,ctx,canvas:{clientWidth:800,clientHeight:600},viewport:{camera:{}},addEventListener(){},resize(){this.resizeCount=(this.resizeCount||0)+1;},draw(){},setDocument(design){this.primitives=design.primitives;},setNetHighlights(groups){this.highlights=groups;}};views.push(view);return view;}}
 };
 vm.runInNewContext(fs.readFileSync('extension/conflict-viewer.js','utf8'),context);await new Promise(resolve=>setImmediate(resolve));return {get,views,bodyClasses,events};
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


test('conflict drawings start full-width; explicit Properties toggles both panels and resizes without changing the resolution',async()=>{
 const f=await fixture();assert.equal(f.get('toggleProperties').getAttribute('aria-pressed'),'false');assert.equal(f.bodyClasses.has('properties-hidden'),true);
 f.get('acceptCurrent').onclick();const choice=f.get('chosenVersion').textContent;
 f.get('currentPropertySearch').value='value';f.get('toggleProperties').onclick();assert.equal(f.get('toggleProperties').getAttribute('aria-pressed'),'true');assert.equal(f.bodyClasses.has('properties-hidden'),false);
 for(const view of f.views)assert.equal(view.resizeCount,1);
 f.get('toggleProperties').onclick();assert.equal(f.bodyClasses.has('properties-hidden'),true);assert.equal(f.get('currentPropertySearch').value,'value');assert.equal(f.get('chosenVersion').textContent,choice);assert.equal(f.get('saveOriginal').disabled,false);
 for(const view of f.views)assert.equal(view.resizeCount,2);
});
test('secondary view controls open on demand and Escape restores focus without changing choice or highlights',async()=>{
 const f=await fixture();assert.equal(f.get('viewOptionsPanel').hidden,true);assert.equal(f.get('viewOptions').getAttribute('aria-expanded'),'false');
 f.get('acceptIncoming').onclick();const choice=f.get('chosenVersion').textContent;f.get('viewOptions').onclick();assert.equal(f.get('viewOptionsPanel').hidden,false);
 let focused=false,prevented=false;f.get('viewOptions').focus=()=>focused=true;for(const handler of f.events.get('keydown'))handler({key:'Escape',preventDefault(){prevented=true;}});
 assert.equal(f.get('viewOptionsPanel').hidden,true);assert.equal(focused,true);assert.equal(prevented,true);assert.equal(f.get('chosenVersion').textContent,choice);for(const view of f.views)assert.equal(view.highlights.length,1);
});
