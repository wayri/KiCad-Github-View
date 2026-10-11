const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
function harness(request){
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,value:id==='resultView'?'map':'75',addEventListener(){}});return nodes.get(id);};let builds=0;
 const context={document:{getElementById:node,body:{classList:{contains:()=>false}}},TextEncoder,crypto:crypto.webcrypto,KiCadAnalysisSpatial:require('../analysis-spatial.js'),KiCadAnalysisData:require('../analysis-data.js'),KiCadPCBRenderer:{build(){builds++;return{primitives:[]};}},KiCadDesignDiff:{parse:s=>s}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../analysis-overlay.js'),'utf8'),context);
 return{controller:context.KiCadAnalysisOverlay.mount({request}),node,builds:()=>builds};
}
const content='exact PCB bytes',sha=crypto.createHash('sha256').update(content).digest('hex'),report={request:{board_path:'board.kicad_pcb'},source_sha256:sha};
test('PCB background requires exact saved source bytes, not merely matching filename',async()=>{
 for(const [actual,expected]of [[content,1],[content+'\n',0]]){
  const h=harness(async type=>type==='project-inventory'?{files:[{path:'board.kicad_pcb'}]}:type==='project-file'?{content:actual}:{paths:[]});
  await h.controller.setReport(report);assert.equal(h.builds(),expected);assert.match(h.node('overlayStatus').textContent,expected?/verified by SHA-256/:/could not be matched/);h.controller.dispose();
 }
});
test('stale report responses cannot attach geometry after file changes or disposal',async()=>{
 let finish;const h=harness(()=>new Promise(resolve=>{finish=resolve;}));
 const pending=h.controller.setReport(report);await h.controller.setReport({});finish({files:[{path:'board.kicad_pcb'}]});await pending;
 assert.equal(h.builds(),0);assert.match(h.node('overlayStatus').textContent,/no source PCB attached/);
 const stale=h.controller.setReport(report);h.controller.dispose();finish({files:[{path:'board.kicad_pcb'}]});await stale;assert.equal(h.builds(),0);
});
test('missing source binding never fetches or attaches an unrelated PCB',async()=>{
 let calls=0;const h=harness(async()=>{calls++;throw Error('unexpected');});await h.controller.setReport({model_sha256:sha,board_path:'board.kicad_pcb'});assert.equal(calls,0);assert.equal(h.builds(),0);
});
