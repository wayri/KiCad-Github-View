const test=require('node:test'),assert=require('node:assert/strict');
const {mount}=require('../work-board-panel.js');
class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.className='';this.text='';this.value='';this.hidden=false;this.disabled=false;}
 append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}setAttribute(k,v){this.attributes[k]=v;}removeAttribute(k){delete this[k];delete this.attributes[k];}
 set textContent(v){this.text=String(v);this.children=[];}get textContent(){return this.text+this.children.map(n=>n.textContent).join(' ');}
}
const walk=n=>[n,...n.children.flatMap(walk)];
function harness({provider='github',handler,onOpenThread=()=>{}}={}){
 const container=new Element('div'),document={createElement:tag=>new Element(tag)},calls=[];let scope={provider,repository:'owner/repo',ref:'a'.repeat(40),file:'board.kicad_pcb',...(provider==='gitlab'?{host:'https://gitlab.example.org'}:{})};
 const data={id:'board1',title:'Hardware',url:provider==='github'?'https://github.com/orgs/owner/projects/1':'https://gitlab.example.org/owner/repo/-/boards/1',fieldId:'status',columns:[{id:'todo',title:'Todo'},{id:'done',title:'Done'}],items:[{id:'item1',title:'Inspect U3',kind:'issue',number:12,repository:'owner/repo',columnId:'todo',assignees:['alice','bob']}]};
 if(provider==='gitlab'){data.id=7;data.columns=[{id:21,title:'Todo'},{id:22,title:'Done'},{id:'open',title:'Open'},{id:'closed',title:'Closed'}];data.items[0].id=12;data.items[0].columnId=21;}
 const request=async(type,payload)=>{calls.push({type,payload});if(provider==='gitlab'&&type!=='work-board-list'){assert.ok(Number.isSafeInteger(payload.boardId)&&payload.boardId>0);if(type==='work-board-move'){assert.ok(Number.isSafeInteger(payload.itemId)&&payload.itemId>0);for(const value of [payload.listId,payload.fromListId])assert.ok(['open','closed'].includes(value)||Number.isSafeInteger(value)&&value>0);}}if(handler)return handler(type,payload,data);if(type==='work-board-list')return{boards:[{id:data.id,title:data.title,url:data.url}]};if(type==='work-board-move'){data.items[0].columnId=payload.optionId??payload.listId;return{updated:true};}return data;};
 const api=mount({document,container,request,getScope:()=>scope,onOpenThread});return{api,calls,data,container,find:cls=>walk(container).find(n=>n.className===cls),all:cls=>walk(container).filter(n=>n.className===cls),setScope:value=>{scope={...scope,...value};}};
}
test('loads provider columns, opens issue context, and status selection only writes on Apply',async()=>{
 let opened;const h=harness({onOpenThread:v=>{opened=v;}});await h.api.ready;
 assert.deepEqual(h.calls.map(c=>c.type),['work-board-list','work-board-read']);assert.match(h.container.textContent,/@alice @bob/);
 h.find('work-board-card-title').onclick();assert.equal(opened.number,12);
 const select=h.find('work-board-target');select.value='done';select.onchange();assert.equal(h.calls.length,2);assert.equal(h.find('work-board-apply').disabled,false);
 await h.find('work-board-apply').onclick();const mutation=h.calls.find(c=>c.type==='work-board-move');assert.equal(mutation.payload.optionId,'done');assert.equal(mutation.payload.fieldId,'status');assert.equal(mutation.payload.confirmed,true);assert.equal(h.data.items[0].columnId,'done');
});
test('GitLab status changes use issue board list fields, keeping exact host scope',async()=>{
 const h=harness({provider:'gitlab'});await h.api.ready;const target=h.find('work-board-target');target.value='22';target.onchange();await h.find('work-board-apply').onclick();
 const payload=h.calls.find(c=>c.type==='work-board-move').payload;assert.equal(payload.boardId,7);assert.equal(payload.itemId,12);assert.equal(payload.listId,22);assert.equal(payload.fromListId,21);assert.equal(payload.host,'https://gitlab.example.org');assert.equal(payload.optionId,undefined);
});
test('GitHub always offers clearing Status and sends previous status for stale-write detection',async()=>{
 const h=harness();await h.api.ready;const target=h.find('work-board-target');assert.ok(target.children.some(n=>n.value===''));assert.equal(h.all('work-board-column').length,3);
 target.value='';target.onchange();await h.find('work-board-apply').onclick();const payload=h.calls.find(c=>c.type==='work-board-move').payload;
 assert.equal(payload.optionId,'');assert.equal(payload.expectedColumnId,'todo');assert.equal(h.data.items[0].columnId,'');
});
test('GitLab multiple label memberships render in every actual column and move only rendered membership',async()=>{
 const h=harness({provider:'gitlab'});h.data.items[0].columnIds=[21,22];h.data.items[0].updatedAt='2026-10-29T03:00:00.000Z';await h.api.ready;
 assert.equal(h.all('work-board-card').length,2);const targets=h.all('work-board-target');assert.equal(targets[0].value,'21');assert.equal(targets[1].value,'22');
 targets[1].value='21';targets[1].onchange();await h.all('work-board-apply')[1].onclick();const payload=h.calls.find(c=>c.type==='work-board-move').payload;
 assert.equal(payload.fromListId,22);assert.equal(payload.listId,21);assert.equal(payload.expectedUpdatedAt,'2026-10-29T03:00:00.000Z');
});
test('GitLab keeps open and closed list IDs and rejects malformed numeric IDs before requests',async()=>{
 const h=harness({provider:'gitlab'});h.data.items[0].id='12';await h.api.ready;
 let target=h.find('work-board-target');target.value='closed';target.onchange();await h.find('work-board-apply').onclick();
 let payload=h.calls.find(c=>c.type==='work-board-move').payload;assert.equal(payload.itemId,12);assert.equal(payload.listId,'closed');assert.equal(payload.fromListId,21);
 target=h.find('work-board-target');target.value='open';target.onchange();await h.find('work-board-apply').onclick();payload=h.calls.filter(c=>c.type==='work-board-move')[1].payload;assert.equal(payload.fromListId,'closed');assert.equal(payload.listId,'open');
 for(const invalid of ['21x','2e1','021','0','-2','9007199254740992']){target=h.find('work-board-target');target.value=invalid;target.onchange();await h.find('work-board-apply').onclick();}
 assert.equal(h.calls.filter(c=>c.type==='work-board-move').length,2);assert.match(h.container.textContent,/Invalid GitLab board identity/);
});
test('provider URL rejects foreign origins and script links; titles remain inert text',async()=>{
 const h=harness({handler:async(type,payload,data)=>type==='work-board-list'?{boards:[{id:data.id,title:'Board'}]}:{...data,url:'javascript:alert(1)',items:[{...data.items[0],title:'<img src=x onerror=bad()>'}]}});await h.api.ready;
 assert.equal(h.find('work-board-provider-link').hidden,true);assert.match(h.container.textContent,/<img src=x onerror=bad\(\)>/);assert.equal(walk(h.container).some(n=>n.tagName==='img'),false);
 h.data.url='https://evil.example/project';await h.api.refresh();assert.equal(h.find('work-board-provider-link').hidden,true);
});
test('partial data and permission failures remain visible without inventing columns',async()=>{
 const h=harness({handler:async(type,payload,data)=>type==='work-board-list'?{boards:[{id:data.id,title:'Board'}]}:{...data,hasMore:true,warnings:['Read-only access.']}});await h.api.ready;assert.match(h.find('work-board-status').textContent,/Partial board/);assert.match(h.find('work-board-status').textContent,/Read-only/);
 const denied=harness({handler:async()=>{throw Error('Projects permission required.');}});await denied.api.ready;assert.match(denied.container.textContent,/Projects permission required/);assert.equal(denied.all('work-board-column').length,0);
});
test('stale scopes cannot render, open tasks or submit changes; disposal discards pending reads',async()=>{
 let finish;const h=harness({handler:async(type,payload,data)=>type==='work-board-list'?{boards:[{id:data.id,title:'Board'}]}:new Promise(resolve=>{finish=()=>resolve(data);})});await new Promise(setImmediate);h.setScope({repository:'other/repo'});finish();await h.api.ready;assert.equal(h.all('work-board-card').length,0);
 const ready=harness();await ready.api.ready;const target=ready.find('work-board-target'),apply=ready.find('work-board-apply');target.value='done';target.onchange();ready.setScope({ref:'b'.repeat(40)});await apply.onclick();assert.equal(ready.calls.filter(c=>c.type==='work-board-move').length,0);
 ready.api.dispose();assert.equal(ready.container.children.length,0);assert.equal(await ready.api.refresh(),false);
});
