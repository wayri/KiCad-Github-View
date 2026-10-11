const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
test('inline shell and each nested drawing page are accessible from GitHub and GitLab.com',()=>{
 const rules=manifest.web_accessible_resources;
 const pages=['analysis-viewer.html','pdf-viewer.html','project-viewer.html','browser-viewer.html','pcb-viewer.html','schematic-viewer.html','revision-viewer.html'];
 for(const page of pages){
  for(const host of ['https://github.com/*','https://gitlab.com/*'])assert.ok(rules.some(rule=>rule.matches.includes('https://*/*')&&rule.resources.includes(page)),`${page} must be navigable inside the ${host} frame tree`);
  assert.ok(fs.existsSync(path.join(root,page)));
 }
 // Keep credential/settings and privileged worker modules private.
 assert.deepEqual(rules.flatMap(rule=>rule.resources).sort(),pages.sort());
 assert.ok(rules.every(rule=>JSON.stringify([...rule.matches].sort())===JSON.stringify(['https://*/*'])));
 assert.deepEqual(manifest.optional_host_permissions,['https://*/*']);
 assert.ok(manifest.permissions.includes('scripting'));
 assert.ok(manifest.content_scripts.every(rule=>JSON.stringify([...rule.matches].sort())===JSON.stringify(['https://github.com/*','https://gitlab.com/*'])));
 assert.deepEqual([...manifest.host_permissions].sort(),['https://api.github.com/*','https://github.com/*','https://gitlab.com/*','https://raw.githubusercontent.com/*','https://uploads.github.com/*']);
});
