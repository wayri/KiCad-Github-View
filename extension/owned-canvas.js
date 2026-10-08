/* Owned browser Canvas2D engine. Geometry and source coordinates are in millimetres. */

((root) => {

  "use strict";

  const finitePoint = p => Number.isFinite(p?.x) && Number.isFinite(p?.y);

  function arcThrough(a,b,c) {

    if (![a,b,c].every(finitePoint)) return null;

    const d=2*(a.x*(b.y-c.y)+b.x*(c.y-a.y)+c.x*(a.y-b.y));

    if (Math.abs(d)<1e-10) return null;

    const aa=a.x*a.x+a.y*a.y,bb=b.x*b.x+b.y*b.y,cc=c.x*c.x+c.y*c.y;

    const x=(aa*(b.y-c.y)+bb*(c.y-a.y)+cc*(a.y-b.y))/d,y=(aa*(c.x-b.x)+bb*(a.x-c.x)+cc*(b.x-a.x))/d;

    const start=Math.atan2(a.y-y,a.x-x),mid=Math.atan2(b.y-y,b.x-x),end=Math.atan2(c.y-y,c.x-x);

    const turn=n=>(n+Math.PI*4)%(Math.PI*2);

    return {x,y,r:Math.hypot(a.x-x,a.y-y),start,end,ccw:turn(mid-start)>turn(end-start)};

  }

  function points(p) {

    if(p.type==='arc'){const a=arcThrough(p.start,p.mid,p.end);if(a){let delta=a.end-a.start;if(a.ccw){while(delta>0)delta-=Math.PI*2;}else{while(delta<0)delta+=Math.PI*2;}return Array.from({length:33},(_,i)=>({x:a.x+Math.cos(a.start+delta*i/32)*a.r,y:a.y+Math.sin(a.start+delta*i/32)*a.r}));}return [p.start,p.end].filter(finitePoint);}

    if(p.points)return p.points.filter(finitePoint);

    if(p.type==='circle'||p.type==='pad'&&p.r)return [{x:p.x-p.r,y:p.y-p.r},{x:p.x+p.r,y:p.y+p.r}];

    if(p.type==='text'){const size=p.size||1.27,w=String(p.text||'').length*size*.65,h=size*1.4,angle=(p.angle||0)*Math.PI/180;return [{x:0,y:-h},{x:w,y:-h},{x:w,y:h},{x:0,y:h}].map(q=>({x:p.x+q.x*Math.cos(angle)-q.y*Math.sin(angle),y:p.y+q.x*Math.sin(angle)+q.y*Math.cos(angle)}));}

    return finitePoint(p)?[p]:[];

  }

  function bounds(primitives, includeFrame=false){

    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;

    for(const p of primitives){if(p.hidden||(p.frame&&!includeFrame))continue;const pad=(p.width||0)/2;for(const q of points(p)){minX=Math.min(minX,q.x-pad);minY=Math.min(minY,q.y-pad);maxX=Math.max(maxX,q.x+pad);maxY=Math.max(maxY,q.y+pad);}}

    return minX===Infinity?null:{x:minX,y:minY,w:Math.max(.01,maxX-minX),h:Math.max(.01,maxY-minY)};

  }

  function segmentDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l)):0;return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}

  function inside(p,poly){let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)hit=!hit;}return hit;}

  function hitPrimitive(p,at,tolerance){

    if(p.hole||p.frame)return false;

    if(p.type==='circle'||p.type==='pad'&&p.r){const dist=Math.hypot(at.x-p.x,at.y-p.y);return p.fill?dist<=p.r+tolerance:Math.abs(dist-p.r)<=tolerance+(p.width||.1)/2;}

    const poly=points(p);

    if((p.type==='polygon'||p.type==='pad'||p.type==='text')&&inside(at,poly))return true;

    const limit=tolerance+(p.width||.1)/2;

    for(let i=1;i<poly.length;i++)if(segmentDistance(at,poly[i-1],poly[i])<=limit)return true;

    return p.type==='polygon'&&poly.length>2&&segmentDistance(at,poly.at(-1),poly[0])<=limit;

  }

  // Saved geometry is immutable between primitive-array replacements. Keep a
  // bounded grid, with large shapes in an overflow list rather than duplicating
  // them across thousands of cells. Text remains conservative for font metrics.
  function spatialBounds(p){
    if(p.type==='text')return null;
    if(p.type==='arc'){const a=arcThrough(p.start,p.mid,p.end);if(a){const r=a.r+(p.width||.15)/2;return {x:a.x-r,y:a.y-r,w:2*r,h:2*r};}}
    const b=bounds([{...p,hidden:false,width:p.width||.15}],true);
    return b&&[b.x,b.y,b.w,b.h].every(Number.isFinite)?b:null;
  }
  class SpatialIndex {
    constructor(primitives){
      this.primitives=primitives;this.length=primitives.length;this.cells=new Map();this.overflow=[];
      const boxes=primitives.map(spatialBounds);let x=Infinity,y=Infinity,right=-Infinity,bottom=-Infinity;
      for(const b of boxes)if(b){x=Math.min(x,b.x);y=Math.min(y,b.y);right=Math.max(right,b.x+b.w);bottom=Math.max(bottom,b.y+b.h);}
      this.box={x,y,w:Math.max(.01,right-x),h:Math.max(.01,bottom-y)};this.references=0;
      for(let i=0;i<boxes.length;i++){
        const b=boxes[i];if(!b){this.overflow.push(i);continue;}
        const range=this.range(b),count=(range.x1-range.x0+1)*(range.y1-range.y0+1);
        if(count>64||this.references+count>1000000){this.overflow.push(i);continue;}
        for(let cy=range.y0;cy<=range.y1;cy++)for(let cx=range.x0;cx<=range.x1;cx++){const key=cy*64+cx;if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key).push(i);}
        this.references+=count;
      }
    }
    range(b){const grid=(value,origin,size)=>Math.max(0,Math.min(63,Math.floor((value-origin)/size*64)));return {x0:grid(b.x,this.box.x,this.box.w),x1:grid(b.x+b.w,this.box.x,this.box.w),y0:grid(b.y,this.box.y,this.box.h),y1:grid(b.y+b.h,this.box.y,this.box.h)};}
    query(b){
      const indices=new Set(this.overflow),range=this.range(b);
      if(range.x0===0&&range.y0===0&&range.x1===63&&range.y1===63)return this.primitives;
      if(b.x+b.w>=this.box.x&&b.x<=this.box.x+this.box.w&&b.y+b.h>=this.box.y&&b.y<=this.box.y+this.box.h)
        for(let y=range.y0;y<=range.y1;y++)for(let x=range.x0;x<=range.x1;x++)for(const i of this.cells.get(y*64+x)||[])indices.add(i);
      return [...indices].sort((a,b)=>a-b).map(i=>this.primitives[i]);
    }
  }

  class Camera {

    constructor(width=800,height=600){this.width=width;this.height=height;this.zoom=4;this.center={x:0,y:0,set(x,y){this.x=x;this.y=y;}};this.flipped=false;}

    get bbox(){return {x:this.center.x-this.width/this.zoom/2,y:this.center.y-this.height/this.zoom/2,w:this.width/this.zoom,h:this.height/this.zoom};}

    set bbox(b){if(!b||![b.x,b.y,b.w,b.h].every(Number.isFinite)||b.w<=0||b.h<=0)return;this.center.set(b.x+b.w/2,b.y+b.h/2);this.zoom=Math.max(.001,Math.min(10000,Math.min(this.width/b.w,this.height/b.h)));}

    screen_to_world(p){return {x:this.center.x+(p.x-this.width/2)/this.zoom*(this.flipped?-1:1),y:this.center.y+(p.y-this.height/2)/this.zoom};}

    world_to_screen(p){return {x:(p.x-this.center.x)*this.zoom*(this.flipped?-1:1)+this.width/2,y:(p.y-this.center.y)*this.zoom+this.height/2};}

  }

  class Viewport extends EventTarget {

    constructor(host,options={}){

      super();this.host=host;this.geometryBounds=new WeakMap();this.frameRequest=null;this.canvas=document.createElement('canvas');this.canvas.className='owned-canvas';this.canvas.tabIndex=0;this.canvas.setAttribute('aria-label','Interactive KiCad drawing; click to select, right-drag to pan, wheel to zoom');host.append(this.canvas);

      this.ctx=this.canvas.getContext('2d');if(!this.ctx)throw new Error('Canvas2D rendering is unavailable.');this.viewport={camera:new Camera()};this.primitives=[];this.visibleLayers=new Set();this.dark=Boolean(options.dark);this.pcb=Boolean(options.pcb);this.grid=false;this.selected=null;this.drag=null;this.netHighlight=null;this.netPrimitives=new Set();this.isolateNet=false;this.paperVisible=!this.pcb;this.activeLayer='F.Cu';this.focusedLayer=null;this.layerFocusMode='dim';this.layerSnapshot=null;
      this.acceleration=options.acceleration==='off'?'off':'auto';this.motion=null;this.motionActive=false;this.motionFailed=false;this.motionTimer=null;this.wheelMotion=false;

      this.layers={query_point:at=>this.query(at).map(p=>({bbox:{context:{uuid:p.uuid,reference:p.reference,kind:p.kind,pinNumber:p.pinNumber,connectPoint:p.connectPoint,parent:p.ownerUuid?{uuid:p.ownerUuid}:null},primitive:p}}))};

      this.handlers=[];const listen=(name,fn,opts)=>{this.canvas.addEventListener(name,fn,opts);this.handlers.push(()=>this.canvas.removeEventListener(name,fn,opts));};

      listen('pointerdown',e=>{if(e.button===1||e.button===2){e.preventDefault();this.drag={x:e.clientX,y:e.clientY,moved:false};this.canvas.setPointerCapture(e.pointerId);this.prepareMotion();}});

      listen('pointermove',e=>{if(!this.drag)return;const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;if(Math.abs(dx)+Math.abs(dy)>0)this.drag.moved=true;const c=this.viewport.camera;c.center.x-=dx/c.zoom*(c.flipped?-1:1);c.center.y-=dy/c.zoom;this.drag.x=e.clientX;this.drag.y=e.clientY;this.requestDraw();});

      listen('pointerup',e=>{if(this.drag){this.drag=null;this.finishMotion();}if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);});listen('pointercancel',()=>{this.drag=null;this.finishMotion();});listen('lostpointercapture',()=>{if(this.drag){this.drag=null;this.finishMotion();}});

      listen('click',e=>{if(e.pointerType==='touch'&&this.touchNetPick?.(e))return;const r=this.canvas.getBoundingClientRect(),at=this.viewport.camera.screen_to_world({x:e.clientX-r.left,y:e.clientY-r.top});const hit=this.query(at)[0];this.select(hit?{primitive:hit,context:{uuid:hit.uuid,reference:hit.reference,kind:hit.kind,pinNumber:hit.pinNumber,connectPoint:hit.connectPoint,parent:hit.ownerUuid?{uuid:hit.ownerUuid}:null}}:null,{multi:Boolean(e.ctrlKey||e.metaKey||e.shiftKey)});});

      listen('wheel',e=>{e.preventDefault();this.prepareMotion();const r=this.canvas.getBoundingClientRect(),p={x:e.clientX-r.left,y:e.clientY-r.top},c=this.viewport.camera,before=c.screen_to_world(p);c.zoom=Math.max(.001,Math.min(10000,c.zoom* Math.exp(-Math.max(-100,Math.min(100,e.deltaY))*.004)));const after=c.screen_to_world(p);c.center.x+=before.x-after.x;c.center.y+=before.y-after.y;if(typeof setTimeout==='function'){this.wheelMotion=true;if(this.motionTimer!==null)clearTimeout(this.motionTimer);this.motionTimer=setTimeout(()=>this.finishMotion(),120);}this.requestDraw();},{passive:false});

      listen('contextmenu',e=>e.preventDefault());

      this.observer=new ResizeObserver(()=>{const prior=this.viewport.camera.zoom;this.resize();this.viewport.camera.zoom=prior;this.draw();});this.observer.observe(host);this.resize();

    }

    resize(){const r=this.host.getBoundingClientRect(),c=this.viewport.camera;c.width=Math.max(1,r.width);c.height=Math.max(1,r.height);const dpr=globalThis.devicePixelRatio||1;this.canvas.width=Math.max(1,Math.round(c.width*dpr));this.canvas.height=Math.max(1,Math.round(c.height*dpr));this.canvas.style.width=c.width+'px';this.canvas.style.height=c.height+'px';}

    setDocument(design,path){this.resize();this.design=design;this.document={filename:path};this.primitives=design.primitives;this.visibleLayers=new Set((design.layers||[]).filter(layer=>!this.pcb||['F.Cu','B.Cu','F.SilkS','B.SilkS','Edge.Cuts'].includes(layer)));this.selected=null;this.focusedLayer=null;this.layerSnapshot=null;this.setNetHighlight(null);this.zoom_to_board();this.draw();}

    get primitives(){return this._primitives;}
    set primitives(value){this._primitives=value;this.spatialIndex=null;this.geometryBounds=new WeakMap();}
    candidates(box){
      if(this.primitives.length<512)return this.primitives;
      if(!this.spatialIndex||this.spatialIndex.length!==this.primitives.length)this.spatialIndex=new SpatialIndex(this.primitives);
      return this.spatialIndex.query(box);
    }
    query(at,pixels=5){const tolerance=pixels/this.viewport.camera.zoom;return this.candidates({x:at.x-tolerance,y:at.y-tolerance,w:2*tolerance,h:2*tolerance}).filter(p=>!p.hidden&&p.pick!==false&&(p.uuid||p.reference)&&(!p.layer||this.visibleLayers.has(p.layer))&&(!this.focusedLayer||this.layerFocusMode!=='isolate'||p.layer===this.focusedLayer)&&hitPrimitive(p,at,tolerance)).sort((a,b)=>{const priority=p=>p.kind==='pad'?0:p.kind==='footprint'||p.kind==='symbol'?1:p.kind==='zone'?4:2;const focus=p=>this.focusedLayer&&p.layer===this.focusedLayer?0:1;return focus(a)-focus(b)||priority(a)-priority(b);}).slice(0,40);}

    select(hit,options={}){this.selected=hit?.primitive||null;this.draw();this.dispatchEvent(new CustomEvent('kicad:select',{detail:{item:hit?.context||null,multi:Boolean(options.multi)}}));}

    setNetHighlight(net,options={}){this.setNetHighlights(net?[net]:[],options);}
    setNetHighlights(nets,options={}){const list=Array.isArray(nets)?nets.slice(0,200):[];this.netHighlight=list.length?list[0]:null;this.highlightCount=list.length;this.netPrimitives=new Set(list.flatMap(net=>net.primitives||[]));this.isolateNet=Boolean(options.isolate);this.highlightMode=['bright','dim','isolate'].includes(options.mode)?options.mode:(this.isolateNet?'isolate':'dim');this.isolateNet=this.highlightMode==='isolate';}

    focusLayer(layer,mode='dim'){

      if(!(this.design?.layers||[]).includes(layer)||!['dim','isolate'].includes(mode))return false;

      if(!this.layerSnapshot)this.layerSnapshot=new Set(this.visibleLayers);

      this.focusedLayer=layer;this.layerFocusMode=mode;this.activeLayer=layer;this.visibleLayers.add(layer);return true;

    }

    restoreLayers(){if(this.layerSnapshot)this.visibleLayers=new Set(this.layerSnapshot);this.layerSnapshot=null;this.focusedLayer=null;}

    layerPreset(preset){

      const all=this.design?.layers||[];if(!['all','none','front','back','copper'].includes(preset))return false;

      if(!this.layerSnapshot)this.layerSnapshot=new Set(this.visibleLayers);

      this.focusedLayer=null;this.visibleLayers=new Set(all.filter(layer=>preset==='all'||preset!=='none'&&(layer==='Edge.Cuts'||preset==='copper'&&layer.endsWith('.Cu')||preset==='front'&&layer.startsWith('F.')||preset==='back'&&layer.startsWith('B.'))));return true;

    }

    fitLayer(){const primitives=this.primitives.filter(p=>!p.hidden&&!p.frame&&p.layer===this.focusedLayer);const b=bounds(primitives);if(!b)return false;const margin=Math.max(1,Math.max(b.w,b.h)*.08);this.viewport.camera.bbox={x:b.x-margin,y:b.y-margin,w:b.w+2*margin,h:b.h+2*margin};this.paperVisible=false;return true;}

    zoom_to_board(){this.paperVisible=!this.pcb;const edges=this.pcb?this.primitives.filter(p=>p.layer==='Edge.Cuts'):[];const b=bounds(edges.length?edges:this.primitives);if(b){const margin=Math.max(3,Math.max(b.w,b.h)*.06);this.viewport.camera.bbox={x:b.x-margin,y:b.y-margin,w:b.w+2*margin,h:b.h+2*margin};}else this.zoom_to_page();}

    zoom_to_page(){this.paperVisible=true;const p=this.design?.page||{width:297,height:210};this.viewport.camera.bbox={x:-5,y:-5,w:p.width+10,h:p.height+10};}

    background(){return this.dark?'#101720':'#dfe5e9';}

    paperColor(){return this.dark?'#18242d':'#fffef9';}

    cameraState(){const c=this.viewport.camera;return {x:c.center.x,y:c.center.y,zoom:c.zoom,width:c.width,height:c.height,flipped:c.flipped};}
    prepareMotion(){
      if(this.disposed||this.acceleration==='off'||this.motionFailed||this.primitives.length<4096||this.renderPrimitives||!root.KiCadMotionWebGL)return false;
      try{
        if(!this.motion){this.motion=new root.KiCadMotionWebGL.Motion(this.host);this.motion.onLost=()=>{this.motionFailed=true;this.finishMotion();};}
        if(this.motion.saved)return true;
        const c=this.viewport.camera,dpr=globalThis.devicePixelRatio||1,w=c.width,h=c.height,width=Math.round(w*1.5*dpr),height=Math.round(h*1.5*dpr),max=this.motion.gl.getParameter(this.motion.gl.MAX_TEXTURE_SIZE);
        if(width*height>root.KiCadMotionWebGL.MAX_PIXELS||width>max||height>max)return false;
        const snapshot=document.createElement('canvas');snapshot.width=width;snapshot.height=height;
        const context=snapshot.getContext('2d');if(!context)return false;
        const originalCanvas=this.canvas,originalContext=this.ctx;let saved;
        try{this.canvas=snapshot;this.ctx=context;c.width=w*1.5;c.height=h*1.5;saved=this.cameraState();this.drawGeometry();}
        finally{this.canvas=originalCanvas;this.ctx=originalContext;c.width=w;c.height=h;}
        this.motion.upload(snapshot,saved);return true;
      }catch{this.motionFailed=true;this.motion?.dispose();this.motion=null;return false;}
    }
    motionFrame(){
      if(!this.drag&&!this.wheelMotion)return false;
      if(!this.prepareMotion())return false;
      const state=this.cameraState(),dpr=globalThis.devicePixelRatio||1;
      if(!this.motion.show(state,dpr)){this.motion.saved=null;if(!this.prepareMotion()||!this.motion.show(state,dpr))return false;}
      this.canvas.style.opacity='0';this.motionActive=true;this.dispatchEvent(new CustomEvent('kicad:viewframe'));return true;
    }
    finishMotion(){if(this.motionTimer!==null){clearTimeout(this.motionTimer);this.motionTimer=null;}if(this.frameRequest!==null&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(this.frameRequest);this.frameRequest=null;this.wheelMotion=false;if(!this.disposed)this.draw();}
    requestDraw(){if(typeof requestAnimationFrame!=='function'){this.draw();return;}if(this.frameRequest===null)this.frameRequest=requestAnimationFrame(()=>{this.frameRequest=null;if(!this.disposed&&!this.motionFrame())this.draw();});}
    inView(p,view){let box=this.geometryBounds.get(p);if(box===undefined){box=spatialBounds(p);this.geometryBounds.set(p,box||null);}if(!box)return true;const margin=3/this.viewport.camera.zoom;return box.x+box.w>=view.x-margin&&box.x<=view.x+view.w+margin&&box.y+box.h>=view.y-margin&&box.y<=view.y+view.h+margin;}
    draw(){
      if(this.motionTimer!==null){clearTimeout(this.motionTimer);this.motionTimer=null;}this.wheelMotion=false;
      if(this.acceleration==='off'&&this.motion){this.motion.dispose();this.motion=null;}
      this.motion?.hide();if(this.motion)this.motion.saved=null;this.canvas.style.opacity='';this.motionActive=false;this.drawGeometry();
    }
    drawGeometry(){

      const c=this.viewport.camera,ctx=this.ctx,dpr=globalThis.devicePixelRatio||1;ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle=this.background();ctx.fillRect(0,0,this.canvas.width,this.canvas.height);ctx.setTransform(dpr,0,0,dpr,0,0);

      if(this.grid&&c.zoom>2){let step=Number.isFinite(this.gridPitch)&&this.gridPitch>=.001&&this.gridPitch<=100?this.gridPitch:(c.zoom>12?1:5);while(step*c.zoom<5)step*=10;const b=c.bbox;ctx.fillStyle=this.dark?'#2b3b46':'#d3d3c7';let count=0;for(let x=Math.ceil(b.x/step)*step;x<b.x+b.w&&count<20000;x+=step)for(let y=Math.ceil(b.y/step)*step;y<b.y+b.h&&count++<20000;y+=step){const s=c.world_to_screen({x,y});ctx.fillRect(s.x,s.y,1,1);}}

      if(this.paperVisible){const page=this.design?.page||{width:297,height:210},a=c.world_to_screen({x:0,y:0}),b=c.world_to_screen({x:page.width,y:page.height});ctx.save();ctx.shadowColor='#00000055';ctx.shadowBlur=18;ctx.shadowOffsetY=4;ctx.fillStyle=this.paperColor();ctx.fillRect(Math.min(a.x,b.x),a.y,Math.abs(b.x-a.x),b.y-a.y);ctx.restore();}

      const view=c.bbox;
      const margin=3/c.zoom;
      if(this.renderPrimitives)this.renderPrimitives(ctx,c,this);else for(const p of this.candidates({x:view.x-margin,y:view.y-margin,w:view.w+2*margin,h:view.h+2*margin})){

        if(p.hidden||!this.inView(p,view))continue;

        if(p.frame&&!this.paperVisible)continue;

        if(!p.frame&&p.layer&&!this.visibleLayers.has(p.layer))continue;

        const matches=this.netPrimitives.has(p),dim=this.netHighlight&&!p.frame&&!matches,layerDim=this.focusedLayer&&!p.frame&&p.layer!==this.focusedLayer;

        if(layerDim&&this.layerFocusMode==='isolate'&&!p.hole&&p.layer!=='Edge.Cuts')continue;

        if(dim&&this.isolateNet&&!p.hole&&p.layer!=='Edge.Cuts')continue;

        this.paint(p,{color:matches&&!p.hole?(this.pcb?'#ffe18b':this.dark?'#78d5ff':'#006ca8'):this.netClassColors?.get(p)||null,opacity:Math.min(dim&&!p.hole&&this.highlightMode!=='bright'&&p.layer!=='Edge.Cuts'?(this.pcb?.16:.28):1,layerDim&&!p.hole?.18:1)});

      }

      if(this.selected){const b=bounds([this.selected],true);if(b){const a=c.world_to_screen(b);ctx.strokeStyle='#80f0b7';ctx.lineWidth=2;ctx.setLineDash([4,3]);ctx.strokeRect(a.x-4,a.y-4,(c.flipped?-1:1)*b.w*c.zoom+8,b.h*c.zoom+8);ctx.setLineDash([]);}}

    }

    paint(p,style={}){

      const ctx=this.ctx,c=this.viewport.camera;ctx.save();let color=style.color||(p.kind==='pad'&&p.padType==='thru_hole'?'#d6bf73':p.color)||'#819baa';if(p.hole)color=this.paperVisible?this.paperColor():this.background();else if(!style.color&&!this.pcb&&this.dark){const map={'#000000':'#ccd6d5','#840000':'#ef827b','#008400':'#73ce91','#000080':'#96b7ea','#a0a0a0':'#657d89'};color=map[color.toLowerCase()]||color;}

      ctx.strokeStyle=color;ctx.fillStyle=p.fill==='background'?(this.paperVisible?this.paperColor():this.background()):color;ctx.globalAlpha=Math.max(0,Math.min(1,(Number.isFinite(p.opacity)?p.opacity:1)*(style.opacity??1)));ctx.lineWidth=Math.max(.65,(p.width||.15)*c.zoom);ctx.lineCap='round';ctx.lineJoin='round';

      if(p.type==='text'){const q=c.world_to_screen(p);ctx.translate(q.x,q.y);ctx.rotate((p.angle||0)*Math.PI/180*(c.flipped?-1:1));ctx.font=`${p.bold?'bold ':''}${p.italic?'italic ':''}${Math.max(1,(p.fontHeight||p.size||1.27)*c.zoom*4/3)}px ${p.fontFace?'sans-serif':'"Arial",sans-serif'}`;ctx.textAlign=p.align||'center';ctx.textBaseline=p.baseline||'middle';const height=p.fontHeight||p.size||1.27;if(p.fontWidth&&height>0)ctx.scale(p.fontWidth/height,1);const lines=String(p.text||'').split('\n');lines.forEach((text,i)=>ctx.fillText(text,0,(i-(lines.length-1)/2)*height*c.zoom*(p.lineSpacing||1.5)));ctx.restore();return;}

      ctx.beginPath();

      if(p.type==='arc'){const a=arcThrough(p.start,p.mid,p.end);if(a){const q=c.world_to_screen(a);const start=c.flipped?Math.PI-a.start:a.start,end=c.flipped?Math.PI-a.end:a.end;ctx.arc(q.x,q.y,a.r*c.zoom,start,end,c.flipped?!a.ccw:a.ccw);}else{const ps=points(p);if(ps.length){const q=c.world_to_screen(ps[0]);ctx.moveTo(q.x,q.y);for(const t of ps.slice(1)){const s=c.world_to_screen(t);ctx.lineTo(s.x,s.y);}}}}

      else if(p.type==='circle'||p.type==='pad'&&p.r){const q=c.world_to_screen(p);ctx.arc(q.x,q.y,p.r*c.zoom,0,2*Math.PI);}

      else{const ps=points(p);if(ps.length){const q=c.world_to_screen(ps[0]);ctx.moveTo(q.x,q.y);for(const t of ps.slice(1)){const s=c.world_to_screen(t);ctx.lineTo(s.x,s.y);}if(p.type==='polygon'||p.type==='pad')ctx.closePath();}}

      if(p.fill)ctx.fill();if(!p.hole&&p.stroke!==false)ctx.stroke();ctx.restore();

    }

    dispose(){this.disposed=true;if(this.frameRequest!==null&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(this.frameRequest);this.frameRequest=null;if(this.motionTimer!==null)clearTimeout(this.motionTimer);this.motionTimer=null;this.motion?.dispose();this.motion=null;this.observer.disconnect();for(const stop of this.handlers)stop();this.canvas.remove();}

  }

  root.KiCadOwnedCanvas={Camera,arcThrough,bounds,hitPrimitive,mount:(host,options)=>new Viewport(host,options)};

  if(typeof module==='object'&&module.exports)module.exports=root.KiCadOwnedCanvas;

})(globalThis);
