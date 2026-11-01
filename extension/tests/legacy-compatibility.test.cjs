const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const diff=require('../design-diff.js'),pcb=require('../pcb-renderer.js'),sch=require('../schematic-renderer.js'),data=require('../browser-data.js'),compat=require('../file-compatibility.js');
const folder=path.join(__dirname,'fixtures/legacy-vna2'),source=name=>fs.readFileSync(path.join(folder,name),'utf8');
test('retained root schematic remains byte-identical to the pinned public source',()=>{
 const provenance=JSON.parse(source('provenance.json')),item=provenance.sources.find(x=>x.path==='hw/vna2.sch');
 assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(folder,'vna2.sch'))).digest('hex'),item.sha256);
});
test('pinned VNA legacy modules retain hexadecimal timestamp identity and pad world coordinates',()=>{
 const text=source('board-excerpt.kicad_pcb'),ast=diff.parse(text),before=JSON.stringify(ast),drawing=pcb.build(ast,'hw/vna2.kicad_pcb');
 assert.equal(JSON.stringify(ast),before);assert.equal(drawing.compatibility.legacy,true);
 assert.ok(ast.some(n=>Array.isArray(n)&&n.some(s=>Array.isArray(s)&&s[0]==='tstamp'&&s[1]==='584E6390')));
 const pad=drawing.primitives.find(p=>p.kind==='pad'&&p.reference==='C272');assert.deepEqual(pad.padCenter,{x:153.97,y:116.65});
 assert.equal(pad.ownerUuid,'58880A71');assert.ok(drawing.primitives.some(p=>p.text==='DNP'));
 const files=[{path:'hw/vna2.kicad_pcb',content:text}],model=require('../design-model.js').buildProject(files);
 assert.ok(model.objects.some(o=>o.reference==='C272'||o.label==='C272'));assert.ok(diff.projectObjects(files).some(o=>o.kind==='footprint'&&o.metadata.uuid==='584E6390'));
});
test('numeric timestamps stay lexical while invalid geometric numbers remain rejected',()=>{
 const ast=diff.parse('(kicad_pcb (tstamp 00000001) (tedit 584E6390) (pad 01 smd rect))');assert.equal(ast[1][1],'00000001');assert.equal(ast[2][1],'584E6390');assert.equal(ast[3][1],'01');
 assert.throws(()=>diff.parse('(kicad_pcb (segment (start 1e9999 0)))'),/numeric/);
});
test('pinned legacy root schematic uses supplied cache bodies and saved mil pin coordinates',()=>{
 const content=source('vna2.sch'),libraries=[{path:'hw/vna2-cache.lib',content:source('vna2-cache.lib')}],ast=diff.parse(content,{libraries}),drawing=sch.build(ast,'hw/vna2.sch');
 assert.equal(ast.filter(n=>Array.isArray(n)&&n[0]==='symbol').length,47);assert.equal(data.sheetFiles(content).length,7);
 assert.ok(!drawing.warnings.some(w=>/Missing saved legacy library definition/.test(w)));
 const C5=drawing.primitives.find(p=>p.reference==='C5'&&p.kind==='pin');assert.ok(C5);assert.deepEqual(C5.connectPoint,{x:91.44,y:31.75});
 const missing=sch.build(diff.parse(content));assert.ok(missing.warnings.some(w=>/Missing saved legacy library definition/.test(w)));
 const files=[{path:'hw/vna2.sch',content,legacyLibraries:libraries}],snapshot=diff.prepareProject(files);assert.ok(require('../design-model.js').buildProject(files,null,snapshot).objects.length>47);
 assert.equal(diff.preparedFile(snapshot,'hw/vna2.sch').find(n=>Array.isArray(n)&&n[0]==='lib_symbols').length>1,true);
 assert.throws(()=>diff.parse(content.replace('$EndSCHEMATC','')),/terminator/);
 assert.throws(()=>diff.parse('PCBNEW-BOARD Version 1'),/separate.*kicad_pcb/);
});
test('legacy hierarchy retrieval retains original sources and reads the conventional root cache only',async()=>{
 const content='EESchema Schematic File Version 2\n$Sheet\nS 0 0 100 100\nU 1\nF0 "Child" 50\nF1 "child.sch" 50\n$EndSheet\n$EndSCHEMATC\n',child='EESchema Schematic File Version 4\n$EndSCHEMATC\n',library='EESchema-LIBRARY Version 2.3\n#End Library\n',calls=[];
 const entries={'hw/root.sch':content,'hw/child.sch':child,'hw/root-cache.lib':library};
 const files=await data.loadProject('owner/repo','a'.repeat(40),'hw/root.sch',async(_r,_s,name)=>{calls.push(name);return entries[name]??null;});
 assert.deepEqual(files.map(f=>f.path),['hw/root.sch','hw/child.sch']);assert.equal(files[0].content,content);assert.equal(files[1].legacyLibraries[0].content,library);assert.ok(!calls.includes('hw/child-cache.lib'));
 assert.equal(data.childPath('hw/root.sch','../../evil.sch'),null);
});
test('legacy drawing/project paths remain discoverable with branch and directory identity',()=>{
 global.KiCadGitHub=require('../parsing.js');const launch=require('../project-launch.js');
 assert.deepEqual(global.KiCadGitHub.detectedProjects([{type:'blob',path:'hw/vna2.pro'},{type:'blob',path:'hw/vna2.sch'},{type:'blob',path:'hw/vna2.kicad_pcb'}]),['hw/vna2.pro']);
 const info=launch.context('https://github.com/Ttl/vna2/tree/master/hw',{ref:'master'});assert.equal(info.ref,'master');assert.equal(info.directory,'hw');
 assert.match(launch.viewerURL({repository:'Ttl/vna2',sha:'a'.repeat(40)},'hw/vna2.pro',x=>x),/^project-viewer/);
});
test('saved variable expansion uses properties, title and project context with bounded recursion',()=>{
 const ast=diff.parse('(kicad_sch (title_block (title "Receiver")) (symbol (property "Reference" "R1") (property "Value" "10k")))'),warnings=[];
 const resolver=compat.textResolver(ast,{textVariables:{PROJECT:'Board',A:'${B}',B:'${A}'},sheetNumber:2,sheetCount:4},x=>warnings.push(x));
 assert.equal(resolver.resolve('${PROJECT} ${TITLE} ${R1:VALUE} ${#}/${##}'),'Board Receiver 10k 2/4');
 assert.equal(resolver.resolve('${REFERENCE}',resolver.fields(ast[2])),'R1');
 assert.equal(resolver.resolve('${A}'),'${A}');assert.equal(resolver.resolve('${MISSING}'),'${MISSING}');assert.equal(resolver.resolve('${constructor}'),'${constructor}');assert.ok(warnings.length>=3);
});
test('rendered schematic and PCB variables retain visible fields and source text',()=>{
 const schematic=diff.parse('(kicad_sch (text "${PROJECT}" (at 10 20) (effects (font (size 1 1)))))');
 const text=sch.build(schematic,'root.kicad_sch',{textVariables:{PROJECT:'VNA'}}).primitives.find(p=>p.rawText==='${PROJECT}');assert.equal(text.text,'VNA');
 const board=diff.parse('(kicad_pcb (layers (0 "F.Cu" signal)) (footprint "X" (at 10 20) (uuid "x") (property "Reference" "U1" (at 0 0) (layer "F.Cu") (effects (font (size 1 1)))) (property "Value" "IC" (at 0 1) (layer "F.Cu") (effects (font (size 1 1)))) (fp_text user "${REFERENCE} ${VALUE} ${PROJECT}" (at 0 2) (layer "F.Cu") (effects (font (size 1 1))))))');
 assert.ok(pcb.build(board,'root.kicad_pcb',{textVariables:{PROJECT:'Board'}}).primitives.some(p=>p.text==='U1 IC Board'));
});
test('legacy centre/sweep arc conversion keeps saved radius and start point',()=>{
 const result=pcb.build(diff.parse('(kicad_pcb (version 20170123) (gr_arc (start 10 20) (end 12 20) (angle 90) (layer "Edge.Cuts") (width .2)))'));
 const arc=result.primitives.find(p=>p.type==='arc');assert.deepEqual(arc.start,{x:12,y:20});assert.ok(Math.abs(arc.mid.x-(10+Math.SQRT2))<1e-10);assert.deepEqual(arc.end,{x:10,y:22});
});

