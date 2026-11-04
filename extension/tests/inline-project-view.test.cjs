const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {create}=require('../inline-project-view.js');
class Node {
 constructor(tag){this.tag=tag;this.children=[];this.parentNode=null;this.attributes={};this.listeners=new Map();this.disabled=false;this.style={};this.textContent='';}
 get isConnected(){return this.tag==='html'||Boolean(this.parentNode?.isConnected);}
 attachShadow(options){this.shadow=new Node('shadow');this.shadow.parentNode=this;this.shadowMode=options.mode;return this.shadow;}
 append(...nodes){for(const node of nodes){node.remove();node.parentNode=this;this.children.push(node);}}
 prepend(node){node.remove();node.parentNode=this;this.children.unshift(node);}
 remove(){if(this.parentNode){this.parentNode.children.splice(this.parentNode.children.indexOf(this),1);this.parentNode=null;}}
 setAttribute(k,v){this.attributes[k]=v;}
 addEventListener(type,fn){this.listeners.set(type,fn);}
 removeEventListener(type,fn){if(this.listeners.get(type)===fn)this.listeners.delete(type);}
 scrollIntoView(){this.scrolled=true;}
 focus(){this.focused=true;}
}
const walk=node=>[node,...node.children.flatMap(walk),...(node.shadow?walk(node.shadow):[])];
function harness({respond,source='https://github.com/owner/private',protocol='chrome-extension:'}={}){
 const html=new Node('html'),body=new Node('body'),main=new Node('main'),sourceNode=new Node('pre'),focus=new Node('button');html.append(body);body.append(main);main.append(focus,sourceNode);const events=new Node('events'),requests=[],observers=[];
 const location={href:source},document={body,documentElement:html,activeElement:focus,createElement:tag=>new Node(tag),querySelector:selector=>selector==='main'?main:null,addEventListener:(...args)=>body.addEventListener(...args),removeEventListener:(...args)=>body.removeEventListener(...args)};
 const runtime={getURL:name=>protocol+'//self/'+name,sendMessage:async message=>{requests.push(message);return respond?respond(message):{ok:true};}};
 class Observer {constructor(callback){this.callback=callback;observers.push(this);}observe(){this.active=true;}disconnect(){this.active=false;}}
 const controller=create({document,location,runtime,MutationObserver:Observer,events});const url=runtime.getURL('project-viewer.html?repository=owner%2Fprivate&ref='+ 'a'.repeat(40)+'&file=board.kicad_pro');
 return{controller,html,main,focus,sourceNode,location,events,document,requests,observers,url,find:predicate=>walk(html).find(predicate)};
}
test('explicit in-page mount keeps original source and uses an isolated extension frame',()=>{
 const h=harness();assert.equal(h.main.children.length,2);assert.deepEqual(h.controller.open({url:h.url,sourceUrl:h.location.href}),{opened:true,mode:'inline'});
 const host=h.main.children[0],frame=h.find(n=>n.tag==='iframe');assert.equal(host.shadowMode,'closed');assert.equal(frame.src,h.url);assert.equal(frame.referrerPolicy,'no-referrer');assert.equal(h.sourceNode.isConnected,true);assert.equal(h.sourceNode.hidden,undefined);assert.equal(h.requests.length,0);assert.equal(h.find(n=>n.className==='bar').children.length,3);
 assert.equal(h.controller.close(),true);assert.equal(frame.isConnected,false);assert.equal(h.sourceNode.isConnected,true);assert.equal(h.focus.focused,true);assert.equal(h.observers[0].active,false);assert.equal(h.events.listeners.size,0);assert.equal(h.controller.close(),false);
});
test('new explicit open replaces one owned viewer without duplicating source or observers',()=>{
 const h=harness();h.controller.open({url:h.url});const old=h.find(n=>n.tag==='iframe');h.controller.open({url:h.url.replace('project-viewer.html','browser-viewer.html')});assert.equal(old.isConnected,false);assert.equal(h.main.children.length,3);assert.equal(h.observers[0].active,false);assert.equal(h.observers[1].active,true);assert.equal(h.sourceNode.isConnected,true);
});
test('navigation and external host removal dispose the old view and do not steal focus',()=>{
 for(const cause of ['navigation','remove','pagehide','turbo']){const h=harness();h.controller.open({url:h.url});const frame=h.find(n=>n.tag==='iframe');if(cause==='navigation'){h.location.href+='?new=1';h.observers[0].callback();}if(cause==='remove'){h.main.children[0].remove();h.observers[0].callback();}if(cause==='pagehide')h.events.listeners.get('pagehide')();if(cause==='turbo')h.document.body.listeners.get('turbo:before-visit')();assert.equal(frame.isConnected,false,cause);assert.equal(h.focus.focused,undefined,cause);assert.equal(h.observers[0].active,false,cause);}
});
test('only this extension’s allowlisted viewer pages can be embedded',()=>{
 const h=harness();for(const url of ['https://github.com/owner/private','javascript:alert(1)','data:text/html,bad','chrome-extension://other/project-viewer.html','chrome-extension://self/options.html','chrome-extension://self/project-viewer.html#fragment','chrome-extension://name:secret@self/project-viewer.html','chrome-extension://self/nested/project-viewer.html'])assert.throws(()=>h.controller.open({url}),/viewer/i,url);
 assert.throws(()=>h.controller.open({url:h.url,sourceUrl:'https://github.com/other/repo'}),/navigation changed/);assert.equal(h.main.children.length,2);
 const firefox=harness({protocol:'moz-extension:'});assert.doesNotThrow(()=>firefox.controller.open({url:firefox.url}));
});
test('pop out requests the background once and only closes after its successful response',async()=>{
 const h=harness();h.controller.open({url:h.url});const button=h.find(n=>n.textContent==='Open in tab');await button.listeners.get('click')();assert.deepEqual(h.requests,[{type:'inline-project-open-tab',url:h.url}]);assert.equal(h.find(n=>n.tag==='iframe'),undefined);assert.equal(h.sourceNode.isConnected,true);
 const blocked=harness({respond:()=>({ok:false,error:'Administrator restricted this action.'})});blocked.controller.open({url:blocked.url});const blockedButton=blocked.find(n=>n.textContent==='Open in tab');await blockedButton.listeners.get('click')();assert.equal(blocked.find(n=>n.tag==='iframe').isConnected,true);assert.equal(blockedButton.disabled,false);assert.match(blocked.find(n=>n.className==='status').textContent,/Administrator restricted/);
});
test('page senders cannot issue open commands or access a generic postMessage bridge',()=>{
 const h=harness();let listener;const runtime={id:'self',getURL:name=>'chrome-extension://self/'+name,onMessage:{addListener:fn=>{listener=fn;}},sendMessage:async()=>({ok:true})};
 const context={document:h.document,location:h.location,chrome:{runtime},URL,MutationObserver:class{observe(){}disconnect(){}},addEventListener(){},removeEventListener(){}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../inline-project-view.js'),'utf8'),context);let replies=0;for(const sender of [{id:'evil'},{id:'self',tab:{id:9}},{tab:{id:9}},{}])assert.equal(listener({type:'inline-project-open',url:h.url},sender,()=>replies++),false);assert.equal(replies,0);assert.equal(h.main.children.length,2);
 listener({type:'inline-project-open',url:h.url},{id:'self'},reply=>{assert.equal(reply.ok,true);replies++;});assert.equal(replies,1);assert.equal(h.main.children.length,3);assert.equal(h.events.listeners.has('message'),false);
});

test('actual project launcher is accepted and embed failure keeps the independent-tab fallback visible',()=>{
 const h=harness();h.controller.open({url:h.url.replace('project-viewer.html','project-launcher.html')});const frame=h.find(n=>n.tag==='iframe');frame.listeners.get('error')();assert.match(h.find(n=>n.className==='status').textContent,/Use Open in tab/);assert.equal(h.find(n=>n.textContent==='Open in tab').disabled,false);assert.throws(()=>h.controller.open({url:h.url.replace('project-viewer.html','project-launch.html')}),/viewer/i);
});
