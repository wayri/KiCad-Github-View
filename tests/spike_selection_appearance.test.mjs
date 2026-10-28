import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createSelectionAppearance} from '../extension/spike/selectionAppearance.mjs';
import {selectionMatcher} from '../extension/spike/selectionState.mjs';
const require=createRequire(import.meta.url),location=['../extension/node_modules/three/build/three.cjs','../.vizdiff/build-deps/node_modules/three/build/three.cjs'].map(p=>new URL(p,import.meta.url)).find(existsSync),THREE=location?require(fileURLToPath(location)):null;

test('exact net selection keeps original selected instance color and greys neighbors, then restores material and colors',{skip:!THREE},()=>{
 const material=new THREE.MeshStandardMaterial({color:0xffffff}),mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material,2);
 mesh.userData.records=[{uuid:'a',ref:'U1',net:'GND'},{uuid:'b',ref:'U1',net:'VCC'}];mesh.setColorAt(0,new THREE.Color('#d5a027'));mesh.setColorAt(1,new THREE.Color('#ec6262'));
 const sourceColors=mesh.instanceColor,sourceBytes=[...sourceColors.array],geometry=mesh.geometry,matrix=mesh.instanceMatrix;
 const display=createSelectionAppearance(THREE,()=>[mesh]),color=new THREE.Color();
 display.update(selectionMatcher({netNames:['GND']}),true);mesh.getColorAt(0,color);assert.ok(Math.hypot(...color.toArray().map((v,i)=>v-new THREE.Color('#d5a027').toArray()[i]))<1e-6);mesh.getColorAt(1,color);assert.equal(color.r,color.g);assert.equal(color.g,color.b);assert.equal(mesh.geometry,geometry);assert.equal(mesh.instanceMatrix,matrix);
 display.update(selectionMatcher({uuids:['b']}),true);mesh.getColorAt(0,color);assert.equal(color.r,color.g);mesh.getColorAt(1,color);assert.ok(Math.hypot(...color.toArray().map((v,i)=>v-new THREE.Color('#ec6262').toArray()[i]))<1e-6);
 display.restore();assert.equal(mesh.material,material);assert.equal(mesh.instanceColor,sourceColors);assert.deepEqual([...sourceColors.array],sourceBytes);
});

test('selection appearance leaves selected textured materials intact and desaturates other shared materials reversibly',{skip:!THREE},()=>{
 const material=new THREE.MeshStandardMaterial({color:0xdf7434}),a=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material),b=a.clone();a.userData.record={uuid:'a'};b.userData.record={uuid:'b'};b.visible=false;
 const display=createSelectionAppearance(THREE,()=>[a,b]);display.update(selectionMatcher({uuids:['a']}),true);assert.equal(a.material,material);assert.notEqual(b.material,material);assert.equal(b.visible,false);
 const shader={fragmentShader:'void main(){vec3 outgoingLight;#include <opaque_fragment>}'};b.material.onBeforeCompile(shader);assert.match(shader.fragmentShader,/dot\(outgoingLight/);assert.equal(material.color.getHex(),0xdf7434);
 display.update(()=>false,false);assert.equal(b.material,material);assert.equal(b.visible,false);
});

test('explicit numeric-looking net names never resolve as different net codes',()=>{
 const match=selectionMatcher({netNames:['1']},{nets:{1:'VCC'},pads:[]});assert.equal(match({net:'1'}),true);assert.equal(match({net:'VCC'}),false);
});
