const test=require('node:test'),assert=require('node:assert/strict');
const {parse}=require('../design-diff.js'),{inspect}=require('../file-compatibility.js');
test('KiCad 9 and 10 saved headers retain recognized geometry without version rejection',()=>{
 for(const version of ['9.0','10.0']){
  const ast=parse(`(kicad_pcb (version 20241229) (generator_version "${version}") (segment (start 1 2) (end 3 4) (width .2) (layer "F.Cu")))`);
  const result=require('../pcb-renderer.js').build(ast);
  assert.equal(result.compatibility.generatorVersion,version);assert.equal(result.compatibility.forwardPreview,false);
  assert.deepEqual(result.primitives.find(p=>p.kind==='track').points,[{x:1,y:2},{x:3,y:4}]);
 }
});
test('synthetic future headers and unknown constructs are visibly disclosed, not claimed as verified',()=>{
 const ast=parse('(kicad_sch (generator_version "11.0-dev") (version 20270101) (future_geometry (x 3)))');
 const result=require('../schematic-renderer.js').build(ast);
 assert.equal(result.compatibility.forwardPreview,true);assert.deepEqual(result.compatibility.unknown,['future_geometry']);
 assert.ok(result.warnings.some(w=>w.includes('forward-compatibility')));assert.ok(result.warnings.some(w=>w.includes('future_geometry')));
});
test('missing generator does not invent a KiCad major version',()=>{
 assert.equal(inspect(parse('(kicad_pcb (version 20241229))')).generatorVersion,null);
 assert.throws(()=>inspect([]),/root/);
});
