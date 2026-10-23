const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');

const script=fs.readFileSync(path.join(__dirname,'../../android-app/web/engineering-tools.js'),'utf8');

function harness({drawing=false,picker=false}={}){
 const nodes=new Map(),listeners=new Map(),children=[];
 const element=(tag='div')=>({tagName:tag.toUpperCase(),hidden:false,open:false,children:[],append(...items){this.children.push(...items);},
  removeAttribute(name){if(name==='src')this.src='';},after(next){const at=children.indexOf(this);children.splice(at+1,0,next);nodes.set(next.id,next);}});
 const viewer=element('iframe');viewer.id='viewer';viewer.hidden=!drawing;
 viewer._src=drawing?'revision-viewer.html?file=Marble.kicad_pcb':'';viewer.srcWrites=0;
 Object.defineProperty(viewer,'src',{get(){return this._src;},set(value){this.srcWrites++;this._src=value;}});
 const drawingState={camera:{zoom:8,x:41,y:22},selected:{uuid:'pad-3'}};
 viewer.contentWindow=drawingState;viewer.contentDocument={identity:'original drawing document'};
 children.push(viewer);nodes.set('viewer',viewer);
 const welcome=element('main');welcome.hidden=drawing||picker;nodes.set('welcome',welcome);
 const projectPicker=element('details');projectPicker.hidden=!picker;projectPicker.open=picker;nodes.set('projectPicker',projectPicker);
 const document={readyState:'complete',getElementById:id=>nodes.get(id),querySelector:()=>null,
  querySelectorAll:selector=>selector==='dialog[open]'?[]:[],createElement:element};
 let baseBacks=0,homeCalls=0;
 const navigate=(page,file)=>{viewer.src=page+'?file='+file;viewer.hidden=false;welcome.hidden=true;projectPicker.hidden=true;};
 const android={openAnalysis:file=>navigate('analysis-viewer.html',file),openDrawing:file=>navigate('browser-viewer.html',file),
  openProject:file=>navigate('project-viewer.html',file),
  showHome(){homeCalls++;viewer.hidden=true;welcome.hidden=false;projectPicker.hidden=true;}};
 const ui={handleBack(){baseBacks++;return false;}};
 const context={document,URLSearchParams,KiCadAndroid:android,KiCadAndroidUI:ui,
  addEventListener:(name,listener)=>listeners.set(name,listener),KiCadAndroidProject:{id:'marble',github:{repository:'wayri/Marble',sha:'b'.repeat(40)}}};
 vm.runInNewContext(script,context);
 return{context,nodes,children,viewer,welcome,picker:projectPicker,drawingState,listeners,
  get tool(){return nodes.get('engineeringToolViewer');},get baseBacks(){return baseBacks;},get homeCalls(){return homeCalls;}};
}

test('calculator, BoM, PDF and Gerber visits preserve the mounted drawing and return context',()=>{
 const h=harness({drawing:true}),originalDocument=h.viewer.contentDocument,originalWindow=h.viewer.contentWindow;
 const pages=['calculator-viewer.html','bom-viewer.html','pdf-viewer.html','gerber-viewer.html'];
 assert.equal(h.children.length,2);
 for(const page of pages){
  h.context.KiCadAndroid.openTools(page);
  assert.equal(h.tool.src.split('?')[0],page);
  assert.equal(h.tool.hidden,false);
  assert.equal(h.viewer.hidden,true);
  assert.equal(h.context.KiCadAndroidUI.handleBack(),true);
  assert.equal(h.tool.hidden,true);
  assert.equal(h.viewer.hidden,false);
  assert.equal(h.welcome.hidden,true);
  assert.equal(h.viewer.src,'revision-viewer.html?file=Marble.kicad_pcb');
  assert.equal(h.viewer.srcWrites,0);
  assert.equal(h.viewer.contentDocument,originalDocument);
  assert.equal(h.viewer.contentWindow,originalWindow);
  assert.equal(h.drawingState.camera.zoom,8);
  assert.equal(h.drawingState.selected.uuid,'pad-3');
 }
 assert.equal(h.children.length,2,'tool navigation reuses one sibling frame');
 assert.equal(h.baseBacks,0,'native Back is consumed by the active tool');
});

