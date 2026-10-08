const test=require('node:test'),assert=require('node:assert/strict'),{fields,replace}=require('../part-fields.js');
const source='(kicad_pcb (footprint "R" (uuid "part") (at 1 2 90) (property "Reference" "R1") (property "Value" "10k") (property "MPN" "OLD") (pad "1" smd rect (at 0 0) (net 1 "DATA"))))';
test('field edit preserves all bytes except selected field strings',()=>{
 assert.deepEqual(fields(source,'part').map(f=>f.name),['Value','MPN']);
 const revised=replace(source,'part',{Value:'20k',MPN:'NEW'});assert.equal(revised,source.replace('"10k"','"20k"').replace('"OLD"','"NEW"'));assert.equal(replace(source,'part',{Value:'10k'}),source);
});
test('quoted data stays data, with protected identities and missing fields rejected',()=>{
 const value='quoted "field" \n (pad injected)';assert.equal(fields(replace(source,'part',{Value:value}),'part')[0].value,value);
 assert.throws(()=>replace(source,'part',{Reference:'R2'}),/protected/);assert.throws(()=>replace(source,'part',{Footprint:'Other'}),/protected/);assert.throws(()=>replace(source,'part',{Unknown:'new'}),/missing/);assert.throws(()=>replace(source,'part',{Value:'x'.repeat(4097)}),/4096/);
});
test('only placed schematic symbol is patched, not embedded library definition',()=>{
 const s='(kicad_sch (lib_symbols (symbol "R" (property "Value" "LIB"))) (symbol (lib_id "R") (uuid "a") (property "Value" "10k")))';assert.equal(replace(s,'a',{Value:'22k'}),s.replace('"10k"','"22k"'));
 assert.throws(()=>replace('(kicad_pcb (footprint R (uuid a)) (footprint R (uuid a)))','a',{}),/ambiguous/);
});
