const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');

test('every dedicated drawing template supplies net-name controls used during viewer initialization',()=>{
 for(const name of ['pcb-viewer.html','schematic-viewer.html','revision-viewer.html']){
  const html=fs.readFileSync(path.join(__dirname,'..',name),'utf8');
  assert.match(html,/<label\b[^>]*\bid="netNamesSetting"[^>]*>\s*<input\b[^>]*\bid="showNetNames"[^>]*\btype="checkbox"/,name+' must supply the settings wrapper and checkbox before the shared viewer runs');
  for(const id of ['netNamesSetting','showNetNames'])assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,name+' has one '+id);
 }
});
