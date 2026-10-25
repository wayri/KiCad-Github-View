const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function ui(){
 const nodes=new Map(),handlers=new Map(),requests=[],timers=new Map();let timerId=0;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='githubScope'?'public':'',hidden:false,disabled:false,dataset:{},textContent:'',children:[],addEventListener(){},setAttribute(name,value){this[name]=value;},replaceChildren(){this.children=[];},append(...children){this.children.push(...children);},removeAttribute(){},showModal(){this.open=true;},close(){this.open=false;}});return nodes.get(id);};
 const context={CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},dispatchEvent:event=>handlers.get(event.type)?.(event),console,URL,Map,Set,Error,Number,JSON,localStorage:{getItem:()=>null,setItem(){}},document:{getElementById:node,createElement:()=>({setAttribute(){},append(){}})},setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),addEventListener:(name,fn)=>handlers.set(name,fn),AndroidKiCad:{githubRequest:(id,message)=>requests.push({id,...message})}};
 vm.runInNewContext(fs.readFileSync('android-app/web/github.js','utf8'),context);
 const reply=(type,value)=>{const req=requests.filter(r=>r.action===type).at(-1);assert.ok(req,type);context.KiCadAndroidGitHub.reply(req.id,{ok:true,result:value});};
 return {node,context,requests,reply,event:(name,detail)=>handlers.get(name)?.({detail})};
}
const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
test('sign-in launches authorization automatically and native completion updates buttons and account immediately',async()=>{
 const u=ui();u.reply('auth-status',{connected:false});await flush();const starting=u.node('githubSignIn').onclick();u.reply('device-start',{userCode:'ABCD-1234',interval:5});await starting;
 assert.equal(u.node('githubDevice').hidden,false);assert.equal(u.node('githubSignIn').disabled,true);assert.equal(u.node('githubCode').textContent,'ABCD-1234');assert.equal(u.requests.at(-1).action,'open-verification');assert.ok(!u.requests.some(r=>r.action==='device-poll'));
 u.event('kicad-github-auth-changed',{connected:true,login:'alice',pending:false});assert.equal(u.node('githubDevice').hidden,true);assert.equal(u.node('githubSignIn').textContent,'Sign out');assert.equal(u.node('githubSignIn')['aria-label'],'Sign out');assert.equal(u.node('githubSignIn').disabled,false);assert.equal(u.node('githubButton').dataset.connected,'true');assert.match(u.node('githubAccount').textContent,/alice/);assert.equal(u.node('githubBrowse').disabled,false);
});
test('return check recovers pending sign-in and stale status cannot overwrite connected state',async()=>{
 const u=ui();u.reply('auth-status',{connected:false,pending:true,userCode:'RESTORED'});await flush();assert.equal(u.node('githubCode').textContent,'RESTORED');assert.equal(u.node('githubDevice').hidden,false);
 u.event('kicad-android-resumed');assert.equal(u.requests.at(-1).action,'auth-status');u.event('kicad-github-auth-changed',{connected:true,login:'alice'});u.reply('auth-status',{connected:false});await flush();assert.equal(u.node('githubSignIn').textContent,'Sign out');assert.equal(u.node('githubSignIn')['aria-label'],'Sign out');assert.equal(u.node('githubDevice').hidden,true);
});
test('cancel releases scope controls and transient polling errors keep pending sign-in recoverable',async()=>{
 const u=ui();u.reply('auth-status',{connected:false,pending:true,userCode:'RESTORED'});await flush();u.event('kicad-github-auth-changed',{pending:true,error:'Connection timed out'});assert.equal(u.node('githubSignIn').disabled,true);assert.equal(u.node('githubDevice').hidden,false);
 u.node('githubCancelSignIn').onclick();assert.equal(u.node('githubSignIn').disabled,false);assert.equal(u.node('githubScope').disabled,false);assert.equal(u.requests.at(-1).action,'device-cancel');assert.equal(u.node('githubDevice').hidden,true);
});
test('native completion without profile information still shows signed in; expiration offers restart',async()=>{
 const u=ui();u.reply('auth-status',{connected:false,pending:true});await flush();u.event('kicad-github-auth-changed',{pending:false,error:'GitHub sign-in expired. Start again.'});assert.equal(u.node('githubSignIn').disabled,false);assert.equal(u.node('githubDevice').hidden,true);
 u.event('kicad-github-auth-changed',{connected:true,warning:'Signed in; account details could not be refreshed.'});assert.equal(u.node('githubSignIn').textContent,'Sign out');assert.equal(u.node('githubSignIn')['aria-label'],'Sign out');assert.equal(u.node('githubAccount').textContent,'Signed in to GitHub');assert.match(u.node('githubStatus').textContent,/Signed in/);
});


test('connected account can choose access without signing out until explicit reconnect',async()=>{
 const u=ui();u.reply('auth-status',{connected:true,login:'alice'});await flush();
 assert.equal(u.node('githubScope').disabled,false);assert.equal(u.node('githubReconnect').hidden,false);
 u.node('githubScope').value='private';u.node('githubScope').onchange();
 assert.equal(u.node('githubSignIn').textContent,'Sign out');assert.ok(!u.requests.some(r=>r.action==='device-start'||r.action==='sign-out'));
 const task=u.node('githubReconnect').onclick();assert.equal(u.requests.at(-1).scope,'private');u.reply('device-start',{userCode:'NEW-CODE'});await task;
 assert.equal(u.node('githubDevice').hidden,false);
});
test('cancellation during device-start ignores late replies and releases loading controls',async()=>{
 const u=ui();u.reply('auth-status',{connected:false});await flush();const task=u.node('githubSignIn').onclick();
 assert.equal(u.node('githubScope').disabled,false);u.node('githubCancelSignIn').onclick();await task;
 u.reply('device-start',{userCode:'STALE'});await flush();
 assert.equal(u.node('githubDevice').hidden,true);assert.equal(u.node('githubSignIn').disabled,false);assert.equal(u.node('githubStatus').textContent,'Sign-in cancelled.');
 assert.ok(!u.requests.some(r=>r.action==='open-verification'));
});
test('changing scope or closing sign-in cancels pending authorization',async()=>{
 for(const control of ['scope','close']){const u=ui();u.reply('auth-status',{connected:false,pending:true,userCode:'OLD'});await flush();
 if(control==='scope')u.node('githubScope').onchange();else u.node('githubClose').onclick();
 assert.equal(u.requests.at(-1).action,'device-cancel');assert.equal(u.node('githubDevice').hidden,true);assert.equal(u.node('githubSignIn').disabled,false);}
});
