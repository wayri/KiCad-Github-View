const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const workspace=fs.readFileSync(require.resolve('../review-workspace.js'),'utf8');
const source=workspace.slice(workspace.indexOf('    let nativeOpenBusy=false;'),workspace.indexOf('    const nativeGit='));
function setup(grant=true){
 const nodes=[],events={},messages=[],requests=[];
 function make(tag,text){const node={tag,textContent:text,children:[],style:{},isConnected:true,handlers:{},append(...items){this.children.push(...items);},setAttribute(k,v){this[k]=v;},addEventListener(k,fn){this.handlers[k]=fn;},showModal(){this.open=true;},close(){this.open=false;this.handlers.close?.();},remove(){this.isConnected=false;}};nodes.push(node);return node;}
 const tools=make('div'),body=make('body'),root={location:{protocol:'chrome-extension:',search:'?repository=owner%2Frepo&ref='+ 'a'.repeat(40)+'&file=root.kicad_sch'},addEventListener:(k,fn)=>events[k]=fn};let resolveOpen;
 const context={root,URLSearchParams,Promise,make,button:(text,fn)=>{const n=make('button',text);n.onclick=fn;return n;},$:()=>tools,document:{body},chrome:{runtime:{id:'a'.repeat(32),sendMessage:m=>{messages.push(m);return Promise.resolve({ok:true});}},permissions:{request:p=>{requests.push(p);return Promise.resolve(grant);}}},request:(type,args)=>{messages.push({type,...args});return new Promise(r=>resolveOpen=r);}};
 vm.runInNewContext(source,context);tools.children.find(n=>n.id==='openInKiCad').onclick();
 return{nodes,messages,requests,events,start:()=>nodes.find(n=>n.textContent==='Choose save location and open').onclick(),close:()=>nodes.find(n=>n.tag==='dialog').close(),resolve:()=>resolveOpen?.({opened:true})};
}
const tick=()=>new Promise(setImmediate);
test('desktop permission request starts in click and uses immutable URL context, not local paths',async()=>{
 const h=setup();h.start();assert.equal(h.requests.length,1);await tick();const message=h.messages.find(m=>m.type==='native-kicad-open');assert.equal(message.repository,'owner/repo');assert.equal(message.file,'root.kicad_sch');assert.equal(message.ref,'a'.repeat(40));assert.equal(message.confirmed,true);assert.equal(Object.hasOwn(message,'archivePath'),false);h.resolve();await tick();
});
test('denied permission does not download and pagehide cancels only owning operation',async()=>{
 const denied=setup(false);denied.start();await tick();assert.equal(denied.messages.length,0);
 const h=setup();h.start();await tick();h.events.pagehide();assert.equal(h.messages.at(-1).type,'native-kicad-cancel');assert.deepEqual(Object.keys(h.messages.at(-1)),['type']);h.resolve();await tick();
});
