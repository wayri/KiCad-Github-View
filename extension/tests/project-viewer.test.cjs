const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function runtime(fetchFile){
 class Element extends EventTarget{constructor(){super();this.children=[];this.value='';this.hidden=false;this.style={};this.dataset={};this.attributes={};this.text='';}append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;this.text='';}setAttribute(k,v){this.attributes[k]=String(v);}set textContent(v){this.text=String(v);this.children=[];}get textContent(){return this.text+this.children.map(n=>n.textContent).join(' ');}getBoundingClientRect(){return{left:0,top:0,width:800,height:600};}getContext(){return new Proxy({},{get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>(o[k]=v,true)});}}
 const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},requests=[],handlers={};let mounted=null;
 const context={URLSearchParams,TextEncoder,TextDecoder,Map,Set,console,location:{search:'?repository=wayri/review&ref=main&file=board.kicad_pro'},document:{getElementById:get,createElement:()=>new Element(),createElementNS:()=>new Element(),body:{dataset:{}},documentElement:{style:{}}},addEventListener:(type,fn)=>handlers[type]=fn,
 KiCadGitHub:require('../parsing.js'),KiCadProjectSettings:require('../project-settings.js'),KiCadGerberRenderer:require('../gerber-renderer.js'),KiCadUIIcons:{decorate(){}},
 KiCadOwnedCanvas:{mount(host){mounted=new EventTarget();Object.assign(mounted,{canvas:new Element(),viewport:{camera:new(require('../owned-canvas.js').Camera)(800,600)},resize(){},zoom_to_board(){},draw(){this.renderPrimitives?.(this.canvas.getContext(),this.viewport.camera,this);},dispose(){}});mounted.canvas.width=800;mounted.canvas.height=600;return mounted;}},
 chrome:{runtime:{getURL:name=>name,sendMessage:async request=>{requests.push(request);if(request.type==='project-inventory')return{ok:true,result:{snapshotRef:'a'.repeat(40),warnings:[],files:[{path:'board.kicad_pro'},{path:'top.gbr'},{path:'bottom.gbr'}]}};try{return{ok:true,result:{path:request.file,content:await fetchFile(request.file)}};}catch(e){return{ok:false,error:e.message};}}}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../project-viewer.js'),'utf8'),context);return{get,requests,canvas:()=>mounted,handlers};
}
const gerber='%FSLAX24Y24*%%MOMM*%%ADD10C,1*%D10*X010000Y020000D03*M02*';
test('project GUI exposes saved settings and mounts the public canvas API for multiple Gerber layers',async()=>{
 const view=runtime(async file=>file.endsWith('.gbr')?gerber:'{"board":{"design_settings":{"rules":{"min_clearance":0.2}}}}');await tick();assert.match(view.get('settingSections').textContent,/Board constraints/);
 // File tree buttons use the original requested identities after SHA pinning.
 const buttons=view.get('fileTree').children;await buttons.find(n=>n.textContent==='top.gbr').onclick();await buttons.find(n=>n.textContent==='bottom.gbr').onclick();assert.equal(view.get('gerberLayers').children.length,2);assert.equal(view.canvas().primitives.length,2);assert.ok(view.requests.filter(r=>r.type==='project-file').every(r=>r.ref==='a'.repeat(40)));
 view.get('gerberClear').onclick();assert.equal(view.canvas().primitives.length,0);assert.equal(view.get('gerberLayers').children.length,0);
});
test('late failed source reads cannot overwrite the latest project selection',async()=>{
 let rejectOld;const view=runtime(file=>file==='top.gbr'?new Promise((_,reject)=>rejectOld=reject):Promise.resolve(file.endsWith('.gbr')?gerber:'{}'));await tick();const buttons=view.get('fileTree').children;
 const pending=buttons.find(n=>n.textContent==='top.gbr').onclick();await buttons.find(n=>n.textContent==='bottom.gbr').onclick();rejectOld(new Error('Old failure'));await pending;assert.equal(view.get('projectFile').textContent,'bottom.gbr');assert.match(view.get('projectStatus').textContent,/Viewing saved source/);
});
