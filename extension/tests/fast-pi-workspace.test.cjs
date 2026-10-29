const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parse}=require('../design-diff.js'),{boardInfo}=require('../fast-pi-workspace.js');
test('Fast PI setup reads saved net identifiers and copper layers without making up stackup values',()=>{
 const info=boardInfo(parse('(kicad_pcb (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (44 "Edge.Cuts" user)) (net 0 "") (net 2 "GND") (net 4 "-12V"))'));
 assert.deepEqual(info,{nets:[{id:2,name:'GND'},{id:4,name:'-12V'}],layers:['F.Cu','B.Cu']});
});
test('Fast PI worker returns exact solver result or a visible failure without executing arbitrary scripts',()=>{
 let handler,reply,imported;const context={self:{KiCadFastPI:{solveBoard(ast,options){if(options.fail)throw Error('disconnected');return {voltageV:ast[0],dropV:options.drop};}},postMessage:x=>reply=x},importScripts:path=>imported=path};
 vm.runInNewContext(fs.readFileSync(require.resolve('../fast-pi-worker.js'),'utf8'),context);handler=context.self.onmessage;
 assert.equal(imported,'fast-pi.js');handler({data:{ast:[5],options:{drop:.1}}});assert.equal(reply.ok,true);assert.equal(reply.result.voltageV,5);handler({data:{ast:[],options:{fail:true}}});assert.equal(reply.ok,false);assert.equal(reply.error,'disconnected');
});
test('VS Code Fast PI fetches only its host-supplied packaged worker and revokes the blob URL',async()=>{
 const {createWorker}=require('../fast-pi-workspace.js'),calls=[],signal=new AbortController().signal;
 const host={KiCadVSCodeContext:{fastPIWorkerUrl:'https://resources.example/media/fast-pi-worker-vscode.js'},fetch:async(url,options)=>{calls.push({url,options});return {ok:true,arrayBuffer:async()=>new Uint8Array([1,2]).buffer};},Blob:class {constructor(bytes,options){this.bytes=bytes;this.options=options;}},URL:{createObjectURL:()=> 'blob:owned-worker',revokeObjectURL:url=>calls.push({revoked:url})},Worker:class{constructor(url){this.url=url;}}};
 const worker=await createWorker(host,signal);assert.equal(worker.url,'blob:owned-worker');assert.equal(calls[0].url,host.KiCadVSCodeContext.fastPIWorkerUrl);assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].options.signal,signal);assert.equal(calls[1].revoked,'blob:owned-worker');
 host.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(256*1024+1)});await assert.rejects(createWorker(host),/size is invalid/);
 host.fetch=async()=>({ok:false});await assert.rejects(createWorker(host),/could not be read/);
});
test('self-contained VS Code worker solves a supplied copper strip without importScripts',()=>{
 let reply;const context={postMessage:x=>reply=x};context.self=context;
 vm.runInNewContext(fs.readFileSync(require.resolve('../fast-pi-worker-vscode.js'),'utf8'),context);
 const ast=parse('(kicad_pcb (segment (net 1) (start .5 .5) (end 9.5 .5) (width 1) (layer "F.Cu")))');
 context.onmessage({data:{ast,options:{net:1,layers:[{name:'F.Cu',zMm:0,thicknessMm:.035}],conductivitySm:58000000,cellSizeMm:1,currentA:2,sourceVoltageV:5,source:{x:.5,y:.5,layer:'F.Cu'},sink:{x:9.5,y:.5,layer:'F.Cu'}}}});
 assert.equal(reply.ok,true);assert.ok(Math.abs(reply.result.dropV-2*.009/(58000000*.001*.000035))<1e-10);
});
