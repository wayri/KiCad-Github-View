const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const diagnostics=require('../environment-diagnostics.js'),flush=()=>new Promise(setImmediate);
function setup(respond){
 const requests=[],timers=new Map();let next=0;
 const elements=new Map(['runViewerDiagnostics','viewerDiagnostics','viewerDiagnosticsLocal'].map(id=>[id,{style:{},attributes:{},disabled:false,textContent:'',setAttribute(k,v){this.attributes[k]=v;},hidden:false,href:id==='viewerDiagnosticsLocal'?'local-viewer.html':undefined}]));
 const env={KiCadEnvironmentDiagnostics:diagnostics,document:{getElementById:id=>elements.get(id)},chrome:{runtime:{sendMessage:request=>{requests.push(request);return respond(request);}}},setTimeout:fn=>{timers.set(++next,fn);return next;},clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(fs.readFileSync(require.resolve('../environment-options.js'),'utf8'),env);
 return {elements,requests,timers,run:()=>elements.get('runViewerDiagnostics').onclick(),output:elements.get('viewerDiagnostics')};
}
const policy={available:true,valid:true,networkEnabled:true,providerWritesEnabled:true};
const result=(accessIssue=null,accountAccessIssue=null)=>({version:'0.12.80',siteAccess:[{host:'https://github.com/*',state:'granted',requiredForViewing:true}],connectivity:[{host:'github.com',reachable:true,status:200,requiredForViewing:true}],accessIssue,accountAccessIssue,note:'No project or account data was sent.'});
test('options do not probe network under offline or unverifiable administrator settings and keep local fallback visible',async()=>{
 for(const value of [{...policy,networkEnabled:false},{...policy,valid:false},null]){
  const h=setup(async()=>({ok:true,result:value}));await h.run();assert.deepEqual(h.requests.map(r=>r.type),['managed-policy-status']);assert.equal(h.elements.get('runViewerDiagnostics').disabled,false);assert.equal(h.output.attributes.role,'alert');assert.match(h.output.textContent,/administrator|Administrator/);assert.equal(h.elements.get('viewerDiagnosticsLocal').href,'local-viewer.html');assert.equal(h.elements.get('viewerDiagnosticsLocal').hidden,false);assert.equal(h.timers.size,0);
 }
});
test('optional API block warns about account actions while public viewing remains a separate successful check',async()=>{
 const optional=diagnostics.classifyAccessError('net::ERR_BLOCKED_BY_ADMINISTRATOR'),h=setup(async r=>({ok:true,result:r.type==='managed-policy-status'?{...policy,providerWritesEnabled:false}:result(null,optional)}));await h.run();assert.deepEqual(h.requests.map(r=>r.type),['managed-policy-status','viewer-diagnostics']);assert.match(h.output.textContent,/Project viewing: public website\/raw checks completed/);assert.match(h.output.textContent,/API-only failure does not mean/);assert.match(h.output.textContent,/remote writes disabled/);assert.equal(h.output.attributes.role,'status');
});
test('generic network failure stays inconclusive and private worker exception text is not echoed',async()=>{
 const h=setup(async r=>{if(r.type==='managed-policy-status')return{ok:true,result:policy};throw Error('Failed to fetch SECRET private/repository');});await h.run();assert.match(h.output.textContent,/did not identify the cause/);assert.doesNotMatch(h.output.textContent,/SECRET|private\/repository/);
 const unknown=setup(async r=>{if(r.type==='managed-policy-status')return{ok:true,result:policy};throw Error('SECRET proxy credentials');});await unknown.run();assert.match(unknown.output.textContent,/does not establish an organization policy block/);assert.doesNotMatch(unknown.output.textContent,/SECRET/);
});
test('policy reply failures and worker timeouts restore controls without probing or changing settings',async()=>{
 const denied=setup(async()=>({ok:false,error:'SECRET invalid policy'}));await denied.run();assert.equal(denied.requests.length,1);assert.doesNotMatch(denied.output.textContent,/SECRET/);
 const h=setup(()=>new Promise(()=>{})),pending=h.run();assert.equal(h.elements.get('runViewerDiagnostics').disabled,true);assert.equal(h.requests.length,1);for(const fn of [...h.timers.values()])fn();await pending;assert.equal(h.elements.get('runViewerDiagnostics').disabled,false);assert.match(h.output.textContent,/does not establish an organization policy block/);assert.equal(h.timers.size,0);assert.equal(h.requests.length,1);
});
test('options HTML exposes a safe local link and loads diagnostic helpers before their UI',()=>{
 const html=fs.readFileSync(require.resolve('../options.html'),'utf8');assert.match(html,/<a id="viewerDiagnosticsLocal" href="local-viewer\.html" target="_blank" rel="noopener">Open local files<\/a>/);assert.ok(html.indexOf('src="environment-diagnostics.js"')<html.indexOf('src="environment-options.js"'));assert.match(html,/does not change site access|do not change site access/);assert.match(html,/extension or file picker itself is blocked/);
});
