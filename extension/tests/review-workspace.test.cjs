const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveObject, measurement } = require('../review-workspace.js');
const objects = [
  { id: 'root-r1', path: 'root.kicad_sch', uuid: 'root-symbol', reference: 'R1' },
  { id: 'child-r1', path: 'power.kicad_sch', uuid: 'child-symbol', reference: 'R1' },
  { id: 'footprint', path: 'board.kicad_pcb', uuid: 'footprint-uuid', reference: 'R1' },
  { id: 'pad', path: 'board.kicad_pcb', uuid: 'pad-uuid', reference: 'R1', parentId: 'footprint' }
];
test('selection UUID and reference are scoped to the active drawing', () => {
  assert.equal(resolveObject(objects, 'power.kicad_sch', { uuid: 'root-symbol' }), null);
  assert.equal(resolveObject(objects, 'power.kicad_sch', { reference: 'R1' }).id, 'child-r1');
  assert.equal(resolveObject(objects, 'board.kicad_pcb', { ref: 'R1' }).id, 'footprint');
});
test('native pick resolves pad identity before its footprint ancestor', () => {
  assert.equal(resolveObject(objects, 'board.kicad_pcb', { uuid: 'pad-uuid', parent: { uuid: 'footprint-uuid' } }).id, 'pad');
  assert.equal(resolveObject(objects, 'board.kicad_pcb', { parent: { tstamp: 'footprint-uuid' } }).id, 'footprint');
});
test('ambiguous identity is never attached to an arbitrary part', () => {
  const duplicates = [...objects, { ...objects[2], id: 'duplicate' }];
  assert.equal(resolveObject(duplicates, 'board.kicad_pcb', { uuid: 'footprint-uuid', reference: 'R1' }), null);
  const cycle = {}; cycle.parent = cycle;
  assert.equal(resolveObject(objects, 'board.kicad_pcb', cycle), null);
});
test('measurement retains signed millimetre offsets and rejects invalid coordinates', () => {
  assert.deepEqual(measurement({x: 10, y: 20}, {x: 7, y: 24}), {dx: -3, dy: 4, distance: 5});
  assert.deepEqual(measurement({x: 0, y: 0}, {x: 0, y: 0}), {dx: 0, dy: 0, distance: 0});
  assert.equal(measurement({x: Infinity, y: 0}, {x: 0, y: 0}), null);
  assert.equal(measurement({x: '1', y: 0}, {x: 0, y: 0}), null);
});
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function workspaceRuntime(respond=async()=>[], hooks={}){
  const elements=new Map();
  class Element extends EventTarget{
    constructor(tag='div'){super();this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.hidden=false;this.value='';this.checked=false;this.style={setProperty(k,v){this[k]=v;}};this.text='';this.parentElement=null;this.classes=new Set();this.classList={toggle:(name,on)=>{const enabled=on??!this.classes.has(name);if(enabled)this.classes.add(name);else this.classes.delete(name);return enabled;},contains:name=>this.classes.has(name),remove:name=>this.classes.delete(name)};}
    set id(value){this.attributes.id=value;elements.set(value,this);}get id(){return this.attributes.id;}get className(){return this.attributes.class||'';}set className(value){this.attributes.class=value;this.classes=new Set(value.split(/\s+/));}
    set textContent(value){this.text=String(value);this.children=[];}get textContent(){return this.text+this.children.map(c=>c.textContent).join(' ');}
    append(...children){for(const child of children){child.remove();child.parentElement=this;this.children.push(child);}}replaceChildren(...children){for(const child of this.children)child.parentElement=null;this.text='';this.children=[];this.append(...children);}remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(c=>c!==this);this.parentElement=null;}
    insertBefore(child,reference){child.remove();child.parentElement=this;const index=this.children.indexOf(reference);if(index<0)this.children.push(child);else this.children.splice(index,0,child);}
    setAttribute(k,v){this.attributes[k]=String(v);if(k==='id')this.id=v;if(k==='class')this.className=v;}matches(selector){return selector.startsWith('.')?this.classes.has(selector.slice(1)):selector.startsWith('#')?this.id===selector.slice(1):this.tagName.toLowerCase()===selector.split('.')[0]&&(!selector.includes('.')||this.classes.has(selector.split('.')[1]));}
    closest(selector){for(let node=this;node;node=node.parentElement)if(node.matches(selector))return node;return null;}querySelector(selector){for(const child of this.children){if(child.matches(selector))return child;const nested=child.querySelector(selector);if(nested)return nested;}return null;}
    contains(node){return node===this||this.children.some(child=>child.contains(node));}focus(){this.focused=true;}click(){return this.onclick?.();}getBoundingClientRect(){return{left:0,top:0,width:hooks.width||800,height:this.id==='reviewWorkspace'?(hooks.workspaceHeight||600):(hooks.frameHeight||600)};}
  }
  const get=id=>{if(!elements.has(id)){const element=new Element();element.id=id;}return elements.get(id);};
  // Retain the shared HTML's ownership hierarchy so moving panes is exercised.
  const body=new Element('body'),stack=[body],html=fs.readFileSync(path.join(__dirname,'../revision-viewer.html'),'utf8');
  for(const token of html.match(/<[^>]+>|[^<]+/g)||[]){
    if(token.startsWith('</')){if(stack.length>1)stack.pop();continue;}
    if(token.startsWith('<!'))continue;
    if(token.startsWith('<')){const tag=token.match(/^<([\w-]+)/)?.[1];if(!tag)continue;const node=new Element(tag);for(const match of token.matchAll(/([\w-]+)="([^"]*)"/g))node.setAttribute(match[1],match[2]);node.hidden=/\shidden(?:\s|>)/.test(token);if(node.attributes.value)node.value=node.attributes.value;stack.at(-1).append(node);if(!['input','img','meta','link','br','hr'].includes(tag))stack.push(node);}
    else if(token.trim())stack.at(-1).text+=token.trim();
  }
  get('objectFilter').value='parts';get('severityFilter').value='all';get('stateFilter').value='all';get('readFilter').value='all';get('commentSort').value='severity';
  const file=hooks.files?.[0]||{path:'board.kicad_pcb',content:'(kicad_pcb (net 1 "SIGNAL") (footprint "Resistor" (layer "F.Cu") (at 30 40) (uuid "fp") (property "Reference" "R1") (property "Value" "10k") (pad "1" smd rect (at 1 0) (size 2 2) (layers "F.Cu") (net 1 "SIGNAL") (uuid "pad"))))'};
  if(hooks.source)file.content=hooks.source;
  const diff=require('../design-diff.js'),design=require(hooks.pcb===false?'../schematic-renderer.js':'../pcb-renderer.js').build(diff.parse(file.content),file.path),designs=new Map();
  const canvas=new EventTarget();canvas.canvas=new Element();canvas.visibleLayers=new Set(['F.Cu']);canvas.viewport={camera:new(require('../owned-canvas.js').Camera)(800,600)};canvas.setNetHighlight=net=>canvas.netHighlight=net;canvas.resize=()=>{};canvas.draw=()=>workspace.draw();
  const receipts=new Map(),localStorage={getItem:key=>receipts.get(key)||null,setItem:(key,value)=>receipts.set(key,value),removeItem:key=>receipts.delete(key)};
  const keyHandlers=new Set();
  let resizeCallback;
  const context={innerWidth:hooks.width||800,innerHeight:hooks.frameHeight||600,EventTarget,CustomEvent,Map,Set,console,crypto:require('node:crypto').webcrypto,localStorage,document:{body,getElementById:id=>{const node=elements.get(id);return node&&body.contains(node)?node:null;},createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)},addEventListener:(type,fn)=>{if(type==='keydown')keyHandlers.add(fn);if(type==='resize')resizeCallback=fn;},removeEventListener:(type,fn)=>{if(type==='keydown')keyHandlers.delete(fn);},matchMedia:()=>({matches:true}),
    KiCadCommentCompose:{...require('../comment-compose.js'),...(hooks.compose||{})},KiCadReviewTools:require('../review-tools.js'),KiCadDesignModel:require('../design-model.js'),KiCadNetModel:require('../net-model.js'),KiCadReviewComments:require('../review-comments.js'),KiCadBrowserData:require('../browser-data.js'),KiCadOwnedCanvas:require('../owned-canvas.js'),
    KiCadPairedReview:require('../paired-review.js'),KiCadBomAnalytics:require('../bom-analytics.js'),
    chrome:{runtime:{sendMessage:async message=>({ok:true,result:await respond(message)})}},setTimeout,clearTimeout,URL,Blob};
  if(hooks.vscode)context.KiCadVSCodeContext={};
  if(hooks.navigation){Object.assign(context,{KiCadProjectSearch:require('../project-search.js'),KiCadRuleReports:require('../rule-reports.js'),KiCadDesignDiff:diff,KiCadPCBRenderer:require('../pcb-renderer.js'),KiCadSchematicRenderer:require('../schematic-renderer.js')});vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../review-navigation.js'),'utf8'),context);get('ruleSeverity').value='all';get('showRuleMarkers').checked=true;}
  canvas.setNetHighlights=(nets,options)=>{canvas.highlightNets=nets;canvas.netHighlight=nets[0]||null;canvas.netPrimitives=new Set(nets.flatMap(n=>n.primitives||[]));canvas.highlightMode=options.mode;};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../review-workspace.js'),'utf8'),context);
  const workspace=context.KiCadReviewWorkspace.mount({files:[file],repository:'wayri/fixture',ref:'main',rootFile:file.path,pcb:true,getCanvas:()=>canvas,currentFile:()=>file.path,focus(){},openSheet(){},getDesigns:()=>designs,...hooks});
  canvas.layers={query_point:at=>hooks.query?.(at)||[]};
  workspace.attachCanvas(canvas);
  function load(){designs.set(file.path,design);canvas.design=design;canvas.primitives=design.primitives;workspace.draw();}
  function key(value,extra={}){const event={key:value,target:canvas.canvas,composedPath:()=>[],preventDefault(){this.defaultPrevented=true;},...extra};for(const fn of keyHandlers)fn(event);return event;}
  return{get,workspace,canvas,design,load,receipts,key,document:context.document,resize(width){hooks.width=width;resizeCallback?.();}};
}
test('workspace initializes net geometry after the drawing loads without a file-path change',()=>{
  const view=workspaceRuntime();assert.equal(view.get('netList').children.length,0);view.load();assert.equal(view.get('netCount').textContent,'1 net');
  view.get('netList').children[0].click();assert.equal(view.canvas.netHighlight.name,'SIGNAL');assert.ok(view.canvas.netHighlight.primitives.some(p=>p.uuid==='pad'));
  assert.match(view.get('propertyList').textContent,/Saved code 1/);assert.match(view.get('netMemberList').textContent,/R1 · pad 1/);
  view.get('clearNet').click();assert.equal(view.canvas.netHighlight,null);assert.equal(view.get('clearNet').disabled,true);
});
test('part inspector groups saved properties and offers only connected net selection',()=>{
  const view=workspaceRuntime();view.load();view.get('objectList').children[0].click();assert.equal(view.get('selectedName').textContent,'R1');assert.match(view.get('propertyList').textContent,/Electrical Net SIGNAL/);assert.match(view.get('propertyList').textContent,/Geometry/);assert.equal(view.get('selectObjectNet').hidden,false);
  view.get('selectObjectNet').click();assert.equal(view.canvas.netHighlight.name,'SIGNAL');assert.equal(view.get('selectedName').textContent,'SIGNAL');
});

