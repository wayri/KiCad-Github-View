const test=require('node:test'),assert=require('node:assert/strict');
const {sheetOverviewEntries,composeSheetOverview}=require('../review-workspace.js');
const {resolve}=require('../overview-connectivity.js');
const sheets=['root.kicad_sch','channel.kicad_sch'].map(path=>({path,label:path,kind:'schematic'}));
const links=['Left','Right'].map(label=>({path:'root.kicad_sch',uuid:label,label,properties:{Sheetfile:'channel.kicad_sch'}}));
const net=(id,path,extra={})=>({id,path,kind:'schematic',name:id,primitives:[],members:[{kind:'label',position:{x:10,y:20}}],...extra});
const nets=[net('left','root.kicad_sch',{sheetPins:[{sheetId:'Left',name:'IN'}]}),net('right','root.kicad_sch',{sheetPins:[{sheetId:'Right',name:'IN'}]}),net('input','channel.kicad_sch',{hierarchicalNames:['IN']})];
test('hierarchy placements connect only the selected repeated channel and retain the full stack identity',()=>{
 const entries=sheetOverviewEntries(sheets,links),placements=entries.flatMap(e=>e.placements),channel=entries.find(e=>e.sheet.path==='channel.kicad_sch');
 assert.equal(channel.instanceCount,2);assert.equal(new Set(channel.placements.map(p=>p.id)).size,2);
 const result=resolve(nets,['left'],placements);
 assert.deepEqual(result.matches.map(m=>m.net.id).sort(),['input','left']);
 const connected=result.matches.filter(m=>m.net.path===channel.sheet.path).map(m=>m.instanceId);
 assert.equal(connected.length,1);assert.equal(channel.placements.find(p=>p.id===connected[0]).sheetId,'Left');
 assert.equal(result.links.length,1);
});
test('clicking the front copy of a stacked sheet cannot highlight another repeated channel',()=>{
 const entries=sheetOverviewEntries(sheets,links),channel=entries.find(e=>e.sheet.path==='channel.kicad_sch');
 const right=channel.placements.find(p=>p.sheetId==='Right');
 const result=resolve(nets,[{netId:'input',instanceId:right.id}],entries.flatMap(e=>e.placements));
 assert.deepEqual(result.matches.map(m=>m.net.id).sort(),['input','right']);
 assert.equal(result.matches.some(m=>m.instanceId===channel.placements.find(p=>p.sheetId==='Left').id),false);
});
test('stacked canvas preserves front-copy picking identity and routes airwires to backing copies',()=>{
 const source={type:'line',uuid:'wire',points:[{x:1,y:2},{x:3,y:4}]};
 const entries=[{path:'root',label:'Root',design:{page:{width:100,height:100},primitives:[]},groups:[]},{path:'channel',label:'Channel',instanceCount:2,instanceId:'left',instanceLabel:'Root / Left',placements:[{id:'left'},{id:'right'}],design:{page:{width:100,height:100},primitives:[source]},groups:[]}];
 const result=composeSheetOverview(entries,[{from:{path:'root',position:{x:10,y:20}},to:{path:'channel',instanceId:'right',position:{x:10,y:20}}}]);
 const channel=result.pages[1],wire=result.design.primitives.find(p=>p.uuid==='wire');
 assert.equal(wire.sourceInstanceId,'left');assert.deepEqual(source.points,[{x:1,y:2},{x:3,y:4}]);
 assert.deepEqual(result.airwires[0].points[1],{x:channel.x+13,y:channel.y+23});
 assert.ok(result.design.primitives.some(p=>p.text==='Root / Left'));
});
