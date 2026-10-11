const test=require('node:test'), assert=require('node:assert/strict');
const api=require('../bom-manager.js');
const part=(reference,extra={})=>({id:reference,kind:'symbol',path:'main.kicad_sch',reference,properties:{Value:'10k',Footprint:'0603'},...extra});
test('unfinished assembly queue skips non-work items, follows order, wraps and preserves file identities',()=>{
 const objects=[part('R1',{populated:false}),part('R2',{excludeFromBom:true}),part('R3'),part('R3',{path:'sub.kicad_sch'}),part('R10')];
 const metadata={[api.identity(objects[4])]:{Assembly:'verified'}},parts=api.model(objects,'symbol',metadata),pending=api.query(parts,{assembly:'unfinished'});
 assert.deepEqual(pending.map(p=>p.path),['main.kicad_sch','sub.kicad_sch']);
 assert.equal(api.nextAssembly(parts).id,pending[0].id);
 assert.equal(api.nextAssembly(parts,pending[0].id).id,pending[1].id);
 assert.equal(api.nextAssembly(parts,pending[1].id).id,pending[0].id);
 assert.equal(api.nextAssembly(parts,'foreign identity').id,pending[0].id);
 assert.equal(api.nextAssembly(api.query(parts,{search:'R10'})),null);
 assert.equal(api.nextAssembly([]),null);
 assert.equal(objects[2].properties.Assembly,undefined);
});
test('source kinds separate counts; multiunit symbols dedupe within a saved file',()=>{
 const objects=[part('U1'),part('U1',{id:'unit2'}),part('U1',{path:'sub.kicad_sch'}),part('U1',{kind:'footprint',uuid:'a'}),part('U1',{kind:'footprint',uuid:'b'})];
 assert.equal(api.model(objects).length,2);assert.equal(api.model(objects,'footprint').length,2);
 assert.notEqual(api.identity(objects[0]),api.identity(objects[2]));assert.notEqual(api.identity(objects[3]),api.identity(objects[4]));
});
test('query filters population, exclusion, procurement and search; natural reference ordering',()=>{
 const objects=[part('R10'),part('R2',{populated:false}),part('R1',{excludeFromBom:true})];
 const metadata={[api.identity(objects[0])]:{MPN:'ABC-42',status:'ordered'}};
 const parts=api.model(objects,'symbol',metadata);
 assert.deepEqual(api.query(parts).map(p=>p.reference),['R1','R2','R10']);
 assert.deepEqual(api.query(parts,{population:'fitted',excluded:'hide',search:'abc',status:'ordered'}).map(p=>p.reference),['R10']);
 assert.deepEqual(api.query(parts,{population:'dnp'}).map(p=>p.reference),['R2']);assert.equal(api.query(parts,{excluded:'only'}).length,1);
});
test('group quantities retain locate identities and split differing procurement or assembly states',()=>{
 const objects=[part('R1'),part('R2'),part('R3',{populated:false}),part('R4',{excludeFromBom:true}),part('R5')];
 const parts=api.model(objects,'symbol',{[api.identity(objects[4])]:{MPN:'different'}}), groups=api.group(parts);
 assert.equal(groups.length,4);assert.equal(groups[0].quantity,2);assert.deepEqual(groups[0].parts.map(p=>p.object),objects.slice(0,2));
});
test('CSV preserves quotes and neutralizes spreadsheet formulas including whitespace prefixes',()=>{
 const p=part('=CMD',{properties:{Value:'a,"b\nc',Footprint:' \t@cmd',MPN:'+unsafe',Notes:'-formula'}}),csv=api.csv(api.model([p]));
 assert.match(csv,/"'=CMD"/);assert.match(csv,/"' \t@cmd"/);assert.match(csv,/"'\+unsafe"/);assert.match(csv,/"'-formula"/);assert.match(csv,/"a,""b\nc"/);
});
test('metadata is revision scoped, bounded, allowlisted, and never mutates source properties',()=>{
 const object=part('R1'),id=api.identity(object),draft={version:1,scope:'revision-a',parts:{[id]:{MPN:'abc',Notes:'line1\nline2',status:'received'}}};
 const restored=api.validateMetadata(JSON.stringify(draft),'revision-a',new Set([id]));assert.equal(restored[id].MPN,'abc');assert.equal(api.model([object],'symbol',restored)[0].management.status,'received');assert.equal(object.properties.MPN,undefined);
 assert.throws(()=>api.validateMetadata(draft,'revision-b'),/same saved revision/);
 assert.throws(()=>api.validateMetadata(draft,'revision-a',new Set()),/unknown saved part/);
 for(const bad of [{Value:'source edit'},{status:'invented'},{Notes:'x'.repeat(4097)},{Notes:1},{Notes:'\u0000'}])assert.throws(()=>api.validateMetadata({...draft,parts:{[id]:bad}},'revision-a'),/Invalid/);
 assert.throws(()=>api.validateMetadata('x'.repeat(4*1024*1024+1),'revision-a'),/4 MiB/);
 assert.throws(()=>api.model(new Array(100001)),/limit/);assert.throws(()=>api.model([],'mixed'),/Choose/);
 assert.throws(()=>api.scopeKey(''),/scope/);
 assert.deepEqual(JSON.parse(api.metadataJSON('revision-a',restored)),draft);
});
test('modal management saves drafts, calls source editor separately, and reports storage failures',async()=>{
 class Element {
  constructor(tag){this.tag=tag;this.children=[];this.events={};this.dataset={};this.value='';this.textContent='';}
  append(...nodes){for(const node of nodes){if(node instanceof Element){node.remove();node.parent=this;node.parentElement=this;}this.children.push(node);}}
  prepend(node){this.children.unshift(node);node.parent=this;}
  addEventListener(name,handler){this.events[name]=handler;}
  setAttribute(){} focus(){} showModal(){this.open=true;}
  replaceChildren(){this.children=[];}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
  close(){this.events.close?.();}
 }
 const original=global.document;global.document={createElement:tag=>new Element(tag),body:new Element('body')};
 const find=(node,predicate)=>{if(node instanceof Element&&predicate(node))return node;for(const child of node.children||[]){const hit=find(child,predicate);if(hit)return hit;}};
 try {
  const object=part('R1',{properties:{Value:'<script>bad()</script>',Footprint:'0603'}}),saved=new Map();let sourceObject;const changes=[];
  const dialog=api.open({objects:[object],scope:'snapshot-1',storage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)},onEdit:o=>{sourceObject=o;},onMetadataChanged:parts=>changes.push(parts)});
  assert.equal(dialog.open,true);assert.ok(find(dialog,n=>n.textContent.includes('<script>')));
  find(dialog,n=>n.textContent==='Edit KiCad fields').events.click();await Promise.resolve();assert.equal(sourceObject,object);
  find(dialog,n=>n.textContent==='Manage').events.click();const form=find(dialog,n=>n.tag==='form');
  find(form,n=>n.tag==='label'&&n.textContent==='MPN').children[0].value='ABC-123';form.events.submit({preventDefault(){}});
  const restored=JSON.parse([...saved.values()][0]);assert.equal(restored.parts[api.identity(object)].MPN,'ABC-123');assert.equal(object.properties.MPN,undefined);assert.equal(changes.length,1);assert.equal(changes[0][api.identity(object)].MPN,'ABC-123');changes[0][api.identity(object)].MPN='external mutation';assert.equal(JSON.parse([...saved.values()][0]).parts[api.identity(object)].MPN,'ABC-123');
  find(dialog,n=>n.textContent==='Advance assembly').events.click();assert.equal(changes.length,2);assert.equal(changes[1][api.identity(object)].Assembly,'placed');
  dialog.close();assert.equal(global.document.body.children.length,0);
  const failed=api.open({objects:[object],scope:'snapshot-2',storage:{getItem(){return null;},setItem(){throw new Error('quota');}},onMetadataChanged:parts=>changes.push(parts)});
  find(failed,n=>n.textContent==='Manage').events.click();find(failed,n=>n.tag==='form').events.submit({preventDefault(){}});
  assert.ok(find(failed,n=>n.textContent.includes('Draft was not saved: quota')));assert.ok(find(failed,n=>n.tag==='form'));assert.equal(changes.length,2);failed.close();
 } finally {global.document=original;}
});
test('build quantities, costs and assembly progress exclude DNP and non-BoM parts and retain currencies',()=>{
 const objects=[part('R1'),part('R2'),part('R3',{populated:false}),part('R4',{excludeFromBom:true})];const metadata=Object.fromEntries(objects.map((o,i)=>[api.identity(o),{'Unit price':'1.25',Currency:i?'EUR':'USD',Assembly:i?'not started':'verified'}]));
 const parts=api.model(objects,'symbol',metadata),total=api.totals(parts,4);assert.deepEqual({...total.currencies},{USD:5,EUR:5});assert.equal(total.buildParts,8);assert.equal(total.verified,1);
 assert.equal(api.query(parts,{assembly:'verified'}).length,1);assert.throws(()=>api.totals(parts,0),/Build quantity/);assert.throws(()=>api.totals(parts,1.5),/whole/);
 const invalid={version:1,scope:'r',parts:{[parts[0].id]:{'Unit price':'NaN'}}};assert.throws(()=>api.validateMetadata(invalid,'r'),/unit price/);
 assert.equal(api.totals(api.model([part('R1')]),2).unpriced,1);
});
test('grouped exports include build quantities, all custom fields and assembled rows remain distinct',()=>{
 const objects=[part('R1',{properties:{Value:'10k',Footprint:'0603',Tolerance:'1%',Datasheet:'https://example.com'}}),part('R2',{properties:{Value:'10k',Footprint:'0603',Tolerance:'5%'}})],parts=api.model(objects);
 const csv=api.csv(parts,{grouped:true,boards:5});assert.match(csv,/Quantity per board/);assert.match(csv,/Build quantity/);assert.match(csv,/Tolerance/);assert.match(csv,/1%/);assert.match(csv,/5%/);assert.equal(api.group(parts).length,2);assert.match(csv,/"1","5"/);
});
test('manager locates unfinished parts without saving progress and keeps whole-source counts under filtering',()=>{
 class Element{
  constructor(tag){this.tag=tag;this.children=[];this.events={};this.dataset={};this.value='';this.textContent='';}
  append(...nodes){for(const n of nodes){if(n instanceof Element){n.remove();n.parent=this;n.parentElement=this;}this.children.push(n);}}
  prepend(n){this.children.unshift(n);n.parent=this;}addEventListener(name,fn){this.events[name]=fn;}
  setAttribute(){}focus(){}showModal(){}replaceChildren(){this.children=[];}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}close(){this.events.close?.();}
 }
 const original=global.document;global.document={createElement:t=>new Element(t),body:new Element('body')};
 const find=(n,p)=>{if(n instanceof Element&&p(n))return n;for(const c of n.children||[]){const found=find(c,p);if(found)return found;}};
 try{
  const objects=[part('R1'),part('R2'),part('R3',{populated:false}),part('R4',{excludeFromBom:true})],located=[];let writes=0;
  const saved=api.metadataJSON('scope',{[api.identity(objects[0])]:{Assembly:'verified'}});
  const dialog=api.open({objects,scope:'scope',storage:{getItem:()=>saved,setItem:()=>writes++},onLocate:o=>located.push(o)});
  const next=find(dialog,n=>n.textContent==='Next unfinished part');assert.equal(next.disabled,false);next.events.click();assert.equal(located[0],objects[1]);assert.equal(writes,0);
  const search=find(dialog,n=>n.tag==='input'&&n.type==='search');search.value='R2';search.events.input();
  const metric=find(dialog,n=>n.className==='bom-manager-metric'&&n.children[0].textContent==='Assembly verification');assert.equal(metric.children[1].textContent,'1 / 2');assert.match(metric.children[2].textContent,/0\/1 visible verified/);
  search.value='R3';search.events.input();assert.equal(next.disabled,true);assert.equal(find(dialog,n=>n.textContent==='Advance assembly').disabled,true);dialog.close();
  const resumed=api.open({objects:[part('R1'),part('R2')],scope:'scope',selectedId:'R1',storage:{getItem:()=>null,setItem:()=>writes++},onLocate:o=>located.push(o)});
  find(resumed,n=>n.textContent==='Next unfinished part').events.click();assert.equal(located.at(-1).reference,'R2');assert.equal(writes,0);resumed.close();
  const foreign=api.open({objects:[part('R1'),part('R2')],scope:'scope',selectedId:'missing',storage:{getItem:()=>null,setItem:()=>writes++},onLocate:o=>located.push(o)});
  find(foreign,n=>n.textContent==='Next unfinished part').events.click();assert.equal(located.at(-1).reference,'R1');foreign.close();
 }finally{global.document=original;}
});