function uiEvent(type,values){const event=new Event(type,{cancelable:true});Object.assign(event,values);return event;}
test('pinned properties and comments share the side dock and collapse independently',()=>{
 const view=workspaceRuntime(undefined,{width:1600});view.load();
 assert.equal(view.get('designInspector').hidden,true);assert.equal(view.get('commentsSidebar').hidden,true);
 view.get('propertiesButton').click();view.get('pinProperties').click();view.get('commentsButton').click();view.get('pinComments').click();
 assert.equal(view.get('designInspector').hidden,false);assert.equal(view.get('commentsSidebar').hidden,false);
 assert.equal(view.get('commentsPane').parentElement.id,'commentsSidebar');assert.equal(view.get('propertiesPane').parentElement.id,'designInspector');
 assert.equal(view.get('designInspector').style.height,'300px');assert.equal(view.get('commentsSidebar').style.top,'300px');assert.equal(view.get('reviewWorkspace').style['--pinned-right-width'],'340px');
 view.get('closeInspector').click();assert.equal(view.get('designInspector').hidden,true);assert.equal(view.get('commentsSidebar').style.height,'600px');
 assert.equal(view.get('dockProperties').attributes['aria-expanded'],'false');view.get('dockProperties').click();assert.equal(view.get('designInspector').hidden,false);assert.equal(view.get('pinProperties').attributes['aria-pressed'],'true');
 view.workspace.dispose();
});
test('narrow views retain usable full-height transient panes and drafts across resizing',()=>{
 const view=workspaceRuntime(undefined,{width:600,frameHeight:500,workspaceHeight:440});view.get('newComment').click();view.get('commentText').value='Keep draft';
 assert.equal(view.get('commentsSidebar').style.height,'440px');view.get('propertiesButton').click();assert.equal(view.get('commentsSidebar').hidden,true);
 view.resize(350);view.get('dockComments').click();assert.equal(view.get('commentsSidebar').hidden,false);assert.equal(view.get('commentText').value,'Keep draft');assert.equal(view.get('reviewWorkspace').style['--pinned-right-width'],'0px');
 view.workspace.dispose();
});
test('unpinned panes collapse on drawing interaction while pinned panes remain open',()=>{
 const view=workspaceRuntime();view.get('partsButton').click();view.get('pinNavigator').click();view.get('commentsButton').click();
 view.get('drawingHost').dispatchEvent(new Event('pointerdown'));assert.equal(view.get('designNavigator').hidden,false);assert.equal(view.get('commentsSidebar').hidden,true);
 view.get('dockComments').click();assert.equal(view.get('commentsSidebar').hidden,false);assert.equal(view.get('designNavigator').hidden,false);view.workspace.dispose();
});
test('switching comment subtabs and collapsing a sidebar preserve an unsaved draft and never publish',async()=>{
 const calls=[];const view=workspaceRuntime(async message=>{calls.push(message);return[];},{width:1600});view.load();view.get('newComment').click();view.get('commentText').value='Unsaved review';
 assert.equal(view.get('addCommentPane').hidden,false);assert.equal(view.get('addCommentTab').attributes['aria-selected'],'true');
 view.get('viewCommentsTab').click();assert.equal(view.get('viewCommentsPane').hidden,false);view.get('closeComments').click();view.get('commentsButton').click();view.get('addCommentTab').click();
 assert.equal(view.get('commentText').value,'Unsaved review');assert.equal(view.get('commentEditor').hidden,false);
 const tabs=view.get('addCommentTab').parentElement;tabs.dispatchEvent(uiEvent('keydown',{key:'End'}));assert.equal(view.get('viewCommentsTab').attributes['aria-selected'],'true');assert.equal(view.get('viewCommentsTab').focused,true);
 assert.equal(calls.some(message=>message.type==='comment-save'||message.type==='github-publish-comment'),false);
 view.get('cancelComment').click();assert.equal(view.get('viewCommentsPane').hidden,false);
});
test('sidebar handles resize with pointer and keyboard while sections retain collapse state',()=>{
 const view=workspaceRuntime(undefined,{width:1600});view.load();view.get('objectList').children[0].click();
 const handle=view.get('designInspector').children.find(child=>child.classList.contains('sidebar-resizer'));
 handle.dispatchEvent(uiEvent('pointerdown',{button:0,clientX:500,pointerId:1}));handle.dispatchEvent(uiEvent('pointermove',{clientX:450,pointerId:1}));handle.dispatchEvent(uiEvent('pointerup',{pointerId:1}));
 assert.equal(view.get('designInspector').style.width,'350px');handle.dispatchEvent(uiEvent('keydown',{key:'ArrowLeft'}));assert.equal(view.get('designInspector').style.width,'360px');
 handle.dispatchEvent(uiEvent('keydown',{key:'Home'}));assert.equal(view.get('designInspector').style.width,'220px');assert.equal(handle.attributes['aria-valuenow'],'220');
 const section=view.get('propertyList').children.find(child=>child.children[0].textContent==='Identity');section.open=false;section.dispatchEvent(new Event('toggle'));view.get('objectList').children[0].click();
 assert.equal(view.get('propertyList').children.find(child=>child.children[0].textContent==='Identity').open,false);
});
test('top sheet navigation and optional review tools preserve their existing controls',()=>{
 const view=workspaceRuntime(undefined,{pcb:false,files:[{path:'root.kicad_sch',content:'(kicad_sch (uuid root))'}]});
 assert.equal(view.get('sheetLabel').parentElement.id,'topSheetNavigation');assert.equal(view.get('sheetBack').parentElement.id,'topSheetNavigation');
 assert.equal(view.get('variantBar').parentElement.id,'extraReviewControls');assert.equal(view.get('highlightControls').parentElement.id,'extraReviewControls');assert.equal(view.get('extraReviewControls').hidden,true);
 assert.equal(view.get('shortcutHelp').parentElement.id,'extraReviewControls');assert.equal(view.get('diagnostics').parentElement.id,'extraReviewControls');
 view.get('reviewToolsButton').click();assert.equal(view.get('extraReviewControls').hidden,false);view.key('Escape');assert.equal(view.get('extraReviewControls').hidden,true);
 view.key('?');assert.equal(view.get('shortcutHelp').open,true);assert.equal(view.get('extraReviewControls').hidden,false);
});
test('opposite drawing uses explicit or discovered saved paths and asks when several are available',async()=>{
 const calls=[];const view=workspaceRuntime(async message=>{calls.push(message);if(message.type==='drawing-files')return{files:['board.kicad_pcb','one.kicad_sch','two.kicad_sch']};return[];});
 await view.get('viewOppositeDrawing').click();assert.equal(view.get('companionChooser').hidden,false);assert.equal(calls.some(message=>message.type==='open-viewer-window'),false);
 view.get('oppositeDrawingSelect').value='two.kicad_sch';await view.get('oppositeDrawingSelect').onchange();await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.find(message=>message.type==='open-viewer-window').file,'two.kicad_sch');
 const pairedCalls=[];const paired=workspaceRuntime(async message=>{pairedCalls.push(message);return[];},{pairedFile:'confirmed.kicad_sch'});await paired.get('viewOppositeDrawing').click();assert.equal(pairedCalls.find(message=>message.type==='open-viewer-window').file,'confirmed.kicad_sch');assert.equal(pairedCalls.some(message=>message.type==='drawing-files'),false);
 const nativeCalls=[];const native=workspaceRuntime(async message=>{nativeCalls.push(message);if(message.type==='project-inventory')return{files:[{path:'saved.kicad_sch'},{path:'board.kicad_pcb'}]};return[];},{vscode:true});await native.get('viewOppositeDrawing').click();assert.equal(nativeCalls.find(message=>message.type==='open-project-drawing').file,'saved.kicad_sch');assert.equal(nativeCalls.some(message=>message.type==='drawing-files'),false);
});

test('3D keeps parts interaction while clearly disabling unavailable 2D net and layer tools',()=>{
 const view=workspaceRuntime();view.load();view.get('navNets').click();view.workspace.setScene({setPopulation(){}});
 assert.equal(view.get('navNets').disabled,true);assert.equal(view.get('navLayers').disabled,true);assert.equal(view.get('measureButton').disabled,true);assert.equal(view.get('navParts').attributes['aria-selected'],'true');
 view.workspace.setScene(null);assert.equal(view.get('navNets').disabled,false);assert.equal(view.get('navLayers').disabled,false);assert.equal(view.get('measureButton').disabled,false);
});

