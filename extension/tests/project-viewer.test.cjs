const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function runtime(fetchFile,inventoryFiles=null,inventoryError=null){
 class Element extends EventTarget{constructor(){super();this.children=[];this.value='';this.hidden=false;this.style={};this.dataset={};this.attributes={};this.text='';}append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;this.text='';}setAttribute(k,v){this.attributes[k]=String(v);}set textContent(v){this.text=String(v);this.children=[];}get textContent(){return this.text+this.children.map(n=>n.textContent).join(' ');}getBoundingClientRect(){return{left:0,top:0,width:800,height:600};}getContext(){return new Proxy({},{get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>(o[k]=v,true)});}}
 const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},requests=[],handlers={};let mounted=null;
 const context={URLSearchParams,TextEncoder,TextDecoder,Map,Set,console,location:{search:'?repository=wayri/review&ref=main&file=board.kicad_pro'},document:{getElementById:get,createElement:()=>new Element(),createElementNS:()=>new Element(),body:{dataset:{}},documentElement:{style:{}}},addEventListener:(type,fn)=>handlers[type]=fn,
 KiCadGitHub:require('../parsing.js'),KiCadProjectSettings:require('../project-settings.js'),KiCadProjectSettingsUI:require('../project-settings-ui.js'),KiCadGerberRenderer:require('../gerber-renderer.js'),KiCadUIIcons:{decorate(){}},
 KiCadOwnedCanvas:{mount(host){mounted=new EventTarget();Object.assign(mounted,{canvas:new Element(),viewport:{camera:new(require('../owned-canvas.js').Camera)(800,600)},resize(){},zoom_to_board(){},draw(){this.renderPrimitives?.(this.canvas.getContext(),this.viewport.camera,this);},dispose(){}});mounted.canvas.width=800;mounted.canvas.height=600;return mounted;}},
 chrome:{runtime:{getURL:name=>name,sendMessage:async request=>{requests.push(request);if(request.type==='project-inventory'&&inventoryError)return{ok:false,error:inventoryError};if(request.type==='project-inventory')return{ok:true,result:{snapshotRef:'a'.repeat(40),warnings:[],files:inventoryFiles||[{path:'board.kicad_pro'},{path:'top.gbr'},{path:'bottom.gbr'}]}};try{return{ok:true,result:{path:request.file,content:await fetchFile(request.file)}};}catch(e){return{ok:false,error:e.message};}}}}};
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
test('setup controls are copyable read-only fields with source inspection and boolean state',async()=>{
 const view=runtime(async()=>JSON.stringify({board:{design_settings:{rules:{min_clearance:.2,allow_blind_buried_vias:true}}},net_settings:{classes:[null,{name:'Power',clearance:.4,track_width:.6,future_setting:'kept'}]}}));await tick();
 const flatten=element=>[element,...element.children.flatMap(flatten)],all=flatten(view.get('constraintSections'));
 assert.ok(all.some(e=>e.readOnly&&e.value==='0.2'));assert.ok(all.some(e=>e.type==='checkbox'&&e.checked&&e.disabled&&e.attributes['aria-label']));
 const info=all.find(e=>e.attributes['aria-label']==='Inspect saved source for min clearance');assert.ok(info);info.onclick();assert.equal(view.get('settingSourceDetail').open,true);assert.match(view.get('settingValue').textContent,/\/board\/design_settings\/rules\/min_clearance/);
 const category=flatten(view.get('settingSections')).find(e=>e.textContent==='Net classes and assignments'&&e.onclick);category.onclick();
 const rows=flatten(view.get('settingSections'));assert.ok(rows.some(e=>e.className==='netclass-value'&&e.textContent==='Power'&&e.title==='/net_settings/classes/1/name'));assert.ok(rows.some(e=>e.readOnly&&e.value==='kept'));
 assert.equal(view.get('boardSetup').value,'');assert.equal(view.get('loadBoardSetup').disabled,true);
});

test('PCB selection opens one drawing preview; explicit setup retains saved layers without fabricating a stackup',async()=>{
 const board='(kicad_pcb (version 20240108) (general (thickness 1.6)) (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (44 "Edge.Cuts" user)))';
 const view=runtime(async file=>file.endsWith('.kicad_pcb')?board:'{}',[{path:'board.kicad_pro'},{path:'board.kicad_pcb'}]);await tick();
 await view.get('fileTree').children.find(n=>n.textContent==='board.kicad_pcb').onclick();
 assert.equal(view.get('overviewPanel').hidden,false);assert.equal(view.get('drawingPreview').children.length,1);assert.match(view.get('drawingPreview').children[0].src,/file=board.kicad_pcb/);
 view.get('openDesign').onclick();await tick();assert.equal(view.get('drawingPreview').children.length,1);
 await view.get('loadBoardSetup').onclick();assert.equal(view.get('stackupPanel').hidden,false);assert.match(view.get('stackupContent').textContent,/1.6 mm/);assert.match(view.get('stackupContent').textContent,/F.Cu/);assert.match(view.get('stackupContent').textContent,/no saved physical stackup/);assert.doesNotMatch(view.get('stackupContent').textContent,/FR4/);
});
test('project folders start collapsed outside the active path and expand for search',async()=>{
 const view=runtime(async()=> '{}',[{path:'board.kicad_pro'},{path:'Other/x.kicad_pro'}]);await tick();
 assert.equal(view.get('fileTree').children[0].open,false);
 view.get('fileSearch').value='Other';view.get('fileSearch').oninput();assert.equal(view.get('fileTree').children[0].open,true);
 view.get('collapseProjectTree').onclick();assert.equal(view.get('fileSearch').value,'');assert.equal(view.get('fileTree').children[0].open,false);
 view.get('expandProjectTree').onclick();assert.equal(view.get('fileTree').children[0].open,true);
});


test('failed project metadata still opens the requested file and discloses unpinned incomplete structure',async()=>{
 const view=runtime(async()=>'{"board":{"design_settings":{"rules":{"min_clearance":0.2}}}}',null,'GitHub API rate limit reached.');await tick();
 assert.equal(view.get('projectFile').textContent,'board.kicad_pro');assert.match(view.get('settingSections').textContent,/Board constraints/);assert.match(view.get('inventoryNote').textContent,/rate limit.*not been pinned/);assert.equal(view.requests.find(r=>r.type==='project-file').ref,'main');assert.equal(view.get('loadBoardSetup').disabled,true);
});
test('failed metadata and source reads end loading with an actionable error and filename',async()=>{
 const view=runtime(async()=>{throw Error('GitHub authentication failed (HTTP 401). Reconnect your account.');},null,'GitHub denied this request.');await tick();assert.equal(view.get('projectFile').textContent,'board.kicad_pro');assert.match(view.get('projectStatus').textContent,/Unable to load board.kicad_pro.*Reconnect/);assert.doesNotMatch(view.get('projectFile').textContent,/Loading/);
});
