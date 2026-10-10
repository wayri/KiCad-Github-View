const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const local=require('../../android-app/web/local-project.js');
const store=()=>({getItem:()=>null,setItem(){throw Error('Source transport must not write.');}});

test('standalone saved analysis files are read as inert source and stay pinned to the import',async()=>{
 for(const extension of ['wbk','raw','csv','tsv','html','htm','json','txt']){
  const path='reports/analysis.'+extension,content='<script>globalThis.executed=true</script><table><tr><td>1</td></tr></table>';
  const project=local.validate({id:'report',files:[{path,content}]}),api=local.transport(project,store());
  assert.equal((await api.send({type:'project-file',repository:api.scope,ref:api.ref,file:path})).result.content,content);
  assert.equal((await api.send({type:'project-file',ref:'b'.repeat(40),file:path})).ok,false);
  assert.equal((await api.send({type:'source-save',file:path,content:'changed'})).ok,false);
  assert.equal(globalThis.executed,undefined);
 }
 assert.equal(local.analysisFile('config.json'),true);
 assert.equal(local.analysisFile('reports/thermal.json'),true);
 assert.throws(()=>local.validate({files:[{path:'report.js',content:'alert(1)'}]}));
});

function shell(){
 const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,{value:'',hidden:true,children:[],addEventListener(name,fn){this[name]=fn;},removeAttribute(name){delete this[name];},replaceChildren(){this.children=[];this.value='';},append(node){this.children.push(node);if(!this.value)this.value=node.value;}});return nodes.get(id);};
 const loading=[],context={URLSearchParams,Event,KiCadAndroidLocal:local,document:{getElementById:get,createElement:()=>({})},dispatchEvent(){},KiCadAndroidUI:{loading:text=>loading.push(text)}};context.window=context;vm.runInNewContext(fs.readFileSync(require.resolve('../../android-app/web/index.js'),'utf8'),context);return{context,get,loading};
}
test('Android opens standalone reports in the packaged viewer and keeps immutable project scope',async()=>{
 const {context,get,loading}=shell(),path='reports/simulation.csv';
 context.KiCadAndroid.receiveProject({id:'report',files:[{path,content:'time,V\n0,1'}]});
 assert.equal(get('viewer').hidden,false);assert.equal(get('viewer').src.split('?')[0],'analysis-viewer.html');
 let query=new URLSearchParams(get('viewer').src.split('?')[1]);assert.equal(query.get('file'),path);assert.equal(query.get('repository'),'android/report');assert.equal(query.get('ref'),'a'.repeat(40));
 assert.equal(loading.at(-1),'Opening analysis report...');get('viewer').load();assert.equal(loading.at(-1),null);
 const before=get('viewer').src;await context.KiCadAndroid.openAnalysis('../outside.html');assert.equal(get('viewer').src,before);
 context.KiCadAndroidProject={...local.validate({files:[{path,content:''}]}),remote:{provider:'gitlab',host:'https://gitlab.example.com',repository:'team/repo',sha:'b'.repeat(40)}};
 const revision={...context.KiCadAndroidProject,remote:{...context.KiCadAndroidProject.remote,sha:'c'.repeat(40)}};context.KiCadAndroidRevisionCache={get:async sha=>{assert.equal(sha,'c'.repeat(40));return revision;}};
 await context.KiCadAndroid.openAnalysis(path,'c'.repeat(40));query=new URLSearchParams(get('viewer').src.split('?')[1]);assert.equal(query.get('provider'),'gitlab');assert.equal(query.get('host'),'https://gitlab.example.com');assert.equal(query.get('ref'),'c'.repeat(40));
});
