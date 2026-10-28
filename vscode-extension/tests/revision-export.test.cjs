'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const {writeExport,collect,portablePath}=require('../revision-export.js'),{createGitHistoryReader}=require('../git-history-tree.js');
test('real immutable Git export preserves binary bytes in ZIP and independent folder without touching checkout',async()=>{
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'kiview-export-')),repo=path.join(base,'repo');await fs.mkdir(repo);
 try{
  const gitPath=spawnSync(process.platform==='win32'?'where.exe':'which',[process.platform==='win32'?'git.exe':'git'],{encoding:'utf8'}).stdout.trim().split(/\r?\n/)[0];
  function git(args,input){const r=spawnSync(gitPath,['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false',...args],{cwd:repo,input,encoding:'utf8',shell:false,windowsHide:true});assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
  git(['init','--quiet']);await fs.mkdir(path.join(repo,'hardware','models'),{recursive:true});const binary=Buffer.from([0,1,255,13,10,0,128]);
  await fs.writeFile(path.join(repo,'hardware','root.kicad_sch'),'(kicad_sch)');await fs.writeFile(path.join(repo,'hardware','models','part.step'),binary);await fs.writeFile(path.join(repo,'outside.txt'),'outside prefix');git(['add','.']);git(['commit','--quiet','-m','Fixture']);const sha=git(['rev-parse','HEAD']);
  await fs.writeFile(path.join(repo,'hardware','root.kicad_sch'),'MODIFIED WORKING');const before=git(['status','--porcelain']);
  const history={sha,prefix:'hardware',reader:createGitHistoryReader({gitPath,rootPath:repo,isTrusted:()=>true})},args={history,sourceRoots:[repo],check:()=>{}};
  const folder=path.join(base,'independent'),copied=await writeExport({...args,destination:folder,copy:true});assert.equal(copied.files,2);assert.deepEqual(await fs.readFile(path.join(folder,'models','part.step')),binary);assert.equal(await fs.readFile(path.join(folder,'root.kicad_sch'),'utf8'),'(kicad_sch)');
  await assert.rejects(fs.stat(path.join(folder,'.git')),e=>e.code==='ENOENT');await assert.rejects(fs.stat(path.join(folder,'outside.txt')),e=>e.code==='ENOENT');
  const archive=path.join(base,'saved.zip');await writeExport({...args,destination:archive,copy:false});const zip=await fs.readFile(archive),entries=new Map();let offset=0;
  while(zip.readUInt32LE(offset)===0x04034b50){const size=zip.readUInt32LE(offset+18),length=zip.readUInt16LE(offset+26),extra=zip.readUInt16LE(offset+28),start=offset+30+length+extra;entries.set(zip.subarray(offset+30,offset+30+length).toString('utf8'),zip.subarray(start,start+size));offset=start+size;}
  assert.deepEqual(entries.get('models/part.step'),binary);assert.equal(entries.get('root.kicad_sch').toString(),'(kicad_sch)');assert.equal(zip.readUInt32LE(offset),0x02014b50);
  for(const destination of [folder,archive,path.join(repo,'copy'),path.join(repo,'new.zip')])await assert.rejects(writeExport({...args,destination,copy:true}),/already exists|outside the source/);
  assert.equal(git(['status','--porcelain']),before);assert.equal(await fs.readFile(path.join(repo,'hardware','root.kicad_sch'),'utf8'),'MODIFIED WORKING');
  const blob=git(['hash-object','-w','--stdin'],'not a link target');git(['update-index','--add','--cacheinfo',`120000,${blob},hardware/linked`]);git(['commit','--quiet','-m','Unsafe link fixture']);history.sha=git(['rev-parse','HEAD']);await assert.rejects(writeExport({...args,destination:path.join(base,'unsafe'),copy:true}),/unsupported or unsafe/);
 }finally{assert.equal(path.dirname(base),os.tmpdir());await fs.rm(base,{recursive:true,force:true});}
});
test('export rejects unsafe names, collisions, unsupported objects and byte budgets before reading blobs',async()=>{
 for(const value of ['../file','a\\b','.git/config','a:NUL','a?','CON.txt','x.','x ','/absolute','a\u0000b'])assert.equal(portablePath(value),false,value);
 assert.equal(portablePath('models/a component.step'),true);
 const base={path:'part.step',mode:'100644',type:'blob',size:1};
 for(const entries of [[{...base,path:'../x'}],[{...base,mode:'120000'}],[{...base,size:32*1024*1024+1}],[base,{...base,path:'PART.step'}],Array.from({length:2001},(_,i)=>({...base,path:String(i)}))]){
  const history={sha:'a'.repeat(40),prefix:'',reader:{inventory:async()=>({entries,warnings:[]}),read:async()=>{throw Error('Unexpected read');}}};await assert.rejects(collect(history,()=>{}),/unsafe|exceeds|colliding/);
 }
});
