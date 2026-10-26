const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');

test('home separates project entry and dynamically mounted tools without duplicating actions or replacing handlers',()=>{
 const nodes=new Map();
 class Node{
  constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.className='';this.classList={contains:name=>this.className.split(' ').includes(name),add:name=>{this.className+=' '+name;}};}
  append(...items){for(const node of items){node.remove();node.parentElement=this;this.children.push(node);}}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(node=>node!==this);this.parentElement=null;}
  insertBefore(node,before){node.remove();node.parentElement=this;const index=this.children.indexOf(before);assert.ok(index>=0);this.children.splice(index,0,node);}
  querySelector(){return null;}
 }
 const welcome=new Node('main');nodes.set('welcome',welcome);
 const opening=new Node();opening.className='android-welcome-actions';opening.dataset.actionGroup='open';
 let opened=0;const source=new Node('button');source.onclick=()=>opened++;opening.append(source);welcome.append(opening);
 const document={readyState:'loading',getElementById:id=>nodes.get(id),createElement:tag=>new Node(tag),addEventListener(){}};
 const context={document};vm.runInNewContext(fs.readFileSync('android-app/web/adaptive-ui.js','utf8'),context);
 const organize=context.KiCadAndroidUI.organizeHomeActions;organize();
 assert.equal(opening.parentElement,welcome,'quick-start can still insert before the original direct action container');
 const help=new Node('button');help.className='quick-start-link';welcome.append(help);
 const tools=new Node();tools.className='android-welcome-actions';const calculator=new Node('button');calculator.onclick=()=>opened+=10;tools.append(calculator);welcome.append(tools);
 organize();organize();
 assert.equal(welcome.children.length,5,'only one heading per action group');
 assert.equal(welcome.children[0].textContent,'Open project');assert.equal(welcome.children[2].textContent,'Engineering tools');assert.equal(welcome.children[3],tools);assert.equal(welcome.children[4],help);
 assert.equal(opening.classList.contains('android-source-actions'),true);assert.equal(tools.classList.contains('android-engineering-actions'),true);
 assert.equal(tools.children[0],calculator);assert.equal(opening.children[0],source);source.onclick();calculator.onclick();assert.equal(opened,11);
});

