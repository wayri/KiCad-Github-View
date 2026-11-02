const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url');
const project=path.resolve(__dirname,'../..'),roots=[project],git=path.join(project,'.git');
if(fs.existsSync(git)&&fs.statSync(git).isFile()){const value=/^gitdir:\s*(.+)/.exec(fs.readFileSync(git,'utf8'))?.[1];if(value)roots.push(path.resolve(project,value,'../../..'));}
const threePath=roots.flatMap(root=>[path.join(root,'extension/node_modules/three/build/three.module.js'),path.join(root,'.vizdiff/build-deps/node_modules/three/build/three.module.js')]).find(fs.existsSync);
const helper=()=>import('../spike/vrmlSource.mjs'),header='#VRML V2.0 utf8\n',box=(size=2)=>`Shape { geometry Box { size ${size} ${size} ${size} } }`;
async function runtime(){const THREE=await import(pathToFileURL(threePath).href),{VRMLLoader}=await import(pathToFileURL(path.resolve(threePath,'../../examples/jsm/loaders/VRMLLoader.js')).href),h=await helper();return {...THREE,...h,parse(source){const p=h.prepareVRMLSource(source);return h.restoreVRMLNames(new VRMLLoader().parse(p.source),p.identifiers);}};}
function geometrySummary(scene){let meshes=0,lines=0,triangles=0;scene.traverse(o=>{if(o.isLine)lines++;if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}});return {meshes,lines,triangles};}

test('static Switch selects exactly the saved branch, including hidden DEF and repeated USE identity',{skip:!threePath},async()=>{
 const h=await runtime(),source=header+`Group { children [ Switch { whichChoice 1 choice [ Group { children [ DEF _+0 ${box(50)} DEF _+1 ${box(2)} ] } USE _+1 USE _+0 ] } Transform { translation 10 0 0 children USE _+1 } ] }`,scene=h.parse(source),meshes=[];
 scene.traverse(o=>{if(o.isMesh)meshes.push(o);});assert.equal(meshes.length,2);assert.equal(meshes[0].name,'_+1');assert.equal(meshes[1].name,'_+1');assert.equal(meshes[0].geometry,meshes[1].geometry);assert.equal(meshes[0].material,meshes[1].material);
 const bounds=new h.Box3().setFromObject(scene);assert.deepEqual(bounds.min.toArray(),[-1,-1,-1]);assert.deepEqual(bounds.max.toArray(),[11,1,1]);assert.ok(!scene.getObjectByName('_+0'));
});

test('Switch default, negative, out-of-range and NULL choices hide geometry; single node choice works',{skip:!threePath},async()=>{
 const h=await runtime();for(const field of ['', 'whichChoice -1','whichChoice -2','whichChoice 1'])assert.equal(geometrySummary(h.parse(header+`Switch { ${field} choice ${box()} }`)).meshes,0);
 assert.equal(geometrySummary(h.parse(header+`Switch { whichChoice 0 choice [NULL] }`)).meshes,0);assert.equal(geometrySummary(h.parse(header+`Switch { whichChoice 0 choice ${box()} }`)).meshes,1);
});

test('DEF aliases avoid collisions and comments/quoted text remain byte-for-byte opaque',async()=>{
 const {prepareVRMLSource}=await helper(),comment='# DEF _+0 USE _+0 Script url "\\"',quoted='"DEF _+0 USE _+0 Script url \\" untouched"',source=header+comment+'\nWorldInfo { title '+quoted+' }\nDEF KiViewStaticDef0 Group {}\nDEF _+0 Group {}\nUSE _+0',p=prepareVRMLSource(source);
 assert.ok(p.source.includes(comment));assert.ok(p.source.includes(quoted));assert.equal(p.identifiers.get('KiViewStaticDef1'),'KiViewStaticDef0');assert.equal(p.identifiers.get('KiViewStaticDef2'),'_+0');assert.ok(p.source.endsWith('USE KiViewStaticDef2'));assert.ok(source.endsWith('USE _+0'));
});

test('scripts, external resources, dynamic semantics and unsupported nodes/choice fields reject explicitly',async()=>{
 const {prepareVRMLSource}=await helper();for(const body of ['Inline { url ["evil.wrl"] }','Shape { appearance Appearance { texture ImageTexture { url "a" } } }','Script {}','ROUTE a.x TO b.x','PROTO Foo [] {}','EXTERNPROTO Foo [] "x"','DEF a Group {} IMPORT a.b AS c','Switch { whichChoice IS live choice [] }','Switch { whichChoice 0 choice [] live TRUE }','LOD {}','TimeSensor {}'])assert.throws(()=>prepareVRMLSource(header+body),/not supported|Unsupported/);
 for(const body of ['Switch { whichChoice 0 whichChoice 1 choice [] }','Switch { whichChoice 1.5 choice [] }'])assert.throws(()=>prepareVRMLSource(header+body),/Duplicate|static integer/);
});

