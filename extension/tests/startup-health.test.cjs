const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function runtime(){
 const nodes=new Map(),events={},loader={hidden:false,hidePopover(){this.closed=true;}};
 function make(tag){return{tagName:tag.toUpperCase(),style:{},children:[],attributes:{},setAttribute(name,value){this.attributes[name]=value;},contains(target){return this===target||this.children.some(child=>child.contains?.(target));},focus(){this.focused=true;},append(...children){this.children.push(...children);for(const c of children)if(c.id)nodes.set(c.id,c);},querySelector:selector=>nodes.get(selector.slice(1))};}
 const document={body:make('body'),createElement:make,querySelectorAll:()=>[loader]};let reloads=0;
 const context={document,URL,location:{href:'https://viewer.test/pcb-viewer.html?token=SECRET&repository=private/name',reload(){reloads++;}},chrome:{runtime:{getManifest:()=>({version:'0.12.61'})}},addEventListener:(name,handler)=>events[name]=handler};
 vm.createContext(context);vm.runInContext(fs.readFileSync('extension/startup-health.js','utf8'),context);
 return{context,events,document,nodes,loader,reloads:()=>reloads};
}
test('missing bundled scripts show actionable local diagnostics and release loading popover',()=>{
 const r=runtime();r.events.error({target:{tagName:'SCRIPT',src:'https://viewer.test/design-model.js?token=SECRET'}});
 const panel=r.document.body.children[0];assert.equal(panel.id,'viewerStartupError');assert.equal(panel.hidden,false);assert.equal(r.loader.hidden,true);assert.equal(r.loader.closed,true);
 assert.equal(r.nodes.get('viewerAccessWarning').textContent,'!');assert.equal(r.nodes.get('viewerAccessDetails').hidden,true);
 const text=r.context.KiCadStartupHealth.diagnostics();assert.match(text,/design-model.js/);assert.match(text,/0.12.61/);assert.doesNotMatch(text,/SECRET|private\/name|https:/);
 panel.children.at(-2).onclick();assert.equal(r.reloads(),1);panel.children.at(-1).onclick();assert.equal(panel.hidden,true);
});
test('runtime exceptions are identified without recording messages, stacks or source',()=>{
 const r=runtime();r.events.error({filename:'https://viewer.test/revision-viewer.js',lineno:22,error:{name:'ReferenceError',message:'SECRET',stack:'private source'}});
 assert.match(r.context.KiCadStartupHealth.diagnostics(),/revision-viewer.js:22 \(ReferenceError\)/);assert.doesNotMatch(r.context.KiCadStartupHealth.diagnostics(),/SECRET|private source/);
});
test('image errors and cancelled operations do not produce a script error',()=>{
 const r=runtime();r.events.error({target:{tagName:'IMG',src:'broken.png'}});r.events.unhandledrejection({reason:{name:'AbortError'}});assert.equal(r.document.body.children.length,0);
});
test('duplicate errors are coalesced and diagnostics are bounded',()=>{
 const r=runtime();for(let i=0;i<30;i++)r.events.error({filename:'https://viewer.test/'+i+'.js',error:{name:'TypeError'}});
 assert.equal(r.document.body.children.length,1);assert.equal(r.context.KiCadStartupHealth.diagnostics().split('\n').length,8);
});
test('access warnings show a red exclamation with sanitized policy guidance and can be dismissed and reopened',()=>{
 const r=runtime(),api=r.context.KiCadStartupHealth;
 api.showAccessIssue({kind:'organization-block',message:'SECRET private source'});
 const badge=r.nodes.get('viewerAccessWarning'),panel=r.nodes.get('viewerAccessDetails');
 assert.equal(badge.textContent,'!');assert.equal(badge.style.background,'#b91c1c');assert.equal(panel.hidden,false);
 assert.match(r.nodes.get('viewerAccessTitle').textContent,/browser policy/);assert.match(r.nodes.get('viewerAccessHelp').textContent,/administrator/);
 assert.doesNotMatch(r.nodes.get('viewerAccessHelp').textContent,/SECRET|private source/);
 panel.children.at(-1).onclick();assert.equal(panel.hidden,true);assert.equal(badge.hidden,false);assert.equal(badge.attributes['aria-expanded'],'false');
 badge.onclick();assert.equal(panel.hidden,false);
 r.events.pointerdown({target:r.document.body});assert.equal(panel.hidden,true);
 api.showAccessIssue({kind:'connection'});assert.match(r.nodes.get('viewerAccessHelp').textContent,/did not identify the cause/);
 api.clearAccessIssue();assert.equal(badge.hidden,true);assert.equal(panel.hidden,true);
});
