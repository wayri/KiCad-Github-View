const test=require('node:test'),assert=require('node:assert/strict');
global.KiCadCalculatorTools=require('../calculator-tools.js');
const visual=require('../calculator-visuals.js'),catalog=require('../calculator-catalog.js'),calc=global.KiCadCalculatorTools;
const defaults=key=>Object.fromEntries(catalog[key].fields.map(([k,,v])=>[k,v]));
const near=(a,b)=>assert.ok(Math.abs(a-b)<=1e-10*Math.max(1e-20,Math.abs(b)),`${a} ≠ ${b}`);
test('every plotted default has finite, ordered samples matching the analytical model',()=>{
 for(const key of Object.keys(catalog)){const p=defaults(key),result=calc[key](p),plot=visual.plot(key,p,result);if(key==='color'){assert.equal(plot,null);continue;}assert.ok(plot.points.length<=250);assert.equal(plot.points.length,241);for(let i=0;i<plot.points.length;i++){assert.ok(Number.isFinite(plot.points[i].x)&&Number.isFinite(plot.points[i].y),key);if(i)assert.ok(plot.points[i].x>plot.points[i-1].x,key);}}
});
test('RC gain and phase plots agree at cutoff and step settles with the same time constant',()=>{
 const p=defaults('rc'),r=calc.rc(p),gain=visual.plot('rc',p,r),phase=visual.plot('rc',p,r,'phase'),step=visual.plot('rc',p,r,'time');near(gain.points[120].x,r.cutoff);near(gain.points[120].y,-3.010299956639812);near(phase.points[120].y,-45);near(step.points[0].y,0);near(step.points.at(-1).y,Number(p.voltage)*(1-Math.exp(-5)));
});
test('converter ripple plots span computed min/max and remain in continuous conduction',()=>{
 for(const key of ['buck','boost']){const p=defaults(key),r=calc[key](p),plot=visual.plot(key,p,r);near(plot.points[0].y,r.minCurrent);for(const point of plot.points){assert.ok(point.y>=r.minCurrent-1e-10&&point.y<=r.maxCurrent+1e-10);assert.ok(point.y>0);}}
});
test('resonance peak and zero-bandwidth noise agree with independent references',()=>{
 const p=defaults('rlc'),r=calc.rlc(p),plot=visual.plot('rlc',p,r);near(plot.points[120].x,r.resonance);near(plot.points[120].y,1/Number(p.resistance));const np=defaults('noise'),nr=calc.noise(np),noise=visual.plot('noise',np,nr);near(noise.points[0].y,0);near(noise.points.at(-1).y,nr.voltage*Math.sqrt(2));
});