test('unsupported nondefault transform centers and scale orientations fail with an actionable diagnostic',{skip:!threePath},async()=>{
 const h=await runtime();for(const field of ['center 1 0 0','scaleOrientation 0 0 1 1.57'])assert.throws(()=>h.prepareVRMLSource(header+`Transform { ${field} children ${box()} }`),/Transform\.(center|scaleOrientation).*Bake the transform/);
 const source=header+`Transform { center 0 -0 0 scaleOrientation 0 0 1 0 translation 4 0 0 children ${box()} }`,scene=h.parse(source),bounds=new h.Box3().setFromObject(scene);assert.deepEqual(bounds.min.toArray(),[3,-1,-1]);assert.deepEqual(bounds.max.toArray(),[5,1,1]);
 // Nested transforms are checked in their own scope; words inside quoted text stay opaque.
 assert.throws(()=>h.prepareVRMLSource(header+'Transform { children Transform { center 0 1 0 } }'),/Transform.center/);assert.doesNotThrow(()=>h.prepareVRMLSource(header+'WorldInfo { title "Transform center 1 2 3" }'));
});

test('undefined/duplicate DEF identities and direct/indirect cycles reject before Three parsing',async()=>{
 const {prepareVRMLSource}=await helper();for(const body of ['USE missing','DEF a Group {} DEF a Group {}','DEF a Group { children USE a }','DEF a Group { children USE b } DEF b Group { children USE a }'])assert.throws(()=>prepareVRMLSource(header+body),/Undefined|Duplicate|Cyclic/);
});

test('input, tokens, nodes, nesting, references, output and expanded graph are bounded',async()=>{
 const {prepareVRMLSource}=await helper(),simple=header+box();
 for(const limits of [{bytes:10},{tokens:3},{nodes:1},{depth:1},{outputBytes:20},{expandedNodes:1},{expandedTokens:2}])assert.throws(()=>prepareVRMLSource(simple,limits),/limit|budget/);
 assert.throws(()=>prepareVRMLSource(header+'DEF a Group {} DEF b Group {} Group { children [ USE a USE b ] }',{dependencies:1}),/dependency limit/);
 assert.throws(()=>prepareVRMLSource(simple,{bytes:Infinity}),/Invalid/);assert.throws(()=>prepareVRMLSource('#VRML V1.0 ascii\nGroup {}'),/V2.0/);
 let exponential='DEF leaf '+box();for(let i=0;i<19;i++)exponential+=`\nDEF n${i} Group { children [ USE ${i?'n'+(i-1):'leaf'} USE ${i?'n'+(i-1):'leaf'} ] }`;
 assert.throws(()=>prepareVRMLSource(header+exponential),/Expanded VRML DEF\/USE graph/);
 // Cached DAG costs must still account for depth when a previously computed node is reused.
 let chain='DEF a0 Group {}';for(let i=1;i<15;i++)chain+=`\nDEF a${i} Group { children USE a${i-1} }`;assert.throws(()=>prepareVRMLSource(header+chain,{depth:12}),/depth/);
 for(const body of ['Group {','Group { children [ Group {} }','Group { title "unterminated }','Shape { geometry Box { size 1e999 1 1 } }'])assert.throws(()=>prepareVRMLSource(header+body),/Incomplete|Unbalanced|Unterminated|nonfinite/);
});

const retained=path.join(project,'.vizdiff/real-github-qa/olimex/models/4.wrl');
test('retained public Olimex LED selects solid faces with finite source bounds and immutable bytes',{skip:!threePath||!fs.existsSync(retained)},async()=>{
 // Olimex/ESP32-POE, HARDWARE/ESP32-PoE-hardware-revision-M2/packages3D/LED_0603_Y.wrl.
 // SHA-256 binds this offline acceptance check to the exact retained public asset, never a substitute.
 const bytes=fs.readFileSync(retained),hash=b=>crypto.createHash('sha256').update(b).digest('hex');assert.equal(hash(bytes),'22c96be0787c565868a6cabc1883111cd4594f337d84b9e247c66815673240f8');
 const h=await runtime(),p=h.prepareVRMLSource(bytes.toString('utf8')),scene=h.parse(bytes.toString('utf8'));assert.equal(p.staticSwitches,4);assert.deepEqual(geometrySummary(scene),{meshes:1,lines:0,triangles:1082});assert.ok(scene.getObjectByName('_+1'));assert.ok(!scene.getObjectByName('_+0'));
 const bounds=new h.Box3().setFromObject(scene),expected=[-.318897,-.157480,0,.318897,.157480,.236220],actual=[...bounds.min.toArray(),...bounds.max.toArray()];actual.forEach((v,i)=>{assert.ok(Number.isFinite(v));assert.ok(Math.abs(v-expected[i])<1e-6);});assert.equal(hash(fs.readFileSync(retained)),hash(bytes));
});
