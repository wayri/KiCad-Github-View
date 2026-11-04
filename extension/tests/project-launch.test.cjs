const test=require('node:test'),assert=require('node:assert/strict');
global.KiCadGitHub=require('../parsing.js');const launch=require('../project-launch.js');

test('fabrication blob links open the dedicated saved-source viewer, including jobs and Excellon',()=>{
 for(const file of ['fabrication/board.gbrjob','fabrication/board.drl','fabrication/board.xln','fabrication/board.xnc','fabrication/board.exc','fabrication/board.nc','fabrication/top.gbr']){
  const sha='f'.repeat(40),info=launch.context('https://github.com/org/board/blob/'+sha+'/'+file,{repository:'org/board',file,head:sha});
  assert.equal(info.kind,'drawing');const url=new URL(launch.viewerURL(info,file,p=>'chrome-extension://test/'+p));
  assert.equal(url.pathname,'/gerber-viewer.html');assert.equal(url.searchParams.get('ref'),sha);assert.equal(url.searchParams.get('file'),file);
 }
});
test('repository launch preserves root, branch, nested namespace and explicit blob identity',()=>{
 assert.equal(launch.context('https://github.com/owner/repo').ref,'HEAD');
 assert.equal(launch.context('https://github.com/owner/repo/tree/release/design/folder',{ref:'release/design'}).ref,'release/design');
 assert.throws(()=>launch.context('https://github.com/owner/repo/tree/release/design/folder'),/ambiguous/);
 const info=launch.context('https://github.com/owner/repo/blob/release/design/sub/root.kicad_sch',{file:'sub/root.kicad_sch',ref:'release/design',head:'a'.repeat(40)});
 const url=new URL(launch.viewerURL(info,info.file,p=>'moz-extension://test/'+p));assert.equal(url.pathname,'/browser-viewer.html');assert.equal(url.searchParams.get('head'),'a'.repeat(40));assert.equal(url.searchParams.get('file'),'sub/root.kicad_sch');
 const gitlab=launch.context('https://gitlab.com/group/sub/repo');assert.equal(gitlab.repository,'group/sub/repo');assert.equal(gitlab.provider,'gitlab');
 assert.equal(launch.context('https://github.com/owner/repo/issues/42').ref,'HEAD');
});
test('launcher rejects credential-bearing locations and unsafe project paths',()=>{
 assert.equal(launch.context('https://user:secret@github.com/owner/repo'),null);assert.equal(launch.context('http://github.com/owner/repo'),null);
 for(const file of ['../board.kicad_pro','/board.kicad_pro','javascript:bad.kicad_pro','file.txt'])assert.throws(()=>launch.viewerURL({repository:'owner/repo',sha:'a'.repeat(40)},file,p=>p));
 const url=launch.viewerURL({repository:'owner/repo',sha:'a'.repeat(40)},'design/board.kicad_pro',p=>'chrome-extension://test/'+p);assert.equal(new URL(url).pathname,'/project-viewer.html');
});
