const test=require('node:test'),assert=require('node:assert/strict');
const {arrowGeometry,notePlacement}=require('../review-navigation.js');
test('rule arrow heads point toward the saved screen position from every leader direction',()=>{
 for(const [x,y]of [[90,0],[-90,0],[0,90],[0,-90],[60,80],[-60,80]]){const end={x:100,y:100},start={x:end.x-x,y:end.y-y},arrow=arrowGeometry(start,end),points=arrow.head.replace(/[ML]/g,'').trim().split(/\s+/).map(Number);assert.deepEqual(points.slice(2,4),[100,100]);for(const [a,b]of [[points[0],points[1]],[points[4],points[5]]])assert.ok((end.x-a)*x+(end.y-b)*y>0,'both head wings must remain behind the destination');assert.deepEqual(arrow.shaft,{x1:start.x,y1:start.y,x2:100,y2:100});}
 assert.equal(arrowGeometry({x:1,y:1},{x:1,y:1}),null);assert.equal(arrowGeometry({x:NaN,y:0},{x:1,y:1}),null);
});
test('finding notes stay inside narrow, landscape and desktop viewports and omit unusably small views',()=>{
 for(const [w,h]of [[390,700],[700,280],[1200,800],[120,120]])for(const [x,y]of [[0,0],[w,h],[w/2,h/2],[-100,1000]]){const box=notePlacement({x,y},w,h);assert.ok(box.x>=0&&box.y>=0);assert.ok(box.x+box.width<=w&&box.y+box.maxHeight<=h);assert.ok(box.width<=260&&box.maxHeight<=144);}
 assert.equal(notePlacement({x:0,y:0},50,50),null);assert.equal(notePlacement({x:NaN,y:0},390,700),null);
});
