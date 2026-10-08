const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
globalThis.KiCadAndroidGitHubCore=require('../../android-app/web/github.js');globalThis.KiCadAndroidGitLabCore=require('../../android-app/web/gitlab.js');
const links=require('../../android-app/web/external-links.js');
test('Chrome shared repository, file and encoded slash revision links retain provider and drawing',()=>{
 assert.deepEqual(links.parse('https://github.com/wayri/Marble'),{provider:'github',host:'https://github.com',repository:'wayri/Marble',ref:'',file:'',warning:''});
 const blob=links.parse('https://github.com/wayri/Marble/blob/main/design/Marble.kicad_pcb?raw=true#L20');assert.equal(blob.ref,'main');assert.equal(blob.file,'design/Marble.kicad_pcb');
 const custom=links.parse('kicadvizdiff://open?url='+encodeURIComponent('https://github.com/o/r/blob/feature%2Fpower/sub/board.kicad_sch'));assert.equal(custom.ref,'feature/power');assert.equal(custom.file,'sub/board.kicad_sch');
 const gl=links.parse('https://gitlab.example.org/group/sub/project/-/blob/v1/design/main.kicad_pro');assert.equal(gl.repository,'group/sub/project');assert.equal(gl.host,'https://gitlab.example.org');assert.equal(gl.file,'design/main.kicad_pro');
 assert.equal(links.parse('https://gitlab.com/group/sub/project/-/tree/main').ref,'main');
});
test('external links reject malformed, credential-bearing, traversal, unsupported actions and local destinations',()=>{
 for(const value of ['https://github.com','https://github.com/o/r/issues/1','https://user:token@github.com/o/r','http://github.com/o/r','javascript:alert(1)','https://localhost/g/r','https://127.0.0.1/g/r','https://github.com/o/r/blob/main/%2e%2e/a.kicad_sch','https://github.com/o/r/blob/main/x%2F..%2Fa.kicad_pcb','https://github.com/o/r/blob/main/a%5Cb.kicad_pcb','kicadvizdiff://gitlab-oauth?code=abc','kicadvizdiff://open?url=https://github.com/o/r&url=https://github.com/b/c','https://github.com/o/r\n','x'.repeat(8193)])assert.throws(()=>links.parse(value),value);
});
test('link delivery prefills provider dialog without importing, publishing, replacing drafts or sending credentials',()=>{
 const nodes=new Map(),calls=[];const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',click(){calls.push(id);},focus(){calls.push('focus:'+id);},dispatchEvent(e){calls.push(e.type);}});return nodes.get(id);};
 const draft={text:'keep this draft'},project={id:'existing'},context={URL,Event,KiCadAndroidGitHubCore:globalThis.KiCadAndroidGitHubCore,KiCadAndroidGitLabCore:globalThis.KiCadAndroidGitLabCore,document:{getElementById:node,querySelectorAll:()=>[]},KiCadAndroidProject:project,draft};
 vm.runInNewContext(fs.readFileSync('android-app/web/external-links.js','utf8'),context);context.KiCadAndroidLinks.receive('https://gitlab.com/a/b/-/blob/main/design/main.kicad_sch');
 assert.equal(node('gitlabRepository').value,'a/b');assert.equal(node('gitlabRef').value,'main');assert.equal(node('gitlabHost').value,'https://gitlab.com');assert.deepEqual(calls,['change','gitlabButton','focus:gitlabAdd']);assert.equal(context.KiCadAndroidProject,project);assert.equal(draft.text,'keep this draft');
 assert.equal(context.KiCadAndroidLinks.fileFor('gitlab','a/b','main'),'design/main.kicad_sch');assert.equal(context.KiCadAndroidLinks.fileFor('github','a/b','main'),'');assert.equal(context.KiCadAndroidLinks.fileFor('gitlab','a/b','other'),'');
 context.KiCadAndroidLinks.receive('javascript:alert(1)');assert.match(node('importStatus').textContent,/HTTPS/);assert.equal(calls.length,3);
});
