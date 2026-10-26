import test from'node:test';import assert from'node:assert/strict';import{boxFitDistance,sphereFitDistance}from'../extension/spike/fitPolicy.mjs';
test('projected board bounds fit both frustum axes on landscape and portrait screens',()=>{
 for(const size of [[144,84,6],[20,20,70],[250,20,2]])for(const aspect of [390/780,1200/729,2.4])for(const direction of [[0,0,1],[.45,-.38,1]]){
  const length=Math.hypot(...direction),d=direction.map(v=>v/length),rl=Math.hypot(d[2],d[0]),right=[d[2]/rl,0,-d[0]/rl],up=[d[1]*right[2],d[2]*right[0]-d[0]*right[2],-d[1]*right[0]],dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),distance=boxFitDistance(size,d,45,aspect),tan=Math.tan(Math.PI/8);
  for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){const p=[x*size[0]/2,y*size[1]/2,z*size[2]/2],depth=distance-dot(p,d);assert.ok(depth>0);assert.ok(Math.abs(dot(p,right))/(depth*tan*aspect)<=.850001);assert.ok(Math.abs(dot(p,up))/(depth*tan)<=.850001);}
 }
});
test('board-box fitting reduces the empty margin of a sphere fit without clipping tall models',()=>{
 const size=[144,84,6],radius=Math.hypot(...size)/2;assert.ok(boxFitDistance(size,[.45,-.38,1],45,1200/729)<sphereFitDistance(radius,45,1200/729));
 assert.equal(boxFitDistance([1,1,1],[0,0,0],45,1),null);assert.equal(boxFitDistance([NaN,1,1],[0,0,1],45,1),null);
});
