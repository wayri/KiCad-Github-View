"use strict";
// Provider-only I/O: never executes Git or project programs.
const CHANNEL="kicad-vscode:v1",LIMIT=8*1024*1024;
const sameBytes=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const hashPattern=/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/i;
function markerLabel(conflicts,side){
 const labels=[...new Set(conflicts.map(c=>c[side+"Label"].trim()))];
 return labels.length===1&&labels[0]?labels[0]:null;
}
function markerRef(label,repo){
 if(!label)return null;
 const abbreviated=/^([0-9a-f]{7,64})(?: \(.+\))?$/i.exec(label);
 if(abbreviated)return {ref:abbreviated[1],prefix:abbreviated[1].toLowerCase()};
 if(label==="HEAD")return hashPattern.test(repo.state?.HEAD?.commit||"")?{ref:repo.state.HEAD.commit,hash:repo.state.HEAD.commit.toLowerCase()}:null;
 if(!/^[A-Za-z0-9_][A-Za-z0-9_./-]*$/.test(label)||label.includes("..")||label.endsWith("/")||label.endsWith(".lock"))return null;
 const refs=(repo.state?.refs||[]).filter(r=>r.name===label||`refs/heads/${r.name}`===label||`refs/remotes/${r.name}`===label);
 return refs.length===1&&hashPattern.test(refs[0].commit||"")?{ref:refs[0].commit,hash:refs[0].commit.toLowerCase()}:null;
}
async function commitForMarker(repo,label){
 const identity=markerRef(label,repo);if(!identity||typeof repo.getCommit!=="function")return null;
 try{
  const commit=await repo.getCommit(identity.ref),hash=commit?.hash?.toLowerCase(),when=commit?.commitDate;
  if(!hashPattern.test(hash||"")||(identity.hash&&hash!==identity.hash)||(identity.prefix&&!hash.startsWith(identity.prefix)))return null;
  const date=when instanceof Date?when:null,timestamp=date?.getTime();
  return Number.isFinite(timestamp)?{hash,date:date.toISOString(),label}:null;
 }catch{return null;}
}
async function gitMetadata(repo,conflicts,uri){
 if(!repo)return null;
 if(!(repo.state?.mergeChanges||[]).some(change=>change.uri?.toString()===uri.toString()))return {branch:repo.state?.HEAD?.name||"Detached HEAD",current:null,incoming:null,latest:null};
 const [current,incoming]=await Promise.all(["current","incoming"].map(side=>commitForMarker(repo,markerLabel(conflicts,side))));
 const latest=current&&incoming&&current.hash!==incoming.hash&&current.date!==incoming.date?(current.date>incoming.date?"current":"incoming"):null;
 return {branch:repo.state?.HEAD?.name||"Detached HEAD",current,incoming,latest};
}
function createHost(vscode,merge,helpers) {
 let actionQueue=Promise.resolve();
 const dirty=uri=>(vscode.workspace.textDocuments||[]).some(d=>d.uri.toString()===uri.toString()&&d.isDirty);
 async function boundedRead(uri,boundary) {
  if(!/\.kicad_(sch|pcb)$/i.test(uri.path)||!helpers.sameScope(uri,boundary))throw new Error("Select an in-workspace KiCad drawing.");
  const boundaryStat=await vscode.workspace.fs.stat(boundary);if(boundaryStat.type&vscode.FileType.SymbolicLink)throw new Error("Symbolic-link workspace roots are excluded.");
  const relative=uri.path.slice(boundary.path.replace(/\/$/,"").length+1),parts=relative.split("/");
  for(let i=1;i<=parts.length;i++){
   const stat=await vscode.workspace.fs.stat(vscode.Uri.joinPath(boundary,...parts.slice(0,i)));
   if(stat.type&vscode.FileType.SymbolicLink)throw new Error("Symbolic-link paths cannot be resolved.");
   if(i===parts.length&&(!(stat.type&vscode.FileType.File)||stat.size>LIMIT))throw new Error("Drawing exceeds the 8 MiB limit or is not a file.");
  }
  const bytes=await vscode.workspace.fs.readFile(uri);if(bytes.length>LIMIT)throw new Error("Drawing grew beyond the 8 MiB limit.");return bytes;
 }
 async function gitRepository(uri) {
  if(uri.scheme!=="file")return null;
  const extension=vscode.extensions?.getExtension("vscode.git");if(!extension)return null;
  try {const exports=extension.isActive?extension.exports:await extension.activate(),api=exports.getAPI(1);
   return api.repositories.filter(r=>helpers.sameScope(uri,r.rootUri)).sort((a,b)=>b.rootUri.path.length-a.rootUri.path.length)[0]||null;
  } catch {return null;}
 }
 async function open(uri,context,panel) {
  uri=vscode.Uri.parse(uri.toString());
  const scope=helpers.projectScope(uri);if(dirty(uri))throw new Error("Save or discard unsaved source edits before reviewing conflicts.");
  const bytes=await boundedRead(uri,scope.boundary),source=new TextDecoder("utf-8",{fatal:true}).decode(bytes),expectedRoot=/\.kicad_pcb$/i.test(uri.path)?"kicad_pcb":"kicad_sch";
  const analysis=merge.analyze(source,{expectedRoot});if(!analysis.count)throw new Error("The selected file has no unresolved Git conflict markers.");
  panel=panel||vscode.window.createWebviewPanel("kicadVisualReview.conflicts","KiCad: Resolve Git Conflict",vscode.ViewColumn.Active,{enableScripts:true,retainContextWhenHidden:true});
  panel.webview.options={enableScripts:true,localResourceRoots:[context.extensionUri,vscode.Uri.joinPath(context.extensionUri,"media")]};
  const session={token:helpers.secret(),lastId:0,disposed:false},repo=await gitRepository(uri),git=await gitMetadata(repo,analysis.conflicts,uri);let savedOriginal=false,savedBytes=null,queue=Promise.resolve();
  const checkOriginal=async()=>{if(dirty(uri)||!sameBytes(bytes,await boundedRead(uri,scope.boundary))||dirty(uri))throw new Error("Source changed or has unsaved edits; reopen conflict review. Nothing was written.");};
  async function guardCopy(destination) {
    const parts=destination.path.slice(scope.boundary.path.replace(/\/$/,"").length+1).split("/");
    for(let i=1;i<parts.length;i++){const stat=await vscode.workspace.fs.stat(vscode.Uri.joinPath(scope.boundary,...parts.slice(0,i)));if(stat.type&vscode.FileType.SymbolicLink)throw new Error("Symbolic-link copy destinations are excluded.");}
    try {await vscode.workspace.fs.stat(destination);throw new Error("Copy destination already exists; choose a new filename.");}catch(e){if(!["FileNotFound","EntryNotFound"].includes(e.code))throw e;}
  }
  async function dispatch(request){
   if(request.type==="conflict-load")return {path:scope.rootFile,source,canStage:!!repo&&vscode.workspace.isTrusted===true,git};
   if(request.type==="conflict-save"){
    if(vscode.workspace.isTrusted!==true)throw new Error("Trust this workspace before saving resolved files.");
    if(!["current","incoming"].includes(request.choices)||!["copy","original"].includes(request.mode)||Object.keys(request).some(k=>!["type","choices","mode"].includes(k)))throw new Error("Invalid conflict resolution request.");
    const candidate=merge.resolve(source,request.choices,{expectedRoot}),encoded=new TextEncoder().encode(candidate),hasBom=bytes[0]===239&&bytes[1]===187&&bytes[2]===191,data=hasBom?new Uint8Array(encoded.length+3):encoded;if(hasBom){data.set([239,187,191]);data.set(encoded,3);}if(data.length>LIMIT)throw new Error("Resolved source is too large.");
    await checkOriginal();let destination=uri;
    if(request.mode==="copy"){
     destination=await vscode.window.showSaveDialog({defaultUri:uri.with({path:uri.path.replace(/(\.kicad_(?:sch|pcb))$/i,"-resolved$1")}),saveLabel:"Save resolved copy"});if(!destination)return {saved:false};
     if(destination.toString()===uri.toString()||destination.scheme!==uri.scheme||destination.authority!==uri.authority||!helpers.sameScope(destination,scope.boundary)||!destination.path.toLowerCase().endsWith(expectedRoot==="kicad_sch"?".kicad_sch":".kicad_pcb"))throw new Error("Choose a new KiCad file inside the same workspace.");
     await guardCopy(destination);
    }
    const action=request.mode==="original"?"Save resolved original":"Save resolved copy";
    const confirmation=await vscode.window.showWarningMessage(`${action} using the ${request.choices} state? ${destination.toString()}`,{modal:true},action);if(confirmation!==action)return {saved:false};
    if(session.disposed)throw new Error("Conflict review was closed.");await checkOriginal();if(dirty(destination))throw new Error("Destination has unsaved changes.");
    if(vscode.workspace.isTrusted!==true)throw new Error("Workspace trust changed; nothing was written.");
    if(request.mode==="copy")await guardCopy(destination);
    await vscode.workspace.fs.writeFile(destination,data);savedOriginal=request.mode==="original";savedBytes=savedOriginal?data:null;
    return {saved:true,path:destination.toString(),message:"Resolved source saved. Git staging is a separate action.",canStage:savedOriginal&&!!repo};
   }
   if(request.type==="conflict-stage"){
    if(Object.keys(request).length!==1||!savedOriginal||!repo||vscode.workspace.isTrusted!==true)throw new Error("Save the resolved original before staging.");
    if(dirty(uri))throw new Error("Save unsaved edits before staging.");
    const resolvedBytes=await boundedRead(uri,scope.boundary),resolved=new TextDecoder("utf-8",{fatal:true}).decode(resolvedBytes);if(!sameBytes(savedBytes,resolvedBytes))throw new Error("Resolved source changed; reopen review before staging.");if(merge.parse(resolved).conflicts.length)throw new Error("File still contains conflicts.");
    const action="Stage resolved file";if(await vscode.window.showWarningMessage(`Stage ${scope.rootFile} in Git?`,{modal:true},action)!==action)return {staged:false};
    if(session.disposed)throw new Error("Conflict review was closed.");if(vscode.workspace.isTrusted!==true)throw new Error("Workspace trust changed; nothing was staged.");if(dirty(uri)||!sameBytes(savedBytes,await boundedRead(uri,scope.boundary)))throw new Error("Resolved source changed before staging.");
    await repo.add([uri.path.replace(/^\/([A-Za-z]:\/)/,"$1")]);return {staged:true};
   }
   throw new Error("Unsupported conflict operation.");
  }
  const receiver=panel.webview.onDidReceiveMessage(message=>{
   if(session.disposed||message?.channel!==CHANNEL||message.token!==session.token||!Number.isSafeInteger(message.id)||message.id<=session.lastId||message.id>10000)return;
   session.lastId=message.id;
   const run=async()=>{let reply;try{if(!message.request||JSON.stringify(message.request).length>1024)throw new Error("Invalid conflict request.");reply={ok:true,result:await dispatch(message.request)};}catch(error){reply={ok:false,error:String(error.message).slice(0,1000)};}if(!session.disposed)await panel.webview.postMessage({channel:CHANNEL,token:session.token,id:message.id,reply});};queue=actionQueue.then(run,run);actionQueue=queue.catch(()=>{});
  });
  panel.onDidDispose(()=>{session.disposed=true;receiver.dispose();});
  panel.webview.html=await helpers.conflictHTML(panel.webview,context,session);return panel;
 }
 return {open,boundedRead};
}
module.exports={createHost,sameBytes};