test('authoritative tree route ref/path wins over stale nested branch metadata',()=>{
 const parsing=require('../parsing.js'),route=parsing.repositoryRoute('https://github.com/Ttl/vna2/tree/master/hw');
 const scripts=[JSON.stringify({payload:{codeViewTreeRoute:{path:'hw',refInfo:{name:'master'}},stale:{refInfo:{name:'master/hw'}}}})];
 assert.equal(parsing.repositoryRef(route,scripts),'master');
 const slash=parsing.repositoryRoute('https://github.com/owner/repo/tree/feature/board/hw');
 assert.equal(parsing.repositoryRef(slash,[JSON.stringify({payload:{codeViewTreeRoute:{path:'hw',refInfo:{name:'feature/board'}}}})]),'feature/board');
});
test('matching saved project variables are bounded and attached without changing drawing source',async()=>{
 const root='(kicad_sch (text "${PROJECT}"))',metadata='{"text_variables":{"PROJECT":"VNA","__proto__":"ordinary"}}',reads=[];
 const files=await data.loadProject('owner/repo','main','hw/root.kicad_sch',async(_r,_s,name)=>{reads.push(name);return name.endsWith('.kicad_pro')?metadata:root;});
 assert.equal(files[0].content,root);assert.equal(files[0].textVariables.PROJECT,'VNA');assert.equal(files[0].textVariables.__proto__,'ordinary');assert.deepEqual(reads,['hw/root.kicad_sch','hw/root.kicad_pro']);
 const huge=await data.loadProject('owner/repo','main','root.kicad_pcb',async(_r,_s,name)=>name.endsWith('.kicad_pro')?JSON.stringify({text_variables:{X:'x'.repeat(16385)}}):'(kicad_pcb (gr_text "${X}"))');
 assert.equal(huge[0].textVariables,undefined);assert.match(huge[0].discoveryWarning,/text variables unavailable/);
});
