const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('android-app/web/part-editor.js','utf8');
function setup(project){
 class Element{constructor(tag){this.tag=tag;this.children=[];}append(...children){this.children.push(...children);}setAttribute(){}addEventListener(){}showModal(){this.open=true;}close(){this.open=false;}remove(){}}
 const body=new Element('body'),calls=[];
 const context={KiCadAndroidProject:project,document:{body,createElement:tag=>new Element(tag)},TextEncoder,crypto:require('node:crypto').webcrypto,KiCadPartFields:{fields:()=>[{name:'Value',value:'10k'}],replace:()=>'(kicad_sch revised)'},AndroidKiCad:{exportCandidateProject:request=>calls.push(request)}};
 vm.createContext(context);vm.runInContext(source,context);
 return {context,api:context.KiCadAndroidPartEditor,body,calls};
}
const github=()=>({id:'repo',github:{repository:'wayri/project',sha:'a'.repeat(40)},files:[{path:'board.kicad_sch',content:'(kicad_sch original)'}]});
const part={path:'board.kicad_sch',uuid:'part-uuid',reference:'R1'};
function controls(dialog){const body=dialog.children[1];return {save:body.children.find(c=>c.textContent==='Save field draft'),export:body.children.find(c=>c.textContent==='Export revised project'),status:body.children.find(c=>c.tag==='p'&&c.textContent===undefined)};}
test('field editing fails closed for local, GitLab, offline and malformed provenance',()=>{
 const {api,body}=setup(null);
 for(const project of [null,{files:[]},{...github(),offline:true},{...github(),remote:{provider:'gitlab'}},{...github(),github:{repository:'../repo',sha:'a'.repeat(40)}},{...github(),github:{repository:'wayri/project',sha:'main'}}])assert.equal(api.canEdit(project),false);
 assert.equal(api.canEdit(github()),true);
 for(const project of [{files:[]},{...github(),offline:true},{...github(),remote:{provider:'gitlab'}}]){const local=setup(project);assert.throws(()=>local.api.open(part),/only.*GitHub/);assert.equal(local.body.children.length,0);}
 assert.equal(body.children.length,0);
});
test('save rechecks provider provenance even when the same project object changes',()=>{
 const project=github(),{api,calls}=setup(project),dialog=api.open(part),buttons=controls(dialog);
 project.remote={provider:'gitlab'};buttons.save.onclick();assert.match(buttons.status.textContent,/only.*GitHub/);assert.equal(calls.length,0);assert.equal(project.files[0].content,'(kicad_sch original)');
});
test('export rechecks provider provenance and never sends local edits to native',async()=>{
 const project=github(),{api,calls}=setup(project),buttons=controls(api.open(part));buttons.save.onclick();project.offline=true;
 await buttons.export.onclick();assert.match(buttons.status.textContent,/only.*GitHub/);assert.equal(calls.length,0);
});
test('GitHub edits export a separate source-bound copy and keep originals',async()=>{
 const project=github(),{api,calls}=setup(project),buttons=controls(api.open(part));buttons.save.onclick();await buttons.export.onclick();
 assert.equal(calls.length,1);assert.equal(calls[0].changes[0].path,'board.kicad_sch');assert.equal(calls[0].changes[0].content,'(kicad_sch revised)');assert.match(calls[0].changes[0].expectedSha,/^[a-f0-9]{64}$/);assert.equal(project.files[0].content,'(kicad_sch original)');
});
test('export rejects a provider change while hashing the original source',async()=>{
 const project=github(),{context,api,calls}=setup(project);let resolve;
 context.crypto={subtle:{digest:()=>new Promise(done=>{resolve=done;})}};
 const buttons=controls(api.open(part));buttons.save.onclick();const pending=buttons.export.onclick();project.remote={provider:'gitlab'};resolve(new Uint8Array(32).buffer);await pending;
 assert.match(buttons.status.textContent,/only.*GitHub/);assert.equal(calls.length,0);
});
