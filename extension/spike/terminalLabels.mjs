/** Read-only saved terminal annotations, shared by main and probe cameras. */
const safe=value=>typeof value==='string'&&value.length<=160&&!/[\x00-\x1f\x7f-\x9f\u2028-\u202e\u2066-\u2069]/.test(value)?value.trim():'';
export function terminalNumber(pad){return safe(pad?.pinNumber!==undefined?pad.pinNumber:pad?.name);}
export function terminalOnLayer(pad,layer){return ['F.Cu','B.Cu'].includes(layer)&&(pad.layer===layer||pad.layers?.includes(layer)||pad.layers?.includes('*.Cu')||pad.layers?.includes('F&B.Cu'));}
export function facingTerminalLayer(cameraZ,top,bottom){return cameraZ>top?'F.Cu':cameraZ<bottom?'B.Cu':null;}
export function createTerminalLabelState(options={}){
 let nets=options.showNetNames===true,follow=options.showTerminalNumbers===undefined,numbers=follow?nets:options.showTerminalNumbers===true;
 return {setNets(value){nets=Boolean(value);if(follow)numbers=nets;return nets;},setNumbers(value){follow=false;numbers=Boolean(value);return numbers;},get(){return {numbers,nets,legacyCombined:follow};}};
}
/** UI actions notify preferences; externally synchronized setters stay quiet. */
export function createTerminalLabelController(annotations,{enabled=()=>true,onNumbersChange,onNetNamesChange,onChange=()=>{}}={}){
 return {setNumbers(value,{notify=false}={}){const result=annotations.setNumbers(value);onChange(annotations.getState());if(notify)onNumbersChange?.(result);return result;},setNets(value,{notify=false}={}){const result=annotations.setNets(value);onChange(annotations.getState());if(notify)onNetNamesChange?.(result);return result;},update(){return annotations.update({enabled:enabled()});}};
}
export function labelCollisionGrid(cellSize=64){
 if(!Number.isFinite(cellSize)||cellSize<=0)throw Error('Invalid label collision grid size.');
 const cells=new Map(),boxes=[];
 const keys=box=>{const result=[];for(let x=Math.floor(box.x/cellSize);x<=Math.floor((box.x+box.w)/cellSize);x++)for(let y=Math.floor(box.y/cellSize);y<=Math.floor((box.y+box.h)/cellSize);y++)result.push(x+','+y);return result;};
 return {intersects(box){const checked=new Set();for(const key of keys(box))for(const index of cells.get(key)||[]){if(checked.has(index))continue;checked.add(index);const b=boxes[index];if(box.x<b.x+b.w&&box.x+box.w>b.x&&box.y<b.y+b.h&&box.y+box.h>b.y)return true;}return false;},add(box){const index=boxes.push(box)-1;for(const key of keys(box)){if(!cells.has(key))cells.set(key,[]);cells.get(key).push(index);}}};
}
/** Fit an upright, center-aligned rectangle within a projected pad quadrilateral. */
export function projectedTerminalFit(center,corners){
 if(!center||!corners?.length||corners.length!==4||[center,...corners].some(p=>![p.x,p.y,p.z].every(Number.isFinite)||p.z< -1||p.z>1))return null;
 const halfW=Math.min(center.x-Math.min(...corners.map(p=>p.x)),Math.max(...corners.map(p=>p.x))-center.x),halfH=Math.min(center.y-Math.min(...corners.map(p=>p.y)),Math.max(...corners.map(p=>p.y))-center.y);if(!(halfW>0&&halfH>0))return null;
 let scale=1;
 for(let i=0;i<4;i++){const a=corners[i],b=corners[(i+1)%4],nx=b.y-a.y,ny=a.x-b.x,d=Math.abs(nx*(center.x-a.x)+ny*(center.y-a.y)),support=Math.abs(nx)*halfW+Math.abs(ny)*halfH;if(support>0)scale=Math.min(scale,d/support);}
 return scale>0?{width:2*halfW*scale,height:2*halfH*scale}:null;
}
export function createTerminalAnnotations(THREE,{scene,camera,host,records=[],world,top,bottom,surfaceZ=layer=>layer==='F.Cu'?top+.001:bottom-.001,layout,showNetNames=false,showTerminalNumbers,maxLabels=1024,maxRecords=50000,maxTexturePixels=2097152,layerVisible=()=>true,onStatus=()=>{},createCanvas=()=>globalThis.document.createElement('canvas')}={}){
 if(!scene||!camera||!host||!Array.isArray(records)||!Number.isFinite(top)||!Number.isFinite(bottom)||top<=bottom||typeof world!=='function'||typeof layout!=='function'||!Number.isInteger(maxLabels)||maxLabels<1||maxLabels>1024||!Number.isInteger(maxRecords)||maxRecords<1||maxRecords>50000||!Number.isInteger(maxTexturePixels)||maxTexturePixels<1||maxTexturePixels>2097152)throw Error('Invalid terminal annotation limits/context.');
 const state=createTerminalLabelState({showNetNames,showTerminalNumbers}),group=new THREE.Group(),geometry=new THREE.PlaneGeometry(1,1),pool=[],cache=new Map(),inFrame=new Set(),pads=[];let sourceOmitted=0,pixels=0,disposed=false,lastSignature='',lastStatus='',stats={shown:0,readable:0,overlap:0,budget:0,sourceOmitted:0};
 for(const pad of records)if(terminalNumber(pad)){if(pads.length<maxRecords)pads.push(pad);else sourceOmitted++;}
 group.name='Saved pad annotations';scene.add(group);const projected=new THREE.Vector3(),centerWorld=new THREE.Vector3(),cameraSpace=new THREE.Vector3();
 function report(){const result={...stats,...state.get(),maxLabels,maxRecords,maxTexturePixels,texturePixels:pixels,textureEntries:cache.size};const signature=JSON.stringify(result);if(signature!==lastStatus){lastStatus=signature;onStatus(result);}return result;}
 function texture(label){
  const key=JSON.stringify([label.lines,label.size,label.width,label.height]);if(cache.has(key)){const value=cache.get(key);cache.delete(key);cache.set(key,value);inFrame.add(value.texture);return value.texture;}
  const width=Math.ceil(label.width*2),height=Math.ceil(label.height*2),area=width*height;if(width>2048||height>256||area>262144||area>maxTexturePixels)return null;
  while(cache.size>=maxLabels||pixels+area>maxTexturePixels){const unused=[...cache].find(([,value])=>!inFrame.has(value.texture));if(!unused)return null;cache.delete(unused[0]);pixels-=unused[1].pixels;for(const mesh of pool)if(mesh.material.map===unused[1].texture){mesh.material.map=null;mesh.material.needsUpdate=true;}unused[1].texture.dispose();}
  const canvas=createCanvas();canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');if(!ctx)return null;ctx.scale(2,2);ctx.font=`600 ${label.size}px monospace`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';ctx.lineWidth=2;ctx.strokeStyle='#101820';ctx.fillStyle='#f3f8fa';
  label.lines.forEach((text,index)=>{const y=label.height/2+(index-(label.lines.length-1)/2)*label.size*1.2;ctx.strokeText(text,label.width/2,y);ctx.fillText(text,label.width/2,y);});
  const value=new THREE.CanvasTexture(canvas);value.colorSpace=THREE.SRGBColorSpace;cache.set(key,{texture:value,pixels:area});pixels+=area;inFrame.add(value);return value;
 }
 function update({enabled=true}={}){
  if(disposed)return report();camera.updateMatrixWorld();const flags=state.get(),width=Math.max(1,host.clientWidth),height=Math.max(1,host.clientHeight),layer=facingTerminalLayer(camera.position.z,top,bottom),visible=Boolean(enabled&&(flags.numbers||flags.nets)&&layer&&layerVisible(layer));group.visible=visible;
  const signature=JSON.stringify([camera.matrixWorld.elements,camera.projectionMatrix.elements,width,height,visible,layer,flags]);if(signature===lastSignature)return report();lastSignature=signature;stats={shown:0,readable:0,overlap:0,budget:0,sourceOmitted,layer};inFrame.clear();
  if(visible){const grid=labelCollisionGrid(),project=(x,y,z)=>{projected.set(x,y,z).project(camera);return {x:(projected.x+1)*width/2,y:(1-projected.y)*height/2,z:projected.z};};
   for(const pad of pads){if(!terminalOnLayer(pad,layer)||![pad.width,pad.height,...(pad.at||[])].every(Number.isFinite)||!(pad.width>0&&pad.height>0)||pad.at?.length!==2)continue;
    const[x,y]=world(pad.at),z=surfaceZ(layer);centerWorld.set(x,y,z);cameraSpace.copy(centerWorld).applyMatrix4(camera.matrixWorldInverse);const depth=-cameraSpace.z;if(!(depth>0))continue;const pxPerMm=height/(2*Math.tan(camera.fov*Math.PI/360)*depth);if(Math.min(pad.width,pad.height)*pxPerMm<13)continue;
    const center=project(x,y,z);if(center.x<0||center.x>width||center.y<0||center.y>height||center.z< -1||center.z>1)continue;
    const radians=(pad.shape==='circle'?0:pad.rotation||0)*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians),factor=['circle','oval','roundrect'].includes(pad.shape)?Math.SQRT1_2:1,w=pad.width/2*factor,h=pad.height/2*factor,corners=[[-w,-h],[w,-h],[w,h],[-w,h]].map(([dx,dy])=>project(x+c*dx-s*dy,y+s*dx+c*dy,z)),fit=projectedTerminalFit(center,corners);if(!fit)continue;
    const label=layout({number:terminalNumber(pad),pinName:flags.numbers?pad.pinName:'',net:flags.nets?pad.net:'',showNumbers:flags.numbers,showNetNames:flags.nets,widthPx:fit.width,heightPx:fit.height,minPadPx:13});if(!label)continue;
    const box={x:center.x-label.width/2,y:center.y-label.height/2,w:label.width,h:label.height};if(box.x<0||box.y<0||box.x+box.w>width||box.y+box.h>height)continue;stats.readable++;
    if(grid.intersects(box)){stats.overlap++;continue;}if(stats.shown>=maxLabels){stats.budget++;continue;}const map=texture(label);if(!map){stats.budget++;continue;}
    let mesh=pool[stats.shown];if(!mesh){mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({transparent:true,depthTest:false,depthWrite:false,side:THREE.DoubleSide,toneMapped:false}));mesh.renderOrder=200;group.add(mesh);pool.push(mesh);}
    if(mesh.material.map!==map){mesh.material.map=map;mesh.material.needsUpdate=true;}mesh.position.set(x,y,z);mesh.quaternion.copy(camera.quaternion);mesh.scale.set(label.width/pxPerMm,label.height/pxPerMm,1);mesh.visible=true;grid.add(box);stats.shown++;
   }
  }
  for(let i=stats.shown;i<pool.length;i++)pool[i].visible=false;return report();
 }
 return {group,update,setNets(value){lastSignature='';return state.setNets(value);},setNumbers(value){lastSignature='';return state.setNumbers(value);},getState:report,dispose(){if(disposed)return;disposed=true;scene.remove(group);for(const mesh of pool)mesh.material.dispose();for(const value of cache.values())value.texture.dispose();cache.clear();pixels=0;geometry.dispose();group.clear();pads.length=0;pool.length=0;}};
}
