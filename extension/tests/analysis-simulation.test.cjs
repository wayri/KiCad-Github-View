const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const data=require('../analysis-data.js'),simulation=require('../analysis-simulation.js');
const fixture=name=>fs.readFileSync(path.join(__dirname,'fixtures/simulation',name),'utf8');

test('saved complex traces preserve source, units and both numerical components',()=>{
 const report=data.parse('results/ac.raw',fixture('saved-ac.raw'));
 assert.equal(report.path,'results/ac.raw');assert.equal(report.plots[0].title,'AC Analysis');
 assert.equal(report.plots[0].series.length,4);
 const matches=simulation.match(report,{qualifiedNetName:'/filter/out'});assert.equal(matches.length,2);
 assert.deepEqual(matches.map(m=>m.series.signal.component),['real','imaginary']);
 assert.deepEqual(matches.map(m=>m.series.points[1].y),[.5,-.5]);
 assert.equal(matches[0].series.signal.unit,'V');assert.equal(report.plots[0].series[2].signal.unit,'A');
 assert.ok(report.fields.some(f=>f.path==='Date'&&f.value==='2026-10-28'));
 assert.ok(report.fields.some(f=>f.path==='Title'&&f.value.includes('not solver output')));
});

test('native CSV run suffix retains exact net identity and event timestamps',()=>{
 const report=data.parse('results/transient.csv',fixture('saved-transient.csv'));
 const matches=simulation.match(report,{qualifiedNetName:'/filter/out'});assert.equal(matches.length,1);
 assert.equal(matches[0].series.signal.run,'1');assert.equal(matches[0].series.signal.expression,'V(/filter/out)1');
 assert.deepEqual(matches[0].series.points.map(p=>p.x),[0,1e-6,1e-6,2e-6]);
 for(const selection of [{netName:'out'},{netName:'/filter/out',sourcePath:'filter.kicad_sch'},{qualifiedNetName:'/Filter/out'},{qualifiedNetName:'out'},{qualifiedNetName:'/unrelated/out'}])assert.deepEqual(simulation.match(report,selection),[]);
 assert.equal(simulation.catalogue(report).length,2); // Current through V1 is not a net voltage.
});

test('explicit source binding cannot cross into another sheet',()=>{
 const report=data.parse('x.csv','time;V(out)\n0;1');report.plots[0].series[0].signal.sourcePath='first.kicad_sch';
 assert.equal(simulation.match(report,{netName:'out',sourcePath:'first.kicad_sch'}).length,1);
 assert.deepEqual(simulation.match(report,{netName:'out',sourcePath:'second.kicad_sch',qualifiedNetName:'out'}),[]);
});

test('expressions, differential voltages and arbitrary labels are never single-net links',()=>{
 const report=data.parse('signals.csv','time;V(out,in);V(out)+V(in);output;I(V1);V(out) [dB]\n0;1;2;3;4;5');
 assert.equal(simulation.catalogue(report).length,0);
});

test('raw rejects ambiguous layouts and malformed indices without inventing samples',()=>{
 const raw=fixture('saved-ac.raw');
 for(const [from,to,pattern]of [
  ['1 v(/filter/out)','9 v(/filter/out)',/index/],
  ['2 i(v1) current','2 v(/filter/out) current',/duplicate/],
  ['Flags: complex','Flags: complex unpadded',/flags/],
  ['No. Points: 3','No. Points: 3junk',/dimensions/],
  ['No. Points: 3','No. Points: 200001',/dimensions/],
  ['No. Variables: 3','No. Variables: 256\nNo. Variables: 3',/duplicate/],
  ['0 10,0','0 10,2',/sweep axes/],
  ['1 v(/filter/out) voltage','1 v(/filter/out) voltage dims=2',/dimensions/],
  ['0.005,0.006','NaN,0.006',/sample value/],
  ['Values:','Binary:',/Binary/]
 ])assert.throws(()=>data.parse('bad.raw',raw.replace(from,to)),pattern);
 assert.throws(()=>data.parse('multiple.raw',raw+'\n'+raw),/Incomplete/);
 const budget=raw.replace('No. Variables: 3','No. Variables: 11').replace('No. Points: 3','No. Points: 200000');
 assert.throws(()=>data.parse('oversized.raw',budget),/dimensions/); // 4.4m real/imag cells, before allocating rows.
});

test('all declared raw signals are visible beyond generic table preview limit',()=>{
 const count=70,raw='Title: many\nFlags: real\nNo. Variables: '+count+'\nNo. Points: 1\nVariables:\n'+Array.from({length:count},(_,i)=>i+' '+(i?'v(/n'+i+') voltage':'time time')).join('\n')+'\nValues:\n0 0\n'+'1\n'.repeat(count-1);
 const report=data.parse('many.raw',raw);assert.equal(report.plots[0].series.length,69);assert.equal(simulation.match(report,{qualifiedNetName:'/n69'}).length,1);
});

test('workbook cannot masquerade as numerical result through generic JSON axes',()=>{
 const report=data.parse('settings.wbk',JSON.stringify({version:6,tabs:[],x:[0,1],y:[2,3]}));assert.equal(report.plots.length,0);assert.match(report.warnings.join(),/not waveform samples/);
});

test('raw budgets bound header expansion and tolerate blank separators without row allocation',()=>{
 const raw=fixture('saved-ac.raw');assert.throws(()=>data.parse('huge-header.raw','Title: '+'x'.repeat(1024*1024)+'\n'+raw),/metadata budget/);
 const report=data.parse('blank-lines.raw',raw.replace('Values:\n','Values:\n'+'\n'.repeat(250000)));assert.equal(report.plots[0].series[0].points.length,3);
});

test('saved declared quantities take precedence over suggestive raw variable spelling',()=>{
 const report=data.parse('typed.raw',fixture('saved-ac.raw').replace('v(/filter/out) voltage','v(/filter/out) current'));
 assert.equal(simulation.catalogue(report).length,0);assert.equal(report.plots[0].series[0].signal.unit,'A');
});

test('CSV exports retain selectable signals beyond the first 64 columns',()=>{
 const names=Array.from({length:69},(_,i)=>'V(/n'+i+')'),report=data.parse('many.csv','time;'+names.join(';')+'\n0;'+'1;'.repeat(68)+'1');
 assert.equal(report.plots[0].series.length,69);assert.equal(simulation.match(report,{qualifiedNetName:'/n68'}).length,1);
});
