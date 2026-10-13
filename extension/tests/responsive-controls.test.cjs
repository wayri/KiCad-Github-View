const test=require('node:test'),assert=require('node:assert/strict');const {bounds,anchoredBounds}=require('../responsive-controls.js');
test('selection picker anchors beside the tap and flips above/left at viewport edges',()=>{
 assert.deepEqual(anchoredBounds({width:260,height:300},{x:20,y:100},393,852),{left:32,top:112,width:260,height:300});
 assert.deepEqual(anchoredBounds({width:260,height:300},{x:380,y:800},393,852),{left:108,top:488,width:260,height:300});
 const clipped=anchoredBounds({width:260,height:400},{x:300,y:240},393,260);assert.equal(clipped.top,8);assert.equal(clipped.height,244);assert.ok(clipped.left+clipped.width<=385);
});
test('placement reads DOMRect prototype properties instead of relying on enumerable fields',()=>{
 const rect=Object.create({get width(){return 260;},get height(){return 193;}});
 assert.deepEqual(anchoredBounds(rect,{x:262,y:598},524,1136),{left:8,top:610,width:260,height:193});
});
test('phone pickers are constrained to every viewport edge',()=>{
 for(const rect of [{left:380,top:780,width:250,height:300},{left:-50,top:-20,width:250,height:300},{left:0,top:0,width:800,height:1200}]){
  const b=bounds(rect,393,852);assert.ok(b.left>=8&&b.top>=8);assert.ok(b.left+b.width<=385&&b.top+b.height<=844);
 }
});
test('keyboard-reduced and nested viewports bound menu height without losing scroll area',()=>{
 const b=bounds({left:300,top:450,width:280,height:400},393,260);assert.equal(b.height,244);assert.equal(b.top,8);assert.equal(b.left,105);
});