test('switching tools keeps the first drawing return state; tool subsection Back stays in tool',()=>{
 const h=harness({drawing:true});
 h.context.KiCadAndroid.openTools('calculator-viewer.html');
 h.context.KiCadAndroid.openTools('pdf-viewer.html','docs/manual.pdf','c'.repeat(40));
 assert.equal(new URLSearchParams(h.tool.src.split('?')[1]).get('file'),'docs/manual.pdf');
 assert.equal(new URLSearchParams(h.tool.src.split('?')[1]).get('ref'),'c'.repeat(40));
 let subsection=1;h.tool.contentWindow={KiCadSectionPages:{back(){if(subsection){subsection--;return true;}return false;}}};
 assert.equal(h.context.KiCadAndroidUI.handleBack(),true);
 assert.equal(h.tool.hidden,false,'first Back returns from the PDF subsection');
 assert.equal(h.context.KiCadAndroidUI.handleBack(),true);
 assert.equal(h.tool.hidden,true);
 assert.equal(h.viewer.hidden,false);
 assert.equal(h.viewer.srcWrites,0);
});

test('tool modal Back closes the modal before leaving the tool',()=>{
 const h=harness({drawing:true});h.context.KiCadAndroid.openTools('gerber-viewer.html');
 const modal={closed:false,close(){this.closed=true;}};
 h.tool.contentDocument={querySelectorAll:()=>modal.closed?[]:[modal]};
 assert.equal(h.context.KiCadAndroidUI.handleBack(),true);
 assert.equal(modal.closed,true);
 assert.equal(h.tool.hidden,false);
 assert.equal(h.context.KiCadAndroidUI.handleBack(),true);
 assert.equal(h.tool.hidden,true);
});

test('home and project picker launches restore their exact prior visibility',()=>{
 const home=harness();
 home.context.KiCadAndroid.openTools('calculator-viewer.html');
 assert.equal(home.welcome.hidden,true);
 assert.equal(home.context.KiCadAndroidUI.handleBack(),true);
 assert.equal(home.welcome.hidden,false);
 assert.equal(home.viewer.hidden,true);
 assert.equal(home.viewer.srcWrites,0);
 const picker=harness({picker:true});
 picker.context.KiCadAndroid.openTools('bom-viewer.html');
 picker.context.KiCadAndroid.closeTools();
 assert.equal(picker.picker.hidden,false);
 assert.equal(picker.picker.open,true);
 assert.equal(picker.viewer.hidden,true);
});

test('showHome and a new project invalidate stale tool return state',()=>{
 const h=harness({drawing:true});
 h.context.KiCadAndroid.openTools('pdf-viewer.html');
 h.context.KiCadAndroid.showHome();
 assert.equal(h.tool.hidden,true);
 assert.equal(h.welcome.hidden,false);
 assert.equal(h.homeCalls,1);
 h.context.KiCadAndroid.closeTools();
 assert.equal(h.viewer.hidden,true,'stale drawing state is not restored after Home');
 h.context.KiCadAndroid.openTools('gerber-viewer.html');
 h.listeners.get('kicad-project-opened')();
 assert.equal(h.tool.hidden,true);
 h.context.KiCadAndroid.closeTools();
 assert.equal(h.viewer.hidden,true,'stale state is not restored after project replacement');
});

test('tool requests to open a drawing, project or report leave no stale return snapshot',()=>{
 const h=harness();
 for(const [name,file,page]of [['openDrawing','board.kicad_pcb','browser-viewer.html'],
  ['openProject','Marble.kicad_pro','project-viewer.html'],['openAnalysis','thermal.csv','analysis-viewer.html']]){
  h.context.KiCadAndroid.openTools('calculator-viewer.html');
  h.context.KiCadAndroid[name](file);
  assert.equal(h.tool.hidden,true);
  assert.equal(h.viewer.hidden,false);
  assert.equal(h.viewer.src,page+'?file='+file);
  h.context.KiCadAndroid.closeTools();
  assert.equal(h.viewer.hidden,false,'closing an obsolete tool cannot hide the newly opened page');
 }
});
