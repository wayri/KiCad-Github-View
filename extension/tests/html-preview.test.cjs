const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const preview=require('../html-preview.js'),paths=require('../parsing.js');
test('HTML policy precedes untrusted markup and denies external resources and forms',()=>{
 const html=preview.documentFor('<meta http-equiv="refresh" content="0;url=https://evil.test"><script>fetch("https://evil.test")</script>');
 assert.ok(html.indexOf('Content-Security-Policy')<html.indexOf('refresh'));
 for(const policy of ["connect-src 'none'","frame-src 'none'","form-action 'none'","object-src 'none'","base-uri 'none'"])assert.ok(html.includes(policy));
 assert.ok(html.includes("script-src 'unsafe-inline' 'unsafe-eval'"));
 assert.ok(preview.documentFor('<script>bad()</script>',{interactive:false}).includes("script-src 'none'"));
 assert.throws(()=>preview.documentFor('é'.repeat(4*1024*1024+1)),/8 MiB/);
});
test('HTML routes remain bounded safe project paths',()=>{
 for(const name of ['bom/ibom.html','reports/index.htm'])assert.equal(paths.filePath(name),name);
 for(const name of ['../ibom.html','/ibom.html','x\\ibom.html','https:ibom.html','x\u0000.html'])assert.equal(paths.filePath(name),null);
 assert.ok(paths.route('https://github.com/wayri/review/blob/main/ibom.html'));
});
test('sandbox accepts only its parent once and contains no privileged channel',()=>{
 const source=fs.readFileSync(require.resolve('../html-sandbox.js'),'utf8');let handler,frames=0;const parent={};
 vm.runInNewContext(source,{parent,KiCadHTMLPreview:preview,document:{getElementById:()=>({set srcdoc(value){frames++;assert.match(value,/Content-Security-Policy/);}}),body:{}},addEventListener:(type,fn)=>handler=fn});
 handler({source:{},data:{type:'kicad-html-preview',content:'<h1>No</h1>'}});assert.equal(frames,0);
 handler({source:parent,data:{type:'kicad-html-preview',content:'<h1>Yes</h1>'}});assert.equal(frames,1);
 handler({source:parent,data:{type:'kicad-html-preview',content:'again'}});assert.equal(frames,1);
 assert.doesNotMatch(source,/chrome\.|acquireVsCodeApi|postMessage|KiCadVSCodeContext/);
 const manifest=JSON.parse(fs.readFileSync(require.resolve('../manifest.json'),'utf8'));
 assert.deepEqual(manifest.sandbox.pages,['html-sandbox.html']);assert.ok(manifest.content_security_policy.sandbox.includes("connect-src 'none'"));
 assert.doesNotMatch(manifest.content_security_policy.sandbox,/allow-same-origin|allow-forms|allow-popups|allow-top-navigation/);
 assert.doesNotMatch(fs.readFileSync(require.resolve('../html-sandbox.html'),'utf8'),/allow-same-origin/);
});
