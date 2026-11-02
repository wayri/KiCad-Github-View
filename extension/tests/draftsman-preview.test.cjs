const test=require('node:test'),assert=require('node:assert/strict');
const {createPreview}=require('../draftsman-workspace.js'),model=require('../draftsman-model.js');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7wAAAABJRU5ErkJggg==';
function fixture(){
 const document=model.create({provider:'local',repository:'local/project',ref:'saved'},'Assembly');document.pages[0].items.push({id:'view',type:'view',file:'board.kicad_pcb',side:'top',layers:[],x:20,y:20,width:100,height:80,rotation:90,scale:'fit',caption:'Top'});
 const asset={image:png,bounds:{x:10,y:20,width:30,height:40},warnings:[]},created=[],revoked=[],parsed=[];let compositions=0;
 const preview=createPreview({model:{svg(...args){compositions++;return model.svg(...args);}},decode:value=>Buffer.from(value,'base64').toString('binary'),urls:{createObjectURL(blob){created.push(blob);return 'blob:local/'+created.length;},revokeObjectURL:url=>revoked.push(url)},parse:text=>{const image={attributes:{},setAttribute(key,value){this.attributes[key]=value;}},group={getAttribute:()=> 'view',querySelector:()=>image},svg={text,image,style:{},setAttribute(){},querySelectorAll:()=>[group]};parsed.push(svg);return svg;}});
 return {document,asset,preview,created,revoked,parsed,compositions:()=>compositions};
}
test('live preview reuses decoded PNG blobs and skips all SVG composition for unchanged document zoom',()=>{
 const f=fixture(),assets={view:f.asset},first=f.preview.update(f.document,0,assets);assert.equal(first.image.attributes.href,'blob:local/1');assert.equal(f.created.length,1);assert.ok(!first.text.includes(png));assert.match(first.text,/transform="matrix\(/);
 assert.equal(f.preview.update(f.document,0,{...assets}),first);assert.equal(f.compositions(),1);
 const next=model.validate(f.document);next.pages[0].items[0].x=35;const moved=f.preview.update(next,0,assets);assert.equal(f.created.length,1);assert.equal(f.compositions(),2);assert.notEqual(moved,first);assert.equal(moved.image.attributes.href,'blob:local/1');
 const exported=model.svg(next,0,assets);assert.ok(exported.includes(png));assert.deepEqual(moved.text.match(/transform="[^"]+"/g),exported.match(/transform="[^"]+"/g));f.preview.dispose();assert.deepEqual(f.revoked,['blob:local/1']);
});
test('replacement assets release old URLs and invalid remote input never enters the inline SVG',()=>{
 const f=fixture();f.preview.update(f.document,0,{view:f.asset});const next={...f.asset};f.preview.update(f.document,0,{view:next});assert.equal(f.created.length,2);assert.deepEqual(f.revoked,['blob:local/1']);
 assert.throws(()=>f.preview.update(f.document,0,{view:{...next,image:'https://evil.example/a.png'}}),/PNG/);f.preview.dispose();assert.deepEqual(f.revoked,['blob:local/1','blob:local/2']);
});


test('Draftsman validates only changed sheet layouts and invalidates all on paper settings',()=>{
 const {createLayoutValidator}=require('../draftsman-workspace.js'),calls=[],check=createLayoutValidator({svg(doc,index){calls.push(index);return model.svg(doc,index,{});}}),doc=model.create({provider:'local',repository:'local/project',ref:'saved'},'Assembly');
 doc.pages.push({...doc.pages[0],id:'second',title:'Second',items:[]});check(doc,{});assert.deepEqual(calls,[0,1]);check(model.validate(doc),{});assert.deepEqual(calls,[0,1]);
 doc.pages[1].title='Changed';check(doc,{});assert.deepEqual(calls,[0,1,1]);doc.paper='A3';check(doc,{});assert.deepEqual(calls,[0,1,1,0,1]);
});

test('cached Draftsman checks still reject invalid dimension placements after edits',()=>{
 const {createLayoutValidator}=require('../draftsman-workspace.js'),check=createLayoutValidator(model),f=fixture(),assets={view:{bounds:f.asset.bounds}};
 check(f.document,assets);f.document.pages[0].items.push({id:'bad',type:'dimension',viewId:'view',kind:'aligned',a:{x:10,y:20},b:{x:30,y:40},offset:1000});assert.throws(()=>check(f.document,assets),/outside|page|measurement/i);f.preview.dispose();
});
