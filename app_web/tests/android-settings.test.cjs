'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {normalize,themes,KEY}=require('../../android-app/web/settings.js');
test('KiCad presets keep PCB dark and schematic light while app chrome follows the choice',()=>{
 assert.deepEqual(themes({appearance:'kicad-light'},true,true),{ui:'light',drawing:'dark'});
 assert.deepEqual(themes({appearance:'kicad-dark'},false,false),{ui:'dark',drawing:'light'});
 assert.deepEqual(themes({appearance:'system'},true,false),{ui:'dark',drawing:'light'});
 assert.deepEqual(themes({appearance:'light'},true,true),{ui:'light',drawing:'light'});
 assert.deepEqual(themes({appearance:'dark'},false,false),{ui:'dark',drawing:'dark'});
 assert.deepEqual(themes({appearance:'kicad-dark',drawing:'dark'},false,false),{ui:'dark',drawing:'dark'});
 assert.deepEqual(normalize({appearance:'unknown',units:'inches',acceleration:'broken'}),{appearance:'system',drawing:'kicad',units:'mm',acceleration:'auto'});
});
function runtime(saved={appearance:'kicad-dark',drawing:'light',units:'mil',acceleration:'off'}){
 class Node extends EventTarget{
  constructor(tag){super();this.tagName=tag;this.children=[];this.dataset={};this.value='';this.open=false;this.className='';}
  setAttribute(key,value){this[key]=value;}append(...items){this.children.push(...items);}prepend(item){this.children.unshift(item);}click(){this.onclick?.();}focus(){this.focused=true;}showModal(){this.open=true;}close(){this.open=false;this.dispatchEvent(new Event('close'));}
  querySelector(selector){return this.children.find(node=>'.'+node.className===selector)||null;}
 }
 const body=new Node('body'),content=new Node('div');content.className='android-sheet-content';const menu=new Node('dialog');menu.id='appMenuDialog';menu.append(content);body.append(menu);let frameList=[],failed=false;
 const find=(node,id)=>node.id===id?node:node.children.map(child=>find(child,id)).find(Boolean);
 const document={body,readyState:'complete',location:{search:''},createElement:tag=>new Node(tag),getElementById:id=>find(body,id),querySelectorAll:selector=>selector==='iframe'?frameList:selector==='dialog[open]'?[menu,...body.children].filter(n=>n.tagName==='dialog'&&n.open):[]};
 const values=new Map([[KEY,JSON.stringify(saved)]]),media={matches:true,addEventListener(type,fn){this.change=fn;}},observers=[];
 const context={document,URLSearchParams,WeakSet,EventTarget,matchMedia:()=>media,MutationObserver:class{constructor(fn){this.fn=fn;observers.push(this);}observe(){}},localStorage:{getItem:key=>values.get(key),setItem(key,value){if(failed)throw Error('disk full');values.set(key,value);}},addEventListener(){}};
 vm.runInNewContext(fs.readFileSync('android-app/web/settings.js','utf8'),context);
 function drawing(pcb){const calls=[],nodes=new Map();for(const id of ['uiTheme','drawingTheme','rulerUnits','acceleration'])nodes.set(id,{value:id==='rulerUnits'?'mm':id==='acceleration'?'auto':'dark',onchange(){calls.push([id,this.value]);}});const doc={body:new Node('body'),location:{search:'?file='+encodeURIComponent(pcb?'board.kicad_pcb':'diagram.kicad_sch')},getElementById:id=>nodes.get(id),querySelectorAll:()=>[]};const frame=new Node('iframe');frame.contentDocument=doc;frameList.push(frame);return{frame,doc,nodes,calls};}
 return{context,document,menu,content,media,values,drawing,observers,failWrites(){failed=true;}};
}
test('dedicated menu settings persist, reuse viewer handlers, and reach new or nested frames',()=>{
 const r=runtime(),get=id=>r.document.getElementById(id),api=r.context.KiCadAndroidSettings;
 assert.equal(get('androidSettingsButton').textContent,'Settings');r.menu.open=true;get('androidSettingsButton').click();assert.equal(r.menu.open,false);assert.equal(get('androidSettingsDialog').open,true);
 const board=r.drawing(true);api.apply();assert.equal(board.nodes.get('drawingTheme').value,'light');assert.equal(board.nodes.get('rulerUnits').value,'mil');assert.equal(board.nodes.get('acceleration').value,'off');assert.ok(board.calls.length);const handlers=[...board.nodes.values()].map(n=>n.onchange);api.apply();assert.deepEqual([...board.nodes.values()].map(n=>n.onchange),handlers);
 const appearance=get('androidSettingAppearance');appearance.value='light';appearance.onchange();assert.equal(JSON.parse(r.values.get(KEY)).appearance,'light');assert.equal(r.document.body.dataset.uiTheme,'light');assert.equal(board.doc.body.dataset.uiTheme,'light');
 const drawing=get('androidSettingDrawing');drawing.value='dark';drawing.onchange();assert.equal(board.nodes.get('drawingTheme').value,'dark');
 const schematic=r.drawing(false);r.observers[0].fn();schematic.frame.dispatchEvent(new Event('load'));assert.equal(schematic.nodes.get('drawingTheme').value,'dark');assert.equal(schematic.nodes.get('uiTheme').value,'light');
 api.update('appearance','system');r.media.matches=false;r.media.change();assert.equal(r.document.body.dataset.uiTheme,'light');r.media.matches=true;r.media.change();assert.equal(r.document.body.dataset.uiTheme,'dark');
 get('androidSettingsDialog').close();assert.equal(get('androidSettingsButton').focused,true);
});
test('failed preference saves preserve the previous settings and report the failure',()=>{
 const r=runtime(),api=r.context.KiCadAndroidSettings;r.failWrites();assert.equal(api.update('appearance','light'),false);assert.equal(api.get().appearance,'kicad-dark');assert.match(r.document.getElementById('androidSettingsStatus').textContent,/could not be saved/);
});
test('drawing overrides survive DOM mutations until an explicit app setting change',()=>{
 const r=runtime(),api=r.context.KiCadAndroidSettings,board=r.drawing(true);api.apply();
 const theme=board.nodes.get('drawingTheme');theme.value='dark';theme.onchange();
 for(const observer of r.observers)observer.fn();
 assert.equal(theme.value,'dark','background DOM changes must not undo the drawing control');
 api.update('drawing','light');assert.equal(theme.value,'light','explicit app settings apply to existing drawings');
 const units=board.nodes.get('rulerUnits');units.value='mm';units.onchange=()=>{};api.apply();assert.equal(units.value,'mil','late-installed handlers receive saved defaults');
 assert.equal(r.document.getElementById('androidSettingAppearance')['aria-label'],'App theme');
});
