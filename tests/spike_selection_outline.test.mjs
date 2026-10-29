import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {selectionMatcher} from '../extension/spike/selectionState.mjs';
const require=createRequire(import.meta.url);
const location=['../extension/node_modules/three/build/three.cjs','../.vizdiff/build-deps/node_modules/three/build/three.cjs'].map(p=>new URL(p,import.meta.url)).find(existsSync);
const THREE=location?require(fileURLToPath(location)):null;
function setup(pickables){
 const source=readFileSync(new URL('../extension/spike/board3d.js',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('  const selectionLimit ='),source.indexOf('  function clearSelection()'));
 let redraws=0;
 const ui=Function('THREE','initialDark','scene','document','stage','selectionMatcher','board','pickables','invalidate','selectionAppearance','selectionDim','netInspection','fullNet3D','netInspectionHelp','hint','const mechanical=false;'+code+';return {setSelection,showHighlight,highlight,groupHighlight};')(THREE,true,new THREE.Scene(),{createElement:()=>({style:{}})},{append(){}},selectionMatcher,{nets:{},pads:[]},pickables,()=>redraws++,{update(){}},true,{update(){return {active:false,warnings:[]};}},true,{},{});
 ui.redraws=()=>redraws;return ui;
}
test('component cross-selection uses twelve clean edges for its body and pads together',{skip:!THREE},()=>{
 const body=new THREE.Mesh(new THREE.BoxGeometry(3,2,1));body.userData.record={ref:'U1',type:'Component'};
 const pad=new THREE.Mesh(new THREE.BoxGeometry(.5,.5,.1));pad.position.x=2;pad.userData.record={ref:'U1',type:'Pad'};
 const ui=setup([body,pad]);const result=ui.setSelection({references:['U1']});assert.equal(result.highlighted,1);
 assert.equal(ui.redraws(),1,'selection schedules an on-demand redraw');
 const g=ui.groupHighlight.geometry,p=g.getAttribute('position');assert.equal(g.drawRange.count,24);
 for(let i=0;i<24;i+=2){const delta=[p.getX(i)-p.getX(i+1),p.getY(i)-p.getY(i+1),p.getZ(i)-p.getZ(i+1)];assert.equal(delta.filter(x=>Math.abs(x)>1e-6).length,1,'edge must have no face diagonal');}
 assert.equal(ui.groupHighlight.material.depthTest,true);assert.equal(ui.groupHighlight.material.depthWrite,false);
 ui.setSelection({});assert.equal(g.drawRange.count,0);
});
test('single instance outline uses actual geometry bounds including world transforms',{skip:!THREE},()=>{
 const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(4,2,1),new THREE.MeshBasicMaterial(),1);
 mesh.setMatrixAt(0,new THREE.Matrix4().makeTranslation(8,0,0));mesh.position.y=3;
 const ui=setup([mesh]);ui.showHighlight(mesh,0);
 assert.equal(ui.redraws(),1,'native pick schedules an on-demand redraw');
 const box=new THREE.Box3().setFromBufferAttribute(ui.highlight.geometry.getAttribute('position')).applyMatrix4(ui.highlight.matrix);
 const size=box.getSize(new THREE.Vector3());assert.ok(Math.abs(size.x-4.07)<1e-5);assert.ok(Math.abs(size.y-2.07)<1e-5);
 const center=box.getCenter(new THREE.Vector3());assert.equal(center.x,8);assert.equal(center.y,3);
 assert.equal(ui.highlight.isLineSegments,true);
});
