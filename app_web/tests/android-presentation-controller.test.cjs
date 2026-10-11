const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('android-app/web/presentation.js','utf8'),adaptive=fs.readFileSync('android-app/web/adaptive-ui.js','utf8');
function fixture(){
 function make(tag){const classes=new Set();return{tagName:tag.toUpperCase(),children:[],hidden:false,attrs:{},value:'',textContent:'',listeners:{},classList:{contains:k=>classes.has(k),add:k=>classes.add(k),remove:k=>classes.delete(k),toggle(k,v){if(v)classes.add(k);else classes.delete(k);}},append(...nodes){this.children.push(...nodes);},prepend(node){this.children.unshift(node);},replaceChildren(){this.children=[];},setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k];},getClientRects(){return this.hidden?[]:[{width:400,height:300}];},querySelector(){return null;},closest(){return null;},addEventListener(k,f){this.listeners[k]=f;},showModal(){this.open=true;},close(){this.open=false;},click(){if(!this.disabled)this.onclick?.();}};}
 const walk=n=>[n,...n.children.flatMap(walk)];
 function doc(home){const body=make('body');if(home)body.classList.add('android-home');const listeners={};const doc={body,readyState:'complete',createElement:make,getElementById:id=>walk(body).find(n=>n.id===id),querySelector(){return null;},querySelectorAll(selector){const nodes=walk(body);if(selector==='iframe')return nodes.filter(n=>n.tagName==='IFRAME');if(selector==='dialog[open]')return nodes.filter(n=>n.tagName==='DIALOG'&&n.open);if(selector==='#workspaceTabs button')return walk(doc.getElementById('workspaceTabs')).filter(n=>n.tagName==='BUTTON');return[];},addEventListener(k,f){listeners[k]=f;},listeners,defaultView:{Event:class{constructor(type){this.type=type;}},dispatchEvent(){}}};return doc;}
 const document=doc(true),drawing=doc(false),frame=make('iframe');frame.contentDocument=drawing;frame.isConnected=true;drawing.defaultView.frameElement=frame;document.body.append(frame);
 const select=make('select');select.id='sheetSelect';select.options=[{text:'Root'},{text:'Power'},{text:'IO'}];select.selectedIndex=0;let changes=0;select.dispatchEvent=()=>{changes++;name.textContent=select.options[select.selectedIndex].text;};
 const name=make('span');name.id='activeSheet';name.textContent='Root';const pane=make('section');pane.hidden=true;drawing.body.append(select,name,pane);drawing.body.classList.add('original-class');
 const modal=make('dialog');modal.open=true;document.body.append(modal);const calls=[],events={};const slides=[{id:'a',title:'First',notes:'Notes',image:'data:image/png;base64,a'},{id:'b',title:'Second',notes:'',image:'data:image/png;base64,b'}];
 const context={document,KiCadAndroidProject:{id:'project'},localStorage:{},KiCadAndroidPresentationDeck:{create:()=>({load:()=>slides,list:()=>slides})},AndroidKiCad:{setPresentation:v=>calls.push(v)},MutationObserver:class{observe(){}},queueMicrotask,addEventListener(k,f){events[k]=f;}};context.top=context;vm.createContext(context);vm.runInContext(source,context);
 return{context,document,drawing,frame,select,pane,modal,calls,events,api:context.KiCadAndroidPresentation,get changes(){return changes;},node:id=>document.getElementById(id),key(key,target=null){let prevented=false;context.KiCadAndroidPresentation.key({key,target,preventDefault(){prevented=true;},stopImmediatePropagation(){}});return prevented;}};
}
test('live walkthrough toggles presentation chrome and restores existing pane states',()=>{
 const f=fixture();assert.equal(f.api.isActive(),false);f.api.start();assert.equal(f.modal.open,false);assert.equal(f.api.isActive(),true);assert.equal(f.node('androidPresentationBar').hidden,false);assert.equal(f.drawing.body.classList.contains('android-presenting'),true);
 assert.equal(f.pane.hidden,true);assert.equal(f.api.stop(),true);assert.equal(f.api.stop(),false);assert.equal(f.drawing.body.classList.contains('android-presenting'),false);assert.equal(f.drawing.body.classList.contains('original-class'),true);assert.equal(f.pane.hidden,true);assert.deepEqual(f.calls,[true,false]);
});
test('live next and previous navigate source sheets with bounded selection and preserve text editing',()=>{
 const f=fixture();f.api.start();f.key('ArrowRight');assert.equal(f.select.selectedIndex,1);assert.equal(f.node('presentationPageName').textContent,'Power');f.key('PageDown');f.key('PageDown');assert.equal(f.select.selectedIndex,2);f.key('ArrowLeft');assert.equal(f.select.selectedIndex,1);
 assert.equal(f.key('ArrowRight',{closest:()=>({})}),false);assert.equal(f.select.selectedIndex,1);assert.equal(f.key('Escape'),true);assert.equal(f.api.isActive(),false);
});
test('deck playback advances captured slides without navigating source sheets',()=>{
 const f=fixture();f.api.start('deck');assert.equal(f.node('androidSlideStage').hidden,false);assert.equal(f.node('presentationPageName').textContent,'1 / 2');f.key('ArrowRight');assert.equal(f.node('presentationPageName').textContent,'2 / 2');assert.equal(f.node('androidSlideStage').children[0].textContent,'Second');assert.equal(f.select.selectedIndex,0);assert.equal(f.changes,0);f.key('ArrowLeft');assert.equal(f.node('presentationPageName').textContent,'1 / 2');f.api.stop();assert.equal(f.node('androidSlideStage').hidden,true);
});
test('Android Back exits presentation before returning to project home',()=>{
 const f=fixture();f.document.readyState='loading';vm.runInContext(adaptive,f.context);f.api.start();assert.equal(f.context.KiCadAndroidUI.handleBack(),true);assert.equal(f.api.isActive(),false);assert.deepEqual(f.calls,[true,false]);
});
test('home and project change stop active presentation and close slide editor',()=>{
 for(const event of ['kicad-project-home','kicad-project-opened']){const f=fixture();f.api.start();f.node('androidSlideEditor').open=true;f.events[event]();assert.equal(f.api.isActive(),false);assert.equal(f.node('androidSlideEditor').open,false);}
});
