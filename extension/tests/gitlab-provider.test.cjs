'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
global.KiCadBrowserData=require('../browser-data.js');global.KiCadGitHub=require('../parsing.js');
const api=require('../gitlab-provider.js'),sha='a'.repeat(40);
function transport(t,handler){const previous=global.fetch;global.fetch=handler;t.after(()=>global.fetch=previous);}
const json=(value,headers={})=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json',...headers}});
test('GitLab subgroup and slash refs stay encoded on an unauthenticated fixed host',async t=>{
 transport(t,async(url,options)=>{assert.equal(url,'https://gitlab.com/api/v4/projects/group%2Fsubgroup%2Fboard/repository/files/design%2Fboard.kicad_pcb/raw?ref=feature%2Fpcb');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.headers,undefined);return new Response('(kicad_pcb)');});
 assert.equal(await api.file('group/subgroup/board','feature/pcb','design/board.kicad_pcb'),'(kicad_pcb)');
 await assert.rejects(api.file('../board','main','board.kicad_pcb'),/Invalid/);await assert.rejects(api.file('group/board','main','../secret'),/Invalid/);await assert.rejects(api.response('https://evil.test/api/v4/projects/x'),/Invalid/);
});
test('GitLab raw source enforces streamed byte limits and reports missing public files',async t=>{
 transport(t,async()=>new Response(null,{status:404}));assert.equal(await api.file('group/board','main','board.kicad_pcb'),null);
 global.fetch=async()=>new Response('123456');await assert.rejects(api.response('https://gitlab.com/api/v4/projects/x',5),/size limit/);
});
test('GitLab inventory pins trees to a SHA, handles pagination and excludes symlinks',async t=>{
 const calls=[];transport(t,async url=>{calls.push(url);if(url.includes('/commits/'))return json({id:sha});const query=new URL(url).searchParams;assert.equal(query.get('ref'),sha);if(query.get('page')==='1')return json([{path:'main.kicad_pro',type:'blob',mode:'100644'},{path:'link.kicad_pcb',type:'blob',mode:'120000'},{path:'../secret.kicad_pcb',type:'blob',mode:'100644'}],{'x-next-page':'2'});return json([{path:'main.kicad_pcb',type:'blob',mode:'100644'}]);});
 const result=await api.inventory('group/sub/board','main','main.kicad_pcb');assert.equal(result.snapshotRef,sha);assert.deepEqual(result.files.map(f=>f.path),['main.kicad_pcb','main.kicad_pro']);assert.equal(calls.length,3);
});
test('GitLab bounded discovery discloses omitted tree pages',async t=>{
 let count=0;transport(t,async url=>{if(url.includes('/commits/'))return json({id:sha});count++;return json([] ,{'x-next-page':String(count+1)});});const result=await api.inventory('group/board','main','main.kicad_pcb');assert.equal(count,10);assert.match(result.warnings.join(' '),/incomplete/);
});
test('GitLab commits and compare use immutable refs with direct comparison',async t=>{
 transport(t,async url=>{if(/\/commits\/main$/.test(url))return json({id:sha});if(/\/commits\/feature%2Fpcb$/.test(url))return json({id:'b'.repeat(40)});if(url.includes('/compare?')){const query=new URL(url).searchParams;assert.equal(query.get('straight'),'true');assert.equal(query.get('from'),sha);assert.equal(query.get('to'),'b'.repeat(40));return json({compare_timeout:false,diffs:[{old_path:'old.kicad_pcb',new_path:'new.kicad_pcb',renamed_file:true},{old_path:'notes.txt',new_path:'notes.txt'}]});}assert.equal(new URL(url).searchParams.get('ref_name'),sha);return json([{id:sha,title:'Change',author_name:'A',authored_date:'2026-01-01'}]);});
 const history=await api.commits('group/board','main','new.kicad_pcb');assert.equal(history.commits[0].sha,sha);
 const comparison=await api.compare('group/board','main','feature/pcb','new.kicad_pcb');assert.equal(comparison.files.length,1);assert.equal(comparison.files[0].status,'renamed');assert.deepEqual(comparison.warnings,[]);
});


test('GitLab permits larger PCB source but retains schematic and other-file byte caps', async t => {
  const previous = global.fetch; t.after(() => {global.fetch = previous;});
  global.fetch = async () => new Response('x'.repeat(9 * 1024 * 1024));
  assert.equal((await api.file('group/board', 'main', 'large.kicad_pcb')).length, 9 * 1024 * 1024);
  await assert.rejects(api.file('group/board', 'main', 'large.kicad_sch'), /size limit/);
});

