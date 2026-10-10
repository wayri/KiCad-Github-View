/* CPU preparation benchmark; synthetic source, no private project files. */
const {performance}=require('node:perf_hooks');
const diff=require('../design-diff.js'),model=require('../design-model.js'),pcb=require('../pcb-renderer.js'),nets=require('../net-model.js');
const content='(kicad_pcb (layers (0 "F.Cu" signal)) (net 1 "GND") '+Array.from({length:12000},(_,i)=>`(segment (start ${i%120} ${Math.floor(i/120)}) (end ${i%120+.8} ${Math.floor(i/120)}) (width .2) (layer "F.Cu") (net 1) (uuid "track-${i}"))`).join(' ')+')';
const files=[{path:'synthetic.kicad_pcb',content}];
function run(shared){const start=performance.now(),snapshot=shared?diff.prepareProject(files):null;
 const m=model.buildProject(files,null,snapshot),design=pcb.build(shared?diff.preparedFile(snapshot,files[0].path):diff.parse(content),files[0].path),net=nets.build(files,new Map([[files[0].path,design]]),snapshot);
 return{ms:performance.now()-start,objects:m.objects.length,primitives:design.primitives.length,nets:net.nets.length};}
const median=shared=>{run(shared);const results=Array.from({length:5},()=>run(shared));return results.sort((a,b)=>a.ms-b.ms)[2];};
const baseline=median(false),optimized=diff.prepareProject?median(true):null;console.log(JSON.stringify({fixture:'12,000-track PCB',bytes:Buffer.byteLength(content),baseline,optimized,speedup:optimized?baseline.ms/optimized.ms:null},null,2));
