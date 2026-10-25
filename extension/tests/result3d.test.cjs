const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..');
const dependency = [path.join(root, 'extension/node_modules'), path.join(root, '.vizdiff/build-deps/node_modules')].find(p => fs.existsSync(path.join(p, 'three')));
let loaded;
async function renderer() {
  if (!loaded) {
    assert.ok(dependency, 'Three.js build dependencies are installed');
    const moduleURL = pathToFileURL(path.join(dependency, 'three/build/three.module.js')).href;
    const controlSource = fs.readFileSync(path.join(dependency, 'three/examples/jsm/controls/OrbitControls.js'), 'utf8').replace(/from 'three'/g, `from '${moduleURL}'`);
    const controlURL = 'data:text/javascript;base64,' + Buffer.from(controlSource).toString('base64');
    const source = fs.readFileSync(path.join(root, 'extension/spike/result3d.js'), 'utf8').replace('from "three"', `from "${moduleURL}"`).replace('from "three/addons/controls/OrbitControls.js"', `from "${controlURL}"`).replace('from "./renderQuality.mjs"', `from "${pathToFileURL(path.join(root, 'extension/spike/renderQuality.mjs')).href}"`);
    loaded = Promise.all([import('data:text/javascript;base64,' + Buffer.from(source).toString('base64')), import(moduleURL)]);
  }
  return loaded;
}
const surface = () => ({ points: [[0,0,0],[10,0,0],[0,10,0]], triangles: [[0,1,2]], values: [0,10,20], nodal: true, unit: '°C', zKnown: false });
test('GPU surface retains nodal field and barycentric probe in source coordinates', async () => {
  const [api, THREE] = await renderer();
  const overlay = api.createResultOverlay(surface(), ([x,y,z]) => [x-100, -y+20, z+2]);
  const probe = overlay.sample({ object: overlay.mesh, faceIndex: 0, point: new THREE.Vector3(-97.5, 17.5, 2) });
  assert.equal(overlay.mesh.geometry.getAttribute('position').count, 3);
  assert.deepEqual([probe.x, probe.y, probe.z, probe.value], [2.5,2.5,0,7.5]);
  assert.equal(probe.unit, '°C'); assert.match(probe.method, /barycentric/); overlay.dispose();
});
test('cell fields probe exact saved cell value rather than interpolating neighboring cells', async () => {
  const [api, THREE] = await renderer(); const input = surface(); input.nodal = false; input.values = [42];
  const overlay = api.createResultOverlay(input);
  assert.equal(overlay.sample({object: overlay.mesh, faceIndex: 0, point: new THREE.Vector3(1,1,0)}).value, 42); overlay.dispose();
});
test('null nodes and null cells remain unrendered holes', async () => {
  const [api] = await renderer();
  for (const input of [{...surface(), values: [0,null,20]}, {...surface(), nodal: false, values: [null]}]) {
    const overlay = api.createResultOverlay(input); assert.equal(overlay.mesh.geometry.getAttribute('position').count, 0); assert.equal(overlay.sample({object:overlay.mesh, faceIndex:0}), null); overlay.dispose();
  }
});
test('surface bounds reject nonfinite, invalid index/value lengths and oversized meshes', async () => {
  const [api] = await renderer();
  assert.throws(() => api.validateResultSurface({...surface(), points:[[NaN,0,0]]}), /coordinate|match/);
  assert.throws(() => api.validateResultSurface({...surface(), triangles:[[0,1,3]]}), /index/);
  assert.throws(() => api.validateResultSurface({...surface(), values:[0,Infinity,20]}), /value/);
  assert.throws(() => api.validateResultSurface({...surface(), values:[0]}), /match/);
  assert.throws(() => api.validateResultSurface({...surface(), triangles:new Array(200001)}), /limit/);
});
test('opacity clamps and probe geometry uses explicit coordinate mapping', async () => {
  const [api] = await renderer(); const overlay = api.createResultOverlay(surface(), ([x,y,z]) => [x,-y,z]);
  overlay.setOpacity(0); assert.equal(overlay.mesh.visible,false); overlay.setOpacity(2); assert.equal(overlay.mesh.material.opacity,1);
  overlay.setProbes([{x:2,y:3,z:0}]); const marker = overlay.group.children[1].children[0]; assert.deepEqual(marker.position.toArray(),[2,-3,0]);
  overlay.setProbes([]); assert.equal(overlay.group.children[1].children.length,0); overlay.dispose(); assert.equal(overlay.group.children.length,0);
});