test('GitLab limited comparison recovers omitted drawings from immutable complete trees',async t=>{
 const head='b'.repeat(40),blob=id=>id.repeat(40),entry=(path,id,mode='100644')=>({path,id:blob(id),type:'blob',mode});
 const before=[entry('unchanged.kicad_pcb','1'),entry('modified.kicad_pcb','2'),entry('old.kicad_sch','3'),entry('deleted.kicad_sch','4'),entry('edited-old.kicad_sch','5'),entry('becomes-link.kicad_pcb','6')];
 const after=[entry('unchanged.kicad_pcb','1'),entry('modified.kicad_pcb','7'),entry('sub/new.kicad_sch','3'),entry('added.kicad_pcb','8'),entry('edited-new.kicad_sch','9'),entry('becomes-link.kicad_pcb','a','120000')];
 const refs=[];transport(t,async url=>{
  if(url.includes('/commits/'))return json({id:url.endsWith('/main')?sha:head});
  if(url.includes('/compare?'))return json({compare_timeout:true,diffs:[]});
  const query=new URL(url).searchParams;refs.push(query.get('ref'));assert.equal(query.get('recursive'),'true');return json(query.get('ref')===sha?before:after);
 });
 const result=await api.compare('group/sub/board','main','feature','modified.kicad_pcb');
 assert.deepEqual(new Set(refs),new Set([sha,head]));assert.equal(result.base,sha);assert.equal(result.head,head);
 assert.deepEqual(result.files,[
  {file:'added.kicad_pcb',oldFile:'added.kicad_pcb',status:'added'},
  {file:'becomes-link.kicad_pcb',oldFile:'becomes-link.kicad_pcb',status:'removed'},
  {file:'deleted.kicad_sch',oldFile:'deleted.kicad_sch',status:'removed'},
  {file:'edited-new.kicad_sch',oldFile:'edited-new.kicad_sch',status:'added'},
  {file:'edited-old.kicad_sch',oldFile:'edited-old.kicad_sch',status:'removed'},
  {file:'modified.kicad_pcb',oldFile:'modified.kicad_pcb',status:'modified'},
  {file:'sub/new.kicad_sch',oldFile:'old.kicad_sch',status:'renamed'}
 ]);assert.match(result.warnings[0],/complete commit trees/);assert.match(result.warnings[0],/ambiguous moves/);
});

test('GitLab tree fallback does not invent deletions or rename ambiguous duplicates',async t=>{
 const head='b'.repeat(40),entry=path=>({path,id:'1'.repeat(40),type:'blob',mode:'100644'});
 let incomplete=false,invalid=false;transport(t,async url=>{
  if(url.includes('/commits/'))return json({id:url.endsWith('/main')?sha:head});
  if(url.includes('/compare?'))return json({compare_timeout:true,diffs:[]});
  const before=new URL(url).searchParams.get('ref')===sha;
  if(incomplete)return json([] ,{'x-next-page':'2'});
  if(invalid)return json([{...entry('bad.kicad_pcb'),id:'not-a-blob-id'}]);
  return json((before?['a.kicad_sch','b.kicad_sch']:['c.kicad_sch']).map(entry));
 });
 const result=await api.compare('group/board','main','feature','a.kicad_sch');assert.deepEqual(result.files.map(item=>item.status),['removed','removed','added']);
 incomplete=true;await assert.rejects(api.compare('group/board','main','feature','a.kicad_sch'),/repository discovery is incomplete/);
 incomplete=false;invalid=true;await assert.rejects(api.compare('group/board','main','feature','a.kicad_sch'),/Invalid GitLab drawing identity/);
});

test('GitLab normal diff excludes unsafe paths and retains regular-to-symlink removal',async t=>{
 transport(t,async url=>url.includes('/commits/')?json({id:url.endsWith('/main')?sha:'b'.repeat(40)}):json({diffs:[
  {old_path:'regular.kicad_pcb',new_path:'regular.kicad_pcb',a_mode:'100644',b_mode:'120000'},
  {old_path:'C:/secret.kicad_pcb',new_path:'../secret.kicad_pcb'},
  {old_path:'large.kicad_pcb',new_path:'large.kicad_pcb',too_large:true,collapsed:true}
 ]}));
 const result=await api.compare('group/board','main','feature','regular.kicad_pcb');
 assert.deepEqual(result.files,[{file:'regular.kicad_pcb',oldFile:'regular.kicad_pcb',status:'removed'},{file:'large.kicad_pcb',oldFile:'large.kicad_pcb',status:'modified'}]);
});

test('GitLab same immutable revision avoids comparison and tree requests',async t=>{
 let count=0;transport(t,async url=>{assert.match(url,/\/commits\//);count++;return json({id:sha});});
 assert.deepEqual(await api.compare('group/board','main','alias','board.kicad_pcb'),{files:[],base:sha,head:sha,warnings:[]});assert.equal(count,2);
});
