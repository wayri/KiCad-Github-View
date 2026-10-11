const test=require('node:test'),assert=require('node:assert/strict');
const api=require('../../android-app/web/repository-tree.js'),local=require('../../android-app/web/local-project.js');
test('repository tree retains unsupported source files and distinguishes imported models',()=>{
 const p=local.validate({id:'tree',files:[{path:'board.kicad_pcb',content:'(kicad_pcb)'}],assets:[{path:'models/part.step',base64:'YQ=='}],repositoryTree:{entries:[{path:'README.md',type:'blob'},{path:'models/part.step',type:'blob'},{path:'models',type:'tree'}],truncated:false}});
 const entries=api.inventory(p);assert.equal(entries.find(e=>e.path==='README.md').loaded,false);assert.equal(entries.find(e=>e.path==='models/part.step').loaded,true);
 assert.equal(api.children(entries)[0].path,'models');assert.deepEqual(api.children(entries,'','PART').map(e=>e.path),['models']);assert.equal(api.children(entries,'models','PART')[0].path,'models/part.step');
});
test('tree validation refuses traversal, duplicates and unsupported node types',()=>{
 const p={files:[{path:'board.kicad_pcb',content:'x'}]};for(const entries of [[{path:'../secret',type:'blob'}],[{path:'x',type:'bad'}],[{path:'x',type:'blob'},{path:'x',type:'blob'}]])assert.throws(()=>local.validate({...p,repositoryTree:{entries}}));
});
test('source links pin commits and encode paths and self-hosted namespaces',()=>{
 const sha='a'.repeat(40);assert.equal(api.sourceURL({github:{repository:'owner/repo',sha}},'models/a b.step'),'https://github.com/owner/repo/blob/'+sha+'/models/a%20b.step');assert.equal(api.sourceURL({remote:{host:'https://git.example',repository:'team/sub/repo',sha}},'a.step'),'https://git.example/team/sub/repo/-/blob/'+sha+'/a.step');assert.equal(api.sourceURL({},'a.step'),null);
});
