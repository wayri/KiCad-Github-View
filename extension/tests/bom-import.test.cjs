const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const reader=require('../bom-import.js');
const fixtures=path.join(__dirname,'fixtures/bom-import'),read=name=>fs.readFileSync(path.join(fixtures,name),'utf8');
const payload=()=>({metadata:{variant:'Prototype'},edges_bbox:{minx:0,miny:0,maxx:20,maxy:10},edges:[{type:'segment',start:[0,0],end:[20,0],width:.1}],footprints:[{ref:'R1',layer:'F',bbox:{pos:[5,5],relpos:[-1,-.5],size:[2,1],angle:90}},{ref:'R2',layer:'B',bbox:{pos:[15,5],relpos:[-1,-.5],size:[2,1],angle:0}}],bom:{both:[[['R1',0]]],skipped:[1],fields:{0:['10k','R_0603','M-1'],1:['22k','R_0603','M-2']}}});
test('official compressed public iBOM demo imports without running any script',()=>{
 globalThis.document=undefined;const result=reader.parse(read('ibom-public-demo.html'),'ibom.html');assert.equal(result.format,'InteractiveHtmlBom');assert.equal(result.model.objects.length,34);
 const r=result.model.objects.find(x=>x.reference==='R1');assert.equal(r.properties.Value,'100k');assert.equal(r.properties.Footprint,'R_0805_2012Metric');assert.equal(r.side,'F');assert.equal(r.excludeFromBom,false);assert.equal(result.assembly.primitives.length,38);assert.ok(result.warnings.some(x=>x.includes('REF**')));
});
test('fixtures retain source and producer hashes',()=>{const p=JSON.parse(read('provenance.json'));for(const [name,hash]of Object.entries(p.fixture_sha256))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(fixtures,name))).digest('hex'),hash);assert.ok(p.studio.producer_sha256);});
test('actual BoM Studio draft producer export preserves fields and population',()=>{
 const result=reader.parse(read('studio-producer.json'),'bom.json');assert.equal(result.format,'WayriCAD BoM Studio export');assert.equal(result.model.objects.length,11);assert.equal(result.provenance.status,'draft');assert.equal(result.variant,'<Default>');assert.ok(result.model.objects.some(x=>!x.populated));assert.ok(result.model.objects.every(x=>x.properties.MPN));
});
test('CSV grouped ranges have exact per-board quantity and quoted custom fields',()=>{
 const r=reader.parse('References,Qty,Value,Footprint,MPN,Notes\r\n"R1-R3, R8",4,10k,R_0603,"ACME,12","first\nsecond ""quoted"""\r\n','BOM.csv');assert.equal(r.model.objects.length,4);assert.deepEqual(r.model.objects.map(x=>x.reference),['R1','R2','R3','R8']);assert.equal(r.model.objects[0].properties.MPN,'ACME,12');assert.equal(r.model.objects[0].properties.Notes,'first\nsecond "quoted"');assert.equal(r.model.objects[0].metadata.properties.Reference,'R1');
});
test('CSV accepts KiCad semicolons/trailing empty column, TSV and Unicode ranges',()=>{
 assert.equal(reader.parse('Reference;Qty;Value;Footprint;\nR1–R3;3;10k;R_0603;','bom.csv').model.objects.length,3);
 const r=reader.parse('Designator\tValue\tDNP\tInBOM\nC1\t1u\tYes\tNo','any.tsv').model.objects[0];assert.equal(r.populated,false);assert.equal(r.excludeFromBom,true);
});
test('Pocket KiView exported population/exclusion and board quantities round-trip',()=>{const r=reader.parse('Reference,Quantity per board,Build quantity,Population,Excluded from BOM,Side,value,footprint\n"R1,R2",2,20,DNP,Yes,B,10k,R0603','bom.csv');assert.equal(r.model.objects.length,2);assert.equal(r.model.objects[0].populated,false);assert.equal(r.model.objects[0].excludeFromBom,true);assert.equal(r.model.objects[0].side,'B');assert.equal(r.model.objects[0].properties.Value,'10k');});
test('quantity mismatch, duplicate identities and ambiguous ranges are rejected',()=>{
 for(const value of ['Reference,Qty\n"R1,R2",3','Reference,Qty\nR1,1\nR1,1','Reference,Qty\nR01-R03,3','Reference,Qty\nR1-C3,3','Value,Qty\n10k,3'])assert.throws(()=>reader.parse(value,'bom.csv'));
 assert.throws(()=>reader.references('R3-R1'));assert.throws(()=>reader.references('R1-R60000'));
});
test('malformed CSV and duplicate header are rejected',()=>{for(const value of ['Reference,Value\nR1,"x','Reference,Value\nR1,"x"oops','Reference,Value\nR1,x,z','Reference,Reference\nR1,R2'])assert.throws(()=>reader.parse(value,'bom.csv'));});
test('iBOM fields, membership and geometry preserve semantic data',()=>{
 const r=reader.parse(JSON.stringify({pcbdata:payload(),config:{fields:['Value','Footprint','MPN']}}),'ibom.json');assert.equal(r.variant,'Prototype');assert.equal(r.model.objects[0].properties.MPN,'M-1');assert.equal(r.model.objects[1].excludeFromBom,true);assert.equal(r.model.objects[1].populated,true);assert.equal(r.assembly.components[1].side,'B');assert.equal(r.assembly.components[0].points[0].x,4.5);assert.equal(r.assembly.components[0].points[0].y,6);
});
test('raw iBOM without field headers retains positional fields without guessing',()=>{const r=reader.parse(JSON.stringify(payload()),'ibom.json');assert.equal(r.model.objects[0].properties['Field 1'],'10k');assert.equal(r.model.objects[0].properties.Value,'');assert.ok(r.warnings.some(x=>x.includes('without guessing')));});
test('malicious HTML stays inert, expressions and unsupported layouts rejected',()=>{
 globalThis.bomWasExecuted=false;const r=reader.parse('<script>globalThis.bomWasExecuted=true;</script><script>var config = {"fields":["Value","Footprint","MPN"]};\nvar pcbdata = '+JSON.stringify(payload())+';</script>','ibom.html');assert.equal(globalThis.bomWasExecuted,false);assert.equal(r.model.objects[0].properties.Value,'10k');
 for(const html of ['<script>var pcbdata = fetch("https://evil.invalid");</script>','<script>var pcbdata = '+JSON.stringify(payload())+'.constructor("alert(1)")();</script>','<script>var pcbdata = JSON.parse(LZString.decompressFromBase64("%%%"));</script>','<html><table><tr><td>R1</td></tr></table></html>'])assert.throws(()=>reader.parse(html,'ibom.html'));
});
test('invalid iBOM identities and oversized input are rejected',()=>{let p=payload();p.bom.both[0][0][1]=22;assert.throws(()=>reader.parse(JSON.stringify(p),'ibom.json'));p=payload();p.footprints[1].ref='R1';assert.throws(()=>reader.parse(JSON.stringify(p),'ibom.json'));assert.throws(()=>reader.parse(' '.repeat(reader.limits.bytes+1),'bom.html'),/16 MiB/);});
test('workspace overrides require source export and candidate routing is conservative',()=>{assert.throws(()=>reader.parse(JSON.stringify({schema:1,base:{},variants:{}}),'bom.json'),/sidecars/);for(const p of ['bom.csv','project_bom.json','assembly/ibom.html'])assert.equal(reader.candidate(p),true);for(const p of ['simulation.csv','results.json','index.html'])assert.equal(reader.candidate(p),false);});
