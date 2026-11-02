const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const reader=require('../github-session-reader.js'),{create}=require('../github-project-buffer.js'),paths=require('../parsing.js'),data=require('../browser-data.js'),folder=path.join(__dirname,'fixtures/github-public-discovery'),fixture=name=>fs.readFileSync(path.join(folder,name+'.html'),'utf8');
const cases=[{repo:'BerkeleyLab/Marble',name:'marble',branch:'main',directory:'design',sha:'a426777d92c0f22a546d4740b419a3937e0c1f90',project:'design/Marble.kicad_pro',board:'design/Marble.kicad_pcb',root:'marble-root',tree:'marble-design'},{repo:'Ttl/vna2',name:'vna2',branch:'master',directory:'hw',sha:'2cf0efb22da56a168a7f07bf5e2c30631343997b',project:'hw/vna2.pro',board:'hw/vna2.kicad_pcb',root:'vna2-root',tree:'vna2-hw'}];
function response(body,url,status=200,type='text/html'){const result=new Response(body,{status,headers:{'content-type':type}});Object.defineProperty(result,'url',{value:url});return result;}
function setup(c){const calls=[],source='(kicad_pcb (version 20211014))',api=create({readSession:async()=>null,fetch:async(url,init)=>{calls.push({url,init});const parsed=new URL(url);assert.ok(['github.com','raw.githubusercontent.com'].includes(parsed.hostname));assert.equal(init.headers,undefined);assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');
 if(parsed.hostname==='raw.githubusercontent.com')return response(source,url,200,'text/plain');
 if([`https://github.com/${c.repo}`,`https://github.com/${c.repo}/tree/${c.branch}`,`https://github.com/${c.repo}/tree/${c.sha}`].includes(url))return response(fixture(c.root),url);
 if([`https://github.com/${c.repo}/tree/${c.branch}/${c.directory}`,`https://github.com/${c.repo}/tree/${c.sha}/${c.directory}`].includes(url))return response(fixture(c.tree),url);
 return response('<html><title>Access denied by organization policy</title></html>',url,403);
 }});return {api,calls,source};}
test('retained public HTML metadata remains source-bound and byte-verified',()=>{
 for(const entry of JSON.parse(fs.readFileSync(path.join(folder,'provenance.json'),'utf8'))){const bytes=fs.readFileSync(path.join(folder,entry.name+'.html'));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),entry.retainedHtmlSha256);assert.equal(entry.status,200);const objects=reader.htmlObjects(bytes.toString());assert.ok(objects.length);const directory=entry.path==='/'?'':entry.path,snapshot=reader.treeData(objects,entry.ref.currentOid,directory);assert.equal(snapshot.sha,entry.ref.currentOid);assert.equal(snapshot.items.length,entry.treeCount);}
});
for(const c of cases)test(c.repo+' root discovers the saved project without any repository tab or API',async()=>{
 const h=setup(c),context=await h.api.context('https://github.com/'+c.repo);assert.equal(context.ref,'HEAD');const inventory=await h.api.inventory(c.repo,'HEAD');assert.equal(inventory.snapshotRef,c.sha);assert.ok(paths.detectedProjects(inventory.files.map(item=>({...item,type:'blob'}))).includes(c.project));assert.match(inventory.warnings.join(' '),/incomplete/,'unreadable ancillary folders remain explicit');assert.equal(h.calls[1].url,`https://github.com/${c.repo}/tree/${c.sha}/${c.directory}`,'design folder is prioritized before firmware/auxiliary directories');h.api.dispose();
});
for(const c of cases)test(c.repo+' nested branch/path metadata is authoritative and reuses the pinned directory',async()=>{
 const h=setup(c),source=`https://github.com/${c.repo}/tree/${c.branch}/${c.directory}`,context=await h.api.context(source);assert.equal(context.ref,c.branch);assert.equal(context.directory,c.directory);assert.equal(context.sha,c.sha);const listing=await h.api.inventory(c.repo,c.branch,undefined,{directory:context.directory});assert.ok(listing.files.some(f=>f.path===c.project));assert.equal(h.calls.filter(call=>call.url.endsWith('/'+c.directory)).length,1,'folder bytes come from the context cache');h.api.dispose();
});
test('detached project and project-file readers share immutable public source bytes',async()=>{
 const c=cases[0],h=setup(c),view=require('../github-project-view.js').create({buffer:h.api,data,paths});global.KiCadGitHubSessionReader=reader;
 const file=await view.read({type:'project-file',repository:c.repo,ref:c.sha,file:c.board});assert.equal(file.content,h.source);
 const project=await view.read({type:'project',repository:c.repo,ref:c.sha,file:c.board});assert.equal(project[0].content,h.source);const detached=await view.read({type:'project-file',repository:c.repo,ref:c.sha,file:c.board});assert.equal(detached.snapshotRef,c.sha);assert.equal(h.calls.filter(call=>call.url.includes('raw.githubusercontent.com')).length,1);h.api.dispose();
});
test('HTML masquerading as text KiCad source is rejected before cache success',async()=>{
 let count=0;const api=create({readSession:async()=>null,fetch:async url=>response(++count===1?'<!DOCTYPE html><html>Sign in</html>':'(kicad_pcb)',url,200,'text/plain')});
 await assert.rejects(api.file('owner/repo','a'.repeat(40),'board.kicad_pcb',1024),/HTML website page/);assert.equal(api.stats().entries,0);assert.equal(await api.file('owner/repo','a'.repeat(40),'board.kicad_pcb',1024),'(kicad_pcb)');assert.equal(await api.file('owner/repo','a'.repeat(40),'board.kicad_pcb',1024),'(kicad_pcb)');assert.equal(count,2);api.dispose();
});
test('website organization and request limits have explicit website-only diagnostics',async()=>{
 for(const [status,body,pattern]of [[403,'<html>Blocked by your organization policy</html>',/organization policy/],[429,'<html>Too many requests</html>',/website requests are temporarily limited/]]){const api=create({readSession:async()=>null,fetch:async url=>response(body,url,status)});await assert.rejects(api.resolve('owner/repo','HEAD'),error=>{assert.match(error.message,pattern);assert.equal(error.source,'github-website');assert.ok(!error.accessIssue.title.includes('API'));assert.match(error.accessIssue.action,/not the GitHub API/);return true;});assert.equal(api.stats().entries,0);api.dispose();}
});
test('JSON scripts are inert and malformed/non-JSON markup never becomes a tree',()=>{
 global.__githubFixtureExecuted=false;const objects=reader.htmlObjects('<script>global.__githubFixtureExecuted=true;</script><script type="application/json">{"payload":{}}</script>');assert.equal(global.__githubFixtureExecuted,false);assert.equal(objects.length,1);assert.throws(()=>reader.treeData(objects,'HEAD',''),/readable/);assert.deepEqual(reader.htmlObjects('<script type="text/javascript">{"payload":{}}</script>'),[]);
});

