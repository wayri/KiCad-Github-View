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
test('GitLab commits and compare use immutable refs with direct comparison warnings',async t=>{
 transport(t,async url=>{if(/\/commits\/main$/.test(url))return json({id:sha});if(/\/commits\/feature%2Fpcb$/.test(url))return json({id:'b'.repeat(40)});if(url.includes('/compare?')){const query=new URL(url).searchParams;assert.equal(query.get('straight'),'true');assert.equal(query.get('from'),sha);assert.equal(query.get('to'),'b'.repeat(40));return json({compare_timeout:true,diffs:[{old_path:'old.kicad_pcb',new_path:'new.kicad_pcb',renamed_file:true},{old_path:'notes.txt',new_path:'notes.txt'}]});}assert.equal(new URL(url).searchParams.get('ref_name'),sha);return json([{id:sha,title:'Change',author_name:'A',authored_date:'2026-01-01'}]);});
 const history=await api.commits('group/board','main','new.kicad_pcb');assert.equal(history.commits[0].sha,sha);
 const comparison=await api.compare('group/board','main','feature/pcb','new.kicad_pcb');assert.equal(comparison.files.length,1);assert.equal(comparison.files[0].status,'renamed');assert.match(comparison.warnings.join(' '),/incomplete/);
});