test('drawing tools group Design, Inspect and Review while preserving handlers and late actions',()=>{
 const nodes=new Map();
 class Node{
  constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.className='';this.classList={contains:c=>this.className.split(' ').includes(c),add:c=>{this.className+=' '+c;}};}
  set id(id){this._id=id;nodes.set(id,this);}get id(){return this._id;}
  append(...items){for(const n of items){n.remove();n.parentElement=this;this.children.push(n);}}
  prepend(n){n.remove();n.parentElement=this;this.children.unshift(n);}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(n=>n!==this);}
  querySelector(s){return this.children.find(n=>n.classList.contains(s.slice(1)))||null;}
 }
 const content=new Node();content.className='android-sheet-content';const sheet=new Node();sheet.id='androidToolsSheet';sheet.append(content);const drawing=new Node();drawing.id='drawingTools';content.append(drawing);
 let calls=0;const control=(id,parent=drawing)=>{const n=new Node('button');n.id=id;n.onclick=()=>calls++;parent.append(n);return n;};
 const assembly=control('openBomManager'),checks=control('viewRuleChecks'),markers=control('toggleRuleMarkers'),grid=control('gridButton'),highlights=control('highlightControls',content);highlights.checked=true;
 const toolbar=new Node(),groupHighlight=control('androidGroupHighlight',toolbar),unselect=control('androidUnselect',toolbar),clear=control('androidClearHighlights',toolbar);
 const navigation=control('projectButton',content),analytics=control('openBoardAnalytics');
 const presentation=new Node();presentation.className='presentation-launch';content.prepend(presentation);
 const document={readyState:'loading',getElementById:id=>nodes.get(id),createElement:tag=>new Node(tag),addEventListener(){}};
 const context={document};vm.runInNewContext(fs.readFileSync('android-app/web/adaptive-ui.js','utf8'),context);
 context.KiCadAndroidUI.organizeDrawingTools();context.KiCadAndroidUI.organizeDrawingTools();
 assert.deepEqual(drawing.children,[checks,assembly]);assert.equal(markers.parentElement.parentElement.id,'androidToolGroup-display');assert.equal(grid.parentElement,markers.parentElement);assert.equal(highlights.parentElement.parentElement.id,'androidToolGroup-highlight');assert.equal(highlights.checked,true);assert.equal(presentation.parentElement.parentElement.id,'androidToolGroup-highlight');
 for(const id of ['display','more'])assert.equal(nodes.get('androidToolGroup-'+id).open,false);
 for(const id of ['highlight','navigation'])assert.equal(nodes.get('androidToolGroup-'+id).open,true);
 assert.equal(content.children[0].id,'androidToolGroup-navigation','Design precedes the Inspect tool grid');
 assert.equal(nodes.get('androidPrimaryToolsHeading').textContent,'Inspect');
 for(const action of [groupHighlight,unselect,clear]){assert.equal(action.parentElement,highlights.parentElement);assert.ok(action.querySelector('.button-label'),'secondary selection actions retain visible names');}
 assert.equal(toolbar.children.length,0,'secondary selection controls leave the canvas toolbar');
 assert.equal(navigation.parentElement.parentElement.id,'androidToolGroup-navigation');
 assert.equal(analytics.parentElement.parentElement.id,'androidToolGroup-more');
 assert.equal(nodes.get('androidToolGroup-highlight').children[0].textContent,'Review');
 assert.equal(nodes.get('androidToolGroup-navigation').children[0].textContent,'Design');
 assert.equal(nodes.get('androidToolGroup-more').children[0].textContent,'More tools');
 assembly.onclick();markers.onclick();assert.equal(calls,2);const calculator=control('openCalculators');context.KiCadAndroidUI.organizeDrawingTools();assert.equal(calculator.parentElement,analytics.parentElement);assert.equal(content.children.length,6);
 assert.equal(groupHighlight.children.length,1,'observer passes do not duplicate captions');
 const sidebar=control('phoneSidebarToggle',toolbar),fit=control('androidFitDrawing',toolbar),measure=control('androidMeasure',toolbar),originalMeasure=control('measureButton');
 context.KiCadAndroidUI.organizeDrawingTools();context.KiCadAndroidUI.organizeDrawingTools();
 assert.deepEqual(toolbar.children,[sidebar],'late measurement and Fit cannot displace More from the phone toolbar');
 assert.equal(fit.parentElement.parentElement.id,'androidToolGroup-navigation');assert.equal(measure.parentElement,drawing);assert.equal(originalMeasure.hidden,true,'one visible measurement action retains the shared implementation');
 assert.equal(measure.children.length,1,'late action receives exactly one readable caption');measure.onclick();fit.onclick();assert.equal(calls,4);
 const reports=control('openSavedReports'),three=control('mode3d'),layers=control('androidRailLayers',toolbar);
 context.KiCadAndroidUI.organizeDrawingTools();context.KiCadAndroidUI.organizeDrawingTools();
 for(const action of [reports,three,layers]){assert.equal(action.parentElement,drawing);assert.equal(action.children.length,1);action.onclick();}
 assert.equal(drawing.children[0],measure,'Measure remains the first inspection action after late controls mount');
 assert.equal(reports.querySelector('.button-label').textContent,'Reports');assert.equal(layers.querySelector('.button-label').textContent,'Layers');
 assert.equal(calls,7,'original Reports, 3D and Layers controllers survive regrouping');
 assert.equal(toolbar.children.length,1,'secondary tools cannot refill the drawing rail');
});

