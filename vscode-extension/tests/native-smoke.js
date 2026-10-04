// Standard VS Code extension-test runner. Launch only against a disposable demo.
const vscode=require("vscode"),assert=require("node:assert/strict");
async function run() {
  const extension=vscode.extensions.getExtension("wayri.kicad-visual-review");assert.ok(extension,"development extension must be available");
  await extension.activate();const api=require(require("node:path").join(extension.extensionPath,"extension.js"))._test;assert.ok(api,"development module exposes its host test contract");
  const folder=vscode.workspace.workspaceFolders?.[0];assert.ok(folder,"disposable demo workspace is required");
  assert.ok(folder.uri.path.endsWith("/.vizdiff/vscode-demo-project"),"smoke test is restricted to the disposable demo directory");
  const drawings=await vscode.workspace.findFiles("**/*.kicad_sch",undefined,32),root=drawings.find((uri)=>uri.path.endsWith("/pic_programmer.kicad_sch"));
  assert.ok(root,"PIC programmer root demo is required");
  const nativeBoundary=vscode.workspace.getWorkspaceFolder(root)?.uri;assert.ok(nativeBoundary,"demo drawing is in a workspace");
  const scopeEvidence=JSON.stringify({root:{scheme:root.scheme,authority:root.authority,path:root.path,query:root.query,fragment:root.fragment},boundary:{scheme:nativeBoundary.scheme,authority:nativeBoundary.authority,path:nativeBoundary.path,query:nativeBoundary.query,fragment:nativeBoundary.fragment}});
  const scopeOutput=vscode.Uri.joinPath(extension.extensionUri,"..",".vizdiff","vscode-host-smoke","scope.json");await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(scopeOutput,".."));await vscode.workspace.fs.writeFile(scopeOutput,new TextEncoder().encode(scopeEvidence));
  const before=await vscode.workspace.fs.readFile(root),project=await api.loadProject(root);assert.ok(project.files.length>=2,"native hierarchy reads include child sheets");
  const uriKey=uri=>JSON.stringify([uri.scheme,uri.authority,uri.scheme==="file"?uri.path.replace(/^\/[a-z]:/i,drive=>drive.toLowerCase()):uri.path,uri.query,uri.fragment]);
  const waitForTab=uri=>new Promise(resolve=>{
    let subscription,timer;const check=()=>{const tab=vscode.window.tabGroups.all.flatMap(group=>group.tabs).find(item=>item.input instanceof vscode.TabInputCustom && uriKey(item.input.uri)===uriKey(uri));if(tab){subscription?.dispose();clearTimeout(timer);resolve(tab);}};
    subscription=vscode.window.tabGroups.onDidChangeTabs(check);timer=setTimeout(()=>{subscription.dispose();resolve(null);},5000);check();
  });
  await vscode.commands.executeCommand("kicadVisualReview.open",root);
  const tab=await waitForTab(root);
  assert.ok(tab,"open command creates a real native custom editor: "+JSON.stringify(vscode.window.tabGroups.all.flatMap(group=>group.tabs).map(item=>({label:item.label,type:item.input.constructor.name,uri:item.input.uri?.toString(),viewType:item.input.viewType}))));assert.equal(tab.input.viewType,"kicadVisualReview.viewer");
  const context={workspaceState:{get:(key,fallback)=>fallback,update:async()=>{}}},session=api.createSession(root,project,context);
  let reply;const send=async(id,request)=>{await api.handleMessage({channel:api.CHANNEL,token:session.token,id,request},session,(response)=>{reply=response.reply;});assert.equal(reply.ok,true,reply.error);return reply.result;};
  const scope={repository:session.scope.repository,ref:session.scope.ref,file:session.scope.rootFile},notes=await send(1,{type:"comment-list",...scope});
  const existing=notes.find((note)=>note.id==="vscode-host-smoke"),now=new Date().toISOString();
  const note=existing || {id:"vscode-host-smoke",text:"Native VS Code host verified this Git-trackable review annotation.",createdAt:now,updatedAt:now,severity:"info",state:"open",tags:["native-smoke"],remoteRefs:[],anchor:{...scope,kind:"drawing",position:{x:102.87,y:48.26}}};
  await send(2,{type:"comment-save",comment:note,...(existing?{expectedUpdatedAt:existing.updatedAt}:{})});
  await vscode.window.tabGroups.close(tab,true);await vscode.commands.executeCommand("kicadVisualReview.open",root);
  const reopened=api.createSession(root,await api.loadProject(root),context),stored=await api.readSidecar(reopened);
  assert.ok(stored.data.annotations.some((item)=>item.id===note.id&&item.tags.includes("native-smoke")),"sidecar persists after closing/reopening");
  assert.deepEqual(await vscode.workspace.fs.readFile(root),before,"source schematic was not modified");
  const boards=await vscode.workspace.findFiles("**/*.kicad_pcb",undefined,4);assert.ok(boards.length,"PCB demo is required");
  await vscode.commands.executeCommand("kicadVisualReview.open",boards[0]);
  const pcbTab=await waitForTab(boards[0]);assert.ok(pcbTab,"PCB navigator command opens native custom editor");
  const pcbBefore=await vscode.workspace.fs.readFile(boards[0]);
  const modelSession=api.createSession(boards[0],await api.loadProject(boards[0]),context);
  let modelReply;
  await api.handleMessage({channel:api.CHANNEL,token:modelSession.token,id:1,request:{type:"repo-asset",repository:modelSession.scope.repository,ref:modelSession.scope.ref,file:"models/cube.stp"}},modelSession,response=>{modelReply=response.reply;});
  assert.equal(modelReply?.ok,true,modelReply?.error);assert.equal(modelReply.result.mediaType,"model/step");
  assert.match(Buffer.from(modelReply.result.base64,"base64").toString("utf8"),/ISO-10303-21/);
  assert.deepEqual(await vscode.workspace.fs.readFile(boards[0]),pcbBefore,"STEP asset retrieval did not modify the PCB");
  const output=vscode.Uri.joinPath(extension.extensionUri,"..",".vizdiff","vscode-host-smoke","result.json");
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(output,".."));
  await vscode.workspace.fs.writeFile(output,new TextEncoder().encode(JSON.stringify({runId:process.env.KICAD_SMOKE_RUN_ID||null,verifiedAt:new Date().toISOString(),activated:true,schematicEditorOpened:true,hierarchyFiles:project.files.length,boardEditorOpened:true,stepAssetRead:true,stepFrontend:"not verified by host smoke",sidecarPersisted:true,sourcesUnchanged:true,rendererControls:"not visually inspected"},null,2)));
  console.log("KICAD_HOST_SMOKE_OK");
}
module.exports={run};
