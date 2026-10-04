const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
// Usage: node extension/tests/net-model.bench.cjs [baseline-net-model.js]
const diff=require('../design-diff.js'),current=load(path.resolve(__dirname,'../net-model.js')); 
function load(file){const context={TextEncoder,KiCadDesignDiff:diff};vm.runInNewContext(fs.readFileSync(file,'utf8'),context);return context.KiCadNetModel;}
const baseline=process.argv[2]?load(process.argv[2]):null;
const canonical=result=>JSON.stringify(result);
function measure(model,nets,links){const times=[],iterations=nets.length<1000?1000:1;for(let i=0;i<3;i++){const start=performance.now();for(let j=0;j<iterations;j++)model.relatedSchematicNets(nets,nets[j%nets.length].id,links);times.push((performance.now()-start)/iterations);}return times.sort((a,b)=>a-b)[1];}
function run(name,nets,links){if(baseline)for(let i=0;i<Math.min(2,nets.length);i++)assert.equal(canonical(current.relatedSchematicNets(nets,nets[i].id,links)),canonical(baseline.relatedSchematicNets(nets,nets[i].id,links)));
 const before=baseline?measure(baseline,nets,links):null,after=measure(current,nets,links);console.log(JSON.stringify({name,nets:nets.length,links:links.length,beforeMs:before,afterMs:after,speedup:before?before/after:null}));}
const nets=[],links=[];
for(let i=0;i<128;i++){const p=`sheet${i}.kicad_sch`;if(i<127)links.push({path:p,target:`sheet${i+1}.kicad_sch`,sheetId:'next'});for(let j=0;j<64;j++)nets.push({id:`${p}:${j}`,path:p,kind:'schematic',globalNames:j===0?['GND']:[],hierarchicalNames:[`S${j}`],sheetPins:[{sheetId:'next',name:`S${j}`}]});}
run('128-sheet / 8192-net hierarchy',nets,links);
run('8192 networks sharing global GND',nets.map(n=>({...n,globalNames:['GND'],sheetPins:[]})),[]);
const fixture=path.resolve(__dirname,'../../.vizdiff/Marble.kicad_sch');
if(fs.existsSync(fixture)){const files=[{path:'Marble.kicad_sch',content:fs.readFileSync(fixture,'utf8')}];const {nets}=current.build(files);run('retained Marble source nets (without rendered pins)',nets,[]);}
