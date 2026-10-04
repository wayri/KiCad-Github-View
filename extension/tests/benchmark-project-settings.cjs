// Run: node --expose-gc extension/tests/benchmark-project-settings.cjs [PCB path] [runs]
// Baseline reproduces full AST/filter/copy with the same 64 MiB input cap.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const filename=process.argv[2]||'.vizdiff/chrome-preview/fixtures/main/design/Marble.kicad_pcb';
const runs=Number(process.argv[3]||5),text=fs.readFileSync(filename,'utf8');
const source=fs.readFileSync(path.join(__dirname,'../project-settings.js'),'utf8');
const context={KiCadDesignDiff:require('../design-diff.js'),TextEncoder};
vm.runInNewContext(source.replace('if(boardSettings)return boardSettingsTree(text);',''),context);
const baseline=context.KiCadProjectSettings,selective=require('../project-settings.js'),options={file:filename};
const normalized=v=>JSON.stringify(v);
assert.equal(normalized(selective.parse(text,options)),normalized(baseline.parse(text,options)));
console.log(JSON.stringify({file:filename,bytes:Buffer.byteLength(text),runs,equivalent:true}));
for(const [name,parser] of [['full AST baseline',baseline],['selective settings',selective]]){
 const elapsed=[],heap=[];
 for(let i=0;i<runs;i++){
  global.gc?.();const before=process.memoryUsage().heapUsed,start=performance.now();
  const result=parser.parse(text,options);elapsed.push(performance.now()-start);heap.push(process.memoryUsage().heapUsed-before);
  assert.equal(result.kind,'board-settings');
 }
 const median=values=>values.toSorted((a,b)=>a-b)[Math.floor(values.length/2)];
 console.log(JSON.stringify({name,milliseconds:elapsed.map(v=>Math.round(v)),medianMs:Math.round(median(elapsed)),medianHeapDeltaMiB:+(median(heap)/1048576).toFixed(1)}));
}