test('saving metadata stays local until explicit publish and records its thread link',async()=>{
 const validator=require('../review-comments.js'),messages=[];let notes=[];
 const remoteRef={kind:'issue',repository:'wayri/fixture',number:7,url:'https://github.com/wayri/fixture/issues/7',publishedAt:'2026-10-04T00:00:00.000Z'};
 const view=workspaceRuntime(async m=>{messages.push(m);if(m.type==='comment-list')return notes;if(m.type==='comment-save'){notes=[m.comment];return m.comment;}if(m.type==='github-publish-comment')return{remoteRef};return[];});view.load();await new Promise(resolve=>setImmediate(resolve));
 view.get('newComment').click();view.get('commentText').value='Review R1';view.get('commentSeverity').value='major';view.get('commentState').value='resolved';view.get('commentTags').value='assembly, review';view.get('commentMentions').value='@alice, bob';await view.get('saveComment').click();
 assert.equal(messages.some(m=>m.type==='github-publish-comment'),false);assert.equal(notes[0].state,'resolved');assert.deepEqual(Array.from(notes[0].tags),['assembly','review']);assert.deepEqual(Array.from(notes[0].mentions),['alice','bob']);
 const card=view.get('commentList').children[0],actions=card.children.at(-1);await actions.children.find(e=>e.textContent==='Publish to GitHub').click();
 const publish=messages.find(m=>m.type==='github-publish-comment');assert.equal(publish.destination,'new-issue');assert.equal(publish.comment.anchor.repository,'wayri/fixture');assert.equal(notes[0].remoteRefs[0].url,remoteRef.url);assert.match(view.get('commentStatus').textContent,/Posted to GitHub issue #7/);
 assert.deepEqual(validator.parseSidecar(validator.serializeSidecar(notes))[0].tags,['assembly','review']);
});
test('known repository policy restriction disables direct publish while preserving local comments',async()=>{
 const validate=require('../review-comments.js').validateComment;const note=validate({id:'policy-note',text:'Review placement',createdAt:'2025-01-01T00:00:00.000Z',anchor:{repository:'wayri/fixture',ref:'main',file:'board.kicad_pcb'}});
 const view=workspaceRuntime(async request=>request.type==='comment-list'?[note]:request.type==='comment-policy-status'?{mode:'allowlist',allowed:false,reason:'Only approved reviewers may publish',login:'alice'}:[]);
 view.load();await view.workspace.refreshComments();await new Promise(resolve=>setImmediate(resolve));
 const actions=view.get('commentList').children[0].children.at(-1),publish=actions.children.find(node=>node.textContent==='Publish to GitHub');
 assert.equal(publish.disabled,true);assert.match(view.get('commentPolicyStatus').textContent,/publishing restricted/);
 assert.ok(actions.children.find(node=>node.textContent==='Edit'));assert.equal(view.get('refreshCommentPolicy').disabled,false);
});
test('read receipts, lifecycle actions and creation order remain independent',async()=>{
 const validate=require('../review-comments.js').validateComment;const changed=[];
 let notes=[validate({id:'older',text:'Old question',createdAt:'2025-01-01T00:00:00.000Z',anchor:{repository:'wayri/fixture',ref:'main',file:'board.kicad_pcb'}}),
  validate({id:'newer',text:'New question',createdAt:'2025-02-01T00:00:00.000Z',anchor:{repository:'wayri/fixture',ref:'main',file:'board.kicad_pcb'}})];
 const view=workspaceRuntime(async request=>{if(request.type==='comment-list')return notes;if(request.type==='comment-save'){notes=notes.map(n=>n.id===request.comment.id?request.comment:n);return request.comment;}return[];},{onCommentsChanged:()=>changed.push(true)});
 view.load();await view.workspace.refreshComments();view.get('commentSort').value='newest';view.get('commentSort').onchange();
 assert.match(view.get('commentList').children[0].textContent,/New question/);
 const actions=view.get('commentList').children[0].children.at(-1);actions.children.find(node=>node.textContent==='Mark read').click();
 view.get('readFilter').value='unread';view.get('readFilter').onchange();assert.equal(view.get('commentList').children.length,1);assert.match(view.get('commentList').textContent,/Old question/);
 view.get('readFilter').value='all';view.get('readFilter').onchange();
 await view.get('commentList').children[0].children.at(-1).children.find(node=>node.textContent==='Skip').click();
 assert.equal(notes.find(n=>n.id==='newer').state,'skipped');assert.equal(changed.length,1);
 view.get('stateFilter').value='skipped';view.get('stateFilter').onchange();assert.equal(view.get('commentList').children.length,1);
 assert.match(view.get('commentList').textContent,/Unread/);
});
test('paired selection emits a bounded saved part and net; incoming highlight resolves a unique part',()=>{
 const selections=[];const view=workspaceRuntime(async()=>[],{onSelection:value=>selections.push(value)});view.load();
 view.get('objectList').children[0].click();assert.equal(selections[0].kind,'part');assert.equal(selections[0].reference,'R1');assert.equal(selections[0].uuid,'fp');assert.equal(selections[0].path,'board.kicad_pcb');
 assert.equal(view.workspace.highlightRelated({kind:'part',reference:'R1',uuid:'symbol-uuid',path:'root.kicad_sch'}),true);assert.ok(view.canvas.netPrimitives.size>0,'paired part visibly highlights its geometry');
 view.get('netList').children[0].click();assert.equal(selections.at(-1).kind,'net');assert.equal(selections.at(-1).netName,'SIGNAL');
 assert.equal(view.workspace.highlightRelated({kind:'net',netName:'NO_SUCH_NET',path:'root.kicad_sch'}),false);
});

test('point and dragged-area review tools persist millimetre anchors and disable ruler interception',async()=>{
 let notes=[];const view=workspaceRuntime(async request=>{if(request.type==='comment-list')return notes;if(request.type==='comment-save'){notes.push(request.comment);return request.comment;}return[];});view.load();await new Promise(resolve=>setImmediate(resolve));
 const fire=(type,props)=>{const event=new Event(type,{cancelable:true});Object.assign(event,props);view.canvas.canvas.dispatchEvent(event);};
 view.get('pointComment').click();fire('click',{clientX:400,clientY:300});view.get('commentText').value='Point note';await view.get('saveComment').click();assert.equal(notes[0].anchor.position.x,0);assert.equal(notes[0].anchor.position.y,0);
 view.get('areaComment').click();fire('pointerdown',{button:0,pointerId:1,clientX:100,clientY:100});fire('pointermove',{buttons:1,pointerId:1,clientX:180,clientY:160});fire('pointerup',{button:0,pointerId:1,clientX:180,clientY:160});view.get('commentText').value='Area note';await view.get('saveComment').click();assert.equal(notes[1].anchor.area.width,20);assert.equal(notes[1].anchor.area.height,15);assert.equal(view.get('areaComment').attributes['aria-pressed'],'false');
 view.get('commentSearch').value='Area';view.get('commentSearch').oninput();assert.equal(view.get('commentList').children.length,1);assert.match(view.get('commentList').textContent,/Area note/);
});

 test('ruler updates live before second click, pins results and resumes after panning',()=>{
 const view=workspaceRuntime();view.load();const fire=(type,props)=>{const e=new Event(type,{cancelable:true});Object.assign(e,props);view.canvas.canvas.dispatchEvent(e);};view.get('rulerSnap').value='grid';view.get('rulerPitch').value='1';view.get('measureButton').click();assert.equal(view.get('rulerControls').hidden,false);
 fire('click',{clientX:400,clientY:300});fire('pointermove',{buttons:0,clientX:440,clientY:330});assert.match(view.get('measurementStatus').textContent,/Live.*12.806/);assert.match(view.get('reviewOverlay').textContent,/X: 10.000 mm/);assert.match(view.get('reviewOverlay').textContent,/Y: 8.000 mm/);
 fire('click',{clientX:440,clientY:330,altKey:true});assert.match(view.get('measurementStatus').textContent,/Pinned.*12.500/);fire('pointermove',{buttons:0,clientX:600,clientY:500});assert.match(view.get('measurementStatus').textContent,/Pinned.*12.500/);
 view.get('clearRuler').click();fire('click',{clientX:400,clientY:300});fire('pointerdown',{button:2,clientX:400,clientY:300});fire('pointerup',{button:2,clientX:400,clientY:300});fire('pointermove',{buttons:0,clientX:440,clientY:300});assert.match(view.get('measurementStatus').textContent,/Live.*10.000/);view.get('measureButton').click();assert.equal(view.get('rulerControls').hidden,true);
 });
 test('board extents measurement uses saved outline and reports missing outline',()=>{const view=workspaceRuntime();view.load();view.get('measureButton').click();view.get('measureBoard').click();assert.match(view.get('measurementStatus').textContent,/No saved Edge.Cuts/);view.design.primitives.push({type:'line',layer:'Edge.Cuts',points:[{x:0,y:0},{x:40,y:25}],width:1});view.get('measureBoard').click();assert.match(view.get('reviewOverlay').textContent,/X: 40.000 mm/);assert.match(view.get('reviewOverlay').textContent,/Y: 25.000 mm/);assert.match(view.get('measurementStatus').textContent,/Board extents/);});

const {matchesSearch,sheetTarget}=require('../review-workspace.js');
test('advanced search combines fields, quoted values, custom properties and exclusions literally',()=>{
 const item={label:'R1',reference:'R1',kind:'symbol',path:'power.kicad_sch',properties:{Value:'10 k Ohm',Manufacturer:'Acme','DNP':'No'}};
 assert.equal(matchesSearch(item,'ref:R1 value:"10 k" manufacturer:acme -type:pad',['VCC']),true);
 assert.equal(matchesSearch(item,'net:VCC sheet:power',['VCC']),true);
 assert.equal(matchesSearch(item,'net:GND',['VCC']),false);
 assert.equal(matchesSearch(item,'-manufacturer:acme'),false);
 assert.equal(matchesSearch(item,'value:.*'),false);
});
test('sheet links resolve safe relative paths without escaping repository',()=>{
 assert.equal(sheetTarget({path:'root/main.kicad_sch',properties:{Sheetfile:'../power.kicad_sch'}}),'power.kicad_sch');
 for(const name of ['../../escape.kicad_sch','/abs.kicad_sch','C:\\bad.kicad_sch'])assert.equal(sheetTarget({path:'root/main.kicad_sch',properties:{Sheetfile:name}}),null);
});
test('saved settings inspector includes nested KiCad settings with empty fields',()=>{
 const {workspace,get,load}=workspaceRuntime();load();workspace.select3D({uuid:'fp'});
 assert.match(get('propertyList').textContent,/Saved KiCad settings/);
 assert.match(get('propertyList').textContent,/pad/);
});


test('multi highlight toggles separate networks and single mode replaces the set',()=>{
 const source='(kicad_pcb (net 1 "A") (net 2 "B") (segment (start 1 1) (end 10 1) (width 1) (layer "F.Cu") (net 1) (uuid "a")) (segment (start 1 3) (end 10 3) (width 1) (layer "F.Cu") (net 2) (uuid "b")))';
 const view=workspaceRuntime(async()=>[],{source});view.load();view.get('multiHighlight').checked=true;view.get('netList').children[0].click();view.get('netList').children[1].click();assert.equal(view.canvas.highlightNets.length,2);view.get('netList').children[0].click();assert.equal(view.canvas.highlightNets.length,1);assert.equal(view.canvas.netHighlight.name,'B');
 view.get('multiHighlight').checked=false;view.get('netList').children[0].click();assert.equal(view.canvas.highlightNets.length,1);assert.equal(view.canvas.netHighlight.name,'A');view.get('highlightStyle').value='isolate';view.get('highlightStyle').onchange();assert.equal(view.canvas.highlightMode,'isolate');view.get('clearHighlights').click();assert.equal(view.canvas.highlightNets.length,0);
});

test('global search navigation highlights a saved component and rejects malformed query feedback',()=>{
 const view=workspaceRuntime(async()=>[],{navigation:true});view.load();view.get('navSearch').click();view.get('projectSearch').value='ref:R1 type:footprint';view.get('projectSearch').oninput();assert.equal(view.get('projectResults').children.length,1);view.get('projectResults').children[0].click();assert.match(view.get('highlightSummary').textContent,/1 components/);assert.ok(view.canvas.netPrimitives.size>0);
 view.get('projectSearch').value='ref:R1 OR';view.get('projectSearch').oninput();assert.equal(view.get('projectResults').children.length,0);assert.match(view.get('projectSearchCount').textContent,/OR|term|query/i);
});

test('saved rule report navigation uses millimetre coordinates and clickable arrows; clearing removes markers',async()=>{
 const focused=[],view=workspaceRuntime(async()=>[],{navigation:true,focus:position=>focused.push(position)});view.load();view.get('navRules').click();
 const report={source:'board.kicad_pcb',date:'2026-10-04T00:00:00Z',kicad_version:'9.0.0',coordinate_units:'mils',violations:[{type:'clearance',description:'Copper clearance',severity:'error',items:[{description:'Track',pos:{x:1000,y:2000}}]}]};
 view.get('ruleReportFile').files=[{size:200,name:'board-drc.json',text:async()=>JSON.stringify(report)}];await view.get('ruleReportFile').onchange();assert.match(view.get('ruleCount').textContent,/1 saved/);view.get('nextRule').click();assert.equal(focused[0].x,25.4);assert.equal(focused[0].y,50.8);assert.match(view.get('ruleProvenance').textContent,/unverified/);assert.ok(view.get('commentPins').children.some(n=>n.className.includes('rule-marker')));assert.ok(view.get('reviewOverlay').children.some(n=>n.attributes.d?.includes('L')));
 view.get('clearRuleReports').click();assert.equal(view.get('commentPins').children.filter(n=>n.className?.includes('rule-marker')).length,0);
});

test('overlapping selected net classes retain shared nets when one class is removed',async()=>{
 const view=workspaceRuntime(async()=>[],{navigation:true});view.load();view.get('multiHighlight').checked=true;
 const settings={net_settings:{classes:[{name:'Default',priority:100},{name:'Power',priority:0},{name:'Shared',priority:1}],netclass_assignments:{SIGNAL:['Power','Shared']},netclass_patterns:[]}};
 view.get('netClassFile').files=[{size:200,name:'board.kicad_pro',text:async()=>JSON.stringify(settings)}];await view.get('netClassFile').onchange();
 for(const name of ['Power','Shared']){view.get('netClassSelect').value=name;view.get('highlightNetClass').click();}
 assert.equal(view.canvas.highlightNets.length,1);assert.match(view.get('netClassStatus').textContent,/Power, Shared/);
 view.get('netClassSelect').value='Power';view.get('highlightNetClass').click();assert.equal(view.canvas.highlightNets.length,1);assert.match(view.get('netClassStatus').textContent,/Highlighted classes: Shared/);
 view.get('netClassSelect').value='Shared';view.get('highlightNetClass').click();assert.equal(view.canvas.highlightNets.length,0);
});


test('search selects multiple net classes and single mode replaces component highlights',async()=>{
 const view=workspaceRuntime(async()=>[],{navigation:true});view.load();view.get('multiHighlight').checked=true;
 const settings={net_settings:{classes:[{name:'Default',priority:100},{name:'Power',priority:0},{name:'Shared',priority:1}],netclass_assignments:{SIGNAL:['Power','Shared']},netclass_patterns:[]}};
 view.get('netClassFile').files=[{size:200,name:'board.kicad_pro',text:async()=>JSON.stringify(settings)}];await view.get('netClassFile').onchange();
 view.get('projectSearch').value='type:netclass';view.get('projectSearch').oninput();assert.equal(view.get('projectResults').children.length,2);
 view.get('projectResults').children[0].click();view.get('projectResults').children[1].click();assert.equal(view.canvas.highlightNets.length,1);assert.match(view.get('netClassStatus').textContent,/Power, Shared/);
 view.get('projectResults').children[0].click();assert.equal(view.canvas.highlightNets.length,1);assert.match(view.get('netClassStatus').textContent,/Highlighted classes: Shared/);
 view.get('multiHighlight').checked=false;view.get('projectSearch').value='ref:R1 type:footprint';view.get('projectSearch').oninput();view.get('projectResults').children[0].click();assert.match(view.get('highlightSummary').textContent,/0 nets.*1 components/);
 view.get('projectSearch').value='type:net';view.get('projectSearch').oninput();view.get('projectResults').children[0].click();assert.equal(view.canvas.highlightNets.length,1);assert.match(view.get('highlightSummary').textContent,/0 components/);
});


test('disabling multihighlight immediately reduces combined net and component selection to one',()=>{
 const source='(kicad_pcb (net 1 "A") (net 2 "B") (segment (start 1 1) (end 10 1) (width 1) (layer "F.Cu") (net 1) (uuid "a")) (segment (start 1 3) (end 10 3) (width 1) (layer "F.Cu") (net 2) (uuid "b")))';
 const view=workspaceRuntime(async()=>[],{navigation:true,source});view.load();view.get('multiHighlight').checked=true;view.get('netList').children[0].click();view.get('netList').children[1].click();assert.equal(view.canvas.highlightNets.length,2);
 view.get('multiHighlight').checked=false;view.get('multiHighlight').onchange();assert.equal(view.canvas.highlightNets.length,1);assert.equal(view.canvas.netHighlight.name,'B');assert.match(view.get('highlightSummary').textContent,/1 nets.*0 components/);
});


test('double click enters only a resolved loaded subsheet, never schematic editing',()=>{
 const files=[{path:'root.kicad_sch',content:'(kicad_sch (sheet (at 0 0) (size 10 10) (uuid "sheet-1") (property "Sheetname" "Power") (property "Sheetfile" "power.kicad_sch")))'},{path:'power.kicad_sch',content:'(kicad_sch)'}],opened=[];
 const view=workspaceRuntime(async()=>[],{pcb:false,files,query:()=>[{bbox:{context:{uuid:'sheet-1'}}}],openSheet:path=>opened.push(path)});view.load();const before=JSON.stringify(files);
 const double=()=>{const event=new Event('dblclick',{cancelable:true});Object.assign(event,{button:0,clientX:400,clientY:300});view.canvas.canvas.dispatchEvent(event);};double();assert.deepEqual(opened,['power.kicad_sch']);
 view.get('measureButton').click();double();assert.equal(opened.length,1);view.get('measureButton').click();view.get('areaComment').click();double();assert.equal(opened.length,1);assert.equal(JSON.stringify(files),before);
 view.workspace.dispose();double();assert.equal(opened.length,1);
});

test('missing sheet double click reports absence; parent navigation rejects ambiguous parents',()=>{
 const files=[{path:'root.kicad_sch',content:'(kicad_sch (sheet (at 0 0) (size 10 10) (uuid "sheet-1") (property "Sheetname" "Power") (property "Sheetfile" "missing.kicad_sch")))'}],opened=[];
 const view=workspaceRuntime(async()=>[],{pcb:false,files,query:()=>[{bbox:{context:{uuid:'sheet-1'}}}],openSheet:path=>opened.push(path)});view.load();const event=new Event('dblclick');Object.assign(event,{clientX:400,clientY:300});view.canvas.canvas.dispatchEvent(event);assert.deepEqual(opened,[]);assert.match(view.get('reviewNotice').textContent,/missing/);
 const parentFiles=[files[0],{path:'other.kicad_sch',content:files[0].content},{path:'missing.kicad_sch',content:'(kicad_sch)'}];const child=workspaceRuntime(async()=>[],{pcb:false,files:parentFiles,currentFile:()=> 'missing.kicad_sch',openSheet:path=>opened.push(path)});child.load();child.key('ArrowUp',{altKey:true});assert.deepEqual(opened,[]);assert.match(child.get('reviewNotice').textContent,/multiple parents/);
 const unique=workspaceRuntime(async()=>[],{pcb:false,files:[files[0],parentFiles[2]],currentFile:()=> 'missing.kicad_sch',openSheet:path=>opened.push(path)});unique.load();unique.key('ArrowUp',{altKey:true});assert.deepEqual(opened,['root.kicad_sch']);
});

test('review shortcuts inspect pointer, highlight net, focus search, respect typing and never mutate sources',()=>{
 const focused=[],messages=[],view=workspaceRuntime(async request=>{messages.push(request.type);return[];},{navigation:true,query:()=>[{bbox:{context:{uuid:'pad'}}}],focus:p=>focused.push(p)});view.load();
 view.get('designInspector').hidden=true;view.key('e',{ctrlKey:true});assert.equal(view.get('designInspector').hidden,true);view.key('e',{composedPath:()=>[{tagName:'TEXTAREA'}]});assert.equal(view.get('designInspector').hidden,true);
 const move=new Event('pointermove');Object.assign(move,{clientX:400,clientY:300,buttons:0});view.canvas.canvas.dispatchEvent(move);view.key('e');assert.equal(view.get('selectedName').textContent,'R1 pad 1');assert.equal(view.get('designInspector').hidden,false);
 view.key('h');assert.equal(view.canvas.netHighlight.name,'SIGNAL');view.key(' ');assert.equal(focused[0].x,0);assert.equal(focused[0].y,0);view.key('/');assert.equal(view.get('universalSearch').focused,true);view.key('?');assert.equal(view.get('shortcutHelp').open,true);
 for(const key of ['`','~']){view.get('clearHighlights').click();view.key(key);assert.equal(view.canvas.netHighlight.name,'SIGNAL');view.get('clearHighlights').click();view.key(key,{composedPath:()=>[{tagName:'INPUT'}]});assert.equal(view.canvas.netHighlight,null);}
 for(const key of ['r','Delete','Backspace','x','g'])assert.equal(view.key(key).defaultPrevented,undefined);
 const count=messages.length;view.workspace.dispose();view.key('c');assert.equal(messages.length,count);
});


test('BOM reflects saved DNP and exposes counts, safe component navigation and copper stats',()=>{
 const source='(kicad_pcb (general (thickness 1.6)) (footprint "Resistor" (at 30 40) (uuid "fp") (attr smd dnp) (property "Reference" "R1") (property "Value" "10k") (pad "1" smd rect (at 1 0) (size 2 2) (layers "F.Cu") (uuid "pad"))))';
 const view=workspaceRuntime(undefined,{source});view.load();view.get('navBom').click();
 assert.match(view.get('bomSummary').textContent,/1 components.*0 fitted.*1 DNP/);
 assert.match(view.get('boardStats').textContent,/Saved board thickness 1.6 mm/);
 view.get('bomRows').children[0].children.find(e=>e.textContent==='R1').click();assert.equal(view.get('selectedName').textContent,'R1');
 view.get('highlightDnp').checked=true;view.get('highlightDnp').onchange();assert.ok(view.canvas.netPrimitives.has(view.design.primitives.find(p=>p.ownerUuid==='fp')));
 view.get('clearHighlights').click();assert.equal(view.get('highlightDnp').checked,false);assert.equal(view.canvas.netPrimitives.size,0);
});
test('zone analytics navigation selects saved zone UUID and displays square-millimetre sums',()=>{
 const source='(kicad_pcb (zone (uuid "zone") (net_name "GND") (layer "F.Cu") (polygon (pts (xy 0 0)(xy 10 0)(xy 10 10)(xy 0 10))) (filled_polygon (layer "F.Cu") (pts (xy 1 1)(xy 9 1)(xy 9 9)(xy 1 9)))))';
 const view=workspaceRuntime(undefined,{source});view.load();view.get('navBom').click();view.get('zoneStats').children.find(e=>e.onclick).click();
 assert.match(view.get('propertyList').textContent,/Outline polygon area sum 100.000 mm²/);assert.match(view.get('propertyList').textContent,/Saved fill polygon area sum 64.000 mm²/);assert.match(view.get('propertyList').textContent,/overlaps are counted repeatedly/);assert.ok(view.canvas.netPrimitives.size>0);
});

const {sheetEntries}=require('../review-workspace.js');
const hierarchySheets=[
  {path:'design/root.kicad_sch',label:'Controller'},
  {path:'design/power.kicad_sch',label:'Power'},
  {path:'design/regulator.kicad_sch',label:'Regulator'},
  {path:'design/io.kicad_sch',label:'I/O'}
];
const hierarchyLinks=[
  {path:'design/root.kicad_sch',label:'Power',properties:{Sheetfile:'power.kicad_sch'}},
  {path:'design/power.kicad_sch',label:'Regulator',properties:{Sheetfile:'regulator.kicad_sch'}},
  {path:'design/root.kicad_sch',label:'I/O',properties:{Sheetfile:'io.kicad_sch'}},
  {path:'design/root.kicad_sch',label:'Missing sensor',properties:{Sheetfile:'sensor.kicad_sch'}}
];
test('sheet hierarchy collapses descendants without reintroducing them as orphan files',()=>{
  assert.deepEqual(sheetEntries(hierarchySheets,hierarchyLinks).map(e=>[e.sheet?.label||e.link.label,e.depth]),[['Controller',0],['Power',1],['Regulator',2],['I/O',1],['Missing sensor',1]]);
  assert.deepEqual(sheetEntries(hierarchySheets,hierarchyLinks,'',new Set(['design/root.kicad_sch'])).map(e=>e.sheet.label),['Controller']);
  assert.deepEqual(sheetEntries(hierarchySheets,hierarchyLinks,'',new Set(['design/power.kicad_sch'])).filter(e=>e.sheet).map(e=>e.sheet.label),['Controller','Power','I/O']);
});
test('sheet filtering reveals matching descendants and their ancestors while preserving collapsed state',()=>{
  const collapsed=new Set(['design/root.kicad_sch']);
  assert.deepEqual(sheetEntries(hierarchySheets,hierarchyLinks,'regulator',collapsed).map(e=>e.sheet.label),['Controller','Power','Regulator']);
  assert.deepEqual(sheetEntries(hierarchySheets,hierarchyLinks,'sensor',collapsed).map(e=>e.sheet?.label||e.link.label),['Controller','Missing sensor']);
  assert.deepEqual([...collapsed],['design/root.kicad_sch']);
  assert.equal(sheetEntries(hierarchySheets,hierarchyLinks,'not present').length,0);
  const renamed=[{...hierarchyLinks[0],label:'Supply block'}];
  assert.deepEqual(sheetEntries(hierarchySheets,renamed,'Supply block').map(e=>e.sheet.label),['Controller','Power']);
});
test('reused files and cyclic sheet links stay bounded and preserve all parent symbol targets',()=>{
  const links=[...hierarchyLinks,{path:'design/io.kicad_sch',label:'Shared power',properties:{Sheetfile:'power.kicad_sch'}},{path:'design/regulator.kicad_sch',label:'Cycle',properties:{Sheetfile:'root.kicad_sch'}}];
  const entries=sheetEntries(hierarchySheets,links);
  assert.equal(entries.filter(e=>e.sheet).length,4);
  assert.equal(entries.find(e=>e.sheet?.label==='Power').parents.length,2);
  assert.equal(new Set(entries.filter(e=>e.sheet).map(e=>e.sheet.path)).size,4);
});
test('sheet browser renders compact names with source paths in tooltips and opens the selected file',()=>{
  const files=[{path:'design/root.kicad_sch',content:'(kicad_sch (uuid "root") (sheet (at 10 10) (size 10 10) (uuid "sheet") (property "Sheetname" "Power") (property "Sheetfile" "power.kicad_sch")))'}, {path:'design/power.kicad_sch',content:'(kicad_sch (uuid "power"))'}];
  let opened;
  const view=workspaceRuntime(async()=>[],{files,pcb:false,openSheet:path=>opened=path});
  view.get('navSheets').click();
  const rows=view.get('sheetList').children[1].children;
  assert.equal(rows.length,2);
  const root=rows[0].children[1],child=rows[1].children[1];
  assert.equal(root.title,'design/root.kicad_sch');
  assert.ok(!root.textContent.includes('design/'));
  assert.equal(root.attributes['aria-current'],'page');
  child.click();assert.equal(opened,'design/power.kicad_sch');
  assert.match(rows[1].children[2].attributes['aria-label'],/Locate.*design\/root/);
  rows[0].children[0].click();assert.equal(view.get('sheetList').children[1].children.length,1);
});

test('sheet history bounds visits, replaces forward history after a new branch, and ignores repeat selections',()=>{
 const history=require('../review-workspace.js').sheetHistory(3);history.visit('a');history.visit('b');history.visit('b');history.visit('c');assert.equal(history.move(-1),'b');assert.equal(history.target(1),'c');history.visit('d');assert.equal(history.target(1),null);assert.equal(history.move(-1),'b');history.move(1);history.visit('e');assert.equal(history.move(-1),'d');assert.equal(history.move(-1),'b');assert.equal(history.move(-1),null);
});
test('sheet navigation follows visits, up and root; keyboard history respects text entry',()=>{
 const files=[{path:'root.kicad_sch',content:'(kicad_sch (sheet (at 0 0) (size 10 10) (uuid "s") (property "Sheetfile" "child.kicad_sch")))'},{path:'child.kicad_sch',content:'(kicad_sch (sheet (at 0 0) (size 10 10) (uuid "t") (property "Sheetfile" "leaf.kicad_sch")))'},{path:'leaf.kicad_sch',content:'(kicad_sch)'}];
 let active=files[0].path,view;const open=path=>{active=path;view.workspace.draw();};view=workspaceRuntime(async()=>[],{pcb:false,files,currentFile:()=>active,openSheet:open});view.load();
 assert.equal(view.get('sheetBack').disabled,true);assert.equal(view.get('sheetHome').disabled,true);
 open('child.kicad_sch');open('leaf.kicad_sch');view.get('sheetBack').click();assert.equal(active,'child.kicad_sch');assert.equal(view.get('sheetForward').disabled,false);view.get('sheetForward').click();assert.equal(active,'leaf.kicad_sch');view.get('sheetUp').click();assert.equal(active,'child.kicad_sch');assert.equal(view.get('sheetForward').disabled,true);
 view.get('sheetHome').click();assert.equal(active,'root.kicad_sch');assert.equal(view.get('sheetUp').disabled,true);view.key('ArrowLeft',{altKey:true});assert.equal(active,'child.kicad_sch');view.key('ArrowRight',{altKey:true});assert.equal(active,'root.kicad_sch');view.key('ArrowLeft',{altKey:true,composedPath:()=>[{tagName:'INPUT'}]});assert.equal(active,'root.kicad_sch');
});
test('root navigation resolves an initially opened child and rejects reused-parent ambiguity and cycles',()=>{
 const rootPath=require('../review-workspace.js').rootSheetPath,files=['root','child','other'].map(name=>({path:name+'.kicad_sch'})),link=(path,target)=>({kind:'sheet',path:path+'.kicad_sch',properties:{Sheetfile:target+'.kicad_sch'}});
 assert.equal(rootPath('child.kicad_sch',[link('root','child')],files),'root.kicad_sch');assert.equal(rootPath('child.kicad_sch',[link('root','child'),link('other','child')],files),null);assert.equal(rootPath('child.kicad_sch',[link('root','child'),link('child','root')],files),null);
});

test('GitLab viewer isolates host context and exposes provider account and publication controls',async()=>{
 let notes=[];const calls=[];const view=workspaceRuntime(async message=>{calls.push(message);if(message.type==='comment-save'){notes=[message.comment];return message.comment;}if(message.type==='comment-list')return notes;if(message.type==='comment-policy-status')return{allowed:true,mode:'everyone'};return [];},{provider:'gitlab',host:'https://gitlab.example.com',repository:'group/sub/design'});view.load();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(view.get('reviewSettings').hidden,false);assert.equal(view.get('showGitHub').textContent,'GitLab');assert.equal(view.get('postComment').textContent,'Comment');assert.equal(view.get('editorAccount').textContent,'GitLab account');assert.equal(view.get('repositoryIssues').href,'https://gitlab.example.com/group/sub/design/-/issues');
 view.get('newComment').click();view.get('commentText').value='Check layout';await view.get('saveComment').click();
 assert.match(view.get('commentList').textContent,/Publish to GitLab/);assert.doesNotMatch(view.get('commentList').textContent,/Publish to GitHub/);
 const saved=calls.find(message=>message.type==='comment-save');assert.equal(saved.provider,'gitlab');assert.equal(saved.host,'https://gitlab.example.com');assert.equal(saved.comment.anchor.provider,'gitlab');assert.equal(saved.comment.anchor.host,'https://gitlab.example.com');assert.equal(saved.comment.anchor.repository,'group/sub/design');
 assert.equal(calls.some(message=>message.type.startsWith('github-')),false);assert.equal(calls.find(m=>m.type==='comment-policy-status').host,'https://gitlab.example.com');
});

test('GitHub collaboration lives in View comments and preserves supported destinations without posting',async()=>{
 const calls=[];const view=workspaceRuntime(async m=>{calls.push(m);if(m.type==='comment-policy-status')return{allowed:true,mode:'everyone'};return[];},{pullNumber:42,pullRepository:'wayri/reviews'});view.load();await new Promise(resolve=>setImmediate(resolve));
 view.get('showGitHub').click();assert.equal(view.get('githubPane').hidden,false);assert.equal(view.get('commentsPane').hidden,false);assert.equal(view.get('designInspector').hidden,true);assert.equal(view.get('commentCollaboration').open,true);assert.equal(view.get('viewCommentsTab').attributes['aria-selected'],'true');
 assert.equal(view.get('repositoryIssues').href,'https://github.com/wayri/reviews/issues');assert.equal(view.get('commentDestination').value,'pull-request');assert.equal(view.get('githubCommentType').value,'issue');
 view.get('githubCommentType').value='discussion';view.get('githubCommentType').onchange();assert.deepEqual(Array.from(view.get('commentDestination').children,e=>e.value),['discussion','existing-discussion']);assert.equal(view.get('discussionCategoryLabel').hidden,false);
 view.get('commentDestination').value='existing-discussion';view.get('commentDestination').onchange();assert.equal(view.get('threadNumberLabel').hidden,false);assert.equal(view.get('discussionCategoryLabel').hidden,true);assert.equal(view.get('threadNumber').placeholder,'Discussion number');
 view.get('githubCommentType').value='issue';view.get('githubCommentType').onchange();assert.deepEqual(Array.from(view.get('commentDestination').children,e=>e.value),['issue','existing-issue','pull-request']);
 view.get('showComments').click();assert.equal(view.get('githubPane').closest('#viewCommentsPane').id,'viewCommentsPane');assert.equal(view.get('commentsPane').hidden,false);assert.equal(calls.some(m=>m.type==='github-publish-comment'),false);
});
test('standalone viewer never offers current PR and VS Code remote collaboration remains unavailable',async()=>{
 const github=workspaceRuntime();assert.deepEqual(Array.from(github.get('commentDestination').children,e=>e.value),['issue','existing-issue']);
 for(const hooks of [{vscode:true},{provider:'gitlab',repository:'group/sub/project',vscode:true}]){
  const calls=[];const view=workspaceRuntime(async m=>{calls.push(m);return[];},hooks);view.load();await new Promise(resolve=>setImmediate(resolve));view.get('showGitHub').click();
  assert.equal(view.get('githubPane').hidden,false);assert.equal(view.get('githubAvailableControls').hidden,true);assert.match(view.get('githubAvailability').textContent,/VS Code viewer/);
  assert.equal(calls.some(m=>m.type.startsWith('github-')||m.type==='comment-policy-status'),false);
 }
});
test('new discussion publication requires the selected category and saved notes expose linked conversations',async()=>{
 const calls=[];let notes=[];const remoteRef={kind:'discussion',repository:'wayri/fixture',number:8,url:'https://github.com/wayri/fixture/discussions/8',publishedAt:'2026-10-04T00:00:00.000Z'};
 const view=workspaceRuntime(async m=>{calls.push(m);if(m.type==='comment-list')return notes;if(m.type==='comment-save'){notes=[m.comment];return m.comment;}if(m.type==='github-discussion-categories')return[{id:'category-1',name:'Design review'}];if(m.type==='github-publish-comment')return{remoteRef};return[];});view.load();await new Promise(resolve=>setImmediate(resolve));
 view.get('githubCommentType').value='discussion';view.get('githubCommentType').onchange();view.get('newComment').click();view.get('commentText').value='Question about the board';await view.get('saveComment').click();await view.get('loadCategories').click();assert.equal(view.get('discussionCategory').children[0].textContent,'Design review');view.get('discussionCategory').value='category-1';
 const actions=view.get('commentList').children[0].children.at(-1);await actions.children.find(e=>e.textContent==='Publish to GitHub').click();const publish=calls.find(m=>m.type==='github-publish-comment');assert.equal(publish.destination,'new-discussion');assert.equal(publish.categoryId,'category-1');assert.match(view.get('githubThreadList').textContent,/discussion #8/);assert.equal(view.get('githubThreadList').children[0].children[0].href,remoteRef.url);
});

test('saved annotation type survives editing and rejects accidental publication to the other thread type',async()=>{
 let notes=[];const calls=[];const view=workspaceRuntime(async m=>{calls.push(m);if(m.type==='comment-list')return notes;if(m.type==='comment-save'){notes=[m.comment];return m.comment;}return[];});view.load();await new Promise(resolve=>setImmediate(resolve));
 view.get('newComment').click();view.get('commentText').value='Fix this issue';await view.get('saveComment').click();assert.equal(notes[0].threadType,'issue');assert.match(view.get('commentList').textContent,/Issue/);
 view.get('githubCommentType').value='discussion';view.get('githubCommentType').onchange();view.get('commentCategoryAll').click();let actions=view.get('commentList').children[0].children.at(-1);await actions.children.find(e=>e.textContent==='Publish to GitHub').click();assert.equal(calls.some(m=>m.type==='github-publish-comment'),false);assert.match(view.get('commentStatus').textContent,/Choose a matching destination/);
 actions.children.find(e=>e.textContent==='Edit').click();assert.equal(view.get('githubCommentType').value,'issue');
 view.get('githubCommentType').value='discussion';view.get('githubCommentType').onchange();await view.get('saveComment').click();assert.equal(notes[0].threadType,'discussion');
});

test('all shared viewers contain exactly one collaboration control and a distinct GitHub pane',()=>{
 for(const file of ['pcb-viewer.html','schematic-viewer.html','revision-viewer.html']){
  const html=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
  for(const id of ['showGitHub','githubPane','githubCommentType','commentDestination','reviewSettings','refreshCommentPolicy','refreshGitHub','severityFilter'])assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1,`${file}: ${id}`);
  assert.match(html,/<section id="githubPane" hidden>/);assert.match(html,/Comment type <select id="githubCommentType">/);assert.match(html,/Post to GitHub uploads a captured screenshot/);assert.match(html,/Use Reply to start a new anchored draft/);assert.match(html,/Use View comments → Load thread to read ordinary messages and replies here/);
 }
});

test('editor posts formatted Issue and Discussion directly and saves confirmed thread links',async()=>{
 for(const type of ['issue','discussion']){
  let notes=[];const calls=[];const remoteRef={kind:type,repository:'wayri/fixture',number:12,url:`https://github.com/wayri/fixture/${type==='issue'?'issues':'discussions'}/12`,publishedAt:'2026-10-04T00:00:00.000Z'};
  const view=workspaceRuntime(async m=>{calls.push(m);if(m.type==='comment-list')return notes;if(m.type==='comment-save'){notes=[m.comment];return m.comment;}if(m.type==='github-discussion-categories')return[{id:'category-1',name:'Design review'}];if(m.type==='github-publish-comment')return{remoteRef};return[];});view.load();await new Promise(resolve=>setImmediate(resolve));
  view.get('newComment').click();view.get('commentText').value='Check connector clearance';view.get('commentSeverity').value='major';view.get('editorThreadType').value=type;view.get('editorThreadType').onchange();view.get('editorTitle').value='Connector clearance review';
  if(type==='discussion')await view.get('editorLoadCategories').click();
  view.get('editorPreview').click();assert.match(view.get('editorMarkdown').textContent,/## KiCad visual review/);assert.doesNotMatch(view.get('editorMarkdown').textContent,/kicad-review:v1/);assert.equal(calls.some(m=>m.type==='github-publish-comment'),false);
  await view.get('postComment').click();const publication=calls.find(m=>m.type==='github-publish-comment');assert.equal(publication.destination,`new-${type}`);assert.equal(publication.title,'Check connector clearance');assert.equal(publication.comment.threadType,type);if(type==='discussion')assert.equal(publication.categoryId,'category-1');assert.equal(notes[0].remoteRefs[0].url,remoteRef.url);assert.equal(view.get('commentEditor').hidden,true);assert.match(view.get('commentStatus').textContent,/Posted to GitHub/);
 }
});

test('editor validates existing thread destinations before saving or posting',async()=>{
 const calls=[];const view=workspaceRuntime(async m=>{calls.push(m);return[];});view.load();await new Promise(resolve=>setImmediate(resolve));view.get('newComment').click();view.get('commentText').value='Review';view.get('editorDestination').value='existing-issue';view.get('editorDestination').onchange();view.get('editorThreadNumber').value='0';await view.get('postComment').click();assert.equal(calls.some(m=>m.type==='comment-save'||m.type==='github-publish-comment'),false);assert.match(view.get('commentStatus').textContent,/positive GitHub thread number/);assert.equal(view.get('commentEditor').hidden,false);
});

test('confirmed GitHub screenshot URLs persist with the remote thread and display without local PNG bytes',async()=>{
 let notes=[];
 const attachment={provider:'github',repository:'wayri/fixture',mime:'image/png',width:200,height:100,url:'https://github.com/user-attachments/assets/01234567-89ab-cdef-0123-456789abcdef'};
 const remoteRef={kind:'issue',repository:'wayri/fixture',number:12,url:'https://github.com/wayri/fixture/issues/12',publishedAt:'2026-10-04T00:00:00.000Z'};
 const view=workspaceRuntime(async m=>{if(m.type==='comment-list')return notes;if(m.type==='comment-save'){notes=[m.comment];return m.comment;}if(m.type==='github-publish-comment')return{remoteRef,attachments:[attachment]};return[];});
 view.load();await new Promise(resolve=>setImmediate(resolve));view.get('newComment').click();view.get('commentText').value='Screenshot context';await view.get('postComment').click();
 assert.deepEqual(JSON.parse(JSON.stringify(notes[0].attachments)),[attachment]);
 const findImages=node=>[...(node.tagName==='IMG'?[node]:[]),...node.children.flatMap(findImages)];
 assert.equal(findImages(view.get('commentList'))[0].src,attachment.url);
 assert.equal(findImages(view.get('commentList'))[0].referrerPolicy,'no-referrer');
 const elements=node=>[node,...node.children.flatMap(elements)];
 elements(view.get('commentList')).find(node=>node.tagName==='BUTTON'&&node.textContent==='Edit').click();
 assert.equal(view.get('capturePreview').src,attachment.url);assert.equal(view.get('removeCapture').hidden,false);
 view.get('removeCapture').click();assert.equal(view.get('capturePreview').hidden,true);
 assert.equal(notes[0].attachments.length,1,'removal is a draft change until saved');
 await view.get('saveComment').click();assert.equal(notes[0].attachments,undefined);
});

test('editor routes replies to the selected existing Issue or Discussion number',async()=>{
 for(const type of ['issue','discussion']){
  let notes=[];const calls=[];const remoteRef={kind:type,repository:'wayri/fixture',number:42,url:`https://github.com/wayri/fixture/${type==='issue'?'issues':'discussions'}/42`,publishedAt:'2026-10-04T00:00:00.000Z'};
  const view=workspaceRuntime(async m=>{calls.push(m);if(m.type==='comment-list')return notes;if(m.type==='comment-save'){notes=[m.comment];return m.comment;}if(m.type==='github-publish-comment')return{remoteRef};return[];});view.load();await new Promise(resolve=>setImmediate(resolve));view.get('newComment').click();view.get('commentText').value='Additional clearance evidence';view.get('editorThreadType').value=type;view.get('editorThreadType').onchange();view.get('editorDestination').value=`existing-${type}`;view.get('editorDestination').onchange();view.get('editorThreadNumber').value='42';await view.get('postComment').click();const publication=calls.find(m=>m.type==='github-publish-comment');assert.equal(publication.destination,type);assert.equal(publication.number,42);assert.equal(publication.categoryId,undefined);assert.equal(notes[0].remoteRefs[0].number,42);
 }
});

test('failed direct publication preserves a saved editable draft and does not repeat the request',async()=>{
 let notes=[];const calls=[];const view=workspaceRuntime(async m=>{calls.push(m);if(m.type==='comment-list')return notes;if(m.type==='comment-save'){notes=[m.comment];return m.comment;}if(m.type==='github-publish-comment')throw new Error('Connect GitHub to publish');return[];});view.load();await new Promise(resolve=>setImmediate(resolve));view.get('newComment').click();view.get('commentText').value='Review';await view.get('postComment').click();assert.equal(notes.length,1);assert.equal(notes[0].remoteRefs.length,0);assert.equal(view.get('commentEditor').hidden,false);assert.match(view.get('commentStatus').textContent,/draft remains saved/);assert.equal(calls.filter(m=>m.type==='github-publish-comment').length,1);
});

test('GitLab direct publication saves confirmed issue links and discussions target existing issues',async()=>{
 for(const type of ['issue','discussion']){
  const calls=[];let notes=[];const remoteRef={provider:'gitlab',host:'https://gitlab.example.com',kind:'issue',repository:'group/project',number:42,url:'https://gitlab.example.com/group/project/-/issues/42',publishedAt:'2026-10-04T00:00:00.000Z'};
  const view=workspaceRuntime(async m=>{calls.push(m);if(m.type==='comment-list')return notes;if(m.type==='comment-save'){notes=[m.comment];return m.comment;}if(m.type==='comment-publish')return{remoteRef};if(m.type==='comment-policy-status')return{allowed:true};return[];},{provider:'gitlab',host:'https://gitlab.example.com',repository:'group/project'});view.load();await new Promise(resolve=>setImmediate(resolve));
  view.get('newComment').click();view.get('commentText').value='Review connectivity';view.get('editorThreadType').value=type;view.get('editorThreadType').onchange();view.get('editorTitle').value='Connectivity review';
  if(type==='discussion'){assert.deepEqual(Array.from(view.get('editorDestination').children,e=>e.value),['existing-issue']);view.get('editorThreadNumber').value='42';}
  assert.equal(view.get('editorCategoryLabel').hidden,true);await view.get('postComment').click();
  const publication=calls.find(m=>m.type==='comment-publish');assert.equal(publication.provider,'gitlab');assert.equal(publication.host,'https://gitlab.example.com');assert.equal(publication.destination,type==='discussion'?'issue':'new-issue');assert.equal(publication.discussion,type==='discussion'?true:undefined);assert.equal(publication.categoryId,undefined);assert.equal(publication.comment.threadType,type);
  assert.equal(calls.some(m=>m.type==='github-publish-comment'),false);assert.equal(notes[0].remoteRefs[0].url,remoteRef.url);assert.match(view.get('commentStatus').textContent,/Posted to GitLab issue #42/);
 }
});
test('GitLab annotations readback and settings retain exact provider host and no GitHub category lookup',async()=>{
 const calls=[];const view=workspaceRuntime(async m=>{calls.push(m);if(m.type==='comment-remote-list')return{notes:[],warnings:['Only marked review notes are included.']};return[];},{provider:'gitlab',host:'https://gitlab.example.com',repository:'group/project'});await view.get('refreshGitHub').click();await view.get('reviewSettings').click();assert.equal(calls.find(m=>m.type==='comment-remote-list').host,'https://gitlab.example.com');assert.equal(calls.find(m=>m.type==='open-options').provider,'gitlab');assert.match(view.get('commentStatus').textContent,/Loaded 0 GitLab annotations/);view.get('githubCommentType').value='discussion';view.get('githubCommentType').onchange();assert.equal(view.get('loadCategories').hidden,true);assert.deepEqual(Array.from(view.get('commentDestination').children,e=>e.value),['existing-issue']);
});

test('existing Discussion readback forwards the selected thread number without an Issue lookup',async()=>{
 const calls=[];const view=workspaceRuntime(async m=>{calls.push(m);if(m.type==='github-annotations')return{notes:[],warnings:[]};return[];});
 view.get('githubCommentType').value='discussion';view.get('githubCommentType').onchange();view.get('commentDestination').value='existing-discussion';view.get('threadNumber').value='17';await view.get('refreshGitHub').click();
 const request=calls.find(m=>m.type==='github-annotations');assert.equal(request.discussionNumber,17);assert.equal(request.issueNumber,undefined);assert.equal(request.includeDiscussions,true);
});

test('Reply to a remote annotation retains its drawing anchor and selects the existing thread without posting',async()=>{
 const calls=[],note={id:'remote-note',text:'Review this part',createdAt:'2026-10-04T00:00:00Z',severity:'major',threadType:'discussion',anchor:{repository:'wayri/fixture',ref:'main',file:'board.kicad_pcb',position:{x:3,y:4}},github:{source:'discussion-comment',number:17,state:'open',author:'alice',url:'https://github.com/wayri/fixture/discussions/17#discussioncomment-1',createdAt:'2026-10-04T01:00:00Z',updatedAt:'2026-10-04T02:00:00Z'}};
 const view=workspaceRuntime(async m=>{calls.push(m);if(m.type==='github-annotations')return{notes:[note],warnings:[]};return[];});await view.get('refreshGitHub').click();
 const elements=node=>[node,...node.children.flatMap(elements)];elements(view.get('commentList')).find(node=>node.tagName==='BUTTON'&&node.textContent==='Reply').click();
 assert.equal(view.get('editorDestination').value,'existing-discussion');assert.equal(view.get('editorThreadNumber').value,'17');assert.equal(view.get('commentText').value,'');assert.match(view.get('commentAnchor').textContent,/3.00, 4.00/);assert.equal(calls.some(m=>m.type==='github-publish-comment'),false);
});

test('net review drafts preserve the selected saved net name in formatted GitHub context',async()=>{
 let notes=[];const view=workspaceRuntime(async m=>{if(m.type==='comment-list')return notes;if(m.type==='comment-save'){notes=[m.comment];return m.comment;}return[];});view.load();view.get('netList').children[0].click();view.get('newComment').click();view.get('commentText').value='Review this net';view.get('editorPreview').click();assert.match(view.get('editorMarkdown').textContent,/\| Net \| SIGNAL \|/);await view.get('saveComment').click();assert.equal(notes[0].anchor.kind,'net');assert.equal(notes[0].anchor.netName,'SIGNAL');
});

test('uncertain posting exposes a read-only recovery control and saves its confirmed link without another publication',async()=>{
 let notes=[];const calls=[],ref={kind:'issue',repository:'wayri/fixture',number:19,url:'https://github.com/wayri/fixture/issues/19',publishedAt:'2026-10-05T01:00:00.000Z'};
 const view=workspaceRuntime(async m=>{calls.push(m);if(m.type==='comment-list')return notes;if(m.type==='comment-save'){notes=[m.comment];return m.comment;}if(m.type==='github-publish-comment')throw Error('Unconfirmed outcome');if(m.type==='github-recover-publication')return{remoteRef:ref,recovered:true};return[];});
 view.load();await new Promise(setImmediate);view.get('newComment').click();view.get('commentText').value='Check connection';await view.get('postComment').click();
 const row=view.get('postComment').parentElement.querySelector('.publication-recovery');assert.ok(row);assert.match(row.textContent,/never creates another post/);row.querySelector('input').value='19';await row.querySelector('button').click();
 const recovery=calls.find(m=>m.type==='github-recover-publication');assert.equal(recovery.recoveryNumber,19);assert.equal(recovery.destination,'new-issue');assert.equal(calls.filter(m=>m.type==='github-publish-comment').length,1);assert.equal(notes[0].remoteRefs[0].url,ref.url);assert.match(view.get('commentStatus').textContent,/Recovered link to/);assert.equal(view.get('postComment').parentElement.querySelector('.publication-recovery'),null);
});

test('auto-hide preserves focused comment input, hides after leaving, and restores its draft',async()=>{
 const view=workspaceRuntime();view.get('newComment').click();view.get('commentText').value='Unsaved draft';view.document.activeElement=view.get('commentText');
 view.get('commentsSidebar').dispatchEvent(new Event('pointerleave'));await new Promise(resolve=>setTimeout(resolve,380));assert.equal(view.get('commentsSidebar').hidden,false);
 view.document.activeElement=null;view.get('commentsSidebar').dispatchEvent(new Event('focusout'));await new Promise(resolve=>setTimeout(resolve,380));assert.equal(view.get('commentsSidebar').hidden,true);
 view.get('dockComments').dispatchEvent(new Event('pointerenter'));view.get('dockComments').click();assert.equal(view.get('commentsSidebar').hidden,false);assert.equal(view.get('commentText').value,'Unsaved draft');
 view.get('dockComments').dispatchEvent(new Event('pointerleave'));view.get('commentsSidebar').dispatchEvent(new Event('pointerenter'));await new Promise(resolve=>setTimeout(resolve,380));assert.equal(view.get('commentsSidebar').hidden,false);view.workspace.dispose();
});
test('pinning prevents pending auto-hide; unpinning resumes it and disposal cancels timers',async()=>{
 const view=workspaceRuntime();view.get('dockNavigator').click();view.get('designNavigator').dispatchEvent(new Event('pointerleave'));view.get('pinNavigator').click();await new Promise(resolve=>setTimeout(resolve,380));assert.equal(view.get('designNavigator').hidden,false);
 view.get('pinNavigator').click();view.get('designNavigator').dispatchEvent(new Event('pointerleave'));await new Promise(resolve=>setTimeout(resolve,380));assert.equal(view.get('designNavigator').hidden,true);
 view.get('dockNavigator').click();view.get('designNavigator').dispatchEvent(new Event('pointerleave'));view.workspace.dispose();await new Promise(resolve=>setTimeout(resolve,380));assert.equal(view.get('designNavigator').hidden,false);
});
test('three pinned panes retain drawing width and reuse width resizing',()=>{
 const view=workspaceRuntime(undefined,{width:600});for(const name of ['Navigator','Properties','Comments']){view.get('dock'+name).click();view.get('pin'+name).click();}
 const panel=view.get('commentsSidebar'),handle=panel.querySelector('.sidebar-resizer');handle.dispatchEvent(uiEvent('keydown',{key:'ArrowLeft',shiftKey:false}));
 const reserved=parseFloat(view.get('reviewWorkspace').style['--pinned-left-width'])+parseFloat(view.get('reviewWorkspace').style['--pinned-right-width']);assert.ok(reserved<=(600-64)*.65+1);assert.equal(panel.style.height,'300px');assert.equal(view.get('pinComments').attributes['aria-pressed'],'true');view.workspace.dispose();
});
 test('comment actions restore focus view and reveal the editor in short panes',()=>{
 const view=workspaceRuntime(undefined,{width:600,frameHeight:500,workspaceHeight:434});view.load();
 view.get('focusView').click();view.get('commentsButton').click();assert.equal(view.get('commentsSidebar').hidden,false);assert.equal(view.get('commentsSidebar').classList.contains('compact-sidebar'),false);
 view.get('focusView').click();view.key('c');assert.equal(view.get('commentsSidebar').hidden,false);assert.equal(view.get('addCommentPane').hidden,false);assert.equal(view.get('commentEditor').hidden,false);assert.equal(view.get('commentsSidebar').style.height,'434px');assert.equal(view.get('focusView').textContent,'Focus view');
 const event=uiEvent('contextmenu',{clientX:30,clientY:30,button:2});view.canvas.canvas.dispatchEvent(event);view.get('objectMenu').children.find(b=>/Comment/.test(b.textContent)).click();assert.equal(view.get('commentEditor').hidden,false);assert.equal(view.get('commentsSidebar').classList.contains('compact-sidebar'),false);
 });

 test('mention picker inserts contributors without posting and rejects stale lookup results',async()=>{
 let finish,calls=[];const view=workspaceRuntime(async message=>{calls.push(message);if(message.type==='comment-mention-users')return await new Promise(resolve=>finish=resolve);return[];});view.load();view.get('newComment').click();view.get('mentionSource').value='repository';const lookup=view.get('mentionSource').onchange();finish({users:[{login:'wayri',name:'Reviewer',roles:['Contributor']}],warnings:[]});await lookup;
 const suggestions=view.get('mentionSuggestions');assert.equal(suggestions.children.length,1);suggestions.children[0].click();suggestions.children[0].click();assert.equal(view.get('commentMentions').value,'@wayri');assert.match(view.get('mentionLookupStatus').textContent,/only when posted/);assert.equal(calls.some(m=>/publish/.test(m.type)),false);
 const pending=view.get('mentionSource').onchange();view.workspace.dispose();finish({users:[{login:'other',roles:['User']}],warnings:[]});await pending;assert.equal(suggestions.children.length,0);
 });

 test('PCB hierarchical net cross-highlight opens its saved schematic sheet and highlights refreshed geometry',()=>{
 const files=[{path:'root.kicad_sch',content:'(kicad_sch (sheet (at 0 0) (size 10 10) (uuid "sheet-1") (property "Sheetname" "Power") (property "Sheetfile" "power.kicad_sch")))'},{path:'power.kicad_sch',content:'(kicad_sch (label "ENABLE" (at 1 1 0) (uuid "label-1")) (wire (pts (xy 1 1) (xy 10 1)) (uuid "wire-1")))'}];
 let active=files[0].path,view;const designs=new Map();view=workspaceRuntime(async()=>[],{pcb:false,files,currentFile:()=>active,getDesigns:()=>designs,openSheet:path=>{active=path;const file=files.find(f=>f.path===path),design=require('../schematic-renderer.js').build(require('../design-diff.js').parse(file.content),path);designs.set(path,design);view.canvas.design=design;view.canvas.primitives=design.primitives;view.workspace.draw();}});view.load();
 assert.equal(view.workspace.highlightRelated({kind:'net',path:'board.kicad_pcb',netName:'/Power/ENABLE'}),true);assert.equal(active,'power.kicad_sch');assert.equal(view.canvas.netHighlight.name,'ENABLE');assert.ok(view.canvas.netPrimitives.size>0);
 });

 test('comment view exposes state and sorting filters, updates cards and resets without publishing',async()=>{
 const notes=['open','resolved','skipped','wont-fix'].map((state,i)=>({id:state,text:'Note '+state,state,severity:['minor','critical','major','info'][i],createdAt:`2026-10-0${i+1}T00:00:00Z`,updatedAt:`2026-10-0${i+1}T00:00:00Z`,anchor:{repository:'wayri/fixture',ref:'main',file:'board.kicad_pcb'}}));const calls=[];const view=workspaceRuntime(async message=>{calls.push(message.type);return message.type==='comment-list'?notes:[];});view.load();await view.workspace.refreshComments();view.get('commentsButton').click();assert.equal(view.get('commentFilters').open,true);assert.equal(view.get('commentFilters').contains(view.get('stateFilter')),true);
 view.get('stateFilter').value='closed';view.get('stateFilter').onchange();let cards=view.get('commentList').children;assert.equal(cards.length,2);assert.match(cards[0].textContent,/Note resolved/);assert.match(cards[1].textContent,/Note wont-fix/);
 view.get('commentSort').value='severity-lowest';view.get('commentSort').onchange();assert.match(view.get('commentList').children[0].textContent,/Note wont-fix/);
 view.get('stateFilter').value='skipped';view.get('stateFilter').onchange();assert.equal(view.get('commentList').children.length,1);assert.match(view.get('commentList').textContent,/Note skipped/);
 view.get('resetCommentFilters').click();assert.equal(view.get('stateFilter').value,'all');assert.equal(view.get('commentSort').value,'severity');assert.equal(view.get('commentList').children.length,4);assert.equal(calls.some(t=>/publish|comment-save/.test(t)),false);
 });

 test('Issue and Discussion category tabs separate notes, preserve drafts, and choose matching GitHub destinations',async()=>{
 const notes=['issue','discussion',null].map((threadType,i)=>({id:'category-'+i,text:'Category '+(threadType||'legacy'),...(threadType?{threadType}:{}),state:'open',severity:'info',createdAt:'2026-10-01T00:00:00Z',anchor:{repository:'wayri/fixture',ref:'main',file:'board.kicad_pcb'}})),calls=[];const view=workspaceRuntime(async message=>{calls.push(message.type);return message.type==='comment-list'?notes:[];});view.load();await view.workspace.refreshComments();
 assert.match(view.get('commentCategoryIssue').textContent,/Issues \(1\)/);assert.match(view.get('commentCategoryDiscussion').textContent,/Discussions \(1\)/);view.get('commentCategoryIssue').click();assert.equal(view.get('commentList').children.length,1);assert.match(view.get('commentList').textContent,/Category issue/);assert.equal(view.get('commentCategoryContent').attributes['aria-labelledby'],'commentCategoryIssue');
 view.get('newComment').click();view.get('commentText').value='Keep issue draft';assert.equal(view.get('editorThreadType').value,'issue');assert.equal(view.get('editorDestination').value,'issue');view.get('commentCategoryDiscussion').click();assert.equal(view.get('editorThreadType').value,'issue');assert.equal(view.get('commentText').value,'Keep issue draft');assert.match(view.get('commentList').textContent,/Category discussion/);
 view.get('cancelComment').click();view.get('newComment').click();assert.equal(view.get('editorThreadType').value,'discussion');assert.equal(view.get('editorDestination').value,'discussion');assert.equal(view.get('editorCategoryLabel').hidden,false);view.get('cancelComment').click();view.get('commentCategoryAll').click();assert.equal(view.get('commentList').children.length,3);
 view.get('commentCategoryTabs').dispatchEvent(uiEvent('keydown',{key:'Home'}));assert.equal(view.get('commentCategoryIssue').attributes['aria-selected'],'true');view.get('commentCategoryTabs').dispatchEvent(uiEvent('keydown',{key:'ArrowRight'}));assert.equal(view.get('commentCategoryDiscussion').attributes['aria-selected'],'true');assert.equal(calls.some(t=>/publish|comment-save/.test(t)),false);
 });
 test('category-created issue and discussion drafts publish only to their selected GitHub thread type',async()=>{
 for(const type of ['issue','discussion']){let notes=[];const calls=[];const view=workspaceRuntime(async message=>{calls.push(message);if(message.type==='comment-save'){notes=[message.comment];return message.comment;}if(message.type==='comment-list')return notes;if(message.type==='comment-policy-status')return{allowed:true,mode:'all'};if(message.type==='github-publish-comment')return{remoteRef:{kind:type,repository:'wayri/fixture',number:42,url:`https://github.com/wayri/fixture/${type==='issue'?'issues':'discussions'}/42`,publishedAt:'2026-10-05T00:00:00Z'}};return[];});view.load();await new Promise(resolve=>setImmediate(resolve));view.get(type==='issue'?'commentCategoryIssue':'commentCategoryDiscussion').click();view.get('newComment').click();view.get('commentText').value='Category review';view.get('editorTitle').value='Category review';if(type==='discussion')view.get('editorCategory').value='DIC_review';await view.get('postComment').click();const publication=calls.find(m=>m.type==='github-publish-comment');assert.ok(publication,view.get('commentStatus').textContent);assert.equal(publication.comment.threadType,type);assert.equal(publication.destination,type==='issue'?'new-issue':'new-discussion');assert.equal(view.get('commentEditor').hidden,true);assert.match(view.get('commentList').textContent,/Category review/);}
 });

const groupBoard='(kicad_pcb '+['R1','R2','R3'].map((ref,i)=>`(footprint "Resistor" (layer "F.Cu") (at ${10+i*10} 20) (uuid "fp${i}") (property "Reference" "${ref}") (property "Value" "10k") (pad "1" smd rect (at 0 0) (size 2 2) (layers "F.Cu") (uuid "pad${i}")))`).join(' ')+')';
test('canvas additive selection highlights the whole group, toggles members and clears its companion',()=>{
 const selections=[],view=workspaceRuntime(undefined,{source:groupBoard,onSelection:s=>selections.push(s)});view.load();
 const pick=(uuid,multi)=>view.canvas.dispatchEvent(new CustomEvent('kicad:select',{detail:{item:{uuid},multi}}));
 pick('fp0',false);pick('fp1',true);assert.match(view.get('highlightSummary').textContent,/2 components/);
 assert.deepEqual(Array.from(selections.at(-1).items,i=>i.reference),['R1','R2']);assert.ok(view.canvas.netPrimitives.has(view.design.primitives.find(p=>p.ownerUuid==='fp0')));
 pick('fp2',true);pick('fp1',true);assert.deepEqual(Array.from(selections.at(-1).items,i=>i.reference),['R1','R3']);assert.match(view.get('highlightSummary').textContent,/2 components/);
 view.get('clearHighlights').click();assert.equal(selections.at(-1).kind,'group');assert.equal(selections.at(-1).items.length,0);assert.equal(view.canvas.netPrimitives.size,0);
});
test('multihighlight checkbox and modifier clicks on Parts retain group membership',()=>{
 const selections=[],view=workspaceRuntime(undefined,{source:groupBoard,onSelection:s=>selections.push(s)});view.load();
 view.get('objectList').children[0].click();view.get('objectList').children[1].onclick({ctrlKey:true});assert.equal(selections.at(-1).items.length,2);
 view.get('multiHighlight').checked=true;view.get('objectList').children[2].click();assert.equal(selections.at(-1).items.length,3);
 assert.ok(view.get('objectList').children.every(row=>row.attributes['aria-pressed']==='true'));
});
test('received group highlights all matched footprints without enabling the multihighlight checkbox',()=>{
 const view=workspaceRuntime(undefined,{source:groupBoard});view.load();const items=['R1','R2'].map(reference=>({kind:'part',reference,path:'root.kicad_sch'}));
 assert.equal(view.workspace.highlightRelated({kind:'group',items}),true);assert.match(view.get('highlightSummary').textContent,/2 components/);assert.equal(view.get('multiHighlight').checked,false);
 const uuids=new Set([...view.canvas.netPrimitives].map(p=>p.ownerUuid||p.uuid));assert.ok(uuids.has('fp0'));assert.ok(uuids.has('fp1'));
 view.workspace.highlightRelated({kind:'group',items:[]});assert.equal(view.canvas.netPrimitives.size,0);
});
test('selecting a loaded sheet includes its descendant parts in one cross-highlight group',()=>{
 const symbol=(ref,uuid)=>`(symbol (lib_id "Device:R") (at 20 20 0) (uuid "${uuid}") (property "Reference" "${ref}") (property "Value" "10k"))`;
 const files=[{path:'root.kicad_sch',content:'(kicad_sch (sheet (at 0 0) (size 10 10) (uuid "s") (property "Sheetname" "Power") (property "Sheetfile" "child.kicad_sch")))'},
 {path:'child.kicad_sch',content:'(kicad_sch '+symbol('R1','r1')+' (sheet (at 0 0) (size 10 10) (uuid "t") (property "Sheetfile" "leaf.kicad_sch")))'},
 {path:'leaf.kicad_sch',content:'(kicad_sch '+symbol('R2','r2')+')'}];
 const selections=[],view=workspaceRuntime(undefined,{pcb:false,files,onSelection:s=>selections.push(s)});view.load();view.get('navSheets').click();
 const tree=view.get('sheetList').children.find(node=>node.classList.contains('sheet-tree'));tree.children[1].children.find(node=>node.classList.contains('sheet-open')).click();
 assert.deepEqual(Array.from(selections.at(-1).items,i=>i.reference),['R1','R2']);assert.match(view.get('reviewNotice').textContent,/2 loaded sheets/);
});

test('toolbar opens an independent movable, minimizable check window and explorer navigation preserves it',()=>{
 const view=workspaceRuntime(undefined,{navigation:true});view.load();const win=view.get('ruleWindow'),header=view.get('ruleWindowHeader');
 assert.equal(win.hidden,true);assert.equal(view.get('viewRuleChecks').textContent,'DRC');view.get('viewRuleChecks').click();
 assert.equal(win.hidden,false);assert.equal(view.get('designNavigator').hidden,true);assert.equal(view.get('rulesPane').parentElement.id,'ruleWindow');assert.equal(win.attributes['aria-modal'],'false');
 const before=parseFloat(win.style.left);header.dispatchEvent(uiEvent('keydown',{key:'ArrowRight'}));assert.equal(parseFloat(win.style.left),before+10);
 header.dispatchEvent(uiEvent('pointerdown',{button:0,clientX:50,clientY:50,pointerId:5}));header.dispatchEvent(uiEvent('pointermove',{clientX:90,clientY:70,pointerId:5}));header.dispatchEvent(uiEvent('pointerup',{pointerId:5}));assert.equal(parseFloat(win.style.left),before+50);
 view.get('minimizeRuleWindow').click();assert.equal(view.get('rulesPane').hidden,true);view.get('minimizeRuleWindow').click();assert.equal(view.get('rulesPane').hidden,false);
 view.get('navParts').click();assert.equal(win.hidden,false);assert.equal(view.get('rulesPane').hidden,false);
 view.get('closeRuleWindow').click();assert.equal(win.hidden,true);assert.equal(view.get('viewRuleChecks').attributes['aria-expanded'],'false');assert.equal(view.get('viewRuleChecks').focused,true);
});
test('floating DRC result rows jump to the drawing, retain report after closing and leave markers visible',async()=>{
 const focused=[],view=workspaceRuntime(async()=>[],{navigation:true,focus:p=>focused.push(p)});view.load();view.get('viewRuleChecks').click();
 const report={source:'board.kicad_pcb',date:'2026-10-05T00:00:00Z',kicad_version:'10.0.0',coordinate_units:'mm',violations:[{type:'clearance',description:'Track clearance',severity:'error',items:[{description:'Track',pos:{x:30,y:40}},{description:'Pad',pos:{x:31,y:40}}]}]};
 view.get('ruleReportFile').files=[{size:300,name:'board-drc.json',text:async()=>JSON.stringify(report)}];await view.get('ruleReportFile').onchange();assert.equal(view.get('ruleReportSources').open,false);
 view.get('ruleResults').children[0].children[0].click();assert.deepEqual(focused[0],{x:30,y:40});assert.ok(view.get('reviewOverlay').children.some(n=>n.attributes.d?.includes('L')));
 view.get('nextRuleItem').click();assert.deepEqual(focused[1],{x:31,y:40});view.get('closeRuleWindow').click();assert.ok(view.get('commentPins').children.some(n=>n.className.includes('rule-marker')));
 view.get('viewRuleChecks').click();assert.match(view.get('ruleCount').textContent,/1 saved/);view.get('clearRuleReports').click();assert.match(view.get('ruleCount').textContent,/0 saved/);
});
test('schematic ERC window jumps to an explicitly associated loaded subsheet and rejects unresolved locations',async()=>{
 const files=[{path:'root.kicad_sch',content:'(kicad_sch (uuid root))'},{path:'child.kicad_sch',content:'(kicad_sch (uuid child))'}],opened=[];
 const view=workspaceRuntime(undefined,{navigation:true,pcb:false,files,openSheet:(file,position)=>opened.push({file,position})});view.load();view.get('viewRuleChecks').click();assert.equal(view.get('viewRuleChecks').textContent,'ERC');
 const report={source:'root.kicad_sch',date:'2026-10-05T00:00:00Z',kicad_version:'9.0.0',coordinate_units:'mm',sheets:[{uuid_path:'/',path:'/',violations:[{type:'pin_not_connected',description:'Unconnected pin',severity:'warning',items:[{description:'Pin',pos:{x:10,y:20}}]}]}]};
 view.get('ruleDrawing').value='child.kicad_sch';view.get('ruleReportFile').files=[{size:300,name:'erc.json',text:async()=>JSON.stringify(report)}];await view.get('ruleReportFile').onchange();view.get('ruleResults').children[0].children[0].click();assert.equal(opened[0].file,'child.kicad_sch');assert.deepEqual(opened[0].position,{x:10,y:20});
 view.get('clearRuleReports').click();delete report.sheets[0].violations[0].items[0].pos;view.get('ruleReportFile').files=[{size:300,name:'erc.json',text:async()=>JSON.stringify(report)}];await view.get('ruleReportFile').onchange();view.get('ruleResults').children[0].children[0].click();assert.equal(opened.length,1);assert.match(view.get('ruleStatus').textContent,/no resolved drawing location/);
});

test('check window reports blocked 3D navigation instead of claiming a successful drawing jump',async()=>{
 const focused=[],view=workspaceRuntime(undefined,{navigation:true,focus:p=>focused.push(p)});view.load();
 const report={source:'board.kicad_pcb',date:'2026-10-05T00:00:00Z',kicad_version:'10.0.0',coordinate_units:'mm',violations:[{type:'clearance',description:'Clearance',severity:'error',items:[{description:'Track',pos:{x:30,y:40}}]}]};
 view.get('ruleReportFile').files=[{size:250,name:'drc.json',text:async()=>JSON.stringify(report)}];await view.get('ruleReportFile').onchange();view.workspace.setScene({setPopulation(){}});view.get('nextRule').click();assert.equal(focused.length,0);assert.match(view.get('ruleStatus').textContent,/Cannot jump.*2D/);
});


test('compact composer inserts an inline mention and derives title and mentions on save',async()=>{
 let notes=[];const calls=[];const view=workspaceRuntime(async m=>{calls.push(m);if(m.type==='comment-list')return notes;if(m.type==='comment-mention-users')return{users:[{login:'wayri',name:'Reviewer'}]};if(m.type==='comment-save'){notes=[m.comment];return m.comment;}return[];});view.load();await new Promise(r=>setImmediate(r));view.get('newComment').click();
 assert.equal(view.get('commentComposeTop').children.length,3);assert.equal(view.get('editorTitleLabel').parentElement.hidden,true);assert.equal(view.get('editorDestination').value,'issue');
 const box=view.get('commentText');box.value='Review title\nAsk @wa';box.selectionStart=box.value.length;box.dispatchEvent(new Event('input'));await new Promise(r=>setTimeout(r,240));assert.equal(view.get('inlineMentionSuggestions').hidden,false);view.get('inlineMentionSuggestions').children[0].click();assert.equal(box.value,'Review title\nAsk @wayri ');assert.equal(view.get('inlineMentionSuggestions').hidden,true);await view.get('saveComment').click();assert.deepEqual([...notes[0].mentions],['wayri']);assert.match(view.get('commentList').textContent,/Review title/);
});

test('pasted screenshot is saved with a draft and cancelled conversions cannot contaminate another draft',async()=>{
 let notes=[],finish;const view=workspaceRuntime(async m=>{if(m.type==='comment-list')return notes;if(m.type==='comment-save'){notes=[m.comment];return m.comment;}return[];},{compose:{normalizeCapture:()=>new Promise(r=>finish=r)}});view.load();await new Promise(r=>setImmediate(r));view.get('newComment').click();view.get('commentText').value='Evidence';
 const paste=()=>{const event=new Event('paste',{cancelable:true});Object.defineProperty(event,'clipboardData',{value:{items:[{kind:'file',type:'image/png',getAsFile:()=>new Blob(['image'],{type:'image/png'})}]}});view.get('commentText').dispatchEvent(event);assert.equal(event.defaultPrevented,true);};paste();await view.get('saveComment').click();assert.equal(notes.length,0);assert.match(view.get('commentStatus').textContent,/Wait for/);view.get('cancelComment').click();view.get('newComment').click();finish({dataUrl:'data:image/png;base64,aGVsbG8=',width:1,height:1});await new Promise(r=>setImmediate(r));assert.equal(view.get('capturePreview').hidden,true);
});

test('thread reader shows ordinary text safely, filters dates, and prepares a reply without posting',async()=>{
 const calls=[];const thread={kind:'discussion',number:7,title:'Design question',url:'https://github.com/wayri/fixture/discussions/7',state:'open',author:'wayri',createdAt:'2026-10-01T00:00:00Z',body:'Initial question',comments:[{id:'reply1',author:'reviewer',createdAt:'2026-10-03T12:00:00Z',body:'<script>not executable</script>',replyTo:'parent1'}],warnings:[]};const view=workspaceRuntime(async m=>{calls.push(m);if(m.type==='github-thread-read')return thread;return[];});view.load();await new Promise(r=>setImmediate(r));view.get('commentThreadKind').value='discussion';view.get('commentThreadNumber').value='7';await view.get('commentThreadLoad').click();assert.match(view.get('commentThreadMessages').textContent,/Initial question/);assert.match(view.get('commentThreadMessages').textContent,/<script>not executable/);assert.match(view.get('commentThreadMessages').textContent,/Reply to parent1/);
 view.get('commentSettingsButton').click();assert.equal(view.get('commentSettings').hidden,false);assert.equal(view.get('commentSettingsButton').attributes['data-icon'],'gear');view.get('commentCreatedFrom').value='2026-10-03';view.get('commentCreatedFrom').onchange();assert.doesNotMatch(view.get('commentThreadMessages').textContent,/Initial question/);assert.match(view.get('commentThreadMessages').textContent,/not executable/);view.get('commentThreadMessages').children[0].children.at(-1).click();assert.equal(view.get('editorDestination').value,'existing-discussion');assert.equal(view.get('editorThreadNumber').value,'7');assert.equal(calls.some(m=>m.type==='github-publish-comment'),false);
});


test('net highlighting badges only related sheets and publishes the shared hierarchy',()=>{
 const content=(global)=>`(kicad_sch (version 20250114) (global_label "${global}" (at 0 0) (uuid "g")) (wire (pts (xy 0 0) (xy 10 0)) (uuid "w")))`,files=[{path:'root.kicad_sch',content:content('SUPPLY')},{path:'child.kicad_sch',content:content('SUPPLY')},{path:'unrelated.kicad_sch',content:content('OTHER')}];let snapshot;const view=workspaceRuntime(async()=>[],{pcb:false,files,onHierarchy:value=>snapshot=value});view.load();view.get('netList').children[0].click();const rows=view.get('sheetList').children[1].children,marked=rows.filter(r=>r.children.some(n=>n.className.includes('net-sheet-match')));assert.equal(marked.length,2);assert.equal(typeof view.workspace.followSheet,'function');assert.equal(view.workspace.followSheet('missing.kicad_sch'),false);assert.deepEqual([...snapshot.highlighted].sort(),['child.kicad_sch','root.kicad_sch']);assert.match(view.get('propertyList').textContent,/Matching sheets/);view.get('clearHighlights').click();assert.equal(snapshot.highlighted.length,0);
});

test('angle ruler previews, pins, resets and uses opaque label backgrounds',()=>{
 const view=workspaceRuntime();view.load();const fire=(type,props)=>{const e=new Event(type,{cancelable:true});Object.assign(e,props);view.canvas.canvas.dispatchEvent(e);};
 view.get('rulerSnap').value='off';view.get('rulerKind').value='angle';view.get('measureButton').click();
 fire('click',{clientX:440,clientY:300});assert.match(view.get('measurementStatus').textContent,/vertex/);
 fire('click',{clientX:400,clientY:300});fire('pointermove',{buttons:0,clientX:400,clientY:340});assert.match(view.get('measurementStatus').textContent,/Live angle.*90.0/);
 fire('click',{clientX:400,clientY:340});assert.match(view.get('measurementStatus').textContent,/Pinned angle.*90.0/);
 fire('pointermove',{buttons:0,clientX:480,clientY:350});assert.match(view.get('measurementStatus').textContent,/Pinned angle.*90.0/);
 assert.ok(view.get('reviewOverlay').children.some(n=>n.attributes.class==='ruler-label-background'));
 view.get('rulerKind').value='distance';view.get('rulerKind').onchange();assert.doesNotMatch(view.get('reviewOverlay').textContent,/90.0/);
 fire('click',{clientX:400,clientY:300});fire('click',{clientX:440,clientY:300});assert.match(view.get('measurementStatus').textContent,/Pinned.*10.000/);
 assert.equal(view.get('reviewOverlay').children.filter(n=>n.attributes.class==='ruler-label-background').length,3);
});

test('toolbar search jumps to parts and nets without opening explorer or fetching on input',async()=>{
 const requests=[],view=workspaceRuntime(async request=>{requests.push(request.type);return[];},{navigation:true});view.load();
 const input=view.get('universalSearch');view.document.activeElement=input;assert.equal(input.parentElement.parentElement.id,'frameControls');input.value='R1';input.onfocus();
 assert.equal(view.get('designNavigator').hidden,true);assert.match(view.get('universalSearchResults').textContent,/R1/);
 input.onkeydown({key:'ArrowDown',preventDefault(){}});assert.equal(input.attributes['aria-activedescendant'],'universalResult0');input.onkeydown({key:'Enter',preventDefault(){}});
 assert.equal(view.get('selectedName').textContent,'R1');assert.equal(view.get('universalSearchResults').hidden,true);
 input.value='SIGNAL';input.oninput();await new Promise(resolve=>setTimeout(resolve,150));input.onkeydown({key:'Enter',preventDefault(){}});assert.equal(view.canvas.netHighlight.name,'SIGNAL');
 assert.equal(requests.includes('project-search-files'),false);view.workspace.dispose();
});
test('schematic toolbar search offers loaded sheet links and Escape leaves highlights intact',()=>{
 const file={path:'root.kicad_sch',content:'(kicad_sch (version 20250114) (uuid "root"))'},opened=[],view=workspaceRuntime(async()=>[],{navigation:true,pcb:false,files:[file],openSheet:path=>opened.push(path)});view.load();
 const input=view.get('universalSearch');input.value='root';input.onfocus();assert.match(view.get('universalSearchResults').textContent,/root.kicad_sch/);input.onkeydown({key:'Enter',preventDefault(){}});assert.deepEqual(opened,['root.kicad_sch']);
 input.onfocus();let stopped=false;input.onkeydown({key:'Escape',preventDefault(){},stopPropagation(){stopped=true;}});assert.equal(stopped,true);assert.equal(view.get('universalSearchResults').hidden,true);view.workspace.dispose();
});

test('net-class toggle loads only matching saved settings and restores standard drawing colors',async()=>{
 const requests=[],settings=JSON.stringify({net_settings:{classes:[{name:'Default'},{name:'Signal',pcb_color:'rgba(20,120,240,1)',schematic_color:'rgba(200,20,80,1)'}],netclass_assignments:{SIGNAL:'Signal'}}}),view=workspaceRuntime(async request=>{requests.push(request);if(request.type==='project-inventory')return{snapshotRef:'a'.repeat(40),files:[{path:'other.kicad_pro'},{path:'board.kicad_pro'}]};if(request.type==='project-file')return{content:settings};return[];},{navigation:true});view.load();assert.equal(view.canvas.netClassColors.size,0);
 await view.get('netClassColors').click();assert.equal(view.get('netClassColors').attributes['aria-pressed'],'true');const read=requests.find(r=>r.type==='project-file');assert.equal(read.file,'board.kicad_pro');assert.equal(read.ref,'a'.repeat(40));assert.ok([...view.canvas.netClassColors.values()].includes('rgba(20,120,240,1)'));assert.equal(requests.some(r=>r.type==='project-search-files'),false);
 await view.get('netClassColors').click();assert.equal(view.canvas.netClassColors.size,0);assert.equal(view.get('netClassColors').attributes['aria-pressed'],'false');view.workspace.dispose();
});
test('schematic net-class toggle colors connected wires and labels without recoloring unrelated artwork',async()=>{
 const file={path:'root.kicad_sch',content:'(kicad_sch (version 20250114) (uuid "root") (wire (pts (xy 10 10) (xy 20 10)) (uuid "wire")) (label "SIGNAL" (at 10 10 0) (effects (font (size 1 1))) (uuid "label")) (text "Keep normal" (at 30 30 0) (effects (font (size 1 1))) (uuid "text")))'},settings=JSON.stringify({net_settings:{classes:[{name:'Default',schematic_color:'rgba(200,20,80,1)',pcb_color:'rgba(20,120,240,1)'}]}}),view=workspaceRuntime(async request=>request.type==='project-inventory'?{files:[{path:'root.kicad_pro'}]}:request.type==='project-file'?{content:settings}:[],{navigation:true,pcb:false,files:[file]});view.load();await view.get('netClassColors').click();assert.ok([...view.canvas.netClassColors.keys()].some(p=>p.kind==='wire'));assert.ok([...view.canvas.netClassColors.values()].every(color=>color==='rgba(200,20,80,1)'));assert.ok([...view.canvas.netClassColors.keys()].every(p=>p.uuid!=='text'));view.workspace.dispose();
});
test('ambiguous settings need explicit selection and failed settings reads retain normal colors',async()=>{
 const reads=[],view=workspaceRuntime(async request=>{if(request.type==='project-inventory')return{files:[{path:'a.kicad_pro'},{path:'b.kicad_pro'}]};if(request.type==='project-file'){reads.push(request.file);throw Error('Unavailable');}return[];},{navigation:true});view.load();await view.get('netClassColors').click();assert.equal(reads.length,0);assert.equal(view.get('netColorProject').hidden,false);view.get('netColorProject').value='b.kicad_pro';await view.get('netColorProject').onchange();assert.deepEqual(reads,['b.kicad_pro']);assert.match(view.get('reviewNotice').textContent,/Unavailable/);assert.equal(view.canvas.netClassColors.size,0);view.workspace.dispose();
});
