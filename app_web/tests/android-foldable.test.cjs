const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {region}=require('../../android-app/web/foldable-ui.js');
test('book hinge avoids occlusion, including a zero-width separating crease',()=>{
 assert.deepEqual(region({separating:true,orientation:'vertical',x:390,y:0,width:20,height:900},800,900),{x:0,y:0,width:390,height:900});
 assert.deepEqual(region({separating:true,orientation:'vertical',x:300,y:0,width:0,height:900},800,900),{x:300,y:0,width:500,height:900});
});
test('tabletop uses the larger region and stays above a shortened keyboard viewport',()=>{
 const fold={separating:true,orientation:'horizontal',x:0,y:500,width:800,height:20};
 assert.deepEqual(region(fold,800,1100),{x:0,y:520,width:800,height:580});
 assert.deepEqual(region(fold,800,700),{x:0,y:0,width:800,height:500});
});
test('flat display, cover screen and invalid/nonintersecting hinge restore full viewport',()=>{
 const full={x:0,y:0,width:400,height:800};
 for(const fold of [null,{separating:false},{separating:true,orientation:'vertical',x:500,y:0,width:0,height:800},{separating:true,orientation:'vertical',x:200,y:30,width:5,height:500},{separating:true,orientation:'horizontal',x:0,y:NaN,width:400,height:0}])assert.deepEqual(region(fold,400,800),full);
});
test('fold and unfold keep the existing viewer, draft and project mounted',()=>{
 const handlers={},styles={},draft={value:'Unsaved review'},viewer={src:'loaded-project'},project={name:'Sensor'};
 const body={dataset:{},style:{setProperty:(k,v)=>styles[k]=v}};
 const context={document:{body,readyState:'complete'},innerWidth:800,innerHeight:900,KiCadAndroidProject:project,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},addEventListener:(k,v)=>handlers[k]=v,dispatchEvent:()=>{},requestAnimationFrame:callback=>{callback();return 1;}};
 // Queue frames explicitly, as browsers do, so resize bursts coalesce.
 let pending;context.requestAnimationFrame=callback=>{pending=callback;return 1;};
 vm.createContext(context);vm.runInContext(fs.readFileSync('android-app/web/foldable-ui.js','utf8'),context);pending();
 context.KiCadAndroidFold={separating:true,orientation:'vertical',x:390,y:0,width:20,height:900};handlers['kicad-fold-changed']();pending();
 assert.equal(body.dataset.fold,'vertical');assert.equal(styles['--fold-width'],'390px');
 context.KiCadAndroidFold={orientation:'none',separating:false};handlers['kicad-fold-changed']();pending();
 assert.equal(body.dataset.fold,'none');assert.equal(context.KiCadAndroidUsableViewport,null);assert.equal(context.KiCadAndroidProject,project);assert.equal(draft.value,'Unsaved review');assert.equal(viewer.src,'loaded-project');
});
