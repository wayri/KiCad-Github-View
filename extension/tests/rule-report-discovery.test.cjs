const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const rules=require('../rule-reports.js');
const uuid='11111111-2222-3333-4444-555555555555';
const report=(source='design/board.kicad_pcb')=>JSON.stringify({$schema:'https://schemas.kicad.org/drc.v1.json',source,date:'2026-11-01T00:00:00Z',kicad_version:'10.0',coordinate_units:'mm',violations:[{type:'clearance',severity:'error',description:'Full finding <script>literal</script> text',items:[{uuid,description:'Pad affected',pos:{x:10,y:20}}]}]});
function harness(request){
 const elements=new Map();
 class Node{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.style={};this.attributes={};this.value='';this.checked=false;this._text='';}
  set id(value){this._id=value;elements.set(value,this);}get id(){return this._id;}
  append(...nodes){for(const node of nodes){node.remove();node.parentElement=this;this.children.push(node);}}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(n=>n!==this);this.parentElement=null;}
  replaceChildren(...nodes){for(const node of this.children)node.parentElement=null;this.children=[];this._text='';this.append(...nodes);}
  set textContent(value){this.replaceChildren();this._text=String(value);}get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}
  setAttribute(key,value){this.attributes[key]=String(value);}querySelector(){return null;}
  getBoundingClientRect(){return {left:0,top:0,width:800,height:600};}
 }
 const body=new Node(),get=id=>{if(!elements.has(id)){const node=new Node();node.id=id;body.append(node);}return elements.get(id);};
 get('ruleSeverity').value='all';get('showRuleMarkers').checked=true;
 const options={repository:'owner/repo',ref:'main',rootFile:'design/board.kicad_pcb',getFiles:()=>[{path:'design/board.kicad_pcb'}],getObjects:()=>[],getNets:()=>[],currentFile:()=> 'design/board.kicad_pcb',is3D:()=>false,request,redraw(){},locateRule:()=>true,showRules(){},onRuleReportLoaded(){}};
 const context={document:{getElementById:get,createElement:tag=>new Node(tag)},KiCadRuleReports:rules,TextEncoder};
 vm.runInNewContext(fs.readFileSync(require.resolve('../review-navigation.js'),'utf8'),context);
 return {api:context.KiCadReviewNavigation.mount(options),get,options,Node};
}
test('candidate ranking is bounded, excludes unrelated JSON and traversal, and prioritizes report names',()=>{
 const entries=['package.json','../board-drc.json','C:/board-drc.json','reports/data.json','board-erc.json','board-drc.json',...Array.from({length:30},(_,i)=>`checks/${i}.json`)];
 const selected=rules.reportCandidates(entries,{kind:'drc'});assert.equal(selected[0],'board-drc.json');assert.equal(selected.length,12);assert.ok(!selected.includes('package.json'));assert.ok(!selected.includes('board-erc.json'));assert.ok(selected.every(path=>!path.includes('..')&&!path.includes(':')));
});
test('source association uses exact paths or unique source suffixes without guessing explicit unrelated directories',()=>{
 const parsed=source=>rules.parse(report(source));
 assert.equal(rules.associateSource(parsed('board.kicad_pcb'),['design/board.kicad_pcb']),'design/board.kicad_pcb');
 assert.equal(rules.associateSource(parsed('C:\\work\\design\\board.kicad_pcb'),['design/board.kicad_pcb']),'design/board.kicad_pcb');
 for(const source of ['other/board.kicad_pcb','../board.kicad_pcb'])assert.equal(rules.associateSource(parsed(source),['design/board.kicad_pcb']),null);
 assert.equal(rules.associateSource(parsed('board.kicad_pcb'),['a/board.kicad_pcb','b/board.kicad_pcb']),null);assert.equal(rules.associateSource(parsed('board.kicad_pcb'),['board.kicad_pcb','b/board.kicad_pcb']),null);assert.equal(rules.associateSource(parsed('board.kicad_pcb'),['design/board.kicad_pcb'],{complete:false}),null);assert.equal(rules.associateSource(parsed('design/board.kicad_pcb'),['design/board.kicad_pcb'],{complete:false}),'design/board.kicad_pcb');
});
test('discovery validates content and source identity, pins reads to inventory revision and runs once',async()=>{
 const calls=[];const h=harness(async(type,payload)=>{calls.push({type,payload});if(type==='project-inventory')return {snapshotRef:'a'.repeat(40),files:[{path:'design/board.kicad_pcb'},{path:'reports/board-drc.json'},{path:'reports/other.json'},{path:'reports/unrelated.json'}]};return {path:payload.reportPath,content:payload.reportPath.endsWith('board-drc.json')?report():payload.reportPath.endsWith('other.json')?report('unrelated.kicad_pcb'):'{"ordinary":"json"}'};});
 const result=await h.api.discoverReports();assert.equal(result.loaded,1);assert.equal(result.checked,3);assert.equal(result.warnings.length,2);assert.match(h.get('ruleResults').textContent,/Full finding <script>literal<\/script> text/);assert.equal(h.api.routingReports('design/board.kicad_pcb').length,1);
 assert.ok(calls.filter(c=>c.type==='rule-report').every(c=>c.payload.ref==='a'.repeat(40)));const before=calls.length;assert.equal((await h.api.discoverReports()).cached,true);h.api.renderRules();assert.equal(calls.length,before);
});
test('error and warning toggles remove matching markers; selecting a marker reveals the complete literal finding',async()=>{
 const data=JSON.parse(report());data.violations.push({...data.violations[0],severity:'warning',description:'Warning finding'});
 const h=harness(async(type,payload)=>type==='project-inventory'?{files:[{path:'design/board.kicad_pcb'},{path:'board-drc.json'}]}:{path:payload.reportPath,content:JSON.stringify(data)});await h.api.discoverReports();
 const overlay=new h.Node(),pins=new h.Node(),draw=()=>{pins.replaceChildren();overlay.replaceChildren();h.api.draw(overlay,pins,p=>p,(tag,attrs)=>Object.assign(new h.Node(tag),{attributes:attrs}));};draw();assert.equal(pins.children.length,2);
 pins.children[0].onclick();draw();assert.ok(pins.children.some(n=>n.className==='rule-location-note'&&n.textContent.includes('Full finding <script>literal</script> text')));assert.ok(overlay.children.length>0);
 h.get('showRuleErrors').checked=false;h.get('showRuleErrors').onchange();draw();assert.equal(pins.children.length,1);assert.equal(pins.children[0].attributes['data-severity'],'warning');h.get('showRuleWarnings').checked=false;h.get('showRuleWarnings').onchange();draw();assert.equal(pins.children.length,0);
});
test('ambiguous report item UUIDs cannot navigate using guessed coordinates',async()=>{
 const h=harness(async(type,payload)=>type==='project-inventory'?{files:[{path:'design/board.kicad_pcb'},{path:'board-drc.json'}]}:{path:payload.reportPath,content:report()});h.options.getObjects=()=>[{uuid,id:'a',path:'design/board.kicad_pcb'},{uuid,id:'b',path:'other/board.kicad_pcb'}];let located=0;h.options.locateRule=()=>{located++;return true;};await h.api.discoverReports();h.get('nextRule').onclick();assert.equal(located,0);assert.match(h.get('ruleStatus').textContent,/no resolved drawing location/);
});

