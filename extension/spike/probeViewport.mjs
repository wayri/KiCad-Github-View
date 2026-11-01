import {selectionMatcher,selectableRecord,tapGesture} from './selectionState.mjs';
import {boxFitDistance} from './fitPolicy.mjs';
import {probeViewportPlan} from './renderQuality.mjs';

/** Main scene plus two probes is the bounded three-context budget. */
export function createProbeRegistry(limit=2){
 const entries=new Set();let closed=false,reserved=0;
 return {
  create(factory){
   if(closed)throw Error('The parent 3D scene is closed.');
   if(entries.size+reserved>=limit)throw Error('The interactive 3D probe limit ('+limit+') is reached. Close a 3D probe or switch it to a 2D view.');
   reserved++;let api;try{api=factory();}finally{reserved--;}
   const original=api.dispose;let disposed=false;
   api.dispose=()=>{if(disposed)return;disposed=true;try{original.call(api);}finally{entries.delete(api);}};
   entries.add(api);return api;
  },
  sourceAdded(node){for(const api of entries)api.sourceAdded(node);},
  dispose(){if(closed)return;closed=true;for(const api of [...entries])api.dispose();},
  size(){return entries.size;}
 };
}

/** Clone transforms and visibility, retaining shared source buffers and records.
 * Avoid Object3D.clone's JSON copy of large userData.records and InstancedMesh's
 * duplicate instance arrays. Shared resources are read-only and never disposed. */
export function cloneProbeTree(THREE,source,{materialFor=node=>node.material,instanceColorFor=node=>node.instanceColor}={}){
 let mapping=new WeakMap();const pickables=[];
 function clone(node){
  let copy;
  if(node.isInstancedMesh){copy=new THREE.InstancedMesh(node.geometry,materialFor(node),0);copy.count=node.count;copy.instanceMatrix=node.instanceMatrix;copy.instanceColor=instanceColorFor(node);copy.boundingBox=node.boundingBox;copy.boundingSphere=node.boundingSphere;copy.morphTexture=node.morphTexture;}
  else if(node.isMesh)copy=new THREE.Mesh(node.geometry,materialFor(node));
  else if(node.isLineSegments)copy=new THREE.LineSegments(node.geometry,materialFor(node));
  else if(node.isLineLoop)copy=new THREE.LineLoop(node.geometry,materialFor(node));
  else if(node.isLine)copy=new THREE.Line(node.geometry,materialFor(node));
  else if(node.isPoints)copy=new THREE.Points(node.geometry,materialFor(node));
  else if(node.isSprite)copy=new THREE.Sprite(materialFor(node));
  else copy=new THREE.Group();
  copy.name=node.name;copy.position.copy(node.position);copy.quaternion.copy(node.quaternion);copy.scale.copy(node.scale);copy.matrix.copy(node.matrix);copy.matrixAutoUpdate=node.matrixAutoUpdate;copy.visible=node.visible;copy.renderOrder=node.renderOrder;copy.frustumCulled=node.frustumCulled;copy.layers.mask=node.layers.mask;copy.userData=node.userData;
  mapping.set(node,copy);if(node.geometry&&(node.userData.records||node.userData.record))pickables.push(copy);
  for(const child of node.children)copy.add(clone(child));return copy;
 }
 const root=clone(source);
 return {root,pickables,copyOf:node=>mapping.get(node),sourceAdded(node){
  const pending=[];for(let current=node;current&&!mapping.has(current);current=current.parent)pending.unshift(current);
  if(!pending.length)return false;
  const first=pending[0],parent=mapping.get(first.parent);if(!parent)return false;parent.add(clone(first));return true;
 },release(){root.clear();pickables.length=0;mapping=new WeakMap();}};
}

