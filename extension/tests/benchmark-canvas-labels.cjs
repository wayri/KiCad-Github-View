// CPU/control-flow benchmark, not a browser rasterization or device FPS measurement.
// node extension/tests/benchmark-canvas-labels.cjs
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{performance}=require('node:perf_hooks');
const source=fs.readFileSync(path.join(__dirname,'../owned-canvas.js'),'utf8');
function run(optimized){
 let labels=0,measurements=0;
 const ctx=new Proxy({measureText(text){measurements++;const px=Number(this.font.match(/([\d.]+)px/)[1]),width=text.length*px*.65;return {actualBoundingBoxLeft:width/2,actualBoundingBoxRight:width/2,actualBoundingBoxAscent:px*.6,actualBoundingBoxDescent:px*.6};},fillText(){labels++;}},{get:(obj,key)=>key in obj?obj[key]:()=>{},set:(obj,key,value)=>(obj[key]=value,true)});
 const element={style:{},setAttribute(){},addEventListener(){},removeEventListener(){},getContext:()=>ctx,getBoundingClientRect:()=>({left:0,top:0,width:800,height:600}),remove(){}};
 const env={EventTarget,CustomEvent,document:{createElement:()=>element},ResizeObserver:class{observe(){}disconnect(){}},devicePixelRatio:1};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../pad-labels.js'),'utf8'),env);vm.runInNewContext(source,env);
 const canvas=env.KiCadOwnedCanvas.mount({append(){},getBoundingClientRect:element.getBoundingClientRect},{pcb:true,acceleration:'off'});
 if(!optimized){const inView=canvas.inView.bind(canvas);canvas.inView=(p,view)=>p.type==='text'||inView(p,view);}
 canvas.primitives=Array.from({length:40000},(_,i)=>({type:'text',x:i%200*5,y:Math.floor(i/200)*5,text:`R${i} value`,size:1.27,layer:'F.SilkS'}));canvas.visibleLayers.add('F.SilkS');
 canvas.viewport.camera.bbox={x:400,y:400,w:40,h:30};canvas.drawGeometry();
 const timings=[];labels=0;
 for(let i=0;i<20;i++){canvas.viewport.camera.center.x+=.1;const start=performance.now();canvas.drawGeometry();timings.push(performance.now()-start);}
 timings.sort((a,b)=>a-b);const result={mode:optimized?'cached metrics culling':'previous text overflow painting',medianMs:+timings[10].toFixed(2),labelsPerFrame:labels/20,measurements};canvas.dispose();return result;
}
console.log(JSON.stringify({workload:'40,000 labels; zoomed 40 × 30 mm viewport; 20 warm pans; no-op Canvas rasterization',results:[run(false),run(true)]},null,2));
