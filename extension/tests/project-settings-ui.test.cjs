const test=require('node:test'),assert=require('node:assert/strict'),ui=require('../project-settings-ui.js');
test('saved setup dimensions carry only explicit known source units',()=>{
 assert.equal(ui.unit({path:'/board/design_settings/rules/min_clearance',value:.2},'saved.kicad_pro'),'mm');
 assert.equal(ui.unit({path:'/board/design_settings/defaults/copper_text_size_h',value:1},'saved.kicad_pro'),'mm');
 assert.equal(ui.unit({path:'/board/design_settings/diff_pair_dimensions/0/gap',value:.2},'saved.kicad_pro'),'mm');
 assert.equal(ui.unit({path:'/future/strange_length',value:1},'saved.kicad_pro'),'');
 assert.equal(ui.unit({path:'/rules/min_clearance',value:.2},'saved.kicad_prl'),'');
 assert.equal(ui.unit({path:'/rules/min_clearance',value:'automatic'},'saved.kicad_pro'),'');
});
test('categories and net-class rows preserve saved future fields without inventing defaults',()=>{
 assert.equal(ui.group({path:'/board/design_settings/rules/min_clearance'}),'Board / Design settings / Rules');
 const future={name:'Power',clearance:.4,custom:'saved'};assert.deepEqual(ui.netClasses({tree:{net_settings:{classes:[future,null,[]]}}}),[future]);
 assert.equal(ui.netClasses({tree:{}}).length,0);assert.equal(ui.label('drc_exclusion'),'DRC exclusion');
});
