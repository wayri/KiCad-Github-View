const test=require('node:test'),assert=require('node:assert/strict');
const {localInsets}=require('../../android-app/web/edge-to-edge.js');
test('cutout and gesture clearance applies only to frames touching the screen edge',()=>{
 const safe={left:0,top:30,right:0,bottom:24};
 assert.deepEqual(localInsets(safe,{x:0,y:0,width:400,height:900},400,900),safe);
 assert.deepEqual(localInsets(safe,{x:0,y:82,width:400,height:738},400,900),{left:0,top:0,right:0,bottom:0});
 assert.deepEqual(localInsets(safe,{x:0,y:0,width:400,height:876},400,900),{left:0,top:30,right:0,bottom:0});
});
test('landscape cutouts stay scoped to the affected pane and camera-free screens reserve nothing',()=>{
 assert.deepEqual(localInsets({left:36,right:0,top:0,bottom:12},{x:0,y:0,width:900,height:400},900,400),{left:36,right:0,top:0,bottom:12});
 assert.deepEqual(localInsets({left:36},{x:450,y:0,width:450,height:400},900,400),{left:0,right:0,top:0,bottom:0});
 assert.deepEqual(localInsets({}, {x:0,y:0,width:400,height:900},400,900),{left:0,right:0,top:0,bottom:0});
});
