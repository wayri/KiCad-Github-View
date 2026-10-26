const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('native HTML fallback contains no credentials, host bridge, or executable scripts',()=>{
 const source=fs.readFileSync(require.resolve('../extension.js'),'utf8'),sandbox={module:{exports:{}},TextEncoder,require(name){if(name==='vscode')return {};if(name==='./media/review-comments.js')return require('../../extension/review-comments.js');if(name==='./remote-collaboration.js')return require('../remote-collaboration.js');if(name==='./media/parsing.js')return require('../../extension/parsing.js');if(name==='./media/html-preview.js')return require('../../extension/html-preview.js');throw Error(name);}};
 vm.runInNewContext(source,sandbox);const html=sandbox.module.exports._test.staticHTML('<script>parent.postMessage("unsafe","*")</script><form action="https://evil.test"><input></form>');
 assert.match(html,/script-src &#39;none&#39;/);assert.match(html,/sandbox=""/);assert.match(html,/srcdoc="/);assert.doesNotMatch(html,/<script|<form|acquireVsCodeApi|KiCadVSCodeContext|webview-bridge\.js/);
 assert.ok(source.includes("{enableScripts:false,localResourceRoots:[]}"));
 const section=source.slice(source.indexOf('function openStaticHTML'),source.indexOf('async function openOverview'));
 assert.doesNotMatch(section,/onDidReceiveMessage|handleMessage|createSession/);
});
