const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const viewState=require('../view-state.js'),core=require('../owned-canvas.js');
const tick=()=>new Promise(resolve=>setImmediate(resolve)),plain=value=>JSON.parse(JSON.stringify(value));
async function revision(query='',extraFiles=[],options={}){
 const listeners=new Map(),canvasListeners=new Map(),controls=new Map(),reports=[],calls={board:0,page:0,draw:0,disposed:0,attach:0};
 class Element{constructor(){this.attributes={};this.children=[];this.hidden=false;this.dataset={viewer:'auto'};this.isConnected=true;this.classList={add(){},remove(){},toggle(){}};this.style={};}setAttribute(k,v){this.attributes[k]=String(v);}getAttribute(k){return this.attributes[k]??null;}append(...children){this.children.push(...children);}remove(){}replaceChildren(){this.children=[];}click(){return this.onclick?.();}}
 const get=id=>{if(!controls.has(id)){const element=new Element();if(id==='viewerSettings')element.hidden=true;controls.set(id,element);}return controls.get(id);};
 const camera=new core.Camera(800,600),parent={postMessage:(data,origin)=>reports.push({data,origin})};
 const canvas={canvas:new Element(),viewport:{camera},document:null,visibleLayers:new Set(),addEventListener:(type,callback)=>canvasListeners.set(type,callback),resize(){},draw(){calls.draw++;},dispose(){calls.disposed++;},
  setDocument(design,file){this.design=design;this.document={filename:file};this.zoom_to_board();this.draw();},
  zoom_to_board(){calls.board++;camera.bbox={x:92,y:192,w:16,h:16};},zoom_to_page(){calls.page++;camera.bbox={x:0,y:0,w:297,h:210};}};
 for(const name of ['focusLayer','restoreLayers','layerPreset'])canvas[name]=function(...args){if(name==='focusLayer'){if(!this.layerSnapshot)this.layerSnapshot=new Set(this.visibleLayers);this.focusedLayer=args[0];this.layerFocusMode=args[1];this.visibleLayers.add(args[0]);}else if(name==='layerPreset'){if(!this.layerSnapshot)this.layerSnapshot=new Set(this.visibleLayers);this.focusedLayer=null;this.visibleLayers=new Set(this.design.layers);}else{if(this.layerSnapshot)this.visibleLayers=new Set(this.layerSnapshot);this.layerSnapshot=null;this.focusedLayer=null;}};
 const initialFile=options.file||(options.pcb?'board.kicad_pcb':'root.kicad_sch');
 const context={URL,URLSearchParams,console,location:{search:'?repository=wayri/board&ref=main&file='+initialFile+query},parent,
  document:{getElementById:get,body:new Element(),createElement:()=>new Element(),head:new Element()},
  chrome:{runtime:{getURL:name=>'chrome-extension://ours/'+name,sendMessage:async message=>{(calls.requests||=[]).push(message);if(message.type==='revision-resolve')return{ok:true,result:{sha:'a'.repeat(40)}};if(message.type==='repo-asset'){(calls.assetRequests||=[]).push(message);return{ok:true,result:{base64:'AAAA'}};}return{ok:true,result:[{path:initialFile,content:options.pcb?'(kicad_pcb)':'(kicad_sch)'},...extraFiles]};}}},
  KiCadPairedReview:require('../paired-review.js'),KiCadReviewTools:require('../review-tools.js'),KiCadWorksheet:require('../worksheet.js'),KiCadBrowserData:require('../browser-data.js'),KiCadDesignModel:require('../design-model.js'),KiCadDesignDiff:require('../design-diff.js'),KiCadViewState:viewState,
  KiCadSchematicRenderer:{build:()=>({primitives:[],layers:[],page:{width:297,height:210},warnings:[]})},
  KiCadPCBRenderer:{build:()=>({primitives:[],layers:options.layers||[],page:{width:297,height:210},warnings:[]})},
  SpikeBoard3D:{mountBoard3D(_pane,_source,config){calls.modelOptions=config;return{dispose(){},setTheme(){}};}},
  KiCadOwnedCanvas:{mount:()=>canvas},KiCadReviewWorkspace:{mount:options=>{calls.workspaceOptions=options;return {draw(){},setScene(){},attachCanvas(){calls.attach++;},dispose(){calls.disposed++;},highlightRelated(selection){calls.related=selection;options.onSelection?.(selection);},refreshComments(){calls.refreshed=(calls.refreshed||0)+1;},options};}},
  addEventListener:(type,callback)=>listeners.set(type,callback)};
 if(options.worker)context.KiCadLoading={indicator:()=>({show(){},hide(){},dispose(){}}),paint:async()=>{},run:async(_job,payload,prepare)=>{calls.workerPayload=payload;return {...prepare(),design:context.KiCadSchematicRenderer.build()};}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../revision-viewer.js'),'utf8'),context);await tick();
 return{canvas,camera,calls,get,reports,parent,context,viewframe(){canvasListeners.get('kicad:viewframe')();},message(data,source=parent,origin='chrome-extension://ours'){listeners.get('message')({source,origin,data});},key(key,nodes=[],modifiers={}){let prevented=false;listeners.get('keydown')({key,composedPath:()=>nodes,preventDefault(){prevented=true;},...modifiers});return prevented;},hide(){listeners.get('pagehide')();}};
}

test('GPU gesture frames update viewport status and camera reports; Canvas2D-only mode is selectable',async()=>{
 const v=await revision();v.canvas.motionActive=true;v.camera.center.x+=10;v.viewframe();assert.equal(v.get('drawingHost').dataset.renderBackend,'webgl-motion');assert.equal(v.get('renderMode').textContent,'2D · WebGL');assert.equal(v.reports.at(-1).data.view.x,v.camera.center.x);
 v.get('acceleration').value='off';v.get('acceleration').onchange();assert.equal(v.canvas.acceleration,'off');
 v.canvas.motionActive=false;v.canvas.draw();assert.equal(v.get('drawingHost').dataset.renderBackend,'canvas2d');assert.equal(v.get('renderMode').textContent,'2D');
});
test('owned dedicated viewer mounts fetched designs and accepts only trusted parent commands',async()=>{
 const v=await revision();assert.equal(v.canvas.document.filename,'root.kicad_sch');assert.equal(v.calls.attach,2);
 v.message({type:'kicad-review:command',command:'fit-page'});assert.equal(v.calls.page,1);
 v.message({type:'kicad-review:command',command:'focus',position:{x:50,y:70}});assert.equal(v.camera.center.x,50);assert.equal(v.camera.center.y,70);
 const before=v.calls.draw;v.message({type:'kicad-review:command',command:'fit-page'},{},'chrome-extension://ours');v.message({type:'kicad-review:command',command:'fit-page'},v.parent,'https://github.com');assert.equal(v.calls.draw,before);
});
test('opening a child sheet initially prepares and displays its unambiguous scattered-folder root', async () => {
 const root={path:'design/main.kicad_sch',content:'(kicad_sch (sheet (property "Sheetfile" "../shared/child.kicad_sch")))'};
 const v=await revision('',[root],{file:'shared/child.kicad_sch',worker:true});
 assert.equal(v.canvas.document.filename,root.path);assert.equal(v.calls.workspaceOptions.rootFile,root.path);
 assert.equal(v.calls.workerPayload.rootFile,root.path);
 assert.equal(v.reports[0].data.file,root.path);
 v.calls.workspaceOptions.openSheet('shared/child.kicad_sch');assert.equal(v.canvas.document.filename,'shared/child.kicad_sch');
});
test('ambiguous schematic roots preserve the requested sheet with a visible diagnostic', async () => {
 const parents=['first/root.kicad_sch','second/root.kicad_sch'].map(path=>({path,content:'(kicad_sch (sheet (property "Sheetfile" "../shared/child.kicad_sch")))'}));
 const v=await revision('',parents,{file:'shared/child.kicad_sch'});
 assert.equal(v.canvas.document.filename,'shared/child.kicad_sch');
 assert.match(v.calls.workspaceOptions.files[0].discoveryWarning,/no unambiguous root/);
});
test('saved change focus opens the requested child while hierarchy home retains its actual root', async () => {
 const root={path:'design/main.kicad_sch',content:'(kicad_sch (sheet (property "Sheetfile" "../shared/child.kicad_sch")))'};
 const v=await revision('&focusX=250&focusY=300',[root],{file:'shared/child.kicad_sch',worker:true});
 assert.equal(v.canvas.document.filename,'shared/child.kicad_sch');assert.equal(v.calls.workspaceOptions.rootFile,root.path);
 assert.equal(v.calls.workerPayload.rootFile,'shared/child.kicad_sch');
 assert.equal(v.camera.center.x,250);assert.equal(v.camera.center.y,300);
 const invalid=await revision('&focusX=Infinity&focusY=300',[root],{file:'shared/child.kicad_sch'});
 assert.equal(invalid.canvas.document.filename,root.path);
});
test('focus rejects nonfinite, excessive and nonnumeric positions',async()=>{const v=await revision();const before=plain(v.camera.bbox);for(const position of [{x:NaN,y:2},{x:1000001,y:1},{x:'50',y:70},{x:1}])v.message({type:'kicad-review:command',command:'focus',position});assert.deepEqual(plain(v.camera.bbox),before);});
test('keyboard shortcuts ignore editable paths and modifiers',async()=>{const v=await revision();for(const key of ['f','Home','d','+']){assert.equal(v.key(key,[{tagName:'INPUT'}]),false);assert.equal(v.key(key,[{isContentEditable:true}]),false);assert.equal(v.key(key,[],{ctrlKey:true}),false);}assert.equal(v.key('Home'),true);assert.equal(v.calls.page,1);assert.equal(v.key('d'),true);assert.equal(v.canvas.dark,true);});
test('initial focus uses owned camera once project is available',async()=>{const v=await revision('&focusX=250&focusY=300');assert.equal(v.camera.center.x,250);assert.equal(v.camera.center.y,300);});
test('linked camera messages do not echo and cannot cross sheets',async()=>{
 const v=await revision();assert.equal(v.reports[0].data.phase,'ready');v.camera.center.set(150,180);v.camera.zoom=3.5;v.canvas.draw();assert.deepEqual(plain(v.reports.at(-1).data.view),{x:150,y:180,zoom:3.5});
 const count=v.reports.length;v.canvas.draw();assert.equal(v.reports.length,count);
 v.message({type:'kicad-review:command',command:'set-view',file:'root.kicad_sch',view:{x:400,y:500,zoom:2}});assert.equal(v.camera.center.x,400);assert.equal(v.reports.length,count);
 v.message({type:'kicad-review:command',command:'set-view',file:'other.kicad_sch',view:{x:1,y:2,zoom:4}});assert.equal(v.camera.center.x,400);
 v.message({type:'kicad-review:command',command:'set-view',file:'root.kicad_sch',view:{x:1,y:2,zoom:Infinity}});assert.equal(v.camera.zoom,2);
});
test('active sheet identity is used in reports and received view filtering',async()=>{const v=await revision();v.canvas.document.filename='child.kicad_sch';v.key('f');assert.equal(v.reports.at(-1).data.file,'child.kicad_sch');assert.equal(v.reports.at(-1).data.phase,'ready');});
test('zoom limits keep the camera finite and pagehide disposes owned UI resources',async()=>{const v=await revision();const center=plain(v.camera.center);v.get('zoomIn').click();assert.equal(v.camera.center.x,center.x);v.camera.zoom=9999;v.key('+');assert.equal(v.camera.zoom,10000);v.camera.zoom=.0011;v.key('-');assert.equal(v.camera.zoom,.001);v.hide();assert.equal(v.calls.disposed,2);});

 test('independent UI and drawing themes and ruler units persist through controls',async()=>{const v=await revision();v.get('uiTheme').value='dark';v.get('uiTheme').onchange();assert.equal(v.context.document.body.dataset.uiTheme,'dark');assert.equal(v.canvas.dark,false);v.get('drawingTheme').value='dark';v.get('drawingTheme').onchange();assert.equal(v.canvas.dark,true);v.get('rulerUnits').value='mil';v.get('rulerUnits').onchange();assert.equal(v.get('rulerUnits').value,'mil');});
 test('canvas theme shortcut preserves interface theme and explicit presets choose native canvas by drawing type',async()=>{const v=await revision();v.get('uiTheme').value='dark';v.get('uiTheme').onchange();v.key('d');assert.equal(v.context.document.body.dataset.uiTheme,'dark');assert.equal(v.canvas.dark,true);v.get('displayPreset').value='kicad';v.get('displayPreset').onchange();assert.equal(v.context.document.body.dataset.uiTheme,'light');assert.equal(v.canvas.dark,false);const board=await revision('',[],{pcb:true});board.get('displayPreset').value='kicad';board.get('displayPreset').onchange();assert.equal(board.context.document.body.dataset.uiTheme,'light');assert.equal(board.canvas.dark,true);});
 test('review page setup builds portrait worksheet and restores source page',async()=>{const v=await revision();v.get('settingsButton').click();v.get('pageFormat').value='A3';v.get('pagePortrait').checked=true;v.get('pageTitle').value='Review';v.get('applyPage').click();assert.equal(v.canvas.design.page.width,297);assert.equal(v.canvas.design.page.height,420);assert.equal(v.canvas.design.page.titleBlock.title,'Review');assert.ok(v.canvas.design.primitives.some(p=>p.frame));v.get('resetPage').click();assert.equal(v.canvas.design.page.height,210);});

test('paired selection relay validates parent and suppresses cross-highlight echoes',async()=>{
 const v=await revision(),selection={kind:'part',path:'board.kicad_pcb',reference:'R1'};
 v.calls.workspaceOptions.onSelection(selection);
 assert.equal(v.reports.at(-1).data.type,'kicad-review:selection');
 const count=v.reports.length;
 v.message({type:'kicad-review:command',command:'highlight-related',selection});
 assert.deepEqual(plain(v.calls.related),selection);assert.equal(v.reports.length,count);
 v.calls.related=null;
 v.message({type:'kicad-review:command',command:'highlight-related',selection},{},'chrome-extension://ours');
 v.message({type:'kicad-review:command',command:'highlight-related',selection:{...selection,reference:'R1\n'}});
 assert.equal(v.calls.related,null);
 v.message({type:'kicad-review:command',command:'refresh-comments'});assert.equal(v.calls.refreshed,1);
});
test('3D mode reuses successful model assets across toggles and clears them on pagehide',async()=>{
 const v=await revision('',[],{pcb:true});await v.get('mode3d').click();
 await v.calls.modelOptions.loadAsset('models/part.wrl');
 await v.get('mode3d').click();await v.get('mode3d').click();
 await v.calls.modelOptions.loadAsset('models/part.wrl');assert.equal(v.calls.assetRequests.length,1);
 assert.equal(v.calls.assetRequests[0].repository,'wayri/board');assert.equal(v.calls.assetRequests[0].ref,'a'.repeat(40));assert.equal(v.calls.assetRequests[0].file,'models/part.wrl');
 v.hide();await v.calls.modelOptions.loadAsset('models/part.wrl');assert.equal(v.calls.assetRequests.length,2);
});

test('view settings exposes expanded state and Escape closes it without changing the drawing',async()=>{const v=await revision();v.get('settingsButton').click();assert.equal(v.get('viewerSettings').hidden,false);assert.equal(v.get('settingsButton').attributes['aria-expanded'],'true');assert.equal(v.key('Escape'),true);assert.equal(v.get('viewerSettings').hidden,true);assert.equal(v.get('settingsButton').attributes['aria-expanded'],'false');assert.equal(v.canvas.design.page.width,297);});

test('remote viewer pins branch before loading drawings and passes the same commit to review tools',async()=>{
 const v=await revision();assert.equal(v.calls.requests[0].type,'revision-resolve');assert.equal(v.calls.requests.find(m=>m.type==='project').ref,'a'.repeat(40));assert.equal(v.calls.workspaceOptions.ref,'a'.repeat(40));
});

test('floating saved copper layer selector isolates, shows all and restores the previous view',async()=>{
 const v=await revision('',[],{pcb:true,layers:['F.Cu','In1.Cu','In2.Cu','B.Cu','Edge.Cuts']});
 const bar=v.get('drawingHost').children.find(child=>child.id==='floatingLayerSelector');
 assert.ok(bar);assert.equal(bar.hidden,false);const toggle=bar.children[0],buttons=bar.children[1].children;assert.equal(toggle.attributes['aria-expanded'],'false');toggle.click();assert.equal(toggle.attributes['aria-expanded'],'true');assert.deepEqual(buttons.map(button=>button.dataset.layer),['F.Cu','In1.Cu','In2.Cu','B.Cu','All','Overview']);
 v.canvas.visibleLayers=new Set(['F.Cu','Edge.Cuts']);
 buttons[1].click();assert.equal(toggle.attributes['aria-expanded'],'false');assert.equal(toggle.textContent,'In1.Cu');assert.equal(v.canvas.focusedLayer,'In1.Cu');assert.equal(v.canvas.layerFocusMode,'isolate');assert.equal(buttons[1].attributes['aria-pressed'],'true');
 buttons[4].click();assert.deepEqual([...v.canvas.visibleLayers],v.canvas.design.layers);assert.equal(v.canvas.focusedLayer,null);
 buttons[5].click();assert.deepEqual([...v.canvas.visibleLayers],['F.Cu','Edge.Cuts']);assert.equal(v.canvas.layerSnapshot,null);
 await v.get('mode3d').click();assert.equal(bar.hidden,true);await v.get('mode3d').click();assert.equal(bar.hidden,false);
 const schematic=await revision();assert.equal(schematic.get('drawingHost').children.some(child=>child.id==='floatingLayerSelector'),false);
});
