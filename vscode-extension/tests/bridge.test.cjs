const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const script=fs.readFileSync(path.join(__dirname,"../webview-bridge.js"),"utf8");
function harness() {
  const events={},outgoing=[],dispatched=[],timers=new Map(),token="a".repeat(48);let n=0;
  const window={},host={},sandbox={window,globalThis:null,KiCadVSCodeContext:{token},location:{origin:"https://viewer.example",href:"https://viewer.example/index.html"},URL,
    CustomEvent:class{constructor(type,options={}){this.type=type;this.detail=options.detail;}},dispatchEvent:(event)=>dispatched.push(event),
    acquireVsCodeApi:()=>({postMessage:(m)=>outgoing.push(m)}),addEventListener:(name,fn)=>{events[name]=fn;},
    setTimeout:(fn)=>{timers.set(++n,fn);return n;},clearTimeout:(id)=>timers.delete(id)};
  sandbox.globalThis=sandbox;vm.runInNewContext(script,sandbox);
  const respond=(msg,changes={})=>events.message({source:host,origin:sandbox.location.origin,data:{channel:"kicad-vscode:v1",token,id:msg.id,reply:{ok:true,result:"ok"}},...changes});
  return {sandbox,events,outgoing,dispatched,timers,respond,host,token};
}
test("actual VS Code same-origin enclosing sender is accepted; origin/token/session sender mismatch ignored",async()=> {
  const h=harness(),promise=h.sandbox.chrome.runtime.sendMessage({type:"project"}),msg=h.outgoing[0];
  h.respond(msg,{origin:"https://evil.example"});assert.equal(h.timers.size,1);
  h.respond(msg,{data:{channel:msg.channel,token:"wrong",id:msg.id,reply:{ok:true}}});assert.equal(h.timers.size,1);
  h.respond(msg);assert.equal((await promise).result,"ok");assert.equal(h.timers.size,0);
  const next=h.sandbox.chrome.runtime.sendMessage({type:"comment-list"});
  h.respond(h.outgoing[1],{source:{}});assert.equal(h.timers.size,1);
  h.respond(h.outgoing[1]);await next;
  assert.equal(new URL(h.sandbox.chrome.runtime.getURL("browser-viewer.html")).origin,"https://viewer.example");
});
test("storage adapters preserve chrome reply contracts and timeout/closed view rejects pending work",async()=> {
  const h=harness(),get=h.sandbox.chrome.storage.local.get("variant");
  h.respond(h.outgoing[0],{data:{channel:h.outgoing[0].channel,token:h.token,id:h.outgoing[0].id,reply:{ok:true,result:{variant:1}}}});
  assert.equal((await get).variant,1);
  const set=h.sandbox.chrome.storage.local.set({variant:2});
  h.respond(h.outgoing[1],{data:{channel:h.outgoing[1].channel,token:h.token,id:h.outgoing[1].id,reply:{ok:false,error:"bad key"}}});
  await assert.rejects(set,/bad key/);
  const pending=h.sandbox.chrome.runtime.sendMessage({type:"project"});h.events.pagehide();await assert.rejects(pending,/closed/);
  await assert.rejects(h.sandbox.chrome.runtime.sendMessage({type:"project"}),/closed/);
  h.events.message({source:h.host,origin:h.sandbox.location.origin,data:{channel:"kicad-vscode:v1",token:h.token,eventId:1,event:{type:"comments-refresh"}}});assert.equal(h.dispatched.length,0);
  assert.equal(h.timers.size,0);
});


test("paired selection and comment-change exports use authenticated request IDs",async()=> {
  const h=harness(),selection={kind:"part",reference:"U1",path:"root.kicad_sch",uuid:"symbol-id"};
  const selected=h.sandbox.KiCadVSCodeBridge.selection(selection);assert.equal(h.outgoing[0].request.type,"pair-selection");assert.deepEqual(h.outgoing[0].request.selection,selection);h.respond(h.outgoing[0]);await selected;
  const changed=h.sandbox.KiCadVSCodeBridge.onCommentsChanged();assert.equal(h.outgoing[1].request.type,"comments-changed");h.respond(h.outgoing[1]);await changed;
  await h.sandbox.KiCadVSCodeBridge.selection({...selection,reference:"bad\nreference"});assert.equal(h.outgoing.length,2);
});

test("incoming related and refresh events reject wrong sender, malformed data and event replay",async()=> {
  const h=harness(),selection={kind:"net",path:"board.kicad_pcb",netName:"GND"};
  const event=(eventId,event,changes={})=>h.events.message({origin:h.sandbox.location.origin,source:h.host,data:{channel:"kicad-vscode:v1",token:h.token,eventId,event},...changes});
  event(1,{type:"related",selection},{origin:"https://evil.example"});assert.equal(h.dispatched.length,0);
  event(1,{type:"related",selection},{data:{channel:"kicad-vscode:v1",token:"wrong",eventId:1,event:{type:"related",selection}}});assert.equal(h.dispatched.length,0);
  event(1,{type:"related",selection:{...selection,netName:"x".repeat(501)}});assert.equal(h.dispatched.length,0);
  event(1,{type:"related",selection});assert.equal(h.dispatched[0].type,"kicad-review:related");assert.deepEqual(h.dispatched[0].detail,selection);
  event(1,{type:"related",selection});event(2,{type:"comments-refresh"},{source:{}});assert.equal(h.dispatched.length,1);
  event(2,{type:"comments-refresh",uri:"file:///secret"});event(3,{type:"unknown"});assert.equal(h.dispatched.length,1);
  event(2,{type:"comments-refresh"});assert.equal(h.dispatched[1].type,"kicad-review:comments-refresh");assert.equal(h.dispatched[1].detail,undefined);
  const request=h.sandbox.chrome.runtime.sendMessage({type:"project"});h.respond(h.outgoing[0]);await request;assert.equal(h.timers.size,0);
});
