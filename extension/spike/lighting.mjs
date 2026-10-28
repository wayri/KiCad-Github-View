/** Bounded, reusable lighting rig. Universal inspection keeps every face readable. */
import {studioLights} from './renderQuality.mjs';
export function lightingName(value){return value==='universal'?'universal':'studio';}
export const lightingProfiles=Object.freeze({
 studio:Object.freeze({ambient:.35,environment:.65,shadows:true,occlusion:true,lights:studioLights}),
 universal:Object.freeze({ambient:1,environment:.65,shadows:false,occlusion:false,lights:Object.freeze([
  [0,0,1],[0,0,-1],[1,0,0],[-1,0,0],[0,1,0],[0,-1,0]
 ].map(([x,y,z])=>Object.freeze({x,y,z,intensity:.3,color:0xffffff})))})
});
export function createBoardLighting(THREE,{scene,renderer,extent}){
 const size=Number.isFinite(extent)&&extent>0?extent:1;
 const ambient=new THREE.AmbientLight(0xffffff,0),lights=Array.from({length:6},()=>new THREE.DirectionalLight(0xffffff,0));
 scene.add(ambient,...lights);
 // Studio uses two cached shadow maps. Universal never adds shadow allocations.
 lights.slice(0,2).forEach(key=>{key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=key.shadow.camera.bottom=-size;key.shadow.camera.right=key.shadow.camera.top=size;key.shadow.camera.near=.1;key.shadow.camera.far=size*5;key.shadow.normalBias=.02;key.shadow.bias=-.0001;});
 let mode='studio',quality='balanced',disposed=false;
 function state(){const profile=lightingProfiles[mode];return{mode,ambient:profile.ambient,environment:profile.environment,shadows:profile.shadows&&quality!=='low',occlusion:profile.occlusion&&quality==='high',activeLights:profile.lights.length};}
 function set(value,nextQuality=quality){if(disposed)return state();mode=lightingName(value);quality=nextQuality;const profile=lightingProfiles[mode];ambient.intensity=profile.ambient;
  lights.forEach((key,index)=>{const light=profile.lights[index];key.visible=Boolean(light);if(light){key.color.setHex(light.color);key.intensity=light.intensity;key.position.set(size*light.x,size*light.y,size*light.z);}});
  scene.environmentIntensity=profile.environment;renderer.shadowMap.enabled=state().shadows;renderer.shadowMap.needsUpdate=true;return state();
 }
 function dispose(){if(disposed)return;disposed=true;scene.remove(ambient,...lights);for(const light of lights)light.shadow.dispose?.();}
 set(mode);return{set,state,dispose};
}
