const test=require('node:test'),assert=require('node:assert/strict');
const diff=require('../design-diff.js'),paired=require('../paired-review.js');
const source=`(kicad_pcb (footprint "Device:R" (tstamp fp-old) (path "/root/sheet/symbol") (property "Reference" "R1") (pad "1" smd rect (tstamp pad-old))))`;
test('tstamp-era owner parser geometry regains exact native pad and schematic identities',async()=>{
 const {sourceSelectionRecords}=await import('../spike/sourceSelection.mjs');
 const board={components:[{id:'component-R1',ref:'R1'}],pads:[{id:'pad-R1-1',ref:'R1',name:'1',at:[2,3],width:1,height:1}]};
 const result=sourceSelectionRecords(diff.parse(source),board);
 assert.deepEqual(result.components[0],{...board.components[0],uuid:'fp-old',tstampPath:'/root/sheet/symbol',symbolUuid:'symbol'});
 assert.equal(result.pads[0].uuid,'pad-old');assert.equal(result.pads[0].ownerUuid,'fp-old');assert.equal(result.pads[0].pinNumber,'1');assert.deepEqual(result.pads[0].at,[2,3]);
 const {selectableRecord,selectionMatcher}=await import('../spike/selectionState.mjs');
 assert.equal(selectableRecord(result.pads[0],'pin'),true);assert.equal(selectableRecord(result.components[0],'pin'),false);
 const match=selectionMatcher({uuids:['pad-old']},result);assert.equal(match(result.pads[0]),true);assert.equal(match(result.components[0]),false);
});
test('duplicate legacy references and pad keys never acquire another native identity',async()=>{
 const {sourceSelectionRecords}=await import('../spike/sourceSelection.mjs');
 const footprint=source.slice(source.indexOf('(footprint'),-1),ast=diff.parse('(kicad_pcb '+footprint+' '+footprint+')');
 const result=sourceSelectionRecords(ast,{components:[{id:'component-R1',ref:'R1'}],pads:[{id:'pad-R1-1',name:'1'}]});
 assert.equal(result.components[0].uuid,undefined);assert.equal(result.pads[0].uuid,undefined);
});

test('UUID-less pad names come only from saved pinfunction, never pad technology',async()=>{
 const {sourceSelectionRecords}=await import('../spike/sourceSelection.mjs');
 const ast=diff.parse('(kicad_pcb (footprint "LED" (property "Reference" "D1") (pad "A12" smd rect) (pad "B12" smd rect (pinfunction "K"))))');
 const board={components:[],pads:[{id:'pad-D1-A12',name:'A12',pinName:'smd'},{id:'pad-D1-B12',name:'B12',pinName:'smd'},{id:'unmatched-unnumbered-pad',name:'np_thru_hole',pinName:'smd'}]};
 const result=sourceSelectionRecords(ast,board);
 assert.equal(result.pads[0].pinNumber,'A12');assert.equal(result.pads[0].pinName,'');
 assert.equal(result.pads[1].pinNumber,'B12');assert.equal(result.pads[1].pinName,'K');
 assert.equal(result.pads[2].pinNumber,'');assert.equal(result.pads[2].pinName,'');
 assert.equal(board.pads[0].pinName,'smd');
});
test('full schematic instance path separates identical symbol UUIDs in different files',()=>{
 const symbol=(path,context)=>({kind:'symbol',reference:'R1',uuid:'symbol',path,saved:{tree:['symbol',['instances',['project','project',['path',{quoted:context},['reference','R1']]]]]}});
 const a=symbol('a.kicad_sch','/root/a'),b=symbol('b.kicad_sch','/root/b');
 const selection={kind:'part',path:'board.kicad_pcb',reference:'R1',symbolUuid:'symbol',tstampPath:'/root/b/symbol'};
 assert.equal(paired.relatedPart([a,b],selection).object,b);
 assert.match(paired.relatedPart([a,b],{...selection,tstampPath:'/root/other/symbol'}).error,/does not match/);
 assert.equal(paired.validSelection({...selection,tstampPath:'/root/../symbol'}),false);
 assert.equal(paired.validSelection({...selection,tstampPath:'/root/b/different'}),false);
 assert.equal(paired.partSelection(b).tstampPath,'/root/b/symbol');
});
test('missing placement metadata cannot guess a reused sheet from UUID or reference',()=>{
 const symbol={kind:'symbol',reference:'R1',uuid:'symbol',path:'child.kicad_sch',saved:{tree:['symbol']}},parents=['A','B'].map(Sheetname=>({kind:'sheet',path:'root.kicad_sch',properties:{Sheetfile:'child.kicad_sch',Sheetname}}));
 const selection={kind:'part',path:'board.kicad_pcb',reference:'R1',symbolUuid:'symbol'};
 assert.match(paired.relatedPart([symbol,...parents],selection).error,/Multiple saved/);
 assert.match(paired.relatedPart([symbol,...parents],{...selection,tstampPath:'/root/A/symbol'}).error,/does not match/);
});
