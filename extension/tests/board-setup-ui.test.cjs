const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {model}=require('../board-setup-ui.js'),{parse}=require('../project-settings.js');
test('saved minimum dimensions retain zero, units and provenance without invented defaults',()=>{
 const settings=parse(JSON.stringify({board:{design_settings:{rules:{min_clearance:0,min_resolved_spokes:2,use_height_for_length_calcs:false,future_rule:12}}}}),{file:'board.kicad_pro'}),page=model(settings)[0],fields=page.groups.flatMap(g=>g.fields);
 assert.deepEqual(fields.find(f=>f.key==='min_clearance'),{key:'min_clearance',label:'Minimum clearance',value:0,path:'/board/design_settings/rules/min_clearance',unit:'mm'});
 assert.equal(fields.find(f=>f.key==='min_resolved_spokes').unit,'');assert.equal(fields.find(f=>f.key==='use_height_for_length_calcs').value,false);assert.ok(fields.some(f=>f.key==='future_rule'));assert.ok(!fields.some(f=>f.key==='min_track_width'));
});
test('native saved project maps to separate KiCad rule pages and severity choices',()=>{
 const fixture=fs.readFileSync(require.resolve('./fixtures/embedded/native-vectors.kicad_pro'),'utf8'),settings=parse(fixture,{file:'native.kicad_pro'}),pages=model(settings);
 assert.deepEqual(pages.map(p=>p.title),['Constraints','Pre-defined Sizes','Net Classes','Custom Rules','Violation Severity','Teardrops','Length-tuning Patterns']);
 const severity=pages.find(p=>p.id==='severity').severity;assert.equal(severity.find(f=>f.key==='shorting_items').value,'error');assert.equal(severity.find(f=>f.key==='missing_courtyard').value,'ignore');assert.equal(pages.find(p=>p.id==='sizes').tables[0].rows.length,0);
});
test('size, class and assignment tables retain saved order, units, unknown names and missing values',()=>{
 const settings=parse(JSON.stringify({board:{design_settings:{track_widths:[0,0.2],via_dimensions:[{diameter:0.6,drill:0.3}],diff_pair_dimensions:[{width:0.2,gap:0.15,via_gap:0.3}]}},net_settings:{classes:[{name:'Default',clearance:0.1},{name:'<Power>',track_width:0.5}],netclass_patterns:[{pattern:'V*',netclass:'<Power>'}],netclass_assignments:{'A/B~C':['Default','<Power>']}}}),{file:'demo.kicad_pro'}),pages=model(settings),sizes=pages.find(p=>p.id==='sizes').tables,net=pages.find(p=>p.id==='netclasses');
 assert.deepEqual(sizes[0].rows.map(row=>row[0].value),[0,0.2]);assert.equal(sizes[1].rows[0][1].unit,'mm');assert.equal(net.tables[0].rows[1][0].value,'<Power>');assert.equal(net.tables[0].rows[1][1].value,undefined);assert.equal(net.tables[1].rows[0][0].value,'V*');assert.equal(net.groups[0].fields[0].path,'/net_settings/netclass_assignments/A~1B~0C');
});
test('custom rules retain inert conditions and board-only files do not invent project constraints',()=>{
 const rules=parse('(version 1)(rule "HV" (condition "A.NetClass == \'Power\'") (constraint clearance (min 1mm)))',{file:'board.kicad_dru'});assert.equal(model(rules).find(p=>p.id==='custom').rules[0].condition,"A.NetClass == 'Power'");
 const board=parse('(kicad_pcb (setup))',{file:'board.kicad_pcb'});assert.equal(model(board)[0].groups.length,0);
});