test('automatic discovery bounds network reads and report count and rejects transport path substitution',async()=>{
 let reads=0;const h=harness(async(type,payload)=>{if(type==='project-inventory')return {files:[{path:'design/board.kicad_pcb'},...Array.from({length:30},(_,i)=>({path:`reports/${i}-drc.json`}))]};reads++;return {path:reads===1?'other.json':payload.reportPath,content:report()};});
 const result=await h.api.discoverReports();assert.equal(result.loaded,4);assert.equal(reads,5);assert.match(result.warnings[0],/another source path/);assert.equal(h.api.routingReports('design/board.kicad_pcb').length,4);
});
test('clear reports prevents a late automatic read from reinstating finding markers',async()=>{
 let finish;const h=harness(async(type,payload)=>type==='project-inventory'?{files:[{path:'design/board.kicad_pcb'},{path:'board-drc.json'}]}:new Promise(resolve=>{finish=()=>resolve({path:payload.reportPath,content:report()});}));
 const pending=h.api.discoverReports();await new Promise(setImmediate);h.get('clearRuleReports').onclick();finish();const result=await pending;assert.equal(result.cancelled,true);assert.equal(h.api.routingReports('design/board.kicad_pcb').length,0);assert.equal(h.get('ruleStatus').textContent,'Reports cleared.');
});

test('native KiCad10 report exports parse and retain exact source association',()=>{
 const fs=require('node:fs'),path=require('node:path'),R=require('../rule-reports.js'),folder=path.join(__dirname,'fixtures/rule-reports');
 const drc=R.parse(fs.readFileSync(path.join(folder,'inspection-drc.json'),'utf8'),{kind:'drc'});assert.equal(drc.findings.length,5);assert.equal(R.associateSource(drc,[{path:'hw/inspection.kicad_pcb'}]),'hw/inspection.kicad_pcb');assert.ok(drc.findings.some(f=>f.description==='Track has unconnected end'));
 const erc=R.parse(fs.readFileSync(path.join(folder,'custom_fields-erc.json'),'utf8'),{kind:'erc'});assert.equal(erc.findings.length,0);assert.equal(R.associateSource(erc,[{path:'custom_fields.kicad_sch'}]),'custom_fields.kicad_sch');
});

test('uppercase JSON report discovery preserves the exact transport path',()=>{
 assert.deepEqual(rules.reportCandidates(['checks/BOARD-DRC.JSON','checks/board-ERC.Json'],{kind:'drc'}),['checks/BOARD-DRC.JSON']);
});

