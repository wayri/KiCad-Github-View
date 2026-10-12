const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const code=fs.readFileSync(require.resolve('../local-runtime.js'),'utf8');
function runtime(parent){const handlers={},calls=[],storage=new Map(),context={location:{origin:'http://127.0.0.1:1234'},parent,document:{addEventListener:(name,fn)=>handlers[name]=fn,getElementById:()=>null},chrome:{runtime:{id:'original'}}};context.window=context;
 const host={transport:{send:async m=>{calls.push(m);return{ok:true,result:[]};}},storage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},assetURL:n=>'http://127.0.0.1:1234/'+n,openDrawing:p=>calls.push(p),openProject:()=>calls.push('project'),openURL:p=>calls.push(p),importDrop:data=>calls.push(data)};
 if(parent===true)context.parent={location:context.location,KiCadLocalWorkspace:host};if(parent==='self')context.parent=context;
 vm.runInNewContext(code,context);return{context,host,handlers,calls};}
test('local runtime is a no-op outside a same-origin local workspace',()=>{
 for(const parent of ['self',{location:{origin:'https://other.example'},KiCadLocalWorkspace:{}},{location:{origin:'http://127.0.0.1:1234'}}]){const{context}=runtime(parent);assert.equal(context.chrome.runtime.id,'original');assert.equal(context.KiCadLocalRuntime,undefined);}
});
test('local frame bridge retains nested transport, routes local drawing tools and uses separate preferences',async()=>{
 const{context,host,calls,handlers}=runtime(true);assert.equal(context.KiCadLocalWorkspace,host);assert.equal(context.chrome.runtime.getURL('pcb-viewer.html'),'http://127.0.0.1:1234/pcb-viewer.html');
 await context.chrome.runtime.sendMessage({type:'open-project-drawing',file:'board.kicad_pcb'});await context.chrome.runtime.sendMessage({type:'open-project-overview'});assert.deepEqual(calls,['board.kicad_pcb','project']);
 await context.chrome.storage.local.set({theme:'dark'});assert.equal((await context.chrome.storage.local.get('theme')).theme,'dark');await context.chrome.storage.local.remove('theme');assert.equal((await context.chrome.storage.local.get('theme')).theme,null);
 assert.equal(context.open('calculator-viewer.html'),null);assert.equal(calls.at(-1),'calculator-viewer.html');
 let prevented=false;const dataTransfer={types:['Files']};handlers.drop({dataTransfer,preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(calls.at(-1),dataTransfer);
});
