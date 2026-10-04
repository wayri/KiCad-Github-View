"use strict";
// Same source runs in desktop and web extension hosts. No Node I/O or processes.
const vscode = require("vscode");
const projectPaths=require("./media/parsing.js");
const VIEW = "kicadVisualReview.viewer", CHANNEL = "kicad-vscode:v1";
const MAX_FILE = 8 * 1024 * 1024, MAX_PROJECT = 24 * 1024 * 1024;
const MAX_MESSAGE = 1024 * 1024, MAX_FILES = 32;
const MAX_SIDECAR=4*1024*1024,liveSessions=new Set(),pairTargets=new Map();
const OPERATIONS = new Set(["preview-project-html", "project-inventory", "project-file", "open-project-file", "open-project-overview", "rule-report", "project-search-files", "open-project-drawing", "project", "repo-asset", "pair-selection", "comments-changed", "comment-list", "comment-save", "comment-delete", "storage-get", "storage-set", "open-comment-draft", "github-annotations"]);
let storageQueue=Promise.resolve();
const safePath = (path) => typeof path === "string" && path.length <= 500 && /\.kicad_(sch|pcb)$/i.test(path) &&
  !path.startsWith("/") && path.split("/").every((p) => p && p !== "." && p !== ".." && !/[\\\x00-\x1f\x7f:]/.test(p));
