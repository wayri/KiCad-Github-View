const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
test('inline shell and each nested drawing page are accessible from GitHub',()=>{
 const rules=manifest.web_accessible_resources;
 const pages=['project-viewer.html','browser-viewer.html','pcb-viewer.html','schematic-viewer.html','revision-viewer.html'];
 for(const page of pages){
  assert.ok(rules.some(rule=>rule.matches.includes('https://github.com/*')&&rule.resources.includes(page)),`${page} must be navigable inside the GitHub frame tree`);
  assert.ok(fs.existsSync(path.join(root,page)));
 }
 // Keep credential/settings and privileged worker modules private.
 assert.deepEqual(rules.flatMap(rule=>rule.resources).sort(),pages.sort());
 assert.ok(rules.every(rule=>rule.matches.length===1&&rule.matches[0]==='https://github.com/*'));
});
