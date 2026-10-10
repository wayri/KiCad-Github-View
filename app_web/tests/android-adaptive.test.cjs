const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('embedded and split drawings reuse the ancestor workspace menu; standalone keeps a menu',()=>{
 const {hasParentWorkspace}=require('../../android-app/web/adaptive-ui.js');
 const top={document:{getElementById:()=>null}};top.parent=top;
 assert.equal(hasParentWorkspace(top),false);
 const workspace={document:{getElementById:id=>id==='androidWorkspaceHeader'?{}:null},parent:top};
 assert.equal(hasParentWorkspace({parent:workspace}),true);
 assert.equal(hasParentWorkspace({parent:{document:top.document,parent:workspace}}),true);
 assert.equal(hasParentWorkspace({parent:top}),false);
 assert.equal(hasParentWorkspace({get parent(){throw Error('cross origin');}}),false);
});
test('Android Back dismisses the current overlay and child pane before allowing native exit',()=>{
 const nodes=new Map(),modal={open:true,close(){this.open=false;}},pane={hidden:false,getClientRects(){return this.hidden?[]:[{width:400,height:600}];}},frame={hidden:false,getClientRects:()=>[{width:400,height:600}],contentWindow:{KiCadAndroidUI:{handleBack:()=>api.handleBack()}}};let child=false;
 const document={readyState:'loading',getElementById:id=>nodes.get(id),addEventListener(){},querySelectorAll:selector=>selector==='dialog[open]'?(modal.open?[modal]:[]):selector==='iframe'?(child?[frame]:[]):[]};
 const context={document,module:{exports:{}},console};vm.createContext(context);vm.runInContext(fs.readFileSync('android-app/web/adaptive-ui.js','utf8'),context);const api=context.KiCadAndroidUI;
 nodes.set('commentsSidebar',pane);nodes.set('closeComments',{click(){pane.hidden=true;}});
 assert.equal(api.handleBack(),true);assert.equal(modal.open,false);assert.equal(pane.hidden,false);
 assert.equal(api.handleBack(),true);assert.equal(pane.hidden,true);assert.equal(api.handleBack(),false);
 // A root shell must honor the active drawing's result rather than exit.
 frame.contentWindow.KiCadAndroidUI.handleBack=()=>true;child=true;assert.equal(api.handleBack(),true);
 frame.contentWindow.KiCadAndroidUI.handleBack=()=>false;assert.equal(api.handleBack(),false);
});

