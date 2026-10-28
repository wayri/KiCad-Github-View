const test=require('node:test'),assert=require('node:assert/strict');
const api=require('../revision-actions.js'),sha='a'.repeat(40),other='b'.repeat(40);
test('archives pin entire project sources to a full commit for both providers',()=>{
 assert.equal(api.archiveURL({repository:'owner/project'},sha),'https://github.com/owner/project/archive/'+sha+'.zip');
 assert.equal(api.archiveURL({provider:'gitlab',host:'https://git.example',repository:'team/sub/project'},sha),'https://git.example/team/sub/project/-/archive/'+sha+'/project-'+sha+'.zip');
 for(const scope of [{repository:'../repo'},{repository:'a/b/c'},{provider:'gitlab',repository:'a/b',host:'https://token@git.example'},{provider:'gitlab',repository:'a/b',host:'https://git.example/prefix'},{provider:'gitlab',repository:'a/b',host:'https://git.example/?secret=x'}])assert.throws(()=>api.archiveURL(scope,sha));
 assert.throws(()=>api.archiveURL({repository:'a/b'},'main'));
});
test('quick compare is selected saved commit versus immutable current view',()=>{
 const q=api.comparisonQuery({repository:'a/b',file:'sheets/power supply.kicad_sch'},sha,other);
 assert.equal(q.get('base'),sha);assert.equal(q.get('head'),other);assert.equal(q.get('file'),'sheets/power supply.kicad_sch');
 assert.throws(()=>api.comparisonQuery({repository:'a/b',file:'../secrets'},sha,other));
 assert.throws(()=>api.comparisonQuery({repository:'a/b',file:'board.kicad_pcb'},sha,'main'));
});
