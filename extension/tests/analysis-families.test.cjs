const test=require('node:test'),assert=require('node:assert/strict');
const data=require('../analysis-data.js'),simulation=require('../analysis-simulation.js');
test('KiCad workbooks remain settings and separate from spatial wayriCAD results',()=>{
 const workbook=data.parse('project.wbk',JSON.stringify({version:8,tabs:[]}));
 assert.equal(workbook.family,'kicad');assert.deepEqual(workbook.plots,[]);
 const pi=data.parse('results.json',JSON.stringify({schema:'wayricad.pi-transient/v1',times_s:[0,1],source_voltage_V:[1,2]}));
 assert.equal(pi.family,'wayricad');assert.notEqual(pi.familyLabel,workbook.familyLabel);
 assert.equal(data.family('quicktherm/report.csv'),'wayricad');
});
test('ambiguous exports and KiCad Monkey reports are not silently claimed by either simulator',()=>{
 for(const path of ['result.csv','sim/result.json','other.html'])assert.equal(data.family(path),'other');
 assert.equal(data.parse('export.csv','time,V(out)\n0,1\n1,2').family,'other');
 assert.equal(data.family('monkey.json',{savedSource:{schema:'kicad_monkey.design.a0'}}),'other');
 assert.equal(data.family('renamed.json',{savedSource:{quick_therm:{}}}),'wayricad');
});
test('explicit waveform net links retain source category without guessing or changing net identity',()=>{
 const report=data.parse('quickpi/result.csv','time,V(/power/out)\n0,1\n1,2');
 const [entry]=simulation.match(report,{qualifiedNetName:'/power/out'});
 assert.equal(entry.family,'wayricad');assert.equal(entry.familyLabel,'wayriCAD analysis');assert.equal(entry.net,'/power/out');
 assert.deepEqual(simulation.match(report,{qualifiedNetName:'out'}),[]);
});
test('file names and category hints never create missing spatial coordinates or samples',()=>{
 const report=data.parse('quicksi.json','{"tool":"QuickSI","status":"pending"}');
 assert.equal(report.family,'wayricad');assert.deepEqual(report.plots,[]);
 const unknown=data.parse('unclassified.json','{"family":"wayricad","status":"pending"}');
 assert.equal(unknown.family,'other');assert.deepEqual(unknown.plots,[]);
});
