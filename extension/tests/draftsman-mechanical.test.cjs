const test=require('node:test'),assert=require('node:assert/strict');
const {create,primitives}=require('../draftsman-mechanical.js');
function fixture(fail=false){const calls=[],hosts=[],document={body:{append(host){hosts.push(host);}},createElement(){return{style:{},setAttribute(){},remove(){this.removed=true;}};}};
 const service=create({document,source:{repository:'owner/project',ref:'a'.repeat(40)},request:async(type,args)=>{calls.push({type,args});return type==='repo-model-index'?{paths:['body.step'],warnings:[]}: {base64:'AAAA'};},loadEngine:async()=>({mountBoard3D(host,source,options){calls.push({source,options});return{captureMechanicalView:async projection=>{if(fail)throw Error('GPU unavailable');return{image:'data:image/png;base64,iVBORw0KGgo=',bounds:{x:0,y:0,width:10,height:10},projection,warnings:[]};},dispose(){calls.push('disposed');}};}})});return{service,calls,hosts};}
test('mechanical source filtering drops every copper layer, pads, vias and zones while retaining mounting drills',()=>{
 const items=[{type:'line',layer:'F.Cu'},{type:'line',layer:'In1.Cu'},{type:'polygon',layer:'B.Cu'},
 {type:'pad',layer:'F.Fab'},{type:'via'},{type:'zone'},{type:'line',layer:'F.Mask'},
 {type:'line',layer:'Edge.Cuts'},{type:'text',layer:'F.Fab'},{type:'circle',layer:'F.Cu',hole:true,kind:'drill'},
 {type:'line',layer:'Dwgs.User'},{type:'line',layer:'F.Fab',hidden:true}];
 assert.deepEqual(primitives(items),items.slice(7,11));
});
test('mechanical capture uses the mechanical-only renderer, reuses assets and retains one GPU scene until workspace close',async()=>{
 const {service,calls,hosts}=fixture(),file={path:'board.kicad_pcb',content:'(kicad_pcb)'};
 const [first,second]=await Promise.all([service.capture(file,'top'),service.capture(file,'top')]);
 assert.equal(first,second);const mount=calls.find(x=>x.options);assert.equal(mount.options.mechanical,true);assert.equal(mount.options.dark,false);assert.equal(mount.options.lighting,'universal');assert.equal(mount.options.boardPath,file.path);
 assert.deepEqual(mount.options.assetPaths,['body.step']);assert.equal(calls.filter(x=>x==='disposed').length,0);assert.equal(hosts.length,1);assert.notEqual(hosts[0].removed,true);await service.capture(file,'front');assert.equal(hosts.length,1);assert.equal(calls.filter(x=>x.type==='repo-model-index').length,1);
 await mount.options.loadAsset('body.step');assert.equal(calls.at(-1).type,'repo-asset');assert.equal(calls.at(-1).args.ref,'a'.repeat(40));
 service.dispose();assert.equal(calls.filter(x=>x==='disposed').length,1);assert.equal(hosts[0].removed,true);service.dispose();assert.equal(calls.filter(x=>x==='disposed').length,1);await assert.rejects(service.capture(file),/closed/);
});
test('failed captures remove their host and leave no successful cache entry',async()=>{
 const {service,calls,hosts}=fixture(true),file={path:'board.kicad_pcb',content:'(kicad_pcb)'};
 await assert.rejects(service.capture(file),/GPU unavailable/);await assert.rejects(service.capture(file),/GPU unavailable/);
 assert.equal(hosts.length,2);assert.ok(hosts.every(host=>host.removed));assert.equal(calls.filter(x=>x==='disposed').length,2);service.dispose();
});


test('same path with changed saved content invalidates the cache and retires the old scene',async()=>{
 const {service,calls}=fixture(),file={path:'board.kicad_pcb',content:'(kicad_pcb (generator "first"))'};
 const first=await service.capture(file);file.content='(kicad_pcb (generator "second"))';const second=await service.capture(file);
 assert.notEqual(first,second);assert.deepEqual(calls.filter(x=>x.options).map(x=>x.source),['(kicad_pcb (generator "first"))','(kicad_pcb (generator "second"))']);assert.equal(calls.filter(x=>x==='disposed').length,1);service.dispose();
});

