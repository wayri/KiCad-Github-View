const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
test('only explicit inline entrypoints are embeddable and repository access is granted on invocation',()=>{
 const pages=['analysis-viewer.html','pdf-viewer.html','project-viewer.html','browser-viewer.html','pcb-viewer.html','schematic-viewer.html','revision-viewer.html'];
 for(const page of pages)assert.ok(fs.existsSync(path.join(root,page)),`${page} must remain available inside the extension`);
 assert.deepEqual(manifest.web_accessible_resources,[{resources:['project-launcher.html','project-viewer.html','browser-viewer.html','gerber-viewer.html'],matches:['https://*/*']}],'Only explicit inline entrypoints may be embedded; worker binds their reads to the invoked repository');
 assert.deepEqual(manifest.content_scripts,[],'Repository pages must not receive automatic scripts');
 assert.deepEqual(manifest.host_permissions,[],'Viewing must not require permanent repository host access');
 assert.ok(manifest.permissions.includes('activeTab'));
 assert.ok(manifest.permissions.includes('scripting'));
 assert.ok(!manifest.permissions.includes('cookies'));
 assert.deepEqual(manifest.optional_host_permissions,['https://*/*'],'Review connections may explicitly request their provider host');
});
