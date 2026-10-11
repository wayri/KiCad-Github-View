const test=require('node:test'),assert=require('node:assert/strict'),photo=require('../photo-alignment.js');
const board=[{x:0,y:0},{x:100,y:0},{x:100,y:60},{x:0,y:60}],image=[{x:.1,y:.2},{x:.9,y:.1},{x:.8,y:.8},{x:.2,y:.9}];
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('projective calibration reproduces four anchors and round-trips interior points',()=>{
  const t=photo.fit(board,image);board.forEach((p,i)=>{const q=photo.project(t,p);near(q.x,image[i].x);near(q.y,image[i].y);});
  for(const p of [{x:20,y:10},{x:80,y:55},{x:50,y:30}]){const q=photo.inverse(t,photo.project(t,p));near(q.x,p.x);near(q.y,p.y);}
  const midpoint=photo.project(t,{x:50,y:0});assert.ok(Math.abs(midpoint.y-.15)>.001,'perspective fit is not an affine midpoint');
});
test('normalization preserves accuracy for large board offsets and mirrored back-side photos',()=>{
  const b=board.map(p=>({x:p.x+1000000,y:p.y-1000000})),im=image.map(p=>({x:1-p.x,y:p.y})),t=photo.fit(b,im);
  const q=photo.inverse(t,photo.project(t,{x:1000050,y:-999970}));near(q.x,1000050);near(q.y,-999970);
});
test('fit agrees with an independently specified perspective mapping throughout the plane',()=>{
  const known=p=>{const den=1+.002*p.x+.001*p.y;return{x:(.006*p.x+.001*p.y+.1)/den,y:(.001*p.x+.008*p.y+.1)/den};};
  const t=photo.fit(board,board.map(known));
  for(const p of [{x:0,y:0},{x:25,y:15},{x:50,y:30},{x:75,y:45},{x:100,y:60}]){const q=photo.project(t,p),expected=known(p);near(q.x,expected.x);near(q.y,expected.y);}
});
test('degenerate, crossed, concave, nonfinite, out-of-photo anchors are rejected',()=>{
  for(const b of [board.slice(0,3),[board[0],board[2],board[1],board[3]],[board[0],board[1],{x:50,y:10},board[3]],board.map(p=>({x:p.x,y:0})),[{x:NaN,y:0},...board.slice(1)]])assert.throws(()=>photo.fit(b,image));
  assert.throws(()=>photo.fit(board,[{x:-.1,y:.2},...image.slice(1)]),/normalized/);
});
test('picking uses physical display pixels, source scoped identities and explicit side',()=>{
  const t=photo.fit(board,image),objects=[{id:'a',path:'a.kicad_pcb',uuid:'same',kind:'footprint',position:{x:20,y:20},side:'front'},{id:'b',path:'b.kicad_pcb',uuid:'same',kind:'footprint',position:{x:80,y:20},side:'front'},{id:'c',kind:'footprint',position:{x:20,y:20},side:'back'}];
  const p=photo.project(t,objects[0].position),r=photo.pick(t,objects,p,{width:1200,height:800,radiusPixels:24,side:'front'});
  assert.equal(r.selected.id,'a');assert.equal(r.selected.path,'a.kicad_pcb');assert.equal(r.selected.uuid,'same');assert.equal(r.candidates.length,1);
  const offset={x:p.x+25/1200,y:p.y};assert.equal(photo.pick(t,objects,offset,{width:1200,height:800,radiusPixels:24,side:'front'}).selected,null);
  assert.equal(photo.pick(t,objects,p,{width:1200,height:800,side:'back'}).selected.id,'c');
});
test('overlapping candidates are reported as ambiguous rather than guessed',()=>{
  const t=photo.fit(board,image),objects=['a','b'].map(id=>({id,path:id+'.kicad_pcb',position:{x:20,y:20},side:'front'}));
  const r=photo.pick(t,objects,photo.project(t,objects[0].position),{width:1000,height:600,side:'front'});assert.equal(r.ambiguous,true);assert.equal(r.selected,null);assert.equal(r.candidates.length,2);
  assert.throws(()=>photo.pick(t,new Array(photo.LIMITS.objects+1),{x:.5,y:.5},{width:1000,height:600}),/Too many/);
});
test('calibration persistence refits anchors and rejects stale board, revision, side and image dimensions',()=>{
  const t=photo.fit(board,image),scope={sourceRevision:'sha1',sourcePath:'board.kicad_pcb',sourceFingerprint:'sha256:abc',imageFingerprint:'sha256:'+'a'.repeat(64),side:'front',width:1000,height:600},saved=photo.exportCalibration(t,scope),loaded=photo.importCalibration(saved,scope);
  near(photo.project(loaded,board[0]).x,image[0].x);
  for(const [key,value] of [['sourceRevision','sha2'],['sourcePath','other.kicad_pcb'],['sourceFingerprint','sha256:changed'],['imageFingerprint','sha256:'+'b'.repeat(64)],['side','back'],['width',999],['height',601]])assert.throws(()=>photo.importCalibration(saved,{...scope,[key]:value}),/does not match/);
  assert.throws(()=>photo.exportCalibration(t,{...scope,imageFingerprint:'wrong'}),/SHA-256/);
  const changed=JSON.parse(saved);changed.boardPoints[1]=changed.boardPoints[0];assert.throws(()=>photo.importCalibration(JSON.stringify(changed),scope),/Degenerate/);
  assert.throws(()=>photo.importCalibration('x'.repeat(photo.LIMITS.calibrationBytes+1),scope),/too large/);
});