test('manual import uses the canonical five MiB limit and cancels late reads after clear',async()=>{
 const h=harness();h.get('ruleDrawing').value='design/board.kicad_pcb';
 h.get('ruleReportFile').files=[{name:'board-drc.json',size:4*1024*1024+1,text:async()=>report()}];await h.get('ruleReportFile').onchange();assert.equal(h.api.routingReports('design/board.kicad_pcb').length,1);
 h.get('clearRuleReports').onclick();let read=false;h.get('ruleReportFile').files=[{name:'too-big.json',size:rules.MAX_BYTES+1,text:async()=>{read=true;return report();}}];await h.get('ruleReportFile').onchange();assert.equal(read,false);assert.match(h.get('ruleStatus').textContent,/5 MiB/);
 let finish;h.get('ruleReportFile').files=[{name:'board-drc.json',size:100,text:()=>new Promise(resolve=>{finish=()=>resolve(report());})}];const pending=h.get('ruleReportFile').onchange();h.get('clearRuleReports').onclick();finish();await pending;assert.equal(h.api.routingReports('design/board.kicad_pcb').length,0);assert.equal(h.get('ruleStatus').textContent,'Reports cleared.');
});

test('manual repository report rejects transport substitution and ignores late failed loads',async()=>{
 const h=harness(async()=>({path:'other-drc.json',content:report()}));h.get('repoReportPath').value='board-drc.json';await h.get('loadRepoReport').onclick();assert.match(h.get('ruleStatus').textContent,/another source path/);assert.equal(h.api.routingReports('design/board.kicad_pcb').length,0);
 let fail;h.options.request=()=>new Promise((resolve,reject)=>{fail=()=>reject(Error('late network failure'));});const pending=h.get('loadRepoReport').onclick();h.get('clearRuleReports').onclick();fail();await pending;assert.equal(h.get('ruleStatus').textContent,'Reports cleared.');
});

test('synthetic imported ERC draws saved sheet coordinates, opens full notes and honors the master visibility toggle',async()=>{
 const content=fs.readFileSync(require('node:path').join(__dirname,'fixtures/rule-reports/synthetic-qa-erc.json'),'utf8'),h=harness();h.options.rootFile='custom_fields.kicad_sch';h.options.currentFile=()=>h.options.rootFile;h.options.getFiles=()=>[{path:h.options.rootFile}];h.get('ruleDrawing').value=h.options.rootFile;
 h.get('ruleReportFile').files=[{name:'synthetic-qa-erc.json',size:content.length,text:async()=>content}];let target;h.options.locateRule=value=>{target=value;return true;};await h.get('ruleReportFile').onchange();
 const overlay=new h.Node(),pins=new h.Node(),draw=()=>{pins.replaceChildren();overlay.replaceChildren();h.api.draw(overlay,pins,p=>p,(tag,attrs)=>Object.assign(new h.Node(tag),{attributes:attrs}));};draw();assert.equal(pins.children.length,2);pins.children[0].onclick();assert.equal(target.file,'custom_fields.kicad_sch');assert.deepEqual({...target.position},{x:142.24,y:92.71});draw();assert.match(pins.textContent,/not a claim that KiCad found this error/);assert.ok(overlay.children.length>0);
 h.get('showRuleMarkers').checked=false;draw();assert.equal(pins.children.length,0);assert.equal(overlay.children.length,0);
});

test('ERC child-sheet markers require an explicit drawing association and then jump to that sheet',async()=>{
 const data=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'fixtures/rule-reports/synthetic-qa-erc.json'),'utf8'));data.sheets=[{...data.sheets[0],path:'/Power supply/',uuid_path:'/11111111-2222-3333-4444-555555555555'}];
 const h=harness();h.options.rootFile='custom_fields.kicad_sch';h.options.currentFile=()=> 'sub/power.kicad_sch';h.options.getFiles=()=>[{path:'custom_fields.kicad_sch'},{path:'sub/power.kicad_sch'}];h.get('ruleDrawing').value=h.options.rootFile;const content=JSON.stringify(data);h.get('ruleReportFile').files=[{name:'synthetic-child-erc.json',size:content.length,text:async()=>content}];await h.get('ruleReportFile').onchange();
 const overlay=new h.Node(),pins=new h.Node(),draw=()=>{pins.replaceChildren();overlay.replaceChildren();h.api.draw(overlay,pins,p=>p,(tag,attrs)=>Object.assign(new h.Node(tag),{attributes:attrs}));};draw();assert.equal(pins.children.length,0);
 const select=h.get('reportSheetMappings').children[0].children[0];select.value='sub/power.kicad_sch';select.onchange();draw();assert.equal(pins.children.length,2);let target;h.options.locateRule=value=>{target=value;return true;};pins.children[0].onclick();assert.equal(target.file,'sub/power.kicad_sch');assert.deepEqual({...target.position},{x:142.24,y:92.71});
});
