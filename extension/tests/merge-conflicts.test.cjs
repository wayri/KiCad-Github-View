const test=require('node:test'),assert=require('node:assert/strict');
const source=require('../browser-data.js'),design=require('../design-diff.js');
for(const [name,parse]of [['hierarchy',source.sheetFiles],['drawing',design.parse]]){
 test(name+' rejects unresolved conflicts with line context',()=>{assert.throws(()=>parse('(kicad_sch\n<<<<<<< HEAD\n(symbol)\n=======\n(sheet)\n>>>>>>> other\n)'),/Unresolved Git merge conflict at line 2/);});
 test(name+' retains marker-like text inside quoted fields',()=>{assert.doesNotThrow(()=>parse('(kicad_sch (text "<<<<<<< HEAD\n>>>>>>> example"))'));});
}
const merge=require('../merge-conflicts.js');
const conflict=(a,b)=>`<<<<<<< HEAD\n${a}\n=======\n${b}\n>>>>>>> incoming\n`;
test('complete candidates preserve exterior bytes and labels',()=>{
 const prefix='\uFEFF(kicad_sch\r\n; café\r\n',suffix='  (text "尾")\r\n)\r\n';
 const s=prefix+'<<<<<<< HEAD\r\n(text "old")\r\n=======\r\n(text "new")\r\n>>>>>>> feature\r\n'+suffix;
 const parsed=merge.parse(s);assert.equal(parsed.conflicts.length,1);assert.equal(parsed.conflicts[0].line,3);
 assert.equal(parsed.conflicts[0].currentLabel,'HEAD');assert.equal(parsed.conflicts[0].incomingLabel,'feature');
 assert.equal(merge.resolve(s,'current'),prefix+'(text "old")\r\n'+suffix);
 assert.equal(merge.resolve(s,'incoming'),prefix+'(text "new")\r\n'+suffix);
 assert.equal(s.slice(parsed.conflicts[0].start,parsed.conflicts[0].end).startsWith('<<<<<<<'),true);
});
test('diff3 ancestor and repeated conflicts support explicit per-conflict choices',()=>{
 const s='(kicad_sch\n<<<<<<< ours\n(text "one")\n||||||| ancestor\n(text "base")\n=======\n(text "two")\n>>>>>>> theirs\n'+conflict('(text "three")','(text "four")')+')';
 const parsed=merge.parse(s);assert.equal(parsed.conflicts[0].base,'(text "base")\n');assert.equal(parsed.base,undefined);
 assert.equal(merge.resolve(s,['incoming','current']),'(kicad_sch\n(text "two")\n(text "three")\n)');
 assert.throws(()=>merge.resolve(s,['current']),/every conflict/);assert.throws(()=>merge.resolve(s,['base','incoming']),/every conflict/);
 const allBase='(kicad_pcb\n<<<<<<< ours\n(version 1)\n||||||| ancestor\n(version 0)\n=======\n(version 2)\n>>>>>>> theirs\n)';
 assert.equal(merge.parse(allBase).base,'(kicad_pcb\n(version 0)\n)');
});
test('markers in quoted strings and comments are retained as data',()=>{
 const s='(kicad_sch (text "escaped \\" quote\n<<<<<<< HEAD\n=======\n>>>>>>> other")\n; <<<<<<< comment\n)';
 assert.equal(merge.parse(s).conflicts.length,0);assert.equal(merge.resolve(s,'current'),s);
});
test('malformed and nested conflicts fail before any selection',()=>{
 for(const s of ['<<<<<<< a\n<<<<<<< b\n','=======\n','>>>>>>> b\n','||||||| a\n','<<<<<<< a\n>>>>>>> b\n','<<<<<<< a\n=======\n=======\n','<<<<<<< a\n||||||| b\n||||||| c\n','<<<<<<< a\n========\n','<<<<<<< a\n=======\n'])assert.throws(()=>merge.parse(s),/Git conflict|ancestor marker/);
 assert.throws(()=>merge.parse('<<<<<<< a\n======= invalid\n'),/separator/);
});
test('analysis reports syntactic failures and selection rejects invalid candidate/root',()=>{
 const s='(kicad_sch\n'+conflict('(text "valid")','(text "invalid") )')+')';
 const result=merge.analyze(s);assert.equal(result.count,1);assert.equal(result.candidates.current.valid,true);
 assert.equal(result.candidates.incoming.valid,false);assert.match(result.validationError,/incoming:/);
 assert.throws(()=>merge.resolve(s,'incoming'),/parenthesis/);assert.doesNotThrow(()=>merge.resolve(s,'current'));
 const rootConflict=conflict('(kicad_sch)','(kicad_pcb)');
 assert.equal(merge.analyze(rootConflict,{expectedRoot:'kicad_sch'}).candidates.incoming.valid,false);
 assert.throws(()=>merge.resolve(rootConflict,'incoming',{expectedRoot:'kicad_sch'}),/root/);
 assert.throws(()=>merge.resolve('(other)','current'),/root/);
 assert.throws(()=>merge.resolve('(kicad_sch)','automatic'),/every conflict/);
});
test('bounds reject too many conflicts and oversized inputs',()=>{
 assert.throws(()=>merge.parse(conflict('','').repeat(merge.MAX_CONFLICTS+1)),/Too many/);
 assert.throws(()=>merge.parse(' '.repeat(merge.MAX_BYTES+1)),/64 MiB/);
});
