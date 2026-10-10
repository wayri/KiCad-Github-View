const test=require('node:test'),assert=require('node:assert/strict');
const {repositories,safeUrl,filter}=require('../../android-app/web/github-notifications.js');
const vm=require('node:vm'),fs=require('node:fs');
function inbox(){
 const nodes=[],events=new Map(),requests=[];
 function make(tag){const n={tag,children:[],dataset:{},value:'',isConnected:false,textContent:'',append(...items){this.children.push(...items);items.forEach(x=>{x.isConnected=this.isConnected;});if(tag==='select'&&!this.value)this.value=items[0]?.value||'';},insertBefore(item){this.append(item);},setAttribute(k,v){this[k]=v;},replaceChildren(...items){this.children=items;},showModal(){this.open=true;},close(){this.open=false;}};nodes.push(n);return n;}
 const body=make('body');body.isConnected=true;const menu=make('section');menu.isConnected=true;
 const context={URL,Date,Set,Map,console,localStorage:{getItem:()=>JSON.stringify([{repository:'owner/board',ref:''}])},document:{body,createElement:make,getElementById:id=>nodes.find(n=>n.id===id),querySelector:()=>menu,querySelectorAll:()=>nodes.filter(n=>n.tag==='dialog'&&n.open)},MutationObserver:class{observe(){}},addEventListener:(name,fn)=>events.set(name,fn),KiCadAndroidGitHubCore:require('../../android-app/web/github.js'),KiCadAndroidGitHub:{request:async request=>{requests.push(request);return request.type==='auth-status'?{connected:true,login:'alice'}:{notifications:[{id:'1',repository:'owner/board',title:'Review schematic',type:'Issue',reason:'mention',unread:true,updatedAt:'2026-10-10T10:00:00Z',url:'https://github.com/owner/board/issues/1'}],hasMore:false};}}};
 vm.runInNewContext(fs.readFileSync('android-app/web/github-notifications.js','utf8'),context);
 return{nodes,events,requests,button:()=>nodes.find(n=>n.id==='githubNotificationsButton'),status:()=>nodes.find(n=>n.role==='status'),list:()=>nodes.find(n=>n.className==='github-notification-list')};
}
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
test('foreground inbox uses native account status, fetches saved repositories and clears on disconnect',async()=>{
 const u=inbox();u.button().onclick();await flush();
 assert.equal(u.requests[0].type,'auth-status');assert.equal(u.requests[1].type,'notifications');assert.deepEqual(Array.from(u.requests[1].repositories),['owner/board']);
 assert.equal(u.list().children[0].children[0].textContent,'Review schematic');assert.match(u.button().textContent,/1/);
 u.events.get('kicad-github-account-state')({detail:{connected:false}});assert.equal(u.list().children.some(n=>n.className==='github-notification'),false);assert.doesNotMatch(u.button().textContent,/1/);
});
test('notification repositories include GitHub bookmarks and current projects only',()=>{
 assert.deepEqual(repositories([{repository:'Owner/Board'},{repository:'../invalid'}],[{provider:'github',repository:'owner/board'},{provider:'gitlab',repository:'other/design'}],{github:{repository:'next/pcb'}}),['owner/board','next/pcb']);
 assert.equal(repositories(Array.from({length:110},(_,i)=>({repository:'owner/board'+i})),[],null).length,100);
});
test('notification destinations reject untrusted origins and unrelated repositories',()=>{
 assert.equal(safeUrl('https://github.com/Owner/Board/issues/1','owner/board'),'https://github.com/Owner/Board/issues/1');
 for(const url of ['https://github.com.evil.test/owner/board/issues/1','https://user:pass@github.com/owner/board/issues/1','javascript:alert(1)','https://github.com/owner/board-other/issues/1','https://github.com/owner/board/../other/issues/1'])assert.equal(safeUrl(url,'owner/board'),null);
});
test('inbox filtering separates unread and personal requests without unrelated projects',()=>{
 const row=(id,reason,unread,repository='owner/board')=>({id,reason,unread,repository,url:'https://github.com/'+repository+'/issues/'+id});
 const rows=[row(1,'mention',true),row(2,'subscribed',false),row(3,'review_requested',false),row(4,'mention',true,'other/project')];
 assert.deepEqual(filter(rows,['owner/board'],'mentions').map(x=>x.id),[1,3]);
 assert.deepEqual(filter(rows,['owner/board'],'unread').map(x=>x.id),[1]);
 assert.deepEqual(filter(rows,['owner/board'],'all').map(x=>x.id),[1,2,3]);
});
