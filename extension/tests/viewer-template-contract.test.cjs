const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');

test('every dedicated drawing template supplies net-name controls used during viewer initialization',()=>{
 for(const name of ['pcb-viewer.html','schematic-viewer.html','revision-viewer.html']){
  const html=fs.readFileSync(path.join(__dirname,'..',name),'utf8');
  assert.match(html,/<label\b[^>]*\bid="netNamesSetting"[^>]*>\s*<input\b[^>]*\bid="showNetNames"[^>]*\btype="checkbox"/,name+' must supply the settings wrapper and checkbox before the shared viewer runs');
  for(const id of ['netNamesSetting','showNetNames'])assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,name+' has one '+id);
 }
});


test('all dedicated viewers load the same-tab Draftsman model, exports and workspace before review controls',()=>{
 for(const name of ['pcb-viewer.html','schematic-viewer.html','revision-viewer.html']){
  const html=fs.readFileSync(path.join(__dirname,'..',name),'utf8');
  for(const file of ['draftsman-model.js','draftsman-export.js','draftsman-workspace.js']){assert.equal(html.split('src="'+file+'"').length,2);assert.ok(html.indexOf('src="'+file+'"')<html.indexOf('src="review-workspace.js"'));}
  assert.match(html,/href="draftsman-workspace.css"/);
 }
});