test('Android uses a background parser when available and falls back safely if WebView refuses workers',async()=>{
 const source=fs.readFileSync('android-app/app/src/main/assets/viewer/loading-ui.js','utf8');let worker;class Worker{constructor(){worker=this;}postMessage(){}terminate(){this.terminated=true;}}
 const context={document:{currentScript:{src:'https://appassets.androidplatform.net/assets/viewer/loading-ui.js'}},location:{href:'https://appassets.androidplatform.net/assets/viewer/index.html'},URL,Worker,KiCadVSCodeContext:{},KiCadAndroidRuntime:true,setTimeout,clearTimeout,console};vm.createContext(context);vm.runInContext(source,context);let fallback=0;const job=context.KiCadLoading.run('drawing',{},()=>{fallback++;return {ready:true};});assert.ok(worker);worker.onmessage({data:{ok:true,result:{prepared:true}}});assert.equal((await job).prepared,true);assert.equal(fallback,0);
 const blocked=context.KiCadLoading.run('drawing',{},()=>{fallback++;return {ready:true};});worker.onerror();assert.equal((await blocked).ready,true);assert.equal(fallback,1);assert.equal(worker.terminated,true);
});
test('Back prioritizes menu, then parent sheet, then home without revisiting the child',()=>{
 const nodes=new Map(),modal={open:true,close(){this.open=false;}},calls=[];
 const document={readyState:'loading',getElementById:id=>nodes.get(id),addEventListener(){},querySelectorAll:selector=>selector==='dialog[open]'&&modal.open?[modal]:[]};
 const context={document,module:{exports:{}},console,KiCadAndroid:{showHome(){calls.push('home');nodes.get('viewer').hidden=true;}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('android-app/web/adaptive-ui.js','utf8'),context);const api=context.KiCadAndroidUI;
 const up={disabled:false,click(){calls.push('parent');this.disabled=true;nodes.get('sheetHome').disabled=true;}};
 nodes.set('sheetUp',up);nodes.set('sheetHome',{disabled:false});nodes.set('sheetBack',{disabled:false,click(){calls.push('history');}});
 assert.equal(api.handleBack(),true);assert.equal(modal.open,false);assert.deepEqual(calls,[]);
 assert.equal(api.handleBack(),true);assert.deepEqual(calls,['parent']);
 nodes.set('viewer',{hidden:false,getClientRects(){return this.hidden?[]:[{width:400,height:600}];}});
 assert.equal(api.handleBack(),true);assert.deepEqual(calls,['parent','home']);assert.equal(api.handleBack(),false);
});
test('Back handles nested drawing menus before returning from the subsheet',()=>{
 const makeDocument=()=>({readyState:'loading',nodes:new Map(),getElementById(id){return this.nodes.get(id);},addEventListener(){},querySelectorAll(selector){return selector==='iframe'?this.frames||[]:selector==='dialog[open]'&&this.modal?.open?[this.modal]:[];}});
 function load(document){const c={document,module:{exports:{}},console};vm.createContext(c);vm.runInContext(fs.readFileSync('android-app/web/adaptive-ui.js','utf8'),c);return c.KiCadAndroidUI;}
 const leaf=makeDocument();leaf.modal={open:true,close(){this.open=false;}};let parentVisits=0;leaf.nodes.set('sheetUp',{disabled:false,click(){parentVisits++;this.disabled=true;}});
 const drawing=load(leaf),middle=makeDocument();middle.frames=[{getClientRects:()=>[{width:400,height:600}],contentWindow:{KiCadAndroidUI:drawing}}];
 const outer=makeDocument();outer.frames=[{getClientRects:()=>[{width:400,height:600}],contentWindow:{KiCadAndroidUI:load(middle)}}];const api=load(outer);
 assert.equal(api.handleBack(),true);assert.equal(leaf.modal.open,false);assert.equal(parentVisits,0);
 assert.equal(api.handleBack(),true);assert.equal(parentVisits,1);assert.equal(api.handleBack(),false);
});
test('text selection is explicit and Back exits that mode before sheet navigation',()=>{
 const classes=new Set(),nodes=new Map();let cleared=0,up=0;
 const document={body:{classList:{contains:name=>classes.has(name),toggle(name,on){if(on)classes.add(name);else classes.delete(name);}}},readyState:'loading',getElementById:id=>nodes.get(id),addEventListener(){},querySelectorAll:()=>[]};
 const context={document,module:{exports:{}},console,getSelection:()=>({removeAllRanges(){cleared++;}})};vm.createContext(context);vm.runInContext(fs.readFileSync('android-app/web/adaptive-ui.js','utf8'),context);
 const button={setAttribute(name,value){this[name]=value;}};nodes.set('androidSelectText',button);nodes.set('sheetUp',{disabled:false,click(){up++;}});
 const api=context.KiCadAndroidUI;api.setTextSelection(true);assert.equal(classes.has('text-select-mode'),true);assert.equal(button['aria-pressed'],'true');
 assert.equal(api.handleBack(),true);assert.equal(classes.has('text-select-mode'),false);assert.equal(cleared,1);assert.equal(up,0);assert.equal(button['aria-pressed'],'false');
 assert.equal(api.handleBack(),true);assert.equal(up,1);
});

test('Back closes the all-sheets overview before navigating a parent sheet',()=>{
 let opened=true,parentVisits=0;const nodes=new Map();
 nodes.set('sheetUp',{disabled:false,click(){parentVisits++;this.disabled=true;}});
 const document={readyState:'loading',getElementById:id=>nodes.get(id),addEventListener(){},querySelectorAll:()=>[]};
 const context={document,module:{exports:{}},console,KiCadSheetOverview:{isOpen:()=>opened,close(){opened=false;}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('android-app/web/adaptive-ui.js','utf8'),context);
 assert.equal(context.KiCadAndroidUI.handleBack(),true);assert.equal(opened,false);assert.equal(parentVisits,0);
 assert.equal(context.KiCadAndroidUI.handleBack(),true);assert.equal(parentVisits,1);
 assert.equal(context.KiCadAndroidUI.handleBack(),false);
});