const safeAssetPath=(path)=>typeof path==="string" && path.length>0 && path.length<=500 && /\.(?:wrl|vrml|glb|step|stp)$/i.test(path) &&
  !path.startsWith("/") && path.split("/").every((part)=>part && part!=="." && part!==".." && !/[\\\x00-\x1f\x7f:?#%]/.test(part));
const clone = (object) => JSON.parse(JSON.stringify(object));
function escaped(text) { return String(text).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]); }
function secret() {
  if (!globalThis.crypto?.getRandomValues) throw new Error("This VS Code host lacks secure random tokens; update VS Code.");
  return [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2,"0")).join("");
}
function identity(uri) {
  let hash = 2166136261;
  for (const c of uri.toString()) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return `vscode/workspace-${(hash >>> 0).toString(16)}`;
}
function supportedViewerUri(uri) {
  if(!uri||typeof uri.path!=="string")return false;
  const path=uri.scheme==="file"?uri.path.replace(/^\/[A-Za-z]:\//,""):uri.path;
  return projectPaths.filePath(path.replace(/^\//,""));
}
function scopePath(uri) {
  // VS Code's Windows file provider can normalize only the drive letter.
  // Preserve folder spelling and all virtual-provider URI identities.
  return uri.scheme==="file"?uri.path.replace(/^\/([A-Za-z]):(?=\/)/,(_,drive)=>"/"+drive.toLowerCase()+":"):uri.path;
}
function sameScope(uri, boundary) {
  const prefix = scopePath(boundary).replace(/\/$/, "") + "/";
  return uri.scheme === boundary.scheme && uri.authority === boundary.authority &&
    uri.query === boundary.query && uri.fragment === boundary.fragment && scopePath(uri).startsWith(prefix);
}
function projectScope(uri) {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  const boundary = folder?.uri || uri.with({path:uri.path.slice(0,uri.path.lastIndexOf("/")) || "/"});
  if (!sameScope(uri,boundary)) throw new Error("Drawing is outside its containing workspace.");
  const prefix = boundary.path.replace(/\/$/, "") + "/", rootFile = uri.path.slice(prefix.length);
  if (!projectPaths.filePath(rootFile)) throw new Error("Unsupported or unsafe KiCad drawing path.");
  return {boundary,rootFile,repository:"local/workspace",ref:"workspace"};
}
function childPath(parent,name) {
  if (typeof name !== "string" || !/\.kicad_sch$/i.test(name) || name.startsWith("/") || /[\\\x00-\x1f\x7f:]/.test(name)) return null;
  const parts=parent.split("/").slice(0,-1);
  for(const p of name.split("/")) {if(p===".."){if(!parts.length)return null;parts.pop();}else if(p&&p!==".")parts.push(p);}
  const result=parts.join("/"); return safePath(result) ? result : null;
}
function sheetFiles(source) {
  // Bounded S-expression context; only properties of top-level sheet objects
  // authorize child reads. Comments, text, and library properties are ignored.
  const names=[],stack=[];let i=0,nodes=0,roots=0;
  while(i<source.length) {
    const c=source[i];if(/\s/.test(c)){i++;continue;}
    if(c===";"){while(i<source.length&&source[i]!=="\n")i++;continue;}
    if(++nodes>1000000)throw new Error("KiCad source has too many S-expression nodes.");
    if(c==="(") {if(stack.length>=96)throw new Error("KiCad source is too deeply nested.");if(!stack.length)roots++;stack.push([]);i++;continue;}
    if(c===")") {
      if(!stack.length)throw new Error("Unexpected closing KiCad parenthesis.");
      const entry=stack.pop();i++;
      if(entry[0]==="property" && entry[1]==="Sheetfile" && typeof entry[2]==="string" &&
        stack.length===2 && stack[0][0]==="kicad_sch" && stack[1][0]==="sheet")names.push(entry[2]);
      continue;
    }
    if(!stack.length)throw new Error("Expected a KiCad S-expression.");
    let token="";
    if(c==='"') {
      i++;let closed=false;
      while(i<source.length) {
        const next=source[i++];if(next==='"'){closed=true;break;}
        if(next==="\\"){if(i>=source.length)break;const escaped=source[i++];token+=({n:"\n",r:"\r",t:"\t",'"':'"',"\\":"\\"})[escaped] ?? `\\${escaped}`;}
        else token+=next;
      }
      if(!closed)throw new Error("Unterminated quoted KiCad value.");
    } else {const start=i;while(i<source.length&&!/[\s();"]/.test(source[i]))i++;if(i===start)throw new Error("Invalid KiCad source token.");token=source.slice(start,i);}
    if(stack.at(-1).length<3)stack.at(-1).push(token);
  }
  if(stack.length || roots!==1)throw new Error("Incomplete KiCad S-expression.");
  return names;
}
async function loadProject(uri,scope=projectScope(uri),cancel={isCancellationRequested:false},readBudget=null) {
  const queue=[scope.rootFile], seen=new Set(), files=[], warnings=[],checkedDirectories=new Set();let total=0;
  while(queue.length) {
    if(cancel.isCancellationRequested)throw new Error("Drawing load cancelled.");
    const path=queue.shift();if(seen.has(path))continue;
    if(seen.size>=MAX_FILES)throw new Error("Project exceeds the 32-sheet review limit.");seen.add(path);
    const target=vscode.Uri.joinPath(scope.boundary,...path.split("/"));
    if(!sameScope(target,scope.boundary))throw new Error("Referenced sheet escapes the workspace.");
    let bytes;
    try {
      const parts=path.split("/");
      for(let i=1;i<parts.length;i++) {
        const directory=vscode.Uri.joinPath(scope.boundary,...parts.slice(0,i)),key=directory.toString();
        if(checkedDirectories.has(key))continue;
        const directoryStat=await vscode.workspace.fs.stat(directory);
        if(directoryStat.type & vscode.FileType.SymbolicLink)throw new Error("Symbolic-link directories are excluded from bounded workspace review.");
        checkedDirectories.add(key);
      }
      const stat=await vscode.workspace.fs.stat(target);
      if(stat.type & vscode.FileType.SymbolicLink)throw new Error("Symbolic-link drawings are excluded from bounded workspace review.");
      if(stat.size>MAX_FILE)throw new Error("Drawing exceeds the 8 MiB file limit.");
      if(readBudget&&(readBudget.files>=MAX_FILES||readBudget.bytes+stat.size>MAX_PROJECT))throw new Error("Project search reached its 32-read / 24 MiB source limit.");
      bytes=await vscode.workspace.fs.readFile(target);
      if(readBudget){readBudget.files++;readBudget.bytes+=bytes.byteLength;if(readBudget.bytes>MAX_PROJECT)throw new Error("Project search source grew beyond its 24 MiB read limit.");}
    } catch(error) {
      if(path===scope.rootFile || !["FileNotFound","EntryNotFound"].includes(error.code))throw error;
      warnings.push(`Missing referenced sheet: ${path}`);continue;
    }
    if(bytes.byteLength>MAX_FILE || (total+=bytes.byteLength)>MAX_PROJECT)throw new Error("Project exceeds the 8 MiB file / 24 MiB project limit.");
    const content=new TextDecoder("utf-8",{fatal:true}).decode(bytes);files.push({path,content});
    if(/\.kicad_sch$/i.test(path))for(const name of sheetFiles(content)) {
      const child=childPath(path,name);
      if(!child)warnings.push(`Unsupported or out-of-workspace sheet reference: ${name.slice(0,200)}`);
      else if(!seen.has(child))queue.push(child);
    }
  }
  return {files,warnings,scope};
}
function assertScope(request,session) {
  if(request.repository!==session.scope.repository || request.ref!==session.scope.ref || !session.paths.has(request.file))
    throw new Error("Request belongs to another workspace or drawing.");
}
function validateComment(note,session=null) {
  if(!note || typeof note!=="object" || typeof note.id!=="string" || !/^[A-Za-z0-9_-]{1,100}$/.test(note.id) ||
    typeof note.text!=="string" || !note.text.trim() || note.text.length>4000 ||
    !["info","minor","major","critical"].includes(note.severity || "info") ||
    !validTimestamp(note.createdAt))
    throw new Error("Invalid local review annotation.");
  const allowed=new Set(["id","text","severity","createdAt","updatedAt","anchor","tags","state","remoteRefs","capture","mentions","threadType"]);
  if(Object.keys(note).some((key)=>!allowed.has(key)))throw new Error("Annotation has unsupported fields; preserve it in the sidecar before upgrading.");
  if(!note.anchor || typeof note.anchor.repository!=="string" || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(note.anchor.repository) ||
    note.anchor.repository.split("/").some((p)=>[".",".."].includes(p)) || typeof note.anchor.ref!=="string" ||
    !/^[A-Za-z0-9._/-]{1,200}$/.test(note.anchor.ref) || note.anchor.ref.includes("..") || note.anchor.ref.startsWith("/") ||
    note.anchor.ref.endsWith("/") || !safePath(note.anchor.file))throw new Error("Invalid annotation scope.");
  if(session)assertScope(note.anchor,session);
  const anchor={repository:note.anchor.repository,ref:note.anchor.ref,file:note.anchor.file};
  if(Object.keys(note.anchor).some((key)=>!["repository","ref","file","uuid","objectId","reference","kind","position","area","variant"].includes(key)))throw new Error("Annotation anchor has unsupported fields.");
  for(const [name,limit] of [["uuid",200],["objectId",200],["reference",100],["kind",80],["variant",100]]) {
    const item=note.anchor[name];if(item==null || item==="")continue;
    if(typeof item!=="string" || item.length>limit || /[\x00-\x1f\x7f]/.test(item))throw new Error("Invalid annotation anchor.");anchor[name]=item;
  }
  if(note.anchor.position!=null) {
    const {x,y}=note.anchor.position;
    if(![x,y].every(Number.isFinite) || Math.abs(x)>1e6 || Math.abs(y)>1e6)throw new Error("Invalid annotation position.");anchor.position={x,y};
  }
  if(note.anchor.area!==undefined) {
    const area=note.anchor.area;
    if(!area || typeof area!=="object" || Array.isArray(area) || Object.keys(area).some((key)=>!["x","y","width","height"].includes(key)) ||
      ![area.x,area.y,area.width,area.height].every(Number.isFinite) || Math.abs(area.x)>1e6 || Math.abs(area.y)>1e6 ||
      area.width<=0 || area.height<=0 || area.width>1e6 || area.height>1e6 ||
      Math.abs(area.x+area.width)>1e6 || Math.abs(area.y+area.height)>1e6)throw new Error("Invalid annotation area.");
    anchor.area={x:area.x,y:area.y,width:area.width,height:area.height};
  }
  let capture;
  if(note.capture!==undefined) {
    const image=note.capture;
    if(!image || typeof image!=="object" || Array.isArray(image) || Object.keys(image).some((key)=>!["mime","dataUrl","width","height"].includes(key)) ||
      image.mime!=="image/png" || typeof image.dataUrl!=="string" || image.dataUrl.length>256*1024 ||
      !/^data:image\/png;base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(image.dataUrl) ||
      !pngSignature(image.dataUrl.slice(22)) || ![image.width,image.height].every((size)=>Number.isInteger(size) && size>0 && size<=1024))
      throw new Error("Invalid annotation PNG capture.");
    capture={mime:image.mime,dataUrl:image.dataUrl,width:image.width,height:image.height};
  }
  const updatedAt=note.updatedAt ?? note.createdAt,tags=note.tags ?? [],state=note.state ?? "open",remoteRefs=note.remoteRefs ?? [];
  if(!validTimestamp(updatedAt) || !["open","skipped","resolved","wont-fix"].includes(state) ||
    !Array.isArray(tags) || tags.length>20 || tags.some((tag)=>typeof tag!=="string" || !tag.trim() || tag.length>40 || /[\x00-\x1f\x7f]/.test(tag)) ||
    !Array.isArray(remoteRefs) || remoteRefs.length>20)throw new Error("Invalid annotation state, timestamps, tags or remote references.");
  if(Date.parse(updatedAt)<Date.parse(note.createdAt))throw new Error("Annotation update time precedes creation time.");
  const threadType=note.threadType;if(threadType!==undefined&&!["issue","discussion"].includes(threadType))throw new Error("Invalid annotation thread type.");
  const inputMentions=note.mentions??[],mentions=[],mentionKeys=new Set();
  if(!Array.isArray(inputMentions) || inputMentions.length>20)throw new Error("Invalid annotation mentions.");
  for(const raw of inputMentions) {
    if(typeof raw!=="string")throw new Error("Invalid annotation mention.");
    const login=raw.startsWith("@")?raw.slice(1):raw;
    if(!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(login))throw new Error("Invalid annotation mention.");
    const key=login.toLowerCase();if(!mentionKeys.has(key)){mentions.push(login);mentionKeys.add(key);}
  }
  const refs=remoteRefs.map((remote)=> {
    if(!remote || !["issue","discussion"].includes(remote.kind) || typeof remote.repository!=="string" ||
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(remote.repository) || remote.repository.split("/").some((p)=>[".",".."].includes(p)) ||
      !Number.isSafeInteger(remote.number) || remote.number<=0 || !validTimestamp(remote.publishedAt) ||
      Object.keys(remote).some((key)=>!["kind","repository","number","nodeId","url","publishedAt"].includes(key)) ||
      (remote.nodeId!==undefined && (typeof remote.nodeId!=="string" || !remote.nodeId || remote.nodeId.length>200 || /[\x00-\x1f\x7f]/.test(remote.nodeId))))throw new Error("Invalid remote annotation reference.");
    const base=`https://github.com/${remote.repository}/${remote.kind==="issue"?"issues":"discussions"}/${remote.number}`;
    if(typeof remote.url!=="string" || !remote.url.startsWith(base) ||
      (remote.url!==base && !/^#(?:issuecomment|discussioncomment)-[0-9]+$/.test(remote.url.slice(base.length))))throw new Error("Invalid remote annotation URL.");
    return clone(remote);
  });
  return {id:note.id,text:note.text.trim(),createdAt:note.createdAt,updatedAt,severity:note.severity || "info",anchor,
    tags:[...new Set(tags.map((tag)=>tag.trim()))],state,mentions,...(threadType?{threadType}:{}),remoteRefs:refs,...(capture ? {capture} : {})};
}
function pngSignature(payload) {
  const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",bytes=[];let bits=0,count=0;
  for(const character of payload.slice(0,12)) {
    const value=alphabet.indexOf(character);if(value<0)return false;bits=(bits<<6)|value;count+=6;
    if(count>=8){count-=8;bytes.push((bits>>>count)&255);}
  }
  return [137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value);
}
function validTimestamp(value) {
  return typeof value==="string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,19)===value.slice(0,19);
}
function validateSidecar(data) {
  if(!data || data.schemaVersion!==1 || !Array.isArray(data.annotations) || data.annotations.length>1000 ||
    Object.keys(data).some((key)=>!["schemaVersion","annotations"].includes(key)))throw new Error("Unsupported .kicad-review.json schema; expected schemaVersion 1 and annotations.");
  const seen=new Set(),annotations=data.annotations.map((note)=> {
    const normalized=validateComment(note),key=JSON.stringify([normalized.anchor.repository,normalized.anchor.ref,normalized.anchor.file,normalized.id]);
    if(seen.has(key))throw new Error("Duplicate annotation identity in .kicad-review.json.");seen.add(key);return normalized;
  });
  return {schemaVersion:1,annotations};
}
const equalBytes=(a,b)=>a===null || b===null ? a===b : a.length===b.length && a.every((value,index)=>value===b[index]);
async function readSidecar(session) {
  const uri=vscode.Uri.joinPath(session.scope.boundary,".kicad-review.json");
  try {
    const stat=await vscode.workspace.fs.stat(uri);
    if(stat.type & vscode.FileType.SymbolicLink)throw new Error("The review sidecar is a symbolic link; writes are disabled.");
    if(stat.size>MAX_SIDECAR)throw new Error("Review sidecar exceeds 4 MiB.");
    const bytes=await vscode.workspace.fs.readFile(uri);
    if(bytes.length>MAX_SIDECAR)throw new Error("Review sidecar exceeds 4 MiB.");
    return {uri,bytes:bytes.slice(),data:validateSidecar(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes)))};
  } catch(error) {
    if(["FileNotFound","EntryNotFound"].includes(error.code))return {uri,bytes:null,data:{schemaVersion:1,annotations:[]}};
    throw error;
  }
}
async function writeSidecar(session,before,data) {
  const validated=validateSidecar(data);
  validated.annotations.sort((a,b)=>JSON.stringify([a.anchor.repository,a.anchor.ref,a.anchor.file,a.id]).localeCompare(JSON.stringify([b.anchor.repository,b.anchor.ref,b.anchor.file,b.id])));
  const bytes=new TextEncoder().encode(JSON.stringify(validated,null,2)+"\n");
  if(bytes.length>MAX_SIDECAR)throw new Error("Review sidecar exceeds 4 MiB; no annotations were written.");
  const temporary=vscode.Uri.joinPath(session.scope.boundary,`.kicad-review.${secret()}.tmp`);
  try {
    await vscode.workspace.fs.writeFile(temporary,bytes);
    if(!equalBytes(bytes,await vscode.workspace.fs.readFile(temporary)))throw new Error("Review staging verification failed; original sidecar preserved.");
    const latest=await readSidecar(session);
    if(!equalBytes(before.bytes,latest.bytes))throw new Error("Review sidecar changed externally; reload annotations before retrying. Original changes were preserved.");
    try {await vscode.workspace.fs.rename(temporary,before.uri,{overwrite:before.bytes!==null});}
    catch(error) {
      // A remote provider can commit and then lose its acknowledgement. Recover
      // only when the full destination bytes prove this exact candidate arrived.
      const recovered=await readSidecar(session);
      if(!equalBytes(bytes,recovered.bytes))throw error;
    }
    const committed=await readSidecar(session);
    if(!equalBytes(bytes,committed.bytes))throw new Error("Review sidecar changed during commit; reload annotations to inspect the result.");
    for(const current of liveSessions)if(current.scope.boundary.toString()===session.scope.boundary.toString())current.sidecarBytes=committed.bytes;
    return validated;
  } catch(error) {
    throw new Error(`Could not save .kicad-review.json: ${error.message || error}`);
  } finally {await vscode.workspace.fs.delete(temporary,{recursive:false,useTrash:false}).catch(()=>{});}
}
async function annotationSnapshot(session) {
  const current=await readSidecar(session);
  if(session.sidecarBytes!==undefined && !equalBytes(session.sidecarBytes,current.bytes))throw new Error("Review sidecar changed externally; reload annotations before saving. No changes were written.");
  return current;
}
function createSession(uri,project,context,token=secret()) {
  const storageKey=`kicad-visual-review:${uri.toString()}`;
  const session={uri,scope:project.scope,files:project.files,paths:new Set(project.files.map((f)=>f.path)),context,token,lastId:0,disposed:false,
    storageKey,variantKey:JSON.stringify(["kicad-review-variants",project.scope.repository,project.scope.rootFile]),
    preferencesKey:JSON.stringify(["kicad-review-preferences",project.scope.repository,project.scope.rootFile]),assetRequests:0,assetBytes:0,eventId:0};
  liveSessions.add(session);return session;
}
function validPairSelection(value) {
  const bounded=(item,limit)=>typeof item==="string" && item.length>0 && item.length<=limit && !/[\x00-\x1f\x7f]/.test(item);
  if(!value || typeof value!=="object" || Array.isArray(value) || !["part","net"].includes(value.kind) || !bounded(value.path,1000))return false;
  const fields=value.kind==="part"?["kind","path","reference","uuid","symbolUuid"]:["kind","path","netName"];
  if(Object.keys(value).some((key)=>!fields.includes(key)))return false;
  return value.kind==="net" ? bounded(value.netName,500) : bounded(value.reference,200) &&
    ["uuid","symbolUuid"].every((key)=>value[key]===undefined || bounded(value[key],200));
}
async function relaySelection(value,session) {
  if(!validPairSelection(value) || !session.paths.has(value.path))throw new Error("Invalid or out-of-project paired selection.");
  const target=pairTargets.get(session.uri.toString());if(!target)return {delivered:0};
  let delivered=0;
  for(const other of liveSessions) {
    if(other===session || other.uri.toString()!==target || other.scope.boundary.toString()!==session.scope.boundary.toString() ||
      other.scope.repository!==session.scope.repository || other.scope.ref!==session.scope.ref ||
      /\.kicad_sch$/i.test(other.uri.path)===/\.kicad_sch$/i.test(session.uri.path))continue;
    if(await notifySession(other,{type:"related",selection:clone(value)}))delivered++;
  }
  return {delivered};
}
function unpair(uri) {
  const key=uri.toString(),other=pairTargets.get(key);pairTargets.delete(key);if(other && pairTargets.get(other)===key)pairTargets.delete(other);
}
async function notifySession(session,event) {
  if(session.disposed || typeof session.post!=="function" || session.eventId>=1000000)return false;
  try{return (await session.post({channel:CHANNEL,token:session.token,eventId:++session.eventId,event}))!==false;}catch{return false;}
}
function encodeBase64(bytes) {
  const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",chunks=[];let chunk="";
  for(let i=0;i<bytes.length;i+=3) {
    const first=bytes[i],second=bytes[i+1],third=bytes[i+2];
    chunk+=alphabet[first>>>2]+alphabet[((first&3)<<4)|((second??0)>>>4)]+(second===undefined?"=":alphabet[((second&15)<<2)|((third??0)>>>6)])+(third===undefined?"=":alphabet[third&63]);
    if(chunk.length>=16384){chunks.push(chunk);chunk="";}
  }
  chunks.push(chunk);return chunks.join("");
}
async function loadRepoAsset(request,session) {
  if(request.repository!==session.scope.repository || request.ref!==session.scope.ref)throw new Error("Model asset belongs to another workspace or revision.");
  if(session.assetRequests>=32)throw new Error("Model assets exceed the 32-request session limit.");session.assetRequests++;
  if(!safeAssetPath(request.file))throw new Error("Unsupported or unsafe model asset path.");
  const parts=request.file.split("/"),target=vscode.Uri.joinPath(session.scope.boundary,...parts);
  if(!sameScope(target,session.scope.boundary))throw new Error("Model asset escapes the workspace.");
  for(let i=1;i<parts.length;i++) {
    const stat=await vscode.workspace.fs.stat(vscode.Uri.joinPath(session.scope.boundary,...parts.slice(0,i)));
    if(stat.type & vscode.FileType.SymbolicLink)throw new Error("Symbolic-link model directories are excluded from bounded workspace review.");
    if(!(stat.type & vscode.FileType.Directory))throw new Error("Model asset parent is not a directory.");
  }
  const stat=await vscode.workspace.fs.stat(target);
  if(stat.type & vscode.FileType.SymbolicLink)throw new Error("Symbolic-link model assets are excluded from bounded workspace review.");
  if(!(stat.type & vscode.FileType.File))throw new Error("Model asset is not a file.");
  if(!Number.isSafeInteger(stat.size) || stat.size<0 || stat.size>MAX_FILE)throw new Error("Model asset exceeds the 8 MiB file limit.");
  if(session.assetBytes+stat.size>32*1024*1024)throw new Error("Model assets exceed the 32 MiB session limit.");
  const bytes=await vscode.workspace.fs.readFile(target);session.assetBytes+=bytes.byteLength;
  if(bytes.byteLength>MAX_FILE)throw new Error("Model asset exceeds the 8 MiB file limit.");
  if(session.assetBytes>32*1024*1024)throw new Error("Model assets exceed the 32 MiB session limit.");
  return {base64:encodeBase64(bytes),mediaType:/\.(step|stp)$/i.test(request.file)?"model/step":/\.glb$/i.test(request.file)?"model/gltf-binary":"model/vrml"};
}
async function searchProjectFiles(request,session) {
  assertScope(request,session);
  const candidates=await vscode.workspace.findFiles({baseUri:session.scope.boundary,pattern:"**/*.{kicad_sch,kicad_pcb}"},"**/{.git,node_modules}/**",201);
  const safe=candidates.filter(uri=>sameScope(uri,session.scope.boundary)).map(uri=>({uri,path:uri.path.slice(session.scope.boundary.path.replace(/\/$/,"").length+1)})).filter(item=>safePath(item.path)).sort((a,b)=>a.path.localeCompare(b.path));
  safe.sort((a,b)=>(b.path===session.scope.rootFile?1:0)-(a.path===session.scope.rootFile?1:0));
  const files=[],seen=new Set(),warnings=[],readBudget={files:0,bytes:0};let total=0;
  if(candidates.length>=201)warnings.push("Workspace drawing discovery reached its 200-file limit; results are incomplete.");
  for(const item of safe.slice(0,32)) {
    if(seen.has(item.path))continue;
    try {const project=await loadProject(item.uri,{...session.scope,rootFile:item.path},{isCancellationRequested:false},readBudget);
      for(const file of project.files) {if(seen.has(file.path))continue;const size=new TextEncoder().encode(file.content).byteLength;
        if(files.length>=32||total+size>MAX_PROJECT){warnings.push("Project search reached its 32-file / 24 MiB source limit.");break;}
        files.push(file);seen.add(file.path);total+=size;session.paths.add(file.path);
      }warnings.push(...project.warnings);
    }catch(error){warnings.push(`${item.path}: ${error.message}`);}
    if(files.length>=32||total>=MAX_PROJECT||readBudget.files>=MAX_FILES||readBudget.bytes>=MAX_PROJECT)break;
  }
  if(safe.length>32)warnings.push(`Workspace has ${safe.length} discovered drawings; search loads at most 32.`);
  const settings=[],projects=await vscode.workspace.findFiles({baseUri:session.scope.boundary,pattern:"**/*.kicad_pro"},"**/{.git,node_modules}/**",9);
  for(const uri of projects.slice(0,8)) {
    if(!sameScope(uri,session.scope.boundary))continue;const path=uri.path.slice(session.scope.boundary.path.replace(/\/$/,"").length+1);
    if(!/\.kicad_pro$/i.test(path)||path.length>500||path.split('/').some(p=>!p||p==='.'||p==='..'||/[\\:\x00-\x1f\x7f]/.test(p)))continue;
    try{const parts=path.split('/');for(let i=1;i<=parts.length;i++){const stat=await vscode.workspace.fs.stat(vscode.Uri.joinPath(session.scope.boundary,...parts.slice(0,i)));if(stat.type&vscode.FileType.SymbolicLink)throw new Error('Symbolic-link project settings are excluded.');if(i===parts.length&&stat.size>1024*1024)throw new Error('Project settings exceed 1 MiB.');}
      const bytes=await vscode.workspace.fs.readFile(uri);if(bytes.byteLength>1024*1024)throw new Error('Project settings exceed 1 MiB.');settings.push({path,content:new TextDecoder('utf-8',{fatal:true}).decode(bytes)});
    }catch(error){warnings.push(`${path}: ${error.message}`);}
  }
  if(projects.length>8)warnings.push('Only the first eight project settings files were retrieved. Import the desired .kicad_pro if absent.');
  return {files,settings,warnings,snapshotRef:"workspace",totalDrawings:safe.length};
}
async function readProjectFile(path,session){
  if(!projectPaths.filePath(path))throw new Error('Unsupported project file path.');
  const uri=vscode.Uri.joinPath(session.scope.boundary,...path.split('/'));if(!sameScope(uri,session.scope.boundary))throw new Error('Project file escapes workspace.');
  const parts=path.split('/');for(let i=1;i<=parts.length;i++){const stat=await vscode.workspace.fs.stat(vscode.Uri.joinPath(session.scope.boundary,...parts.slice(0,i)));if(stat.type&vscode.FileType.SymbolicLink)throw new Error('Symbolic-link project files are excluded.');if(i===parts.length&&stat.size>MAX_FILE)throw new Error('Project file exceeds 8 MiB.');}
  const bytes=await vscode.workspace.fs.readFile(uri);if(bytes.byteLength>MAX_FILE)throw new Error('Project file exceeds 8 MiB.');return {path,content:new TextDecoder('utf-8',{fatal:true}).decode(bytes)};
}
async function projectInventory(session){
  const candidates=await vscode.workspace.findFiles({baseUri:session.scope.boundary,pattern:'**/*'},'**/{.git,node_modules,__pycache__}/**',5001),files=[],warnings=[];
  if(candidates.length>5000)warnings.push('Workspace discovery reached 5000 files; project structure may be incomplete.');
  const prefix=session.scope.boundary.path.replace(/\/$/,'')+'/';
  for(const uri of candidates.slice(0,5000)){if(!sameScope(uri,session.scope.boundary))continue;const path=uri.path.slice(prefix.length);if(!projectPaths.filePath(path))continue;
    try{const stat=await vscode.workspace.fs.stat(uri);if(stat.type&vscode.FileType.SymbolicLink)continue;files.push({path,size:stat.size});}catch(error){warnings.push(`${path}: unavailable.`);}}
  files.sort((a,b)=>a.path.localeCompare(b.path));if(files.length>1000)warnings.push('First 1000 supported project files shown.');
  return {files:files.slice(0,1000),snapshotRef:'workspace',warnings};
}
function staticHTML(source){
  const preview=require('./media/html-preview.js').documentFor(source,{interactive:false});
  const policy="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; frame-src about:; connect-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none';";
  return '<!doctype html><head><meta http-equiv="Content-Security-Policy" content="'+escaped(policy)+'"></head><body><p>Static repository HTML preview. Scripts and external assets are disabled. Interactive iBOM is available in the browser extension.</p><iframe title="Static untrusted HTML" sandbox="" style="width:100%;height:85vh;border:0;background:white" srcdoc="'+escaped(preview)+'"></iframe></body>';
}
function openStaticHTML(source,path){
  const panel=vscode.window.createWebviewPanel('kicadVisualReview.html','HTML: '+path,vscode.ViewColumn.Beside,{enableScripts:false,localResourceRoots:[]});
  panel.webview.html=staticHTML(source);return {opened:true,interactive:false};
}
async function openOverview(session){
  const panel=vscode.window.createWebviewPanel('kicadVisualReview.project','KiCad Project Review',vscode.ViewColumn.Beside,{enableScripts:true,localResourceRoots:[vscode.Uri.joinPath(session.context.extensionUri,'media'),session.context.extensionUri]});
  const project={files:session.files,scope:session.scope},overview=createSession(session.uri,project,session.context);overview.overview=true;overview.post=message=>panel.webview.postMessage(message);
  const receiver=panel.webview.onDidReceiveMessage(message=>handleMessage(message,overview,reply=>panel.webview.postMessage(reply)));panel.onDidDispose(()=>{overview.disposed=true;liveSessions.delete(overview);receiver.dispose();});panel.webview.html=await htmlFor(panel.webview,session.context,overview);return {opened:true};
}
async function dispatch(request,session) {
  const state=session.context.workspaceState,key=session.storageKey;
  if(['preview-project-html','project-inventory','project-file','open-project-file','open-project-overview'].includes(request.type)){
    if(request.repository!==session.scope.repository||request.ref!==session.scope.ref)throw new Error('Project request belongs to another workspace.');
    if(request.type==='project-inventory')return projectInventory(session);
    if(request.type==='open-project-overview'){assertScope(request,session);return openOverview(session);}
    const path=request.file;const result=await readProjectFile(path,session);
    if(request.type==='project-file')return result;
    if(request.type==='preview-project-html'){if(!/\.html?$/i.test(path))throw Error('HTML preview requires an HTML file.');return openStaticHTML(result.content,path);}
    await vscode.commands.executeCommand('vscode.openWith',vscode.Uri.joinPath(session.scope.boundary,...path.split('/')),VIEW,vscode.ViewColumn.Beside);return {opened:true};
  }
  if(request.type==="rule-report") {
    assertScope(request,session);const path=request.reportPath;
    if(typeof path!=='string'||path.length>500||!path.endsWith('.json')||path.startsWith('/')||path.split('/').some(p=>!p||p==='.'||p==='..'||/[\\:\x00-\x1f\x7f]/.test(p)))throw new Error('Invalid workspace report path.');
    const uri=vscode.Uri.joinPath(session.scope.boundary,...path.split('/'));if(!sameScope(uri,session.scope.boundary))throw new Error('Report escapes workspace.');
    const parts=path.split('/');for(let i=1;i<=parts.length;i++){const stat=await vscode.workspace.fs.stat(vscode.Uri.joinPath(session.scope.boundary,...parts.slice(0,i)));if(stat.type&vscode.FileType.SymbolicLink)throw new Error('Symbolic-link reports are excluded.');if(i===parts.length&&stat.size>4*1024*1024)throw new Error('Rule report exceeds 4 MiB.');}
    const bytes=await vscode.workspace.fs.readFile(uri);if(bytes.byteLength>4*1024*1024)throw new Error('Rule report exceeds 4 MiB.');return {content:new TextDecoder('utf-8',{fatal:true}).decode(bytes),path};
  }
  if(request.type==="project-search-files")return searchProjectFiles(request,session);
  if(request.type==="open-project-drawing"){assertScope(request,session);await vscode.commands.executeCommand("vscode.openWith",vscode.Uri.joinPath(session.scope.boundary,...request.file.split("/")),VIEW,vscode.ViewColumn.Beside);return {opened:true};}
  if(request.type==="repo-asset")return loadRepoAsset(request,session);
  if(request.type==="pair-selection")return relaySelection(request.selection,session);
  if(request.type==="comments-changed") {
    let delivered=0;
    for(const other of liveSessions)if(other!==session && other.scope.boundary.toString()===session.scope.boundary.toString() && await notifySession(other,{type:"comments-refresh"}))delivered++;
    return {delivered};
  }
  if(request.type==="project") {assertScope(request,session);if(request.file!==session.scope.rootFile)throw new Error("Only the opened project can be retrieved.");return session.files;}
  if(request.type==="open-comment-draft" || request.type==="github-annotations")
    throw new Error("GitHub publishing and remote annotation retrieval are unavailable in VS Code. Keep local annotations or export them for review; no repository context is configured.");
  if(request.type==="storage-get") {
    if(![session.variantKey,session.preferencesKey].includes(request.key))throw new Error("Storage key is outside this drawing.");
    const stored=state.get(`${key}:${request.key===session.variantKey ? "variant" : "preferences"}`);return stored===undefined ? {} : {[request.key]:clone(stored)};
  }
  if(request.type==="storage-set") {
    if(!request.values || typeof request.values!=="object" || Array.isArray(request.values) ||
      Object.keys(request.values).length!==1)throw new Error("Storage key is outside this drawing.");
    const storageKey=Object.keys(request.values)[0],value=request.values[storageKey];
    if(![session.variantKey,session.preferencesKey].includes(storageKey))throw new Error("Storage key is outside this drawing.");
    if(storageKey===session.preferencesKey && (!value || typeof value!=="object" || Array.isArray(value) ||
      Object.keys(value).length!==3 || Object.keys(value).some((name)=>!["uiTheme","drawingTheme","rulerUnits"].includes(name)) ||
      !["dark","light"].includes(value.uiTheme) || !["dark","light"].includes(value.drawingTheme) || !["mm","mil"].includes(value.rulerUnits)))throw new Error("Invalid drawing preferences.");
    await state.update(`${key}:${storageKey===session.variantKey ? "variant" : "preferences"}`,clone(value));return null;
  }
  if(request.type==="comment-list") {
    assertScope(request,session);const snapshot=await readSidecar(session);session.sidecarBytes=snapshot.bytes;
    return snapshot.data.annotations.filter((n)=>n.anchor.file===request.file);
  }
  const snapshot=await annotationSnapshot(session),notes=snapshot.data.annotations;
  if(request.type==="comment-save") {
    const note=validateComment(request.comment),scope=note.anchor;
    if(!session.paths.has(scope.file))throw new Error("Annotation belongs to another drawing.");
    if(notes.filter((n)=>n.id===note.id&&n.anchor.file===scope.file).length>1)throw new Error("Annotation identity is ambiguous across saved provenance; no changes were written.");
    const existing=notes.findIndex((n)=>n.id===note.id && n.anchor.file===scope.file);
    if(existing>=0) {
      const previous=notes[existing];
      if(previous.anchor.repository!==scope.repository || previous.anchor.ref!==scope.ref)throw new Error("Existing annotation provenance cannot be rebound.");
      if(request.expectedUpdatedAt!==undefined && request.expectedUpdatedAt!==previous.updatedAt)throw new Error("Annotation was edited elsewhere; reload annotations before retrying.");
      note.createdAt=previous.createdAt;note.updatedAt=new Date(Math.max(Date.now(),Date.parse(previous.updatedAt)+1)).toISOString();notes[existing]=note;
    } else {assertScope(scope,session);if(notes.length>=1000 || notes.filter((n)=>n.anchor.file===scope.file).length>=100)throw new Error("Local annotation limit reached.");notes.push(note);}
    await writeSidecar(session,snapshot,{schemaVersion:1,annotations:notes});return note;
  }
  assertScope(request,session);
  if(request.type==="comment-delete") {
    if(typeof request.id!=="string" || !/^[A-Za-z0-9_-]{1,100}$/.test(request.id))throw new Error("Invalid annotation ID.");
    if(notes.filter((n)=>n.id===request.id&&n.anchor.file===request.file).length>1)throw new Error("Annotation identity is ambiguous across saved provenance; no changes were written.");
    await writeSidecar(session,snapshot,{schemaVersion:1,annotations:notes.filter((n)=>!(n.id===request.id&&n.anchor.file===request.file))});return null;
  }
  throw new Error("Unsupported viewer operation.");
}
function handleMessage(message,session,post) {
  if(session.disposed || !message || message.channel!==CHANNEL || message.token!==session.token ||
    !Number.isSafeInteger(message.id) || message.id<=session.lastId || message.id>10000)return Promise.resolve(false);
  session.lastId=message.id;
  let request=message.request;
  try {if(!request || !OPERATIONS.has(request.type) || new TextEncoder().encode(JSON.stringify(request)).length>MAX_MESSAGE)throw new Error("Invalid or oversized viewer request.");}
  catch(error){return Promise.resolve(post({channel:CHANNEL,token:session.token,id:message.id,reply:{ok:false,error:error.message}}));}
  // Serialize persisted updates and reads, including multiple editors of one URI.
  const run=async()=> {
    let reply;
    try {reply={ok:true,result:await dispatch(request,session)};}catch(error){reply={ok:false,error:String(error.message || error).slice(0,1000)};}
    if(!session.disposed)await post({channel:CHANNEL,token:session.token,id:message.id,reply});return true;
  };
  const result=storageQueue.then(run,run);storageQueue=result.catch(()=>{});return result;
}
async function htmlFor(webview,context,session) {
  const media=vscode.Uri.joinPath(context.extensionUri,"media"),templateUri=vscode.Uri.joinPath(media,session.overview||!safePath(session.scope.rootFile)?"project-viewer.html":"revision-viewer.html");
  let html=new TextDecoder().decode(await vscode.workspace.fs.readFile(templateUri));
  const nonce=secret(),resource=(name)=>webview.asWebviewUri(vscode.Uri.joinPath(media,...name.split("/"))).toString();
  const contextData={token:session.token,stepWorkerUrl:resource("step-worker-vscode.js"),stepWasmUrl:resource("vendor/occt/occt-import-js.wasm"),search:new URLSearchParams({repository:session.scope.repository,ref:session.scope.ref,file:session.scope.rootFile}).toString()};
  const bootstrap=JSON.stringify(contextData).replace(/</g,"\\u003c").replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");
  const csp=`default-src 'none'; script-src 'nonce-${nonce}' ${webview.cspSource} 'wasm-unsafe-eval'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data: blob:; font-src ${webview.cspSource}; connect-src ${resource('step-worker-vscode.js')} ${resource('vendor/occt/occt-import-js.wasm')}; worker-src blob:; base-uri ${webview.cspSource}; frame-src 'none';`;
  html=html.replace(/(src|href)="([^"#:]+)"/g,(match,attr,name)=>`${attr}="${escaped(resource(name))}"`);
  html=html.replace("<head>",`<head><meta http-equiv="Content-Security-Policy" content="${escaped(csp)}"><base href="${escaped(resource(""))}/"><script nonce="${nonce}">globalThis.KiCadVSCodeContext=${bootstrap};</script><script nonce="${nonce}" src="${escaped(webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri,"webview-bridge.js")).toString())}"></script>`);
  html=html.replace(/(<section id="commentsPane"[^>]*>\s*<h2>[^<]*<\/h2>\s*<p class="hint">)[\s\S]*?(<\/p>)/,"$1Annotations are stored in the workspace Git-trackable .kicad-review.json. GitHub publishing and remote annotations are unavailable here; export notes to share them. Read status belongs to this VS Code webview user.$2");
  html=html.replace("<head>","<head><style>.github-comment-controls>label:not(:last-of-type),#loadCategories,#reviewSettings,#refreshGitHub,#refreshCommentPolicy,#commentPolicyStatus,.github-draft-action,.github-publish-action{display:none!important}</style>");
  return html;
}
function activate(context) {
  const navigatorChanged=new vscode.EventEmitter();
  context.subscriptions.push(navigatorChanged,vscode.window.registerTreeDataProvider("kicadVisualReview.navigator",{
    onDidChangeTreeData:navigatorChanged.event,getTreeItem:(item)=>item,
    async getChildren() {
      const drawings=await vscode.workspace.findFiles("**/*.{kicad_sch,kicad_pcb,kicad_pro,kicad_prl,kicad_dru,kicad_wks,gbr,ger,gerber,gtl,gbl,gts,gbs,gto,gbo,gtp,gbp,gko,gm1,drl,xln,html,htm}","**/{.git,node_modules,__pycache__}/**",200);
      const result=drawings.sort((a,b)=>a.path.localeCompare(b.path)).map((uri)=>({label:uri.path.split("/").at(-1),
        description:vscode.workspace.asRelativePath(uri,false),resourceUri:uri,command:{command:"kicadVisualReview.open",title:"Open drawing",arguments:[uri]}}));
      for(const folder of (vscode.workspace.workspaceFolders || []).slice(0,32)) {
        const uri=vscode.Uri.joinPath(folder.uri,".kicad-review.json");
        try {await vscode.workspace.fs.stat(uri);result.push({label:"Review annotations",description:folder.name,resourceUri:uri,command:{command:"vscode.open",title:"Open sidecar",arguments:[uri]}});}catch(error){if(!["FileNotFound","EntryNotFound"].includes(error.code))throw error;}
      }
      return result;
    }
  }));
  context.subscriptions.push(vscode.commands.registerCommand("kicadVisualReview.refreshNavigator",()=>navigatorChanged.fire()));
  const activeUri=(uri)=>uri || vscode.window.activeTextEditor?.document.uri || vscode.window.tabGroups?.activeTabGroup?.activeTab?.input?.uri;
  const provider={
    async openCustomDocument(uri){return {uri,dispose(){}};},
    async resolveCustomEditor(document,panel,cancel) {
      panel.webview.options={enableScripts:true,localResourceRoots:[vscode.Uri.joinPath(context.extensionUri,"media"),context.extensionUri]};
      try {
        const project=await loadProject(document.uri,projectScope(document.uri),cancel),session=createSession(document.uri,project,context);
        session.post=(message)=>panel.webview.postMessage(message);
        const receiver=panel.webview.onDidReceiveMessage((message)=>handleMessage(message,session,(reply)=>panel.webview.postMessage(reply)));
        panel.onDidDispose(()=>{session.disposed=true;liveSessions.delete(session);receiver.dispose();if(![...liveSessions].some((other)=>other.uri.toString()===session.uri.toString()))unpair(session.uri);});
        panel.webview.html=await htmlFor(panel.webview,context,session);
        if(project.warnings.length)vscode.window.showWarningMessage(project.warnings.join(" ").slice(0,2000));
      } catch(error) {panel.webview.html=`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'"></head><body><h2>KiCad drawing could not be opened</h2><p>${escaped(error.message || error)}</p><p>Run the packaging script to prepare shared media for extension development.</p></body></html>`;}
    }
  };
  context.subscriptions.push(vscode.window.registerCustomEditorProvider(VIEW,provider,{supportsMultipleEditorsPerDocument:true,webviewOptions:{retainContextWhenHidden:true}}));
  context.subscriptions.push(vscode.commands.registerCommand("kicadVisualReview.open",async(uri)=> {
    const target=activeUri(uri);
    if(!supportedViewerUri(target)) {vscode.window.showErrorMessage("Select a saved KiCad project, drawing, settings or Gerber file.");return;}
    await vscode.commands.executeCommand("vscode.openWith",target,VIEW);
  }));
  context.subscriptions.push(vscode.commands.registerCommand("kicadVisualReview.openPair",async(uri)=> {
    const target=activeUri(uri);
    if(!supportedViewerUri(target)){vscode.window.showErrorMessage("Select a saved schematic or PCB to pair.");return;}
    try {
      const scope=projectScope(target),directory=target.path.slice(0,target.path.lastIndexOf("/")),opposite=/\.kicad_sch$/i.test(target.path)?"pcb":"sch";
      const found=await vscode.workspace.findFiles(`**/*.kicad_${opposite}`,"**/{.git,node_modules,__pycache__}/**",200);
      const items=found.filter((candidate)=>sameScope(candidate,scope.boundary) && candidate.path.slice(0,candidate.path.lastIndexOf("/"))===directory &&
        new RegExp(`\\.kicad_${opposite}$`,"i").test(candidate.path) && safePath(candidate.path.slice(scope.boundary.path.replace(/\/$/,"").length+1)))
        .sort((a,b)=>a.path.localeCompare(b.path)).map((candidate)=>({label:candidate.path.split("/").at(-1),description:vscode.workspace.asRelativePath(candidate,false),uri:candidate}));
      if(!items.length){vscode.window.showInformationMessage("No opposite-kind KiCad drawing was found in the same folder.");return;}
      const choice=await vscode.window.showQuickPick(items,{placeHolder:"Choose the drawing to review beside this file",matchOnDescription:true});
      if(!choice || !items.includes(choice))return;
      // Validate saved files and their provider boundaries before establishing a pair.
      await loadProject(target,scope);await loadProject(choice.uri,projectScope(choice.uri));
      unpair(target);unpair(choice.uri);
      try {await vscode.commands.executeCommand("vscode.openWith",target,VIEW);await vscode.commands.executeCommand("vscode.openWith",choice.uri,VIEW,vscode.ViewColumn.Beside);
        pairTargets.set(target.toString(),choice.uri.toString());pairTargets.set(choice.uri.toString(),target.toString());}
      catch(error){unpair(target);throw error;}
    } catch(error){vscode.window.showErrorMessage(`Could not open paired review: ${error.message || error}`);}
  }));
  context.subscriptions.push(vscode.commands.registerCommand("kicadVisualReview.openSidecar",async(uri)=> {
    const target=activeUri(uri);if(!target){vscode.window.showErrorMessage("Open a KiCad drawing to identify its annotation workspace.");return;}
    const scope=projectScope(target);await vscode.commands.executeCommand("vscode.open",vscode.Uri.joinPath(scope.boundary,".kicad-review.json"));
  }));
  context.subscriptions.push(vscode.commands.registerCommand("kicadVisualReview.importLegacyNotes",async(uri)=> {
    const target=activeUri(uri);if(!target){vscode.window.showErrorMessage("Open a KiCad drawing to import its previous workspace notes.");return;}
    const run=async()=> {
      const project=await loadProject(target),session=createSession(target,project,context);
      try {
        const legacy=context.workspaceState.get(`${session.storageKey}:comments`,[]);
        if(!Array.isArray(legacy) || legacy.length>1000)throw new Error("Previous workspace notes are invalid or oversized.");
        const before=await readSidecar(session),notes=before.data.annotations;let count=0;
        for(const original of legacy) {
          if(original.anchor?.repository!==identity(session.scope.boundary) || original.anchor?.ref!=="workspace" || !session.paths.has(original.anchor?.file))
            throw new Error("Previous note provenance does not match this workspace; import was cancelled.");
          const note=validateComment({...original,anchor:{...original.anchor,repository:session.scope.repository}},session);
          if(notes.some((n)=>n.id===note.id&&n.anchor.file===note.anchor.file))continue;
          notes.push(note);count++;
        }
        if(count)await writeSidecar(session,before,{schemaVersion:1,annotations:notes});
        navigatorChanged.fire();vscode.window.showInformationMessage(`Imported ${count} previous notes into .kicad-review.json. Original workspace drafts were retained.`);
      } finally {liveSessions.delete(session);}
    };
    const result=storageQueue.then(run,run);storageQueue=result.catch(()=>{});try {await result;}catch(error){vscode.window.showErrorMessage(error.message);}
  }));
}
function deactivate() {pairTargets.clear();}
module.exports={activate,deactivate,_test:{projectScope,sameScope,childPath,loadProject,createSession,handleMessage,htmlFor,staticHTML,validateSidecar,readSidecar,writeSidecar,CHANNEL,MAX_FILE,MAX_PROJECT}};