test('concurrent projections serialize camera captures and close rejects queued and late results',async()=>{
 const document={body:{append(){}},createElement:()=>({style:{},setAttribute(){},remove(){}})},releases=[],started=[];let mounts=0,disposals=0,firstStarted;const firstCapture=new Promise(resolve=>firstStarted=resolve);
 const service=create({document,source:{},loadEngine:async()=>({mountBoard3D(){mounts++;return{captureMechanicalView:view=>new Promise(resolve=>{started.push(view);firstStarted();releases.push(()=>resolve({image:'data:image/png;base64,iVBORw0KGgo=',bounds:{x:0,y:0,width:1,height:1}}));}),dispose(){disposals++;}};}})});
 const file={path:'board.kicad_pcb',content:'(kicad_pcb)'},first=service.capture(file,'top'),next=service.capture(file,'front');
 await firstCapture;assert.deepEqual(started,['top']);releases.shift()();await first;await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(started,['top','front']);assert.equal(mounts,1);
 const queued=service.capture(file,'back');service.dispose();releases.shift()();await assert.rejects(next,/closed/);await assert.rejects(queued,/closed/);assert.equal(disposals,1);assert.deepEqual(started,['top','front']);
});

test('closing during inventory loading never mounts a late GPU scene',async()=>{
 let finish,mounts=0;const document={body:{append(){}},createElement:()=>({style:{},setAttribute(){},remove(){}})};
 const service=create({document,source:{repository:'r',ref:'x'},request:()=>new Promise(resolve=>finish=resolve),loadEngine:async()=>({mountBoard3D(){mounts++;}})});
 const result=service.capture({path:'board.kicad_pcb',content:'source'});await new Promise(resolve=>setImmediate(resolve));service.dispose();finish({paths:[]});await assert.rejects(result,/closed/);assert.equal(mounts,0);
});

test('mechanical projection preserves component, model, pad, drill and outline source identity',()=>{
 const fs=require('node:fs'),{parse}=require('../design-diff.js'),{mechanicalSource}=require('../draftsman-mechanical.js');
 const source=fs.readFileSync(require.resolve('./fixtures/net3d/inspection.kicad_pcb'),'utf8'),projected=mechanicalSource(source),before=parse(source),after=parse(projected.source),drop=new Set(['segment','arc','via','zone']);
 assert.deepEqual(after,before.filter(node=>!Array.isArray(node)||!drop.has(node[0])));
 assert.deepEqual(projected.removed,{segment:7,arc:1,via:4,zone:2});
 const nested='(kicad_pcb (footprint "part" (uuid "owner") (at 12 13 90) (pad "A1" thru_hole circle (drill .8) (uuid "pin")) (model "body\\\"(segment).step" (offset (xyz 1 2 3)) (rotate (xyz 0 0 90))) (zone (name "nested retained"))) (segment (start 0 0) (end 1 1)))';
 const result=mechanicalSource(nested);assert.deepEqual(parse(result.source),parse(nested).filter(node=>!Array.isArray(node)||node[0]!=='segment'));
 assert.match(result.source,/nested retained/);assert.match(result.source,/body/);assert.match(result.source,/drill \.8/);
});

test('mechanical projection respects strings, escapes, comments and malformed discarded forms',()=>{
 const {mechanicalSource}=require('../draftsman-mechanical.js'),{parse}=require('../design-diff.js');
 const source='(kicad_pcb\n; (zone ignored in comment)\n( ; comment before tuple head\n segment (net "with \\\"quote\\\" and ) ( ;"))\n(gr_text "zone (via) \\\\" (layer "F.SilkS"))\n)';
 const result=mechanicalSource(source);assert.equal(result.removed.segment,1);assert.deepEqual(parse(result.source),parse(source).filter(node=>!Array.isArray(node)||node[0]!=='segment'));
 for(const invalid of ['(kicad_pcb (zone (filled_polygon (pts (xy 1 2))))','(kicad_pcb (segment "unterminated))','(kicad_pcb))','(kicad_pcb) (kicad_pcb)','(kicad_pcb)garbage','(kicad_pcb '+ '('.repeat(96)+')'.repeat(96)+')'])assert.throws(()=>mechanicalSource(invalid));
 const unicode='(kicad_pcb (property "ñ"))';assert.throws(()=>mechanicalSource(unicode,{maxBytes:unicode.length}),/byte budget/);
 assert.throws(()=>mechanicalSource('(kicad_pcb)',{maxBytes:5}),/bounded/);
});

test('capture reuses projected mechanical source for additional views and never submits copper to renderer',async()=>{
 const {service,calls}=fixture(),file={path:'board.kicad_pcb',content:'(kicad_pcb (footprint "A" (pad "1" thru_hole circle (drill .8))) (zone (filled_polygon (pts (xy 0 0) (xy 1 1)))) (via (at 1 1)))'};
 const first=await service.capture(file,'top');await service.capture(file,'bottom');
 const mount=calls.find(call=>call.options);assert.ok(!mount.source.includes('filled_polygon'));assert.ok(!mount.source.includes('(via'));assert.ok(mount.source.includes('(drill .8)'));assert.match(first.warnings.join(' '),/1 routing-via holes/);assert.equal(calls.filter(call=>call.options).length,1);service.dispose();
});
