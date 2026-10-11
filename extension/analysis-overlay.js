/* Coordinate-bound saved fields; source PCB backgrounds require an exact hash. */
((root)=>{'use strict';
 const S=()=>root.KiCadAnalysisSpatial,D=()=>root.KiCadAnalysisData;
 function mount(options){
  const $=id=>document.getElementById(id);let plot=null,saved=null,board=null,background=[],view=null,scene=null,surface=null,values=null,current=null,generation=0,dead=false,probes=[],historyMap=null;
  const dark=()=>document.body.classList.contains('dark');
  function stop(){view?.dispose();scene?.dispose();view=scene=null;current=null;}
  const message=text=>{$('overlayStatus').textContent=text;};
  async function setReport(value){
   const ticket=++generation;stop();saved=value;board=null;background=S().contextGeometry(value);message('Saved result geometry; no source PCB attached.');
   const bindings=S().sourceBindings(value);if(!bindings.length)return;
   try{
    const inventory=await options.request('project-inventory',{});if(dead||ticket!==generation)return;
    const files=(inventory.files||[]).filter(f=>/\.kicad_pcb$/i.test(f.path));
    const names=new Set(bindings.map(b=>b.path.replace(/\\/g,'/').split('/').at(-1)));
    const candidates=files.filter(f=>names.has(f.path.split('/').at(-1))).slice(0,12);
    for(const file of candidates){
     const response=await options.request('project-file',{file:file.path});if(dead||ticket!==generation)return;
     const content=typeof response==='string'?response:response.content;if(typeof content!=='string')continue;
     const bytes=new TextEncoder().encode(content);if(bytes.length>64*1024*1024)continue;
     const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
     if(!bindings.some(b=>b.sha256.toLowerCase()===digest))continue;
     const design=KiCadPCBRenderer.build(KiCadDesignDiff.parse(content),file.path);
     let assetPaths;try{assetPaths=(await options.request('repo-model-index',{})).paths;}catch{}if(dead||ticket!==generation)return;
     board={content,path:file.path,sha256:digest,assetPaths};background=design.primitives.filter(p=>!p.frame&&p.kind!=='footprint-hit');
     message('Source PCB verified by SHA-256 · '+file.path);stop();update(plot,probes);return;
    }
    message('Source PCB hash could not be matched. Showing saved result geometry only.');
   }catch(error){if(ticket===generation&&!dead)message('Source PCB unavailable: '+error.message+'. Showing saved geometry only.');}
  }
  function finiteValues(s){return s.values.filter(v=>Number.isFinite(v));}
  function fieldPrimitives(s){
   const numbers=finiteValues(s),min=numbers.length?numbers.reduce((a,b)=>Math.min(a,b),Infinity):0,max=numbers.length?numbers.reduce((a,b)=>Math.max(a,b),-Infinity):0;
   const rows=[];s.triangles.forEach((t,i)=>{const values=s.nodal?t.map(n=>s.values[n]):[s.values[i]];if(values.some(v=>!Number.isFinite(v)))return;
    const v=values.reduce((a,b)=>a+b,0)/values.length;rows.push({type:'polygon',points:t.map(n=>({x:s.points[n][0],y:s.points[n][1]})),fill:true,stroke:false,color:'hsl('+(240-240*(v-min)/Math.max(.000001,max-min))+',75%,53%)',kind:'analysis-field'});
   });return {rows,min,max};
  }
  function draw2d(){
   if(!view||!surface)return;view.dark=dark();const fields=fieldPrimitives(surface),opacity=Number($('overlayOpacity').value)/100;
   view.renderPrimitives=(ctx,c)=>{
    for(const p of background)if(!p.frame)view.paint(p,{opacity:.65});
    for(const p of fields.rows)view.paint(p,{opacity});
    for(const [i,p]of probes.entries()){if(!p)continue;const at=c.world_to_screen(p);ctx.fillStyle=i?'#e88132':'#d63c70';ctx.beginPath();ctx.arc(at.x,at.y,5,0,Math.PI*2);ctx.fill();ctx.font='bold 12px system-ui';ctx.fillText(i?'B':'A',at.x+8,at.y-8);}
   };view.draw();$('overlayLegend').textContent=fields.rows.length?fields.min.toPrecision(4)+' — '+fields.max.toPrecision(4)+' '+surface.unit:'No finite saved field values';
  }
  function pointAt(event){const rect=view.canvas.getBoundingClientRect(),world=view.viewport.camera.screen_to_world({x:event.clientX-rect.left,y:event.clientY-rect.top});const p=D().probe(plot,world.x,world.y);return p?{...p,z:p.z??(plot.type==='heatmap'&&surface.zKnown?surface.points[0]?.[2]:undefined)}:null;}
  function make2d(){
   const fields=fieldPrimitives(surface);view=KiCadOwnedCanvas.mount($('overlay2d'),{dark:dark(),pcb:true,acceleration:'off'});
   view.setDocument({primitives:[...background,...fields.rows],layers:[],warnings:[]},'Saved results');
   view.canvas.setAttribute('aria-label','2D simulation overlay');
   view.canvas.addEventListener('click',event=>options.onProbe(pointAt(event)));
   view.canvas.addEventListener('pointermove',event=>options.onHover(pointAt(event)));draw2d();
  }
  function setMarkers(){const rows=probes.map((p,i)=>p?{...p,z:p.z??surface?.points[0]?.[2]??0,label:i?'B':'A'}:null).filter(Boolean);if(board&&scene?.setAnalysisProbes)scene.setAnalysisProbes(rows);else scene?.setProbes(rows);}
  function make3d(){
   const callback=p=>p?{...p,name:plot.title,unit:plot.unit,method:p.method||'Saved field'}:null;
   const handlers={onAnalysisProbe:p=>options.onProbe(callback(p)),onAnalysisHover:p=>options.onHover(callback(p))};
   if(board){
    scene=SpikeBoard3D.mountBoard3D($('overlay3d'),board.content,{dark:dark(),...handlers,externalInspector:true,boardPath:board.path,assetPaths:board.assetPaths,loadAsset:path=>options.request('repo-asset',{file:path})});
    const placed=scene.setAnalysisOverlay(surface);if(!placed.placed){scene.dispose();scene=null;message('Verified PCB; overlay placement unavailable: '+placed.reason+'. Showing saved field geometry.');}else message('Source PCB verified by SHA-256 · '+board.path+' · selected saved field is shown through board geometry.');
   }
   if(!scene)scene=SpikeBoard3D.mountResultScene($('overlay3d'),{surface,dark:dark(),onProbe:p=>options.onProbe(callback(p)),onHover:p=>options.onHover(callback(p))});
   if(scene.unavailable){scene.dispose();scene=null;throw Error('WebGL is unavailable on this device');}
   if(scene.setAnalysisOpacity)scene.setAnalysisOpacity(Number($('overlayOpacity').value)/100);else scene.setOpacity(Number($('overlayOpacity').value)/100);
   setMarkers();
  }
  function update(next,pinned=[]){
   if(dead)return;probes=pinned;const plotChanged=plot!==next,changed=plotChanged||values!==next?.values;if(plotChanged)stop();plot=next;
   if(changed){surface=plot?S().toSurface(plot,saved):null;values=plot?.values;}
   const spatial=Boolean(surface?.triangles?.length);$('overlayControls').hidden=!spatial;
   const kind=spatial?$('resultView').value:'map';$('overlay2d').hidden=kind!=='2d';$('overlay3d').hidden=kind!=='3d';$('chart').hidden=!plot||kind!=='map';
   if(kind!==current){stop();current=kind;}
   try{
    if(kind==='2d'){if(!view)make2d();else draw2d();}
    if(kind==='3d'){
     if(!scene)make3d();else if(changed){if(scene.setAnalysisOverlay){const placed=scene.setAnalysisOverlay(surface);if(!placed.placed){scene.dispose();scene=null;make3d();}}else scene.setSurface(surface);}
     scene.setTheme(dark());setMarkers();
     const numbers=finiteValues(surface);$('overlayLegend').textContent=numbers.length?numbers.reduce((a,b)=>Math.min(a,b),Infinity).toPrecision(4)+' — '+numbers.reduce((a,b)=>Math.max(a,b),-Infinity).toPrecision(4)+' '+surface.unit:'No saved values';
    }
   }catch(error){stop();$('overlay3d').hidden=true;$('chart').hidden=false;$('resultView').value='map';message('3D overlay unavailable: '+error.message+'. The 2D map remains available.');}
   drawHistory();
  }
  function drawHistory(){
   const histories=probes.map((p,i)=>p?{label:i?'B':'A',plot:S().pointHistory(plot,p.x,p.y)}:null).filter(p=>p?.plot?.series?.length);
   const canvas=$('probeHistory');canvas.hidden=!histories.length;$('probeHistoryLabel').hidden=!histories.length;historyMap=null;if(!histories.length)return;
   const ctx=canvas.getContext('2d'),box=canvas.getBoundingClientRect(),dpr=devicePixelRatio||1;canvas.width=Math.max(1,box.width*dpr);canvas.height=Math.max(1,box.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle=dark()?'#1b2b36':'#fff';ctx.fillRect(0,0,box.width,box.height);
   const all=histories.flatMap(p=>p.plot.series[0].points),finite=all.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));if(!finite.length)return;
   let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;for(const p of finite){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}
   if(minX===maxX)maxX=minX+1;if(minY===maxY)maxY=minY+1;
   const sx=x=>45+(x-minX)/(maxX-minX)*(box.width-60),sy=y=>15+(maxY-y)/(maxY-minY)*(box.height-45);
   ctx.fillStyle=dark()?'#dce8ef':'#203544';ctx.font='11px system-ui';ctx.fillText(minY.toPrecision(4),1,box.height-30);ctx.fillText(maxY.toPrecision(4),1,20);ctx.fillText(minX.toPrecision(4)+' s',45,box.height-8);ctx.fillText(maxX.toPrecision(4)+' s',box.width-65,box.height-8);
   histories.forEach((h,i)=>{ctx.strokeStyle=i?'#e88132':'#d63c70';ctx.beginPath();let start=false;for(const p of h.plot.series[0].points){if(!Number.isFinite(p.y)){start=false;continue;}if(start)ctx.lineTo(sx(p.x),sy(p.y));else{ctx.moveTo(sx(p.x),sy(p.y));start=true;}}ctx.stroke();ctx.fillStyle=ctx.strokeStyle;ctx.fillText(h.label+' · '+plot.unit,60+i*100,25);});
   historyMap={minX,maxX,width:box.width};$('probeHistoryLabel').textContent='Pinned-point histories · Time (s) · '+plot.unit+' · tap to select a saved frame';
  }
  $('probeHistory').addEventListener('click',event=>{if(!historyMap||!plot?.frames)return;const rect=$('probeHistory').getBoundingClientRect(),px=event.clientX-rect.left;if(px<45||px>historyMap.width-15)return;const time=historyMap.minX+(px-45)/(historyMap.width-60)*(historyMap.maxX-historyMap.minX);let index=0;plot.frames.forEach((f,i)=>{if(Math.abs(Number(f.time_s)-time)<Math.abs(Number(plot.frames[index].time_s)-time))index=i;});options.onFrame(index);});
  $('resultView').onchange=()=>update(plot,probes);$('overlayFit').onclick=()=>{if(view){view.zoom_to_board();view.draw();}scene?.fit();};
  $('overlayOpacity').oninput=()=>{if(view)draw2d();if(scene?.setAnalysisOpacity)scene.setAnalysisOpacity(Number($('overlayOpacity').value)/100);else scene?.setOpacity(Number($('overlayOpacity').value)/100);};
  return {setReport,update,dispose(){dead=true;generation++;stop();}};
 }
 root.KiCadAnalysisOverlay={mount};
})(globalThis);
