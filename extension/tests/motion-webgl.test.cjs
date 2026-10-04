const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {transform,MAX_PIXELS}=require('../motion-webgl.js');
test('GPU texture transform agrees with the source camera in front and back views',()=>{
 for(const flipped of [false,true])for(const zoom of [3.2,4,5]){
  const saved={x:12,y:24,zoom:4,width:1200,height:900,flipped},current={x:15,y:20,zoom,width:800,height:600,flipped};
  const rect=transform(saved,current);assert.ok(rect);
  for(const [x,y] of [[0,0],[400,300],[1200,900]]){
   const worldX=saved.x+(x-saved.width/2)/saved.zoom*(flipped?-1:1),worldY=saved.y+(y-saved.height/2)/saved.zoom;
   const expectedX=(worldX-current.x)*current.zoom*(flipped?-1:1)+current.width/2,expectedY=(worldY-current.y)*current.zoom+current.height/2;
   assert.ok(Math.abs(rect.x+x*rect.width/saved.width-expectedX)<1e-8);assert.ok(Math.abs(rect.y+y*rect.height/saved.height-expectedY)<1e-8);
  }
 }
});
test('uncovered, excessive-scale, flipped and nonfinite gestures require a fresh source redraw',()=>{
 const saved={x:0,y:0,zoom:4,width:1200,height:900,flipped:false},current={...saved,width:800,height:600};
 for(const change of [{x:1000},{y:1000},{zoom:2},{zoom:8},{flipped:true},{x:NaN}])assert.equal(transform(saved,{...current,...change}),null);
});
function runtime({compile=true,uploadError=0}={}){
 const calls=[],listeners=new Map();let error=0;
 const gl=new Proxy({MAX_TEXTURE_SIZE:1,COMPILE_STATUS:2,LINK_STATUS:3,NO_ERROR:0,getParameter:()=>4096,getShaderParameter:()=>compile,getProgramParameter:()=>true,getError:()=>{const value=error;error=0;return value;},isContextLost:()=>false,texImage2D:()=>{error=uploadError;calls.push('upload');}}, {get:(o,k)=>k in o?o[k]:(...args)=>{calls.push([k,...args]);return {};}});
 const element={style:{},width:0,height:0,setAttribute(){},getContext:()=>gl,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),remove:()=>calls.push('remove')};
 const env={document:{createElement:()=>element},module:{exports:{}}};vm.runInNewContext(fs.readFileSync(require.resolve('../motion-webgl.js'),'utf8'),env);
 return {Motion:env.KiCadMotionWebGL.Motion,element,gl,calls,listeners};
}
test('WebGL upload is bounded, rendered as a single quad, and GPU resources are disposed',()=>{
 const view=runtime(),motion=new view.Motion({append(){}}),saved={x:0,y:0,zoom:4,width:1200,height:900,flipped:false};
 assert.throws(()=>motion.upload({width:4097,height:1},saved),/texture budget/);assert.throws(()=>motion.upload({width:4096,height:4096},saved),/texture budget/);assert.equal(MAX_PIXELS,16000000);
 motion.upload({width:1200,height:900},saved);assert.equal(motion.show({...saved,width:800,height:600},1.25),true);assert.equal(view.element.width,1000);assert.equal(view.element.height,750);
 assert.equal(view.calls.filter(call=>Array.isArray(call)&&call[0]==='drawArrays').length,1);
 let lost=false;motion.onLost=()=>lost=true;view.listeners.get('webglcontextlost')({preventDefault(){}});assert.equal(lost,true);assert.equal(motion.show({...saved,width:800,height:600},1),false);assert.equal(view.element.style.display,'none');
 motion.dispose();for(const resource of ['deleteTexture','deleteBuffer','deleteProgram','deleteShader'])assert.ok(view.calls.some(call=>Array.isArray(call)&&call[0]===resource));assert.equal(view.listeners.size,0);
});
test('shader and texture upload failures fail closed to the CPU renderer',()=>{
 const bad=runtime({compile:false});assert.throws(()=>new bad.Motion({append(){}}),/compilation/);assert.ok(bad.calls.includes('remove'));
 const failed=runtime({uploadError:1285}),motion=new failed.Motion({append(){}});assert.throws(()=>motion.upload({width:100,height:100},{}),/upload failed/);motion.dispose();
});
