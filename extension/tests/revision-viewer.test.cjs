const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const viewState=require('../view-state.js'),core=require('../owned-canvas.js');
const tick=()=>new Promise(resolve=>setImmediate(resolve)),plain=value=>JSON.parse(JSON.stringify(value));
async function revision(query='',extraFiles=[]){
 const listeners=new Map(),controls=new Map(),reports=[],calls={board:0,page:0,draw:0,disposed:0,attach:0};
 class Element{constructor(){this.attributes={};this.children=[];this.hidden=false;this.dataset={viewer:'auto'};this.isConnected=true;this.classList={add(){}};this.style={};}setAttribute(k,v){this.attributes[k]=String(v);}append(...children){this.children.push(...children);}remove(){}replaceChildren(){this.children=[];}click(){return this.onclick?.();}}
 const get=id=>{if(!controls.has(id))controls.set(id,new Element());return controls.get(id);};
 const camera=new core.Camera(800,600),parent={postMessage:(data,origin)=>reports.push({data,origin})};
 const canvas={canvas:new Element(),viewport:{camera},document:null,visibleLayers:new Set(),resize(){},draw(){calls.draw++;},dispose(){calls.disposed++;},
  setDocument(design,file){this.design=design;this.document={filename:file};this.zoom_to_board();this.draw();},
  zoom_to_board(){calls.board++;camera.bbox={x:92,y:192,w:16,h:16};},zoom_to_page(){calls.page++;camera.bbox={x:0,y:0,w:297,h:210};}};
 const context={URL,URLSearchParams,console,location:{search:'?repository=wayri/board&ref=main&file=root.kicad_sch'+query},parent,
  document:{getElementById:get,body:new Element(),createElement:()=>new Element(),head:new Element()},
  chrome:{runtime:{getURL:name=>'chrome-extension://ours/'+name,sendMessage:async()=>({ok:true,result:[{path:'root.kicad_sch',content:'(kicad_sch)'},...extraFiles]})}},
  KiCadPairedReview:require('../paired-review.js'),KiCadReviewTools:require('../review-tools.js'),KiCadWorksheet:require('../worksheet.js'),KiCadBrowserData:require('../browser-data.js'),KiCadDesignModel:require('../design-model.js'),KiCadDesignDiff:require('../design-diff.js'),KiCadViewState:viewState,
  KiCadSchematicRenderer:{build:()=>({primitives:[],layers:[],page:{width:297,height:210},warnings:[]})},
  KiCadOwnedCanvas:{mount:()=>canvas},KiCadReviewWorkspace:{mount:options=>{calls.workspaceOptions=options;return {draw(){},attachCanvas(){calls.attach++;},dispose(){calls.disposed++;},highlightRelated(selection){calls.related=selection;options.onSelection?.(selection);},refreshComments(){calls.refreshed=(calls.refreshed||0)+1;},options};}},
  addEventListener:(type,callback)=>listeners.set(type,callback)};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../revision-viewer.js'),'utf8'),context);await tick();
 return{canvas,camera,calls,get,reports,parent,context,message(data,source=parent,origin='chrome-extension://ours'){listeners.get('message')({source,origin,data});},key(key,nodes=[],modifiers={}){let prevented=false;listeners.get('keydown')({key,composedPath:()=>nodes,preventDefault(){prevented=true;},...modifiers});return prevented;},hide(){listeners.get('pagehide')();}};
}
test('owned dedicated viewer mounts fetched designs and accepts only trusted parent commands',async()=>{
 const v=await revision();assert.equal(v.canvas.document.filename,'root.kicad_sch');assert.equal(v.calls.attach,2);
 v.message({type:'kicad-review:command',command:'fit-page'});assert.equal(v.calls.page,1);
 v.message({type:'kicad-review:command',command:'focus',position:{x:50,y:70}});assert.equal(v.camera.center.x,50);assert.equal(v.camera.center.y,70);
 const before=v.calls.draw;v.message({type:'kicad-review:command',command:'fit-page'},{},'chrome-extension://ours');v.message({type:'kicad-review:command',command:'fit-page'},v.parent,'https://github.com');assert.equal(v.calls.draw,before);
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