export function createSharedProbeViewport({THREE,OrbitControls,host,source,sourceScene,sourceRenderer,board,materialFor,instanceColorFor,selection={},selectionMode='all',dark=true,onSelect,raf=requestAnimationFrame,caf=cancelAnimationFrame,Observer=ResizeObserver}){
 if(!host?.append)throw Error('A connected probe viewport host is required.');
 const tree=cloneProbeTree(THREE,source,{materialFor,instanceColorFor}),scene=new THREE.Scene();scene.background=new THREE.Color(dark?0x151820:0xe7ebf1);scene.add(tree.root);
 // Reuse light settings, not shadow targets or GPU-generated PMREM targets,
 // which belong to the main context. No new shadow/AO/environment targets.
 for(const light of sourceScene.children.filter(node=>node.isLight)){const copy=light.clone();copy.castShadow=false;scene.add(copy);}
 const camera=new THREE.PerspectiveCamera(45,1,.01,10000);camera.up.set(0,0,1);camera.position.set(30,-40,60);
 let renderer,controls,observer,alive=true,frame=0,contextLost=false,currentSelection=selection,mode=selectionMode,selectionBounds=null,selectionStats={matched:0,highlighted:0,limited:false};
 const overlayGeometry=new THREE.BufferGeometry(),positions=new THREE.Float32BufferAttribute(256*24*3,3);overlayGeometry.setAttribute('position',positions);overlayGeometry.setDrawRange(0,0);
 const overlayMaterial=new THREE.LineBasicMaterial({color:dark?0xffdf7d:0x9b5500,depthTest:false,depthWrite:false,toneMapped:false}),overlay=new THREE.LineSegments(overlayGeometry,overlayMaterial);overlay.frustumCulled=false;overlay.renderOrder=100;scene.add(overlay);
 const unit=new THREE.EdgesGeometry(new THREE.BoxGeometry(1,1,1)),edges=unit.getAttribute('position'),matrix=new THREE.Matrix4(),local=new THREE.Matrix4(),box=new THREE.Box3(),center=new THREE.Vector3(),size=new THREE.Vector3(),raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),gesture=tapGesture();
 const visible=node=>{for(let n=node;n;n=n.parent)if(!n.visible)return false;return true;};
 function invalidate(){if(alive&&!contextLost&&!frame)frame=raf(paint);}
 function paint(){frame=0;if(!alive||contextLost)return;controls.update();renderer.render(scene,camera);}
 function resize(){if(!alive)return;const w=Math.max(1,host.clientWidth||320),h=Math.max(1,host.clientHeight||240),ratio=probeViewportPlan(w,h,globalThis.devicePixelRatio).ratio;renderer.setPixelRatio(ratio);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();invalidate();}
 function selectedBounds(){
  const matches=selectionMatcher(currentSelection,board);let matched=0,count=0;const union=new THREE.Box3();tree.root.updateWorldMatrix(true,true);
  for(const object of tree.pickables){if(!visible(object))continue;const records=object.userData.records||[object.userData.record];
   for(let index=0;index<records.length;index++){if(!matches(records[index]))continue;if(object.isInstancedMesh){object.getMatrixAt(index,local);if(local.determinant()===0)continue;}matched++;if(count>=256)continue;
    if(object.isInstancedMesh){if(!object.geometry.boundingBox)object.geometry.computeBoundingBox();box.copy(object.geometry.boundingBox);matrix.multiplyMatrices(object.matrixWorld,local);box.applyMatrix4(matrix);}else box.setFromObject(object);
    if(box.isEmpty())continue;union.union(box);box.expandByScalar(.035);box.getCenter(center);box.getSize(size);
    for(let i=0;i<edges.count;i++)positions.setXYZ(count*edges.count+i,center.x+edges.getX(i)*size.x,center.y+edges.getY(i)*size.y,center.z+edges.getZ(i)*size.z);count++;
   }
  }
  overlayGeometry.setDrawRange(0,count*edges.count);positions.needsUpdate=true;selectionBounds=union.isEmpty()?null:union;selectionStats={matched,highlighted:count,limited:matched>count};return selectionStats;
 }
 function fit(){if(!alive)return false;resize();tree.root.updateWorldMatrix(true,true);const bounds=selectionBounds||new THREE.Box3().setFromObject(tree.root);if(bounds.isEmpty())return false;const target=bounds.getCenter(new THREE.Vector3()),dimensions=bounds.getSize(new THREE.Vector3()),direction=camera.position.clone().sub(controls.target).normalize();if(!direction.lengthSq())direction.set(.45,-.6,1).normalize();
  const distance=boxFitDistance([Math.max(2,dimensions.x),Math.max(2,dimensions.y),Math.max(1,dimensions.z)],direction.toArray(),camera.fov,camera.aspect,.8,camera.up.toArray());if(!distance)return false;
  controls.minDistance=.1;controls.maxDistance=Math.max(10000,distance*8);controls.target.copy(target);camera.position.copy(target).addScaledVector(direction,distance);camera.near=Math.max(.001,distance/10000);camera.far=Math.max(10000,distance*20);camera.updateProjectionMatrix();controls.update();invalidate();return true;
 }
 function setSelection(value={}){if(!alive)return {matched:0,highlighted:0,limited:false};currentSelection=value||{};const result=selectedBounds();invalidate();return result;}
 function pick(event){const rect=renderer.domElement.getBoundingClientRect();if(!(rect.width>0&&rect.height>0))return;pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);camera.updateMatrixWorld();scene.updateMatrixWorld(true);raycaster.setFromCamera(pointer,camera);
  const hit=raycaster.intersectObjects(tree.pickables.filter(visible),false).find(hit=>selectableRecord(hit.object.userData.records?.[hit.instanceId]||hit.object.userData.record,mode)),record=hit?(hit.object.userData.records?.[hit.instanceId]||hit.object.userData.record):null;
  setSelection(!record?{}:mode==='net'&&record.net?{netNames:[record.net]}:record.type==='Component'||typeof record.library==='string'?{references:[record.ref]}:{uuids:[record.uuid||record.id]});onSelect?.(record);
 }
 const down=event=>gesture.down(event),move=event=>gesture.move(event),up=event=>{if(gesture.up(event)&&event.button===0)pick(event);},cancel=event=>gesture.cancel(event),lost=event=>{event.preventDefault();contextLost=true;if(frame)caf(frame);frame=0;},restored=()=>{contextLost=false;invalidate();};
 function dispose(){if(!alive)return;alive=false;if(frame)caf(frame);observer?.disconnect();controls?.removeEventListener('change',invalidate);controls?.dispose();
  if(renderer){for(const [name,handler]of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel],['webglcontextlost',lost],['webglcontextrestored',restored]])renderer.domElement.removeEventListener(name,handler);renderer.renderLists?.dispose();renderer.dispose();renderer.forceContextLoss?.();renderer.domElement.remove();}
  scene.remove(tree.root);tree.release();overlayGeometry.dispose();overlayMaterial.dispose();unit.dispose();scene.clear();
 }
 try{
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});renderer.shadowMap.enabled=false;renderer.outputColorSpace=sourceRenderer.outputColorSpace;renderer.toneMapping=sourceRenderer.toneMapping;renderer.toneMappingExposure=sourceRenderer.toneMappingExposure;
  const canvas=renderer.domElement;canvas.style.width='100%';canvas.style.height='100%';canvas.style.display='block';canvas.style.touchAction='none';canvas.tabIndex=0;canvas.setAttribute('aria-label','Interactive 3D probe. Drag to orbit, right-drag to pan, wheel or pinch to zoom, tap to select.');host.append(canvas);
  controls=new OrbitControls(camera,canvas);controls.screenSpacePanning=true;controls.enableDamping=false;controls.addEventListener('change',invalidate);
  for(const [name,handler]of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel],['webglcontextlost',lost],['webglcontextrestored',restored]])canvas.addEventListener(name,handler);
  observer=new Observer(resize);observer.observe(host);resize();setSelection(selection);fit();
 }catch(error){dispose();throw error;}
 return {fit,setSelection,setSelectionMode(value){mode=['all','part','net','pin'].includes(value)?value:'all';},setTheme(value){if(!alive)return;scene.background.setHex(value?0x151820:0xe7ebf1);overlayMaterial.color.setHex(value?0xffdf7d:0x9b5500);invalidate();},
  rotate(degrees=90){if(!alive||!Number.isFinite(degrees))return false;const offset=camera.position.clone().sub(controls.target).applyAxisAngle(camera.up,degrees*Math.PI/180);camera.position.copy(controls.target).add(offset);controls.update();invalidate();return true;},
  zoom(factor){if(!alive||!Number.isFinite(factor)||factor<=0)return false;const offset=camera.position.clone().sub(controls.target),distance=Math.max(controls.minDistance,Math.min(controls.maxDistance,offset.length()/factor));camera.position.copy(controls.target).add(offset.setLength(distance));controls.update();invalidate();return true;},
  sourceAdded(node){if(alive&&tree.sourceAdded(node)){setSelection(currentSelection);invalidate();}},
  getStats(){return {active:alive,sharedGeometry:true,sharedCpuGeometry:true,independentGpuContext:true,sourceParses:0,modelRequests:0,maxPixelCount:500000,maxDevicePixelRatio:2,antialiasRequested:true,ambientOcclusion:false,shadows:false,fullNet3D:false,selectionGeometry:'visible parent geometry',selection:{...selectionStats},contextLost};},dispose};
}
