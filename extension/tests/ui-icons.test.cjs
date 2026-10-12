const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function host(){
 class Node{
  constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attributes={};this.id='';this.classList={add(){}};this.namespaceURI='http://www.w3.org/2000/svg';this._text='';}
  get childElementCount(){return this.children.length;}
  get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}
  set textContent(value){this._text=value;this.children=[];}
  setAttribute(name,value){this.attributes[name]=value;}
  getAttribute(name){return this.attributes[name]??null;}
  hasAttribute(name){return name in this.attributes;}
  append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);}}
  prepend(n){n.parent=this;this.children.unshift(n);}
  replaceChildren(...nodes){this._text='';this.children=[];this.append(...nodes);}
  replaceWith(n){const i=this.parent.children.indexOf(this);n.parent=this.parent;this.parent.children[i]=n;}
  matches(selector){return selector==='[data-icon]'?!!this.dataset.icon:selector===this.tagName.toLowerCase();}
  querySelectorAll(selector){const result=[];for(const n of this.children){if(selector==='[data-icon]'?n.dataset.icon:selector==='.button-label'?n.className==='button-label':n.tagName===selector.toUpperCase())result.push(n);result.push(...n.querySelectorAll(selector));}return result;}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 }
 let ready;
 const document={readyState:'loading',createElement:tag=>new Node(tag),createElementNS:(ns,tag)=>new Node(tag),head:new Node('head'),body:new Node('body'),getElementById:()=>null,addEventListener:(event,fn)=>{ready=fn;},querySelectorAll:selector=>document.body.querySelectorAll(selector)};
 const root={document,MutationObserver:class{observe(){}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../ui-icons.js'),'utf8'),root);
 return{document,api:root.KiCadUIIcons,start:()=>ready()};
}

test('engineering menu actions retain their accessible names and click handlers',()=>{
 const{document,api,start}=host();
 for(const label of ['Engineering calculators','PDF viewer','Gerber viewer & analyzer','Calculate','Show all','Hide all','Run analysis','Export JSON','BoM manager']){
  const button=document.createElement('button');button.textContent=label;button.onclick=()=>label;document.body.append(button);
 }
 start();
 for(const button of document.body.children){assert.ok(button.querySelector('svg'));assert.equal(button.getAttribute('aria-label'),button.onclick());assert.equal(button.title,button.onclick());assert.ok(button.querySelector('.button-label').textContent);}
 assert.equal(document.body.children[0].dataset.icon,'calculator');assert.equal(document.body.children[4].dataset.icon,'eye');assert.equal(document.body.children[5].dataset.icon,'eye-off');
});

test('explicit visibility icons update without replacing button labels or handlers',()=>{
 const{document,api}=host(),button=document.createElement('button');button.textContent='Show DRC markers';button.dataset.icon='eye';button.onclick=()=>42;document.body.append(button);api.decorate(button);
 const label=button.querySelector('.button-label'),visible=button.querySelector('path').getAttribute('d');
 button.dataset.icon='eye-off';api.decorate(button);
 assert.notEqual(button.querySelector('path').getAttribute('d'),visible);assert.equal(button.querySelector('.button-label'),label);assert.equal(button.onclick(),42);assert.equal(button.getAttribute('aria-label'),'Show DRC markers');assert.equal(button.querySelectorAll('svg').length,1);
});

test('rich rows and preexisting custom SVGs survive decoration',()=>{
 const{document,api,start}=host(),rich=document.createElement('button');rich.textContent='Calculate';const input=document.createElement('input');rich.append(input);document.body.append(rich);
 const custom=document.createElement('button'),svg=document.createElementNS('', 'svg');custom.dataset.icon='drc';custom.append(svg);document.body.append(custom);
 start();api.decorate(document);assert.equal(rich.children[0],input);assert.equal(custom.children[0],svg);
});

test('dedicated tool, rule and visibility paths do not fall back to parts',()=>{
 const{paths}=require('../ui-icons.js');for(const name of ['calculator','pdf','erc','drc','eye','eye-off','tools']){assert.ok(paths[name]);assert.notEqual(paths[name],paths.parts);}
 assert.notEqual(paths.erc,paths.drc);assert.notEqual(paths.eye,paths['eye-off']);
});
