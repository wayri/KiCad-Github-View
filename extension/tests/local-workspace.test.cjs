const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function localFrame(){
 class Element extends EventTarget{constructor(){super();this.children=[];this.value='';this.hidden=false;this.style={};this.dataset={};this.attributes={};this.text='';}append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;this.text='';}setAttribute(k,v){this.attributes[k]=String(v);}set textContent(v){this.text=String(v);this.children=[];}get textContent(){return this.text+this.children.map(n=>n.textContent).join(' ');}getBoundingClientRect(){return{left:0,top:0,width:800,height:600};}}
 const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},requests=[],messages=[],network=[];
 const items=new Map(),storage={getItem:key=>items.get(key)||null,setItem:(key,value)=>items.set(key,value),removeItem:key=>items.delete(key)};
 const classList={add(){},remove(){},toggle(){return false;},contains(){return false;}};
 const context={URL,URLSearchParams,TextEncoder,TextDecoder,AbortController,console,location:{origin:'http://127.0.0.1:8765',search:'?repository=local/fixture&ref='+ 'a'.repeat(40)+'&file=board.kicad_pcb&projectOnly=1'},document:{getElementById:get,createElement:()=>new Element(),createElementNS:()=>new Element(),querySelector:()=>null,addEventListener(){},body:{dataset:{},classList},documentElement:{style:{}}},addEventListener(){},fetch:(...args)=>{network.push(args);throw Error('Offline integration must not fetch remote data.');},KiCadReviewComments:require('../review-comments.js'),KiCadReviewWorkspace:require('../review-workspace.js'),KiCadGitHub:require('../parsing.js'),KiCadProjectSettings:require('../project-settings.js'),KiCadProjectSettingsUI:require('../project-settings-ui.js'),KiCadGerberRenderer:require('../gerber-renderer.js'),KiCadUIIcons:{decorate(){}}};
 context.window=context;
 vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../local-project.js'),'utf8'),context);
 const project=context.KiCadLocalProject.validate({id:'fixture',files:[{path:'board.kicad_pcb',content:'(kicad_pcb (version 20240108) (layers (0 "F.Cu" signal) (31 "B.Cu" signal)))'},{path:'root.kicad_sch',content:'(kicad_sch (version 20250114) (uuid "root"))'},{path:'board.kicad_pro',content:'{}'}],assets:[]});
 const transport=context.KiCadLocalProject.transport(project,storage,{local:true,ref:'a'.repeat(40)});
 context.parent={location:{origin:context.location.origin},postMessage:(message,origin)=>messages.push({message,origin}),KiCadLocalWorkspace:{transport:{send:m=>{requests.push(m);return transport.send(m);}},storage,assetURL:n=>context.location.origin+'/'+n,openDrawing(){},openProject(){},openURL(){},importDrop(){}}};
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../local-runtime.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../project-viewer.js'),'utf8'),context);
 return{context,get,requests,messages,network};
}
test('shared project viewer discovers local sources through the real local frame bridge without KiCad or network',async()=>{
 const f=localFrame();await tick();await tick();
 assert.equal(f.context.KiCadLocalRuntime,true);assert.equal(f.context.KiCadLocalWorkspace,f.context.parent.KiCadLocalWorkspace);
 assert.deepEqual(f.requests.map(r=>r.type),['project-inventory','project-file']);assert.equal(f.requests[0].repository,'local/fixture');assert.equal(f.requests[1].file,'board.kicad_pcb');
 assert.match(f.get('fileTree').textContent,/board.kicad_pcb/);assert.match(f.get('fileTree').textContent,/root.kicad_sch/);assert.match(f.get('projectStatus').textContent,/Viewing saved source/);assert.equal(f.get('drawingPreview').children.length,0,'projectOnly avoids an unbridged browser-viewer wrapper');assert.equal(f.network.length,0);assert.equal(f.messages.at(-1).message.type,'kicad-review:project-ready');
});
test('local transport rejects provider publication and foreign source requests without network',async()=>{
 const f=localFrame();await tick();
 const publish=await f.context.chrome.runtime.sendMessage({type:'github-comment-publish',repository:'local/fixture',ref:'a'.repeat(40)});assert.equal(publish.ok,false);assert.match(publish.error,/unavailable|extension|integration/i);
 const foreign=await f.context.chrome.runtime.sendMessage({type:'project-inventory',repository:'foreign/project',ref:'a'.repeat(40)});assert.equal(foreign.ok,false);assert.match(foreign.error,/another imported project/);assert.equal(f.network.length,0);
});
