const test=require('node:test'),assert=require('node:assert/strict');
const {comparisonQuery,mount}=require('../revision-picker.js');
const sha=c=>c.repeat(40),request={repository:'owner/design',headRepository:'fork/design',file:'board.kicad_pcb',oldFile:'old board.kicad_pcb',head:'feature/board'};
test('comparison keeps fork/base identities, encoded paths and immutable revisions',()=>{
 const params=comparisonQuery(request,sha('a'),sha('b'));assert.equal(params.get('repository'),'owner/design');assert.equal(params.get('headRepository'),'fork/design');assert.equal(params.get('oldFile'),'old board.kicad_pcb');assert.equal(params.get('base'),sha('a'));assert.equal(params.get('head'),sha('b'));assert.equal(params.get('status'),'renamed');
 const single=comparisonQuery(request,null,sha('b'));assert.equal(single.get('repository'),'fork/design');assert.equal(single.get('oldFile'),'board.kicad_pcb');assert.equal(single.has('base'),false);
 for(const [r,b,h] of [[request,'main',sha('b')],[request,sha('a'),'moving-branch'],[{...request,file:'../bad.kicad_pcb'},sha('a'),sha('b')],[{...request,repository:'../owner'},sha('a'),sha('b')],[{...request,pullNumber:9},sha('a'),sha('b')]])assert.throws(()=>comparisonQuery(r,b,h));
});
function harness(send){
 const nodes=[];const doc={createElement(tag){const node={tag,ownerDocument:doc,children:[],listeners:{},value:'',textContent:'',append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},setAttribute(key,value){this[key]=value;},addEventListener(key,fn){this.listeners[key]=fn;},remove(){this.removed=true;},get firstChild(){return this.children[0];}};nodes.push(node);return node;}};
 const holder=doc.createElement('div'),navigated=[];const picker=mount({holder,request,send,navigate:p=>navigated.push(p)});return {nodes,holder,navigated,picker};
}
test('picker resolves each immutable source in its own repository before navigation',async()=>{
 const calls=[],h=harness(async message=>{calls.push(message);return {ok:true,result:{repository:message.repository,sha:message.repository==='owner/design'?sha('a'):sha('b')}};});
 h.nodes.find(n=>n['aria-label']==='base branch, tag or commit').value='stable';await h.picker.openComparison(true);
 assert.deepEqual(calls.map(c=>[c.repository,c.file,c.ref]),[['owner/design','old board.kicad_pcb','stable'],['fork/design','board.kicad_pcb','feature/board']]);assert.equal(h.navigated[0].get('base'),sha('a'));assert.equal(h.navigated[0].get('head'),sha('b'));
});
test('picker refuses response repository substitution and disposed late navigation',async()=>{
 const wrong=harness(async()=>({ok:true,result:{repository:'attacker/design',sha:sha('a')}}));await wrong.picker.openComparison(false);assert.equal(wrong.navigated.length,0);assert.ok(wrong.nodes.some(n=>n.textContent.includes('does not match')));
 let release;const late=harness(()=>new Promise(resolve=>{release=resolve;}));const work=late.picker.openComparison(false);late.picker.dispose();release({ok:true,result:{repository:'fork/design',sha:sha('b')}});await work;assert.equal(late.navigated.length,0);
});
test('bounded listings expose commit and branch options without trusting markup',async()=>{
 const h=harness(async m=>({ok:true,result:m.type==='revision-branches'?{repository:m.repository,branches:[{name:'<main>',sha:sha('a')}],warnings:['More branches omitted']}:{repository:m.repository,file:m.file,snapshotRef:sha('b'),commits:[{sha:sha('b'),message:'<script>alert(1)</script>',date:'2026-10-04'},{sha:sha('a'),message:'Previous'}],warnings:[]}}));
 await h.picker.populate();assert.ok(h.nodes.some(n=>n.tag==='option'&&n.textContent.includes('<script>')));assert.ok(h.nodes.some(n=>n.textContent.includes('More branches omitted')));assert.equal(h.nodes.find(n=>n['aria-label']==='base branch, tag or commit').value,sha('a'));
});
