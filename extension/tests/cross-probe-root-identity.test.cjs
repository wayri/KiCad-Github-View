const test=require('node:test'),assert=require('node:assert/strict');
const {buildProject}=require('../design-model.js'),paired=require('../paired-review.js');
const files=(instance='/root',root='root',paths=['/sym'])=>[
 {path:'root.kicad_sch',content:`(kicad_sch (uuid ${root}) (symbol (lib_id "Device:R") (at 10 20) (uuid sym) (property "Reference" "R1") (instances (project "Demo" (path "${instance}" (reference "R1") (unit 1))))))`},
 {path:'board.kicad_pcb',content:`(kicad_pcb (layers (0 "F.Cu" signal)) ${paths.map((path,i)=>`(footprint "R" (layer "F.Cu") (at ${10+i*4} 20) (uuid fp${i}) (path "${path}") (property "Reference" "R${i+1}") (pad "1" smd rect (at 0 0) (size 2 1) (layers "F.Cu") (uuid pad${i})))`).join(' ')})`}
];
const records=(...args)=>{const f=files(...args);return {symbol:buildProject([f[0]]).objects.find(o=>o.kind==='symbol'),board:buildProject([f[1]]).objects.filter(o=>o.kind==='footprint')};};
test('root-relative converted PCB association matches the full saved schematic root path both ways',()=>{
 const {symbol,board}=records();assert.equal(paired.relatedPart(board,paired.partSelection(symbol)).object,board[0]);assert.equal(paired.relatedPart([symbol],paired.partSelection(board[0])).object,symbol);
});
test('cross-probe identity survives omitted property snapshots',()=>{
 const {symbol,board}=records();assert.equal(paired.partSelection(symbol).tstampPath,'/root/sym');assert.equal(paired.partSelection(symbol).rootUuid,'root');const omitted=o=>({...o,saved:{...o.saved,tree:{omitted:1},truncated:true}}),s=omitted(symbol),b=omitted(board[0]);assert.equal(paired.relatedPart([b],paired.partSelection(s)).object,b);assert.equal(paired.relatedPart([s],paired.partSelection(b)).object,s);
});
test('converted root matching never drops nested sheet identity or guesses a foreign root',()=>{
 for(const [instance,root]of [['/root/child','child'],['/foreign','root']]){const {symbol,board}=records(instance,root);assert.ok(paired.relatedPart(board,paired.partSelection(symbol)).error);assert.ok(paired.relatedPart([symbol],paired.partSelection(board[0])).error);}
 const {board}=records();assert.ok(paired.relatedPart(board,{kind:'part',reference:'R1',path:'root.kicad_sch',uuid:'sym',tstampPath:'/foreign/sym'}).error);
});
test('converted root matching rejects multiple footprint instances and mismatched UUIDs',()=>{
 const {symbol,board}=records('/root','root',['/sym','/root/sym']);assert.ok(paired.relatedPart(board,paired.partSelection(symbol)).error);
 const single=records();assert.ok(paired.relatedPart(single.board,{...paired.partSelection(single.symbol),uuid:'wrong',tstampPath:'/root/wrong'}).error);
});
test('converted root matching rejects reused schematic placements and truncated identity lists',()=>{
 const f=files();f[0].content=f[0].content.replace('(unit 1)', '(unit 1)').replace('(path "/root" (reference "R1") (unit 1))','(path "/root" (reference "R1") (unit 1)) (path "/root/other" (reference "R2") (unit 1))');
 const symbol=buildProject([f[0]]).objects.find(o=>o.kind==='symbol'),board=buildProject([f[1]]).objects.find(o=>o.kind==='footprint');assert.ok(paired.relatedPart([symbol],paired.partSelection(board)).error);
 const huge=files();huge[0].content=huge[0].content.replace('(path "/root" (reference "R1") (unit 1))',Array.from({length:65},(_,i)=>`(path "/root/s${i}" (reference "R${i}") (unit 1))`).join(' '));const s=buildProject([huge[0]]).objects.find(o=>o.kind==='symbol');assert.ok(paired.relatedPart([s],paired.partSelection(board)).error);
});
test('pin cross-probing retains root association and resolves only the saved terminal',()=>{
 const {symbol,board}=records(),canonical=paired.partSelection(symbol),selection={...canonical,kind:'pin',ownerUuid:symbol.uuid,pinNumber:'1'},pad={kind:'pad',ownerUuid:board[0].uuid,pinNumber:'1'};assert.equal(paired.relatedPin(board,new Map([['board.kicad_pcb',{primitives:[pad]}]]),selection).object,board[0]);
 assert.equal(paired.validSelection({...canonical,rootUuid:'bad/root'}),false);
});

test('an explicit foreign root cannot match a root symbol even when no placement block exists',()=>{
 const f=files();f[0].content=f[0].content.replace('(instances (project "Demo" (path "/root" (reference "R1") (unit 1))))','');const symbol=buildProject([f[0]]).objects.find(o=>o.kind==='symbol');assert.ok(paired.relatedPart([symbol],{kind:'part',path:'board.kicad_pcb',reference:'R1',symbolUuid:'sym',tstampPath:'/foreign/sym'}).error);
});
