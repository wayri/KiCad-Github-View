import assert from 'node:assert/strict';
import test from 'node:test';
import { footprintProxies } from '../extension/spike/footprintProxies.mjs';

function fixture(angle, back=false, shape=[[0,-1],[6,-1],[6,1],[0,1],[0,-1]]) {
  const part={ref:'J1',at:[40,30],rotation:angle,layer:back?'B.Cu':'F.Cu',width:99,height:99,modelOffset:[100,100,100]};
  const a=-angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  const points=shape.map(([x,y])=>{if(back)x=-x;return [40+x*c-y*s,30+x*s+y*c];});
  const board={components:[part],pads:[],drawings:[{ref:'J1',layer:back?'B.Fab':'F.Fab',points}]};
  return {board,part};
}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
for (const angle of [0,90,37,180,-45]) for (const back of [false,true]) {
  test(`off-centre ${back?'back':'front'} footprint at ${angle} degrees stays within saved body`,()=>{
    const {board,part}=fixture(angle,back),pose=footprintProxies(board).get(part);
    const a=-angle*Math.PI/180,offset=back?-3:3;
    close(pose.at[0],40+offset*Math.cos(a));close(pose.at[1],30+offset*Math.sin(a));
    close(pose.width,6);close(pose.height,2);close(pose.rotation,-a);
  });
}
test('pad fallback includes pad size and board angle, never guessed padding',()=>{
  const {board,part}=fixture(90);board.drawings=[];
  board.pads=[{ref:'J1',at:[40,27],width:6,height:2,rotation:90}];
  const pose=footprintProxies(board).get(part);close(pose.width,6);close(pose.height,2);close(pose.at[1],27);
});
test('circle stand-in corners are inscribed rather than overhanging',()=>{
  const circle=Array.from({length:65},(_,i)=>[2*Math.cos(i*2*Math.PI/64),2*Math.sin(i*2*Math.PI/64)]);
  const {board,part}=fixture(0,false,circle),pose=footprintProxies(board).get(part);
  assert.ok(Math.hypot(pose.width/2,pose.height/2)<=2+1e-6);
});
test('closed lines are joined and an L-shaped outline is not filled across its notch',()=>{
  const {board,part}=fixture(0,false,[[0,0],[4,0],[4,1],[1,1],[1,4],[0,4],[0,0]]);
  const points=board.drawings[0].points;
  board.drawings=points.slice(1).map((p,i)=>({ref:'J1',layer:'F.Fab',points:[points[i],p]}));
  assert.equal(footprintProxies(board).has(part),false);
});
test('missing geometry or ambiguous references omit stand-ins instead of inventing oversized blocks',()=>{
  const {board,part}=fixture(0);board.drawings=[];assert.equal(footprintProxies(board).size,0);
  board.components.push({...part});assert.equal(footprintProxies(board).size,0);
});
test('fabrication body wins over larger courtyard and pads',()=>{
  const {board,part}=fixture(0);
  board.drawings.push({ref:'J1',layer:'F.CrtYd',points:[[0,0],[100,100]]});
  const pose=footprintProxies(board).get(part);close(pose.width,6);close(pose.height,2);
});
