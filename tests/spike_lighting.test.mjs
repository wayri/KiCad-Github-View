import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createBoardLighting,lightingName,lightingProfiles} from '../extension/spike/lighting.mjs';
const require=createRequire(import.meta.url),location=['../extension/node_modules/three/build/three.cjs','../.vizdiff/build-deps/node_modules/three/build/three.cjs'].map(p=>new URL(p,import.meta.url)).find(existsSync),THREE=location?require(fileURLToPath(location)):null;

test('universal lighting equally illuminates opposing faces and does not leave oblique surfaces dark',()=>{
 const profile=lightingProfiles.universal;
 const exposure=n=>profile.ambient+profile.lights.reduce((sum,l)=>sum+l.intensity*Math.max(0,n[0]*l.x+n[1]*l.y+n[2]*l.z),0);
 const values=[[0,0,1],[0,0,-1],[1,0,0],[-1,0,0],[0,1,0],[0,-1,0]].map(exposure);
 assert.ok(values.every(v=>v===values[0]));
 for(const n of [[1,1,1],[-1,1,-1],[1,0,-1]]){const magnitude=Math.hypot(...n),v=exposure(n.map(x=>x/magnitude));assert.ok(v>=values[0]&&v/values[0]<1.2);}
 assert.ok(profile.lights.every(l=>l.color===0xffffff));assert.equal(profile.shadows,false);assert.equal(profile.occlusion,false);
 for(const input of [null,{},'__proto__','UNIVERSAL',''])assert.equal(lightingName(input),'studio');assert.equal(lightingName('universal'),'universal');
});

test('switching lighting reuses scene lights, restores studio shadows and leaves geometry/materials untouched',{skip:!THREE},()=>{
 const scene=new THREE.Scene(),renderer={shadowMap:{enabled:false}},mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({color:0x334455}));scene.add(mesh);const material=mesh.material,geometry=mesh.geometry;
 const rig=createBoardLighting(THREE,{scene,renderer,extent:10});const identities=[...scene.children];
 for(let i=0;i<20;i++){const state=rig.set('universal','high');assert.equal(state.activeLights,6);assert.equal(state.shadows,false);assert.equal(state.occlusion,false);assert.equal(renderer.shadowMap.enabled,false);assert.equal(scene.environmentIntensity,.65);assert.deepEqual(scene.children,identities);rig.set('studio','high');}
 assert.equal(renderer.shadowMap.enabled,true);assert.equal(rig.state().occlusion,true);rig.set('studio','low');assert.equal(renderer.shadowMap.enabled,false);rig.set('universal','low');assert.equal(rig.state().activeLights,6);
 assert.equal(mesh.material,material);assert.equal(mesh.geometry,geometry);assert.equal(material.color.getHex(),0x334455);
 rig.dispose();rig.dispose();assert.deepEqual(scene.children,[mesh]);rig.set('studio');assert.deepEqual(scene.children,[mesh]);geometry.dispose();material.dispose();
});
