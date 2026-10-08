const test=require('node:test'),assert=require('node:assert/strict');
const source=require('../browser-data.js'),design=require('../design-diff.js');
for(const [name,parse]of [['hierarchy',source.sheetFiles],['drawing',design.parse]]){
 test(name+' rejects unresolved conflicts with line context',()=>{assert.throws(()=>parse('(kicad_sch\n<<<<<<< HEAD\n(symbol)\n=======\n(sheet)\n>>>>>>> other\n)'),/Unresolved Git merge conflict at line 2/);});
 test(name+' retains marker-like text inside quoted fields',()=>{assert.doesNotThrow(()=>parse('(kicad_sch (text "<<<<<<< HEAD\n>>>>>>> example"))'));});
}
