const test=require('node:test'),assert=require('node:assert/strict');
const quality=()=>import('../spike/renderQuality.mjs');
test('overlapping copper has deterministic depth precedence on both board faces',async()=>{
 const {copperDepthPolicy}=await quality(),roles=['zone','track','pad','via'];
 const values=roles.map(role=>copperDepthPolicy(role));
 for(const value of values){assert.equal(value.polygonOffset,true);assert.ok(Number.isFinite(value.polygonOffsetFactor));assert.ok(Number.isFinite(value.polygonOffsetUnits));}
 // For either face, lower depth wins independently of world-Z sign. The
 // fixed-point term separates flat, coplanar caps even at zero depth slope.
 for(let i=1;i<values.length;i++)for(const slope of [0,.01,1,100]){
  const bias=value=>slope*value.polygonOffsetFactor+value.polygonOffsetUnits/2**24;
  assert.ok(bias(values[i])<bias(values[i-1]));
 }
 for(const bad of ['unknown','toString','constructor'])assert.throws(()=>copperDepthPolicy(bad),/Unknown/);
});
test('millimetre board clipping keeps sub-micron depth resolution at board-scale distances',async()=>{
 const {boardClipRange}=await quality();
 for(const [distance,radius] of [[2,1],[20,10],[200,100],[2000,1000]]){
  const {near,far}=boardClipRange(distance,radius);assert.ok(near>0&&far>near);assert.ok(far>distance+radius);
  // Perspective depth derivative at the board center for a 24-bit buffer.
  const precision=distance**2*(far-near)/(far*near*(2**24-1));
  assert.ok(precision<distance*.00002,`${distance}: ${precision}`);
  assert.ok(far/near<2000);
 }
 for(const bad of [NaN,Infinity,-1,0]){const clip=boardClipRange(bad,bad);assert.ok(clip.near>0&&clip.far>clip.near);}
});
