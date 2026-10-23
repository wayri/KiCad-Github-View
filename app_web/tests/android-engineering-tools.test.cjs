const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../../android-app/web/engineering-tools.js'),'utf8');
function harness(){const nodes={viewer:{hidden:true,src:'',after(node){nodes[node.id]=node;}},welcome:{hidden:false,append(){}},projectPicker:{hidden:true,open:false}};let analyzed=[];const context={document:{readyState:'complete',getElementById:id=>nodes[id],querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>({append(){},removeAttribute(name){if(name==='src')this.src='';}})},URLSearchParams,location:{search:''},KiCadAndroid:{openAnalysis:(...a)=>analyzed.push(a),showHome(){}},KiCadBomImport:require('../../extension/bom-import.js')};vm.runInNewContext(script,context);return{context,nodes,analyzed};}
test('offline tools hide home and restore its previous state; only trusted page names can open',()=>{
 const h=harness(),api=h.context.KiCadAndroid;api.openTools('https://foreign.invalid');assert.equal(h.nodes.viewer.hidden,true);
 api.openTools('calculator-viewer.html');assert.equal(h.nodes.welcome.hidden,true);assert.equal(h.nodes.viewer.hidden,true);assert.equal(h.nodes.engineeringToolViewer.src,'calculator-viewer.html?');api.closeTools();assert.equal(h.nodes.viewer.hidden,true);assert.equal(h.nodes.welcome.hidden,false);
 h.nodes.viewer.hidden=false;h.nodes.viewer.src='revision-viewer.html?file=board.kicad_pcb';h.nodes.welcome.hidden=true;api.openTools('bom-viewer.html');api.closeTools();assert.equal(h.nodes.viewer.src,'revision-viewer.html?file=board.kicad_pcb');assert.equal(h.nodes.viewer.hidden,false);assert.equal(h.nodes.welcome.hidden,true);
});
test('BoM routing does not hijack waveform CSV or simulation JSON',()=>{
 const h=harness(),api=h.context.KiCadAndroid;api.openAnalysis('thermal.csv','commit');api.openAnalysis('quickpi.json');assert.deepEqual(h.analyzed,[['thermal.csv','commit'],['quickpi.json',undefined]]);api.openAnalysis('ibom.html');assert.equal(h.nodes.engineeringToolViewer.src,'bom-viewer.html?');
});
test('fabrication tool opens offline and returns to home',()=>{const h=harness();h.context.KiCadAndroid.openTools('gerber-viewer.html');assert.equal(h.nodes.engineeringToolViewer.src,'gerber-viewer.html?');h.context.KiCadAndroid.closeTools();assert.equal(h.nodes.welcome.hidden,false);});
