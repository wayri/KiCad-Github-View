const test=require('node:test'),assert=require('node:assert/strict');
const {measurementHistory}=require('../review-tools.js');
const record=(x,file='root.kicad_sch')=>({file,kind:'distance',points:[{x:0,y:0},{x,y:2}]});
test('measurement history retains five newest source-bound results and returns detached copies',()=>{
 const history=measurementHistory();for(let i=0;i<8;i++)history.add(record(i));
 const rows=history.list();assert.equal(rows.length,5);assert.equal(rows[0].points[1].x,7);assert.equal(rows[4].points[1].x,3);
 rows[0].points[0].x=999;rows.pop();assert.equal(history.list()[0].points[0].x,0);assert.equal(history.list().length,5);
 history.add(record(7));assert.equal(history.list().length,5);assert.equal(history.list()[0].id,8,'camera redraw does not duplicate the same completed measurement');
 history.add(record(7,'sub/power.kicad_sch'));assert.equal(history.list()[0].file,'sub/power.kicad_sch');history.clear();assert.deepEqual(history.list(),[]);
});
test('angle and board records preserve native points and invalid results are not retained',()=>{
 const history=measurementHistory(1000);assert.equal(history.add({kind:'angle',file:'root',points:[{x:1,y:0},{x:0,y:0},{x:0,y:1}]}).kind,'angle');
 assert.equal(history.add({...record(4),kind:'board'}).kind,'board');
 for(const bad of [{...record(4),points:[{x:Infinity,y:0},{x:1,y:1}]},{...record(4),points:[{x:1e7,y:0},{x:1,y:1}]},{...record(4),file:''},{...record(4),kind:'other'},{kind:'angle',file:'root',points:[{x:0,y:0},{x:0,y:0},{x:1,y:1}]}])assert.equal(history.add(bad),null);
 assert.equal(history.list().length,2);
});