test('short landscape windows use phone drawers while tablets retain expanded panes',()=>{
 const {sizeClass}=require('../../android-app/web/adaptive-ui.js');
 assert.equal(sizeClass(412,800),'compact');
 assert.equal(sizeClass(915,412),'medium');
 assert.equal(sizeClass(1280,800),'expanded');
 assert.equal(sizeClass(800,1280),'medium');
});

test('workspace shortcuts preserve split handlers, comparison focus and companion chooser lifecycle',()=>{
 const nodes=new Map(),observers=new Map();let splits=0,focused=0;
 const make=tag=>({tagName:tag.toUpperCase(),children:[],dataset:{},attrs:{},append(...children){this.children.push(...children);for(const child of children)if(child.id)nodes.set(child.id,child);},setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k];}});
 const nav=make('nav'),tools=make('dialog');tools.showModal=()=>{tools.open=true;};tools.close=()=>{tools.open=false;};
 nodes.set('androidWorkspaceNav',nav);nodes.set('androidWorkspaceSheet',tools);
 const split=make('button');split.click=()=>splits++;split.disabled=false;split.setAttribute('aria-pressed','false');nodes.set('splitView',split);
 const chooser=make('span');chooser.hidden=true;nodes.set('pairChooser',chooser);
 const picker={open:false,querySelector:()=>({focus(){focused++;}})};
 const document={readyState:'loading',getElementById:id=>nodes.get(id),createElement:make,addEventListener(){},querySelector:selector=>selector==='.revision-picker'?picker:null,querySelectorAll:selector=>selector==='dialog[open]'&&tools.open?[tools]:[]};
 const context={document,module:{exports:{}},MutationObserver:class{constructor(callback){this.callback=callback;}observe(node){observers.set(node,this.callback);}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('android-app/web/adaptive-ui.js','utf8'),context);
 context.KiCadAndroidUI.workspaceActions();context.KiCadAndroidUI.workspaceActions();
 assert.equal(nav.children.length,0,'split and comparison do not crowd the three main view tabs');assert.ok(tools.children.includes(nodes.get('androidWorkspaceActions')));assert.equal(nodes.get('androidWorkspaceActions').children.length,2,'observer remounts do not duplicate actions');
 nodes.get('androidQuickSplit').onclick();assert.equal(splits,1);
 split.disabled=true;split.setAttribute('aria-pressed','true');observers.get(split)();assert.equal(nodes.get('androidQuickSplit').disabled,true);assert.equal(nodes.get('androidQuickSplit').getAttribute('aria-pressed'),'true');
 chooser.hidden=false;observers.get(chooser)();assert.equal(tools.open,true);
 chooser.hidden=true;observers.get(chooser)();assert.equal(tools.open,false,'auto-selected companions close the chooser');
 nodes.get('androidQuickCompare').onclick();assert.equal(tools.open,true);assert.equal(picker.open,true);assert.equal(focused,1);
});
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
 const source=require('node:child_process').execFileSync(process.env.PYTHON||'python',['-c',"from scripts.package_android import payload; print(payload()['loading-ui.js'].decode('utf-8'))"],{encoding:'utf8'});let worker;class Worker{constructor(){worker=this;}postMessage(){}terminate(){this.terminated=true;}}
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
test('Android Back closes conversation options before the conversation panel',()=>{let menu=true,closed=false;const pane={hidden:false,getClientRects:()=>[{width:390,height:600}]},nodes=new Map([['commentsSidebar',pane],['closeComments',{click(){closed=true;pane.hidden=true;}}]]),document={readyState:'loading',getElementById:id=>nodes.get(id),addEventListener(){},querySelectorAll:()=>[]};const context={document,KiCadChatDraft:{closeMenus(){if(menu){menu=false;return true;}return false;}}};vm.runInNewContext(fs.readFileSync('android-app/web/adaptive-ui.js','utf8'),context);assert.equal(context.KiCadAndroidUI.handleBack(),true);assert.equal(closed,false);assert.equal(menu,false);assert.equal(context.KiCadAndroidUI.handleBack(),true);assert.equal(closed,true);});
