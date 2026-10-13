const test=require('node:test'),assert=require('node:assert/strict');const {bounds}=require('../responsive-controls.js');
test('phone pickers are constrained to every viewport edge',()=>{
 for(const rect of [{left:380,top:780,width:250,height:300},{left:-50,top:-20,width:250,height:300},{left:0,top:0,width:800,height:1200}]){
  const b=bounds(rect,393,852);assert.ok(b.left>=8&&b.top>=8);assert.ok(b.left+b.width<=385&&b.top+b.height<=844);
 }
});
test('keyboard-reduced and nested viewports bound menu height without losing scroll area',()=>{
 const b=bounds({left:300,top:450,width:280,height:400},393,260);assert.equal(b.height,244);assert.equal(b.top,8);assert.equal(b.left,105);
});
