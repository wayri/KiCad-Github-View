const test=require('node:test'),assert=require('node:assert/strict'),R=require('../project-recents.js');
const remote=(repository='owner/board',extra={})=>({kind:'remote',provider:'github',host:'https://github.com',repository,ref:'a'.repeat(40),file:'hardware/board.kicad_pcb',...extra});
function fixture(){const data=new Map([['credentials',{token:'not history'}],['notes','retained']]);let time=100;const area={get:async key=>({[key]:data.get(key)}),set:async values=>{for(const [key,value]of Object.entries(values))data.set(key,structuredClone(value));}};return{data,store:R.createStore(area,{now:()=>++time})};}
test('recent metadata is local, bounded and deduplicated per repository while keeping its last exact drawing revision',async()=>{
 const f=fixture();await Promise.all(Array.from({length:55},(_,index)=>f.store.record(remote('owner/project-'+index))));assert.equal((await f.store.list()).length,50);assert.equal((await f.store.list())[0].repository,'owner/project-54');
 await f.store.record(remote('owner/project-10',{ref:'b'.repeat(40),file:'schematic/root.kicad_sch',token:'never persist',content:'private source'}));const items=await f.store.list();assert.equal(items.length,50);assert.equal(items[0].name,'root');assert.equal(items[0].ref,'b'.repeat(40));assert.equal(items.filter(item=>item.repository==='owner/project-10').length,1);assert.equal(JSON.stringify(f.data.get(R.KEY)).includes('never persist'),false);assert.equal(JSON.stringify(f.data.get(R.KEY)).includes('private source'),false);
 await f.store.remove(items[0].id);assert.equal((await f.store.list()).length,49);await f.store.clear();assert.deepEqual(await f.store.list(),[]);assert.deepEqual(f.data.get('credentials'),{token:'not history'});assert.equal(f.data.get('notes'),'retained');
});
test('local recents contain names and identities without claiming cached source or recording arbitrary extras',async()=>{
 const f=fixture(),item=await f.store.record({kind:'local',localId:'c'.repeat(64),name:'Bench board',contents:'private source',token:'private token'});assert.deepEqual(Object.keys(item).sort(),['id','kind','lastOpened','localId','name']);assert.match(R.viewerURL(item,page=>'extension://'+page),/local-viewer.html$/);assert.equal(JSON.stringify(item).includes('private'),false);
 await f.store.record({kind:'local',localId:'c'.repeat(64),name:'Renamed board'});assert.equal((await f.store.list()).length,1);
});
test('remote locations reject unpinned revisions, unsafe files, credential URLs and mismatched providers',()=>{
 for(const value of [remote('owner/../repo'),remote('other/group/repo'),remote('owner/repo',{ref:'main'}),remote('owner/repo',{file:'../board.kicad_pcb'}),remote('owner/repo',{file:'report.html'}),remote('owner/repo',{host:'https://token@github.com'}),remote('owner/repo',{host:'https://github.com/path'}),remote('owner/repo',{provider:'gitlab',host:'https://api.github.com'})])assert.throws(()=>R.normalize(value),/Invalid|provider|origin/);
 const entry=R.normalize(remote('group/sub/board',{provider:'gitlab',host:'https://gitlab.example:8443',ref:'f'.repeat(40),file:'main.kicad_pro'})),url=new URL(R.viewerURL(entry,page=>'chrome-extension://id/'+page));assert.equal(url.pathname,'/project-viewer.html');assert.equal(url.searchParams.get('provider'),'gitlab');assert.equal(url.searchParams.get('host'),'https://gitlab.example:8443');assert.equal(url.searchParams.get('ref'),'f'.repeat(40));
});
test('repository URL parsing accepts exact provider roots and rejects drawing routes or injected credentials',()=>{
 assert.equal(R.parseURL('https://github.com/owner/board.git').repository,'owner/board');assert.equal(R.parseURL('https://gitlab.example/group/sub/board/').provider,'gitlab');
 for(const value of ['javascript:alert(1)','http://github.com/o/r','https://user:token@github.com/o/r','https://github.com/o/r?token=secret','https://github.com/o/r/blob/main/a.kicad_pcb','https://gitlab.com/g/r/-/blob/main/a.kicad_pcb','https://github.com/o%2fr/repo','https://github.com/o/../r'])assert.throws(()=>R.parseURL(value));
});
test('unknown history versions are preserved until an explicit clear, while storage failures leave prior metadata intact',async()=>{
 const f=fixture();f.data.set(R.KEY,{version:2,entries:[]});await assert.rejects(f.store.list(),/newer version/);await assert.rejects(f.store.record(remote()),/newer version/);assert.equal(f.data.get(R.KEY).version,2);await f.store.clear();assert.equal((await f.store.list()).length,0);
 const store=R.createStore({get:async()=>({}),set:async()=>{throw Error('quota');}});await assert.rejects(store.record(remote()),/quota/);
});
