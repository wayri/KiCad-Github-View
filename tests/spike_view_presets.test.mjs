import test from 'node:test';
import assert from 'node:assert/strict';
import {boardViewPresets,boardViewPreset} from '../extension/spike/viewPresets.mjs';
import {boxFitDistance} from '../extension/spike/fitPolicy.mjs';

test('all board viewing sides retain the board thickness as the orbit up axis',()=>{
 assert.deepEqual(boardViewPresets.map(preset=>preset.id),['top','bottom','front','back','left','right','iso']);
 assert.equal(boardViewPreset(true).id,'top');assert.equal(boardViewPreset(false).id,'iso');assert.equal(boardViewPreset('unknown').id,'iso');
 for(const preset of boardViewPresets){assert.deepEqual(preset.up,[0,0,1]);assert.ok(Math.hypot(preset.direction[0],preset.direction[1])>0,'avoid the orbit pole singularity');}
});

test('every fitted camera side contains all board/model bounds in wide and portrait viewports',()=>{
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),normalize=a=>a.map(v=>v/Math.hypot(...a));
 for(const size of [[144,84,6],[20,20,70],[250,20,2]])for(const aspect of [390/780,1200/729,2.4])for(const preset of boardViewPresets){
  const direction=normalize(preset.direction),right=normalize(cross(preset.up,direction)),up=cross(direction,right),distance=boxFitDistance(size,direction,45,aspect,.85,preset.up),tan=Math.tan(Math.PI/8);
  assert.ok(Number.isFinite(distance)&&distance>0);
  for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){const corner=[x*size[0]/2,y*size[1]/2,z*size[2]/2],depth=distance-dot(corner,direction);assert.ok(depth>0);assert.ok(Math.abs(dot(corner,right))/(depth*tan*aspect)<=.850001,preset.id+' horizontal');assert.ok(Math.abs(dot(corner,up))/(depth*tan)<=.850001,preset.id+' vertical');}
 }
 assert.equal(boxFitDistance([1,1,1],[1,0,0],45,1,.85,[0,0,0]),null);
});
