const test=require('node:test'),assert=require('node:assert/strict');
const {build,paint,LIMITS}=require('../gerber-renderer.js');
const header='%FSLAX24Y24*%%MOMM*%%ADD10C,0.2*%D10*';
const layer=s=>build(header+s+'M02*','board-F_Cu.gbr');
test('declared coordinates, aperture dimensions, modal draw and Y inversion',()=>{
 const d=layer('X10000Y20000D02*X30000D01*Y40000*X50000Y60000D03*');
 assert.equal(d.primitives.length,3);assert.deepEqual(d.primitives[0].points,[{x:1,y:-2},{x:3,y:-2}]);assert.deepEqual(d.primitives[1].points,[{x:3,y:-2},{x:3,y:-4}]);assert.equal(d.primitives[2].r,.1);assert.equal(d.primitives[2].y,-6);assert.equal(d.readOnly,true);
});
test('inch, trailing zero omission, incremental coordinates preserve omitted axes',()=>{
 const d=build('%FSTIX23Y23*%%MOIN*%%ADD10C,0.1*%D10*X01Y02D02*X01D01*M02*');
 assert.deepEqual(d.primitives[0].points,[{x:25.4,y:-50.8},{x:50.8,y:-50.8}]);assert.equal(d.primitives[0].width,2.54);
});
test('circle rectangle obround polygon flashes expose physical dimensions',()=>{
 const d=build('%FSLAX24Y24*%%MOMM*%%ADD10R,2X3*%%ADD11O,4X2*%%ADD12P,2X4X45*%D10*X0Y0D03*D11*X50000Y0D03*D12*X100000Y0D03*M02*');
 assert.deepEqual(d.primitives[0].points,[{x:-1,y:-1.5},{x:1,y:-1.5},{x:1,y:1.5},{x:-1,y:1.5}]);assert.deepEqual(d.primitives[1].points,[{x:4,y:0},{x:6,y:0}]);assert.equal(d.primitives[1].width,2);assert.equal(d.primitives[2].points.length,4);assert.ok(Math.abs(d.primitives[2].points[0].x-(10+Math.SQRT1_2))<1e-10);
});
test('clockwise and counterclockwise quarter arcs plus full circle',()=>{
 const cw=layer('X10000Y0D02*G75*G02X0Y-10000I-10000J0D01*').primitives[0];assert.ok(Math.abs(cw.mid.x-Math.SQRT1_2)<1e-10);assert.ok(Math.abs(cw.mid.y-Math.SQRT1_2)<1e-10);
 const ccw=layer('X10000Y0D02*G03X0Y10000I-10000J0D01*').primitives[0];assert.ok(Math.abs(ccw.mid.y+Math.SQRT1_2)<1e-10);
 const circle=layer('X10000Y0D02*G02X10000Y0I-10000J0D01*').primitives[0];assert.equal(circle.type,'circle');assert.equal(circle.r,1);assert.equal(circle.x,0);
 assert.throws(()=>layer('X10000Y0D02*G02X0Y20000I-10000J0D01*'),/radius/);
});
test('linear regions retain multiple closed contours and ordered polarity',()=>{
 const d=layer('G36*X0Y0D02*X40000Y0D01*X40000Y40000D01*X0Y40000D01*X0Y0D01*X10000Y10000D02*X20000Y10000D01*X20000Y20000D01*X10000Y10000D01*G37*%LPC*%X15000Y15000D03*%LPD*%X0Y0D03*');
 assert.equal(d.primitives[0].contours.length,2);assert.deepEqual(d.primitives.map(p=>p.polarity),['dark','clear','dark']);
 assert.throws(()=>layer('G36*X0Y0D02*X10000Y0D01*X10000Y10000D01*G37*'),/Unclosed/);
});
test('clear paint erases only isolated layer and regions fill evenodd',()=>{
 const calls=[],ctx={save(){},restore(){},beginPath(){},arc(){},moveTo(){},lineTo(){},closePath(){},fill(rule){calls.push([this.globalCompositeOperation,rule]);},stroke(){calls.push([this.globalCompositeOperation,'stroke']);}};
 paint(ctx,{zoom:1,world_to_screen:p=>p},layer('X0Y0D03*%LPC*%X0Y0D03*').primitives);
 assert.deepEqual(calls,[['source-over','evenodd'],['destination-out','evenodd']]);
});
test('unsupported aperture macros, holed flashes and G74 arcs omit with diagnostics',()=>{
 const d=build('%FSLAX24Y24*%%MOMM*%%AMfoo*1,1,1,0,0*%%ADD10foo,1*%D10*X0Y0D03*%ADD11C,1X0.3*%D11*X0Y0D03*%ADD12C,0.2*%D12*X10000Y0D02*G74*G02X0Y10000I10000J0D01*M02*');
 assert.equal(d.primitives.length,0);assert.ok(d.warnings.some(w=>/macros/.test(w)));assert.ok(d.warnings.some(w=>/holes/.test(w)));assert.ok(d.warnings.some(w=>/Single-quadrant/.test(w)));
 assert.throws(()=>layer('%SRX2Y1I1J0*%'),/Unsupported/);assert.throws(()=>layer('%LMX*%'),/Unsupported/);
});
test('reject malformed, oversize, unknown syntax, and undeclared coordinate data',()=>{
 assert.throws(()=>build('x'.repeat(LIMITS.bytes+1)),/8 MiB/);assert.throws(()=>build('X1Y2D03*M02*'),/Coordinates|format/);assert.throws(()=>layer('X0Y0D03'),/Unterminated|[Mm]alformed/);assert.throws(()=>layer('X0X1D03*'),/Repeated/);assert.throws(()=>layer('G99*'),/Unsupported/);assert.throws(()=>layer('X123456789012D03*'),/coordinate/);assert.throws(()=>layer('%ADD20C,-1*%'),/dimensions/);
});
test('X2 attributes are retained safely and missing terminator disclosed',()=>{
 const d=build(header+'%TF.FileFunction,Copper,L1,Top*%%TA.AperFunction,Conductor*%%TO.N,GND*%X0Y0D03*');assert.equal(d.attributes.FileFunction,'Copper,L1,Top');assert.ok(d.warnings.some(w=>/M02/.test(w)));
});
test('decimal Excellon drill tools, coordinates and modal axes',()=>{
 const d=build('M48\nMETRIC\nT01C0.8\n%\nG90\nG05\nT01\nX2.5Y3.5\nX4.5\nM30','board.drl');assert.equal(d.primitives.length,2);assert.equal(d.primitives[0].r,.4);assert.equal(d.primitives[0].y,-3.5);assert.equal(d.primitives[1].x,4.5);assert.equal(d.primitives[1].y,-3.5);
 const inch=build('M48\nINCH\nT01C0.1\n%\nT01\nX1.0Y2.0\nM30','board.xln');assert.equal(inch.primitives[0].x,25.4);assert.equal(inch.primitives[0].r,1.27);
});
test('integer drills require explicit format and slots never silently disappear',()=>{
 const d=build('M48\n;FILE_FORMAT=3:3\nMETRIC,TZ\nT01C0.8\n%\nT01\nX2500Y3500\nM30','board.drl');assert.equal(d.primitives[0].x,2.5);
 assert.throws(()=>build('M48\nMETRIC\nT01C0.8\n%\nT01\nX2500Y3500\nM30','board.drl'),/explicit/);
 assert.throws(()=>build('M48\nMETRIC\nT01C0.8\n%\nT01\nG85X2.5Y3.5\nM30','board.drl'),/slots/);
});


test('retained KiCad 10.0.6 exports retain native outline and pad landmarks',()=>{
 const fs=require('node:fs'),path=require('node:path'),renderer=require('../gerber-renderer.js'),bounds=require('../owned-canvas.js').bounds;
 const folder=path.join(__dirname,'fixtures/gerbers'),outline=renderer.build(fs.readFileSync(path.join(folder,'sensor-Edge_Cuts.gbr'),'utf8'),'sensor-Edge_Cuts.gbr');assert.deepEqual(outline.warnings,[]);assert.equal(outline.primitives.length,4);const box=bounds(outline.primitives);assert.ok(Math.abs(box.x-79.95)<1e-8);assert.ok(Math.abs(box.y-64.95)<1e-8);assert.ok(Math.abs(box.w-70.1)<1e-8);assert.ok(Math.abs(box.h-50.1)<1e-8);
 const copper=renderer.build(fs.readFileSync(path.join(folder,'sensor-F_Cu.gbr'),'utf8'),'sensor-F_Cu.gbr');assert.deepEqual(copper.warnings,[]);assert.ok(copper.primitives.some(p=>p.type==='circle'&&Math.abs(p.x-95)<1e-8&&Math.abs(p.y-84)<1e-8));
});