test('literal folder page disambiguates a slash branch without guessing from URL segments',async()=>{
 const objects=reader.htmlObjects(fixture('marble-design')),route=objects[0].payload.codeViewTreeRoute;route.refInfo.name='release/hardware';const html='<script type="application/json">'+JSON.stringify(objects[0])+'</script>',url='https://github.com/BerkeleyLab/Marble/tree/release/hardware/design',api=create({readSession:async()=>null,fetch:async requested=>{assert.equal(requested,url);return response(html,requested);}}),context=await api.context(url);assert.equal(context.ref,'release/hardware');assert.equal(context.directory,'design');assert.equal(context.sha,cases[0].sha);api.dispose();
});
test('explicit inventory refresh retries missing folders while keeping pinned metadata',async()=>{
 const c=cases[0],h=setup(c);await h.api.inventory(c.repo,'HEAD');const before=h.calls.length;await h.api.inventory(c.repo,'HEAD');assert.equal(h.calls.length,before);await h.api.inventory(c.repo,'HEAD',undefined,{refresh:true});assert.ok(h.calls.length>before);assert.equal(h.calls.filter(c=>c.url==='https://github.com/'+cases[0].repo).length,1);h.api.dispose();
});


test('production nested-context then pinned inventory never treats a folder as repository root',async()=>{
 for(const c of cases){const h=setup(c),context=await h.api.context(`https://github.com/${c.repo}/tree/${c.branch}/${c.directory}`),inventory=await h.api.inventory(c.repo,context.sha,undefined,{directory:context.directory}),paths=inventory.files.map(f=>f.path);assert.equal(paths.length,new Set(paths).size);assert.equal(paths.filter(path=>path===c.project).length,1);const schematic=c.project.replace(/\.(?:kicad_pro|pro)$/i,c.project.endsWith('.pro')?'.sch':'.kicad_sch');assert.equal(paths.filter(path=>path===schematic).length,1,'same-basename default schematic is unambiguous');assert.ok(h.calls.some(call=>call.url===`https://github.com/${c.repo}/tree/${context.sha}`),'pinned root must be read independently from the nested folder');h.api.dispose();}
});
test('legacy cached inventories normalize repeated paths but reject type or revision conflicts',async()=>{
 const {normalizeInventory}=require('../github-project-buffer.js'),sha=cases[0].sha,old={snapshotRef:sha,files:[{path:'design/Marble.kicad_sch',size:0},{path:'design/Marble.kicad_sch',size:0}],entries:[{path:'design',type:'directory'},{path:'design/Marble.kicad_sch',type:'file'},{path:'design/Marble.kicad_sch',type:'file'}],warnings:[]},normalized=normalizeInventory(old,sha);
 assert.equal(normalized.files.length,1);assert.equal(normalized.entries.length,2);assert.match(normalized.warnings.join(' '),/Repeated cached/);assert.equal(old.files.length,2,'caller/cache source is not mutated');
 assert.throws(()=>normalizeInventory({...old,snapshotRef:'b'.repeat(40)},sha),/revision/);assert.throws(()=>normalizeInventory({...old,entries:[{path:old.files[0].path,type:'directory'}]},sha),/Conflicting.*types/);
 global.KiCadGitHubSessionReader=reader;const view=require('../github-project-view.js').create({buffer:{inventory:async()=>old},data,paths});const result=await view.read({type:'project-inventory',repository:cases[0].repo,ref:sha,file:cases[0].project});assert.equal(result.files.length,1,'legacy/alternate cached buffers are normalized at the viewer boundary too');
});
test('mirrored real DOM tree payloads deduplicate paths and retain strict type/revision checks',()=>{
 const objects=reader.htmlObjects(fixture('marble-design')),route=objects[0].payload.codeViewTreeRoute,mirror=JSON.parse(JSON.stringify(route));objects[0].payload.codeViewRepoRoute=mirror;const result=reader.treeData(objects,cases[0].sha,'design');assert.equal(result.items.length,route.tree.totalCount);assert.equal(result.items.length,new Set(result.items.map(i=>i.path)).size);
 mirror.tree.items[0].contentType=mirror.tree.items[0].contentType==='file'?'directory':'file';assert.throws(()=>reader.treeData(objects,cases[0].sha,'design'),/Conflicting.*types/);mirror.tree.items[0].contentType=route.tree.items[0].contentType;mirror.refInfo.currentOid='b'.repeat(40);assert.throws(()=>reader.treeData(objects,'HEAD','design'),/conflicting.*revisions/);
});
