// Standard VS Code extension-test runner. Launch only against a disposable demo.
const vscode=require("vscode"),assert=require("node:assert/strict");
async function run() {
  const extension=vscode.extensions.getExtension("wayri.kicad-visual-review");assert.ok(extension,"development extension must be available");
  const api=(await extension.activate())._test;assert.ok(api,"extension activation returned its host contract");
  const folder=vscode.workspace.workspaceFolders?.[0];assert.ok(folder,"disposable demo workspace is required");
  assert.ok(folder.uri.path.endsWith("/.vizdiff/vscode-demo-project"),"smoke test is restricted to the disposable demo directory");
  const drawings=await vscode.workspace.findFiles("**/*.kicad_sch",undefined,32),root=drawings.find((uri)=>uri.path.endsWith("/pic_programmer.kicad_sch"));
  assert.ok(root,"PIC programmer root demo is required");
  const before=await vscode.workspace.fs.readFile(root),project=await api.loadProject(root);assert.ok(project.files.length>=2,"native hierarchy reads include child sheets");
  await vscode.commands.executeCommand("kicadVisualReview.open",root);
  const tab=vscode.window.tabGroups.all.flatMap((group)=>group.tabs).find((item)=>item.input instanceof vscode.TabInputCustom && item.input.uri.toString()===root.toString());
  assert.ok(tab,"open command creates a real native custom editor");assert.equal(tab.input.viewType,"kicadVisualReview.viewer");
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
  assert.ok(vscode.window.tabGroups.all.some((group)=>group.tabs.some((item)=>item.input instanceof vscode.TabInputCustom && item.input.uri.toString()===boards[0].toString())),"PCB navigator command opens native custom editor");
  const output=vscode.Uri.joinPath(extension.extensionUri,"..",".vizdiff","vscode-host-smoke","result.json");
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(output,".."));
  await vscode.workspace.fs.writeFile(output,new TextEncoder().encode(JSON.stringify({activated:true,schematicEditorOpened:true,hierarchyFiles:project.files.length,boardEditorOpened:true,sidecarPersisted:true,sourcesUnchanged:true,rendererControls:"not visually inspected"},null,2)));
  console.log("KICAD_HOST_SMOKE_OK");
}
module.exports={run};
