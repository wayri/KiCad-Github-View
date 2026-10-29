const test=require('node:test'),assert=require('node:assert/strict');
const {pdf,rasterize}=require('../draftsman-export.js');
const image=(bytes=Uint8Array.from([255,216,255,217]))=>({bytes,width:200,height:100});
const decode=bytes=>new TextDecoder('latin1').decode(bytes);
test('multi-page PDF has exact object offsets, page references, stream lengths and dimensions',()=>{
 const jpg=Uint8Array.from([255,216,128,0,10,255,217]),result=pdf([image(jpg),{...image(),width:400,height:600}],297,210),text=decode(result);assert.ok(text.startsWith('%PDF-1.4\n'));assert.match(text,/\/Count 2/);assert.match(text,/\/Kids \[3 0 R 6 0 R\]/);assert.match(text,/\/MediaBox \[0 0 841\.890 595\.276\]/);assert.match(text,/\/Contents 4 0 R/);assert.match(text,/\/Drawing 8 0 R/);assert.match(text,/\/Size 9/);
 const xref=Number(/startxref\n(\d+)\n/.exec(text)[1]);assert.equal(decode(result.subarray(xref,xref+4)),'xref');const entries=decode(result.subarray(xref)).split('\n').slice(3,11);for(let id=1;id<9;id++){const offset=Number(entries[id-1].slice(0,10));assert.equal(decode(result.subarray(offset,offset+String(id).length+6)),id+' 0 obj');}
 const marker=Buffer.from('5 0 obj\n'),at=Buffer.from(result).indexOf(marker),start=Buffer.from(result).indexOf(Buffer.from('stream\n'),at)+7;assert.deepEqual(result.subarray(start,start+jpg.length),jpg);assert.equal(decode(result.subarray(start+jpg.length,start+jpg.length+10)),'\nendstream');assert.ok(text.endsWith('%%EOF\n'));
});
test('invalid page counts, JPEG headers, pixel budgets and paper sizes are rejected',()=>{
 for(const pages of [[],Array.from({length:21},()=>image()),[image(Uint8Array.from([1,2,3,4]))],[image(Uint8Array.from([255,216,1]))],[image(Uint8Array.from([255,216,0,0]))],[{...image(),width:0}],[{...image(),height:4097}],[{...image(),width:4000,height:4000}],[{...image(),width:1.2}],[image(new Uint8Array(16*1024*1024+1))]])assert.throws(()=>pdf(pages,297,210));
 for(const size of [[0,210],[297,Infinity],[1000,210],[-1,210]])assert.throws(()=>pdf([image()],...size));
 const bytes=new Uint8Array(16*1024*1024);bytes.set([255,216]);bytes.set([255,217],bytes.length-2);assert.throws(()=>pdf(Array.from({length:5},()=>image(bytes)),297,210),/64 MiB/);
});
test('PDF output does not alias the source JPEG buffer or mutate its input',()=>{
 const source=image(),snapshot=source.bytes.slice(),result=pdf([source],215.9,279.4);assert.deepEqual(source.bytes,snapshot);source.bytes.fill(0);assert.ok(Buffer.from(result).includes(Buffer.from(snapshot)));assert.match(decode(result),/612\.000 792\.000/);
});
test('raster export rejects invalid dimensions and unbounded SVG before creating DOM resources',async()=>{
 for(const value of [null,{},'x'.repeat(24*1024*1024+1)])await assert.rejects(rasterize(value,{width:297,height:210}),/render limit/);
 for(const size of [{width:0,height:210},{width:297,height:NaN},{width:1000,height:210}])await assert.rejects(rasterize('<svg/>',size),/page size/);
});
