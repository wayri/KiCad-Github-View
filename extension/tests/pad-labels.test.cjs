const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {layout}=require('../pad-labels.js');
const pad=(overrides={})=>({number:'12',net:'GND',widthPx:100,heightPx:50,...overrides});

test('pad number and short net share the bounded label',()=>{
 const label=layout(pad());assert.deepEqual(label.lines,['12','GND']);assert.equal(label.text,'12\nGND');assert.equal(label.size,18);
});
test('long net is shortened in the middle without losing pad number',()=>{
 const net='/Hierarchy/'+('long_name_'.repeat(12))+'/SIGNAL';
 const label=layout(pad({net,widthPx:74,heightPx:42}));
 assert.equal(label.lines[0],'12');assert.equal(label.lines.length,2);assert.match(label.lines[1],/…/);assert.ok(net.startsWith(label.lines[1].split('…')[0]));assert.ok(net.endsWith(label.lines[1].split('…')[1]));assert.ok(label.width<=74);
});
test('unconnected pads retain numbers, and optional pin name must fit completely',()=>{
 assert.deepEqual(layout(pad({net:''})).lines,['12']);
 assert.deepEqual(layout(pad({pinName:'IN'})).lines,['12 IN','GND']);
 assert.deepEqual(layout(pad({pinName:'This signal title is too long',widthPx:50})).lines,['12','GND']);
 assert.equal(layout(pad({number:'P'.repeat(160),net:'N'.repeat(160),widthPx:2000,heightPx:60})).lines[0],'P'.repeat(160));
});
test('secondary text never rejects a valid pad number',()=>{
 for(const net of ['N'.repeat(160),'N'.repeat(161),'bad\nnet',{},null])assert.equal(layout(pad({net,widthPx:20,heightPx:20})).lines[0],'12');
 assert.deepEqual(layout(pad({number:'1',net:'long_net',widthPx:13,heightPx:13})).lines,['1']);
});
test('unsafe identity and invalid dimensions are rejected without coercion',()=>{
 for(const number of ['', ' ', 'bad\nnumber','bad\0number','bad\u202enumber','P'.repeat(161),12,{},null])assert.equal(layout(pad({number})),null);
 for(const [widthPx,heightPx] of [[NaN,50],[Infinity,50],[50,-1],[0,50],[50,undefined]])assert.equal(layout(pad({widthPx,heightPx})),null);
});
test('short-axis thresholds and font bounds keep number legible',()=>{
 assert.equal(layout(pad({number:'1',widthPx:12.9,heightPx:80})),null);
 assert.ok(layout(pad({number:'1',widthPx:13,heightPx:80})));
 assert.equal(layout(pad({widthPx:100,heightPx:23.99,minPadPx:24})),null);
 assert.ok(layout(pad({widthPx:100,heightPx:24,minPadPx:24})));
 assert.equal(layout(pad({number:'P'.repeat(160),widthPx:20,heightPx:50})),null);
 for(const widthPx of [13,20,40.5,100,1000])for(const heightPx of [13,24,50.5,100])for(const maxSize of [3,9,15,18,99]){
  const label=layout(pad({number:'1',net:'long_net_name',widthPx,heightPx,maxSize}));
  if(!label)continue;
  assert.ok(label.size>=9&&label.size<=18);assert.ok(label.width<=widthPx);assert.ok(label.height<=heightPx);assert.ok(Number.isInteger(label.width)&&Number.isInteger(label.height));
 }
});
test('browser UMD entrypoint exports the same layout contract',()=>{
 const env={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../pad-labels.js'),'utf8'),env);
 assert.equal(env.KiCadPadLabels.layout(pad()).text,'12\nGND');
});
test('BGA identifiers remain exact with independent number and net visibility',()=>{
 for(const number of ['A1','AA32','1048','EP']){
  const input=pad({number,net:'VCC',widthPx:80,heightPx:50});assert.equal(layout({...input,showNetNames:false}).text,number);
  assert.equal(layout({...input,showNumbers:false}).text,'VCC');assert.equal(layout({...input,showNumbers:false,showNetNames:false}),null);
 }
 assert.equal(layout(pad({showNumbers:false,net:''})),null);
});
