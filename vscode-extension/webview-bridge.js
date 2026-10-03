/* Private VS Code transport adapter for the shared browser viewer. */
(() => {
  "use strict";
  const context=globalThis.KiCadVSCodeContext,api=acquireVsCodeApi(),channel="kicad-vscode:v1",pending=new Map();
  if(!context || !/^[a-f0-9]{48}$/.test(context.token))throw new Error("Missing private viewer session.");
  let next=0,hostSource,lastEventId=0,closed=false;
  const validSelection=(value)=> {
    const bounded=(item,n)=>typeof item==="string" && item.length>0 && item.length<=n && !/[\x00-\x1f\x7f]/.test(item);
    if(!value || typeof value!=="object" || Array.isArray(value) || !["part","net"].includes(value.kind) || !bounded(value.path,1000))return false;
    const fields=value.kind==="part"?["kind","path","reference","uuid","symbolUuid"]:["kind","path","netName"];
    if(Object.keys(value).some((key)=>!fields.includes(key)))return false;
    return value.kind==="net"?bounded(value.netName,500):bounded(value.reference,200)&&["uuid","symbolUuid"].every((key)=>value[key]===undefined||bounded(value[key],200));
  };
  const request=(message)=>new Promise((resolve,reject)=> {
    if(closed){reject(new Error("Drawing closed."));return;}
    if(pending.size>=128 || next>=10000){reject(new Error("Viewer request limit reached; reopen this drawing."));return;}
    const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(new Error("VS Code viewer request timed out."));},30000);
    pending.set(id,{resolve,reject,timer});api.postMessage({channel,token:context.token,id,request:message});
  });
  addEventListener("message",(event)=> {
    if(closed || event.origin!==location.origin || (hostSource!==undefined && event.source!==hostSource))return;
    const msg=event.data;
    if(msg?.channel!==channel || msg.token!==context.token)return;
    if(msg.event) {
      if(!Number.isSafeInteger(msg.eventId) || msg.eventId<=lastEventId || msg.eventId>1000000)return;
      if(msg.event.type==="related") {
        if(!validSelection(msg.event.selection))return;
        lastEventId=msg.eventId;if(hostSource===undefined)hostSource=event.source;
        dispatchEvent(new CustomEvent("kicad-review:related",{detail:msg.event.selection}));
      } else if(msg.event.type==="comments-refresh" && Object.keys(msg.event).length===1) {
        lastEventId=msg.eventId;if(hostSource===undefined)hostSource=event.source;
        dispatchEvent(new CustomEvent("kicad-review:comments-refresh"));
      }
      return;
    }
    if(!Number.isSafeInteger(msg.id) || !msg.reply || typeof msg.reply.ok!=="boolean")return;
    const entry=pending.get(msg.id);if(!entry)return;pending.delete(msg.id);clearTimeout(entry.timer);entry.resolve(msg.reply);
    // VS Code sends from its enclosing same-origin preload window, then hides
    // that parent from content. Authenticate the first sender by session token.
    if(hostSource===undefined)hostSource=event.source;
  });
  // getURL is used solely to establish parent messaging origin in the shared
  // entry point. Keep that origin equal to this webview, not its resource CDN.
  globalThis.KiCadVSCodeBridge={
    selection:(selection)=>validSelection(selection)?request({type:"pair-selection",selection}).catch(()=>undefined):Promise.resolve(undefined),
    onCommentsChanged:()=>request({type:"comments-changed"}).catch(()=>undefined)
  };
  globalThis.chrome={runtime:{getURL:(name)=>new URL(name,location.href).href,sendMessage:request},storage:{local:{
    async get(key){const reply=await request({type:"storage-get",key});if(!reply.ok)throw new Error(reply.error);return reply.result;},
    async set(values){const reply=await request({type:"storage-set",values});if(!reply.ok)throw new Error(reply.error);}
  }}};
  addEventListener("pagehide",()=>{closed=true;for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(new Error("Drawing closed."));}pending.clear();});
})();
