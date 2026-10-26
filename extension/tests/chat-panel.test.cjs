const test=require('node:test'),assert=require('node:assert/strict');
const {mount}=require('../chat-panel.js'),comments=require('../review-comments.js');
const walk=node=>[node,...node.children.flatMap(walk)];
function harness(overrides={}){
 const events=new Map();let doc;
 class Node{
  constructor(tag,text=''){this.tagName=tag?.toUpperCase();this.children=[];this.attributes={};this.style={};this._text=text;this.hidden=false;this.value='';this.disabled=false;this.scrollTop=0;this.scrollHeight=1000;this.clientHeight=200;}
  append(...items){for(const item of items){item.remove();item.parentElement=this;this.children.push(item);}}
  replaceChildren(...items){for(const item of this.children)item.parentElement=null;this.children=[];this._text='';this.append(...items);}
  remove(){if(this.parentElement){this.parentElement.children=this.parentElement.children.filter(child=>child!==this);this.parentElement=null;}}
  set textContent(text){this._text=String(text);this.replaceChildren();this._text=String(text);}get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
  setAttribute(name,value){this.attributes[name]=String(value);}getAttribute(name){return this.attributes[name];}
  removeAttribute(name){delete this.attributes[name];if(name==='src')delete this.src;}
  contains(other){return this===other||this.children.some(child=>child.contains(other));}
  focus(){doc.activeElement=this;}setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}
  set innerHTML(value){throw Error('Unsafe HTML assignment: '+value);}
 }
 doc={body:new Node('body'),createElement:tag=>new Node(tag),createTextNode:text=>new Node(undefined,text),addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
 const container=new Node('main');doc.body.append(container);const requests=[],confirmations=[],reads=[],saved=[],savedText=[],timers=[];let sequence=0;
 let scope={repository:'owner/board',ref:'a'.repeat(40),file:'board.kicad_pcb'};
 const host={crypto:{randomUUID:()=> 'mutation_'+String(++sequence).padStart(16,'0')},setTimeout:(fn,delay)=>{fn.delay=delay;timers.push(fn);return timers.length;},clearTimeout:id=>{timers[id-1]=null;},confirm:()=>true};
 const options={document:doc,host,container,provider:'github',repository:'owner/board',comments,getScope:()=>scope,
  request:async(type,payload)=>{requests.push({type,payload});return type==='comment-mention-users'?{users:[]}:{};},
  confirmSend:async value=>{confirmations.push(value);return true;},onRead:async(kind,number)=>reads.push({kind,number}),
  createAnnotation:(text,extra)=>comments.validateComment({id:extra.id,text,createdAt:'2026-10-27T05:00:00.000Z',severity:extra.severity,state:extra.state,anchor:{...scope,reference:'U3',uuid:'component-3',kind:'footprint'}}),
  onSaveDraft:async note=>saved.push(note),onSaveTextDraft:async draft=>savedText.push(draft),...overrides};
 const api=mount(options),find=className=>walk(container).find(node=>node.className?.split(' ').includes(className)),byId=id=>walk(container).find(node=>node.id===id);
 const type=text=>{const input=byId('chatMessageText');input.value=text;input.selectionStart=text.length;input.selectionEnd=text.length;input.oninput();return input;};
 return{api,doc,container,host,requests,confirmations,reads,saved,savedText,timers,events,find,byId,type,options,setScope:value=>{scope=value;},setRequest:fn=>{options.request=fn;}};
}
const thread=(number=1,extra={})=>({kind:'issue',number,title:'Review power stage',state:'open',id:String(number),author:'owner',body:'Root description',createdAt:'2026-10-27T04:00:00.000Z',updatedAt:'2026-10-27T04:00:00.000Z',comments:[{id:'12',author:'reviewer',body:'Check **U3**',createdAt:'2026-10-27T04:10:00.000Z',updatedAt:'2026-10-27T04:10:00.000Z',canReply:true,canEdit:false}],capabilities:{create:true,reply:true,edit:true,reactions:false},...extra});
const event=(key,extra={})=>({key,preventDefault(){this.prevented=true;},...extra});
test('only explicit Send/Ctrl+Enter and approved confirmation post; ordinary Enter keeps multiline input',async()=>{
 const h=harness();h.api.render(thread());const input=h.type('Hello <script>bad()</script>');
 const enter=event('Enter');input.onkeydown(enter);assert.equal(enter.prevented,undefined);assert.equal(h.requests.length,0);
 h.options.confirmSend=async()=>false;await h.find('chat-send').onclick();assert.equal(h.requests.length,0);assert.equal(input.value,'Hello <script>bad()</script>');
 h.options.confirmSend=async value=>{h.confirmations.push(value);return true;};await h.find('chat-send').onclick();
 assert.equal(h.requests.length,1);assert.equal(h.requests[0].type,'chat-message-write');assert.equal(h.requests[0].payload.action,'create');assert.equal(h.confirmations.length,1);assert.equal(input.value,'');assert.deepEqual(h.reads,[{kind:'issue',number:1}]);
 h.type('Second');const ctrl=event('Enter',{ctrlKey:true});input.onkeydown(ctrl);await new Promise(setImmediate);assert.equal(ctrl.prevented,true);assert.equal(h.requests.length,2);
});
test('uncertain retries reuse one mutation ID, while changed text receives a fresh one',async()=>{
 const h=harness();h.api.render(thread());h.type('A message');h.setRequest(async(type,payload)=>{h.requests.push({type,payload});throw Error('Unconfirmed network result.');});
 await h.find('chat-send').onclick();await h.find('chat-send').onclick();assert.equal(h.requests[0].payload.clientMutationId,h.requests[1].payload.clientMutationId);assert.equal(h.api.hasDraft(),true);
 h.type('Changed message');await h.find('chat-send').onclick();assert.notEqual(h.requests[1].payload.clientMutationId,h.requests[2].payload.clientMutationId);
});
test('thread switching preserves drafts and confirmation cannot send into a different conversation',async()=>{
 let decide;const h=harness({confirmSend:()=>new Promise(resolve=>{decide=resolve;})});h.api.render(thread(1));h.type('Draft one');const sending=h.find('chat-send').onclick();
 h.api.render(thread(2));h.type('Draft two');decide(true);await sending;assert.equal(h.requests.length,0);assert.equal(h.byId('chatMessageText').disabled,false);
 h.api.render(thread(1));assert.equal(h.byId('chatMessageText').value,'Draft one');h.api.render(thread(2));assert.equal(h.byId('chatMessageText').value,'Draft two');
});
test('ten dirty thread drafts are never silently evicted; Save all uses original source snapshots',async()=>{
 const h=harness();for(let n=1;n<=10;n++){assert.equal(h.api.render(thread(n)),true);h.type('Draft '+n);}
 assert.equal(h.api.render(thread(11)),false);assert.match(h.find('chat-status').textContent,/Ten conversations/);assert.equal(h.api.draft().thread.number,10);
 h.setScope({repository:'owner/board',ref:'a'.repeat(40),file:'other.kicad_sch'});assert.equal(await h.api.saveDraft(true),true);assert.equal(h.savedText.length,10);assert.ok(h.savedText.every(saved=>saved.scope.file==='board.kicad_pcb'));assert.equal(h.api.hasDraft(),false);
 assert.equal(h.api.render(thread(11)),true);h.type('Discard this');h.api.discard(true);assert.equal(h.api.hasDraft(),false);assert.equal(h.requests.length,0);
});
test('message markup is inert, reply targets are explicit and edit actions honor verified permissions',async()=>{
 const own={id:'13',author:'me',body:'My original',createdAt:'2026-10-27T04:20:00.000Z',updatedAt:'2026-10-27T04:20:00.000Z',canReply:true,canEdit:true};
 const h=harness();h.api.render(thread(1,{body:'<img src=x onerror=bad()>',comments:[thread().comments[0],own]}));assert.ok(walk(h.container).filter(n=>n.tagName==='IMG').every(n=>n.hidden&&!n.src));assert.match(h.container.textContent,/<img src=x/);
 assert.equal(walk(h.container).filter(n=>n.className==='chat-edit-action').length,1);h.find('chat-reply-action').onclick();h.type('A reply');await h.find('chat-send').onclick();assert.equal(h.requests[0].payload.replyTo,'12');assert.equal(h.requests[0].payload.action,'reply');
 h.find('chat-edit-action').onclick();assert.equal(h.byId('chatMessageText').value,'My original');h.type('Edited');await h.find('chat-send').onclick();assert.equal(h.requests[1].payload.messageId,'13');assert.equal(h.requests[1].payload.expectedUpdatedAt,own.updatedAt);
 h.api.render(thread(2,{capabilities:{create:false,reply:false,edit:false}}));h.type('No permission');await h.find('chat-send').onclick();assert.equal(h.requests.length,2);assert.equal(h.byId('chatMessageText').disabled,true);
});
test('stale edits are retained without a write; source-bound context is not silently reanchored',async()=>{
 const own={...thread().comments[0],canEdit:true};const h=harness();h.api.render(thread(1,{comments:[own]}));h.find('chat-edit-action').onclick();h.type('My update');h.api.render(thread(1,{comments:[{...own,updatedAt:'2026-10-27T04:11:00.000Z'}]}));await h.find('chat-send').onclick();assert.equal(h.requests.length,0);assert.match(h.find('chat-status').textContent,/message changed/);assert.equal(h.byId('chatMessageText').value,'My update');
 h.api.discard();h.type('Drawing note');await h.find('chat-attach-context').onclick();const anchor=h.api.draft().annotation.anchor;
 h.setScope({repository:'owner/board',ref:'a'.repeat(40),file:'other.kicad_sch'});await h.find('chat-send').onclick();assert.equal(h.requests.length,0);assert.deepEqual(h.api.draft().annotation.anchor,anchor);assert.match(h.find('chat-status').textContent,/Source changed/);
});
test('attached note ID and text exactly match the confirmed write and local Save does not post',async()=>{
 const h=harness();h.api.render(thread());h.type('Review U3');await h.find('chat-attach-context').onclick();h.type('Review U3 decoupling @alice');await h.find('chat-send').onclick();const payload=h.requests[0].payload;
 assert.equal(payload.annotation.id,payload.clientMutationId);assert.equal(payload.annotation.text,payload.body);assert.equal(payload.annotation.threadType,'issue');assert.deepEqual(payload.annotation.mentions,['alice']);
 h.type('Save offline');await h.find('chat-attach-context').onclick();assert.equal(await h.api.saveDraft(),true);assert.equal(h.saved.length,1);assert.equal(h.requests.length,1);assert.equal(h.api.hasDraft(),false);
});
test('mention lookups ignore stale responses and insert only the chosen username',async()=>{
 let release;const h=harness();h.api.render(thread());h.setRequest((type,payload)=>{h.requests.push({type,payload});return new Promise(resolve=>{release=resolve;});});
 h.type('Hi @al');const pending=h.timers.at(-1)();h.type('Hi @bo');release({users:[{login:'alice'}]});await pending;assert.equal(h.find('chat-mention-suggestions').hidden,true);
 const next=h.timers.at(-1)();release({users:[{login:'bob'}]});await next;const suggestions=h.find('chat-mention-suggestions');assert.equal(suggestions.hidden,false);suggestions.children[0].onclick();assert.equal(h.byId('chatMessageText').value,'Hi @bob ');assert.equal(h.requests.every(r=>r.type==='comment-mention-users'),true);
});
test('paste normalizes a screenshot once and retains its original drawing context',async()=>{
 let finish;const h=harness();h.host.KiCadCommentCompose={normalizeCapture:()=>new Promise(resolve=>{finish=resolve;})};h.api.render(thread());h.type('Screenshot');
 const paste={clipboardData:{items:[{kind:'file',type:'image/png',getAsFile:()=>({type:'image/png'})}]},preventDefault(){this.prevented=true;}};
 const pending=h.byId('chatMessageText').onpaste(paste);await new Promise(setImmediate);h.setScope({repository:'owner/board',ref:'a'.repeat(40),file:'other.kicad_sch'});finish({mime:'image/png',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAAA',width:10,height:10});await pending;
 assert.equal(paste.prevented,true);assert.equal(h.api.draft().capture.width,10);assert.equal(h.api.draft().annotation.anchor.file,'board.kicad_pcb');assert.equal(h.requests.length,0);
 assert.equal(h.byId('chatCapturePreview').hidden,false);assert.match(h.byId('chatCapturePreview').src,/^data:image\/png;base64,/);h.find('chat-remove-capture').onclick();assert.equal(h.api.draft().capture,null);assert.equal(h.byId('chatCapturePreview').src,undefined);assert.equal(h.api.draft().annotation.anchor.file,'board.kicad_pcb');
});
test('pending or discarded screenshot work cannot post early or reappear in a new draft',async()=>{
 let finish;const h=harness();h.host.KiCadCommentCompose={normalizeCapture:()=>new Promise(resolve=>{finish=resolve;})};h.api.render(thread());h.type('Wait for image');
 const pending=h.byId('chatMessageText').onpaste({clipboardData:{items:[{kind:'file',type:'image/png',getAsFile:()=>({type:'image/png'})}]},preventDefault(){}});await new Promise(setImmediate);
 assert.equal(h.find('chat-send').disabled,true);await h.find('chat-send').onclick();assert.equal(h.requests.length,0);assert.match(h.find('chat-status').textContent,/screenshot to finish/);
 h.api.discard();finish({mime:'image/png',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAAA',width:10,height:10});await pending;assert.equal(h.api.draft().capture,null);assert.equal(h.api.hasDraft(),false);
});
test('source cards link to their validated saved revision even when Locate refuses it',()=>{
 const h=harness({onLocate:()=>false}),note=comments.validateComment({id:'source-note',text:'Source note',createdAt:'2026-10-27T04:00:00.000Z',anchor:{repository:'owner/board',ref:'b'.repeat(40),file:'design/power.kicad_sch',reference:'U3'}});
 h.api.render(thread(1,{body:comments.toMarkdown(note)}));const link=h.find('chat-source-link');assert.equal(link.href,'https://github.com/owner/board/blob/'+('b'.repeat(40))+'/design/power.kicad_sch');assert.equal(link.rel,'noopener noreferrer');h.find('chat-locate').onclick();assert.match(h.find('chat-status').textContent,/another drawing or revision/);
});
test('cancelling an edit restores its previous draft and UTF-8 size bounds are enforced before confirmation',async()=>{
 const h=harness();h.api.render(thread(1,{comments:[{...thread().comments[0],canEdit:true}]}));h.type('Existing unsent draft');h.find('chat-edit-action').onclick();h.type('Edit content');h.find('chat-cancel-target').onclick();assert.equal(h.byId('chatMessageText').value,'Existing unsent draft');
 h.type('😀'.repeat(16000));await h.find('chat-send').onclick();assert.equal(h.requests.length,0);assert.match(h.find('chat-status').textContent,/60,000 UTF-8 bytes/);
});
test('new messages preserve reading position and offer Jump latest rather than forcing scroll',()=>{
 const h=harness();h.api.render(thread());const list=h.find('chat-messages');list.scrollTop=0;h.api.render(thread(1,{comments:[...thread().comments,{...thread().comments[0],id:'99',body:'New message'}]}));
 assert.equal(list.scrollTop,0);assert.equal(h.find('chat-jump-latest').hidden,false);assert.match(h.find('chat-jump-latest').textContent,/1 new message/);h.find('chat-jump-latest').onclick();assert.equal(list.scrollTop,list.scrollHeight);assert.equal(h.find('chat-jump-latest').hidden,true);
});
const latestTimer=h=>h.timers.findLast(fn=>!!fn);
const tick=h=>{const at=h.timers.findLastIndex(fn=>!!fn),fn=h.timers[at];assert.ok(fn,'a timer is scheduled');h.timers[at]=null;return fn();};
test('automatic refresh is opt-in, visible-only and preserves drafts and reading position',async()=>{
 const h=harness();h.api.render(thread());h.type('Unsent message');const list=h.find('chat-messages');list.scrollTop=0;
 assert.equal(h.byId('chatAutoRefresh').checked,false);assert.equal(latestTimer(h),undefined);
 h.byId('chatAutoRefresh').checked=true;h.byId('chatAutoRefresh').onchange();assert.equal(latestTimer(h).delay,60000);
 h.options.onRead=async()=>{h.reads.push({number:1});h.api.render(thread(1,{comments:[...thread().comments,{...thread().comments[0],id:'new',body:'New automatic read'}]}));};
 await tick(h);assert.equal(h.reads.length,1);assert.equal(h.byId('chatMessageText').value,'Unsent message');assert.equal(list.scrollTop,0);assert.equal(h.find('chat-jump-latest').hidden,false);assert.equal(latestTimer(h).delay,60000);
 h.container.hidden=true;await tick(h);assert.equal(h.reads.length,1,'hidden catalog does not poll');
 h.container.hidden=false;h.doc.body.hidden=true;await tick(h);assert.equal(h.reads.length,1,'hidden ancestors pause polling');h.doc.body.hidden=false;
 h.container.checkVisibility=()=>false;await tick(h);assert.equal(h.reads.length,1,'CSS-hidden conversation does not poll');h.container.checkVisibility=()=>true;
 h.doc.hidden=true;h.events.get('visibilitychange')();assert.equal(latestTimer(h),undefined);h.doc.hidden=false;h.events.get('visibilitychange')();assert.equal(latestTimer(h).delay,60000);
 await tick(h);assert.equal(h.reads.length,2);
 h.byId('chatAutoRefresh').checked=false;h.byId('chatAutoRefresh').onchange();assert.equal(latestTimer(h),undefined);
});
test('manual and automatic refresh do not overlap, and failures back off to five minutes',async()=>{
 let finish;const h=harness();h.api.render(thread());h.options.onRead=()=>{h.reads.push({number:1});return new Promise(resolve=>{finish=resolve;});};
 h.byId('chatAutoRefresh').checked=true;h.byId('chatAutoRefresh').onchange();const polling=tick(h);await new Promise(setImmediate);const manual=h.find('chat-refresh').onclick();assert.equal(h.reads.length,1);assert.equal(latestTimer(h),undefined);
 finish(false);await polling;await manual;assert.equal(latestTimer(h).delay,120000);assert.match(h.find('chat-status').textContent,/could not be refreshed/);
 h.options.onRead=async()=>false;await tick(h);assert.equal(latestTimer(h).delay,240000);await tick(h);assert.equal(latestTimer(h).delay,300000);await tick(h);assert.equal(latestTimer(h).delay,300000);
 h.options.onRead=async()=>true;await tick(h);assert.equal(latestTimer(h).delay,60000,'successful read resets backoff');
 h.api.dispose();assert.equal(latestTimer(h),undefined);assert.equal(h.events.has('visibilitychange'),false);
});
test('disabling automatic refresh during a pending read prevents further polling',async()=>{
 let finish;const h=harness();h.api.render(thread());h.options.onRead=()=>new Promise(resolve=>{finish=resolve;});h.byId('chatAutoRefresh').checked=true;h.byId('chatAutoRefresh').onchange();const pending=tick(h);await new Promise(setImmediate);
 h.byId('chatAutoRefresh').checked=false;h.byId('chatAutoRefresh').onchange();finish(true);await pending;assert.equal(latestTimer(h),undefined);
});
test('an old failed refresh cannot overwrite a newly enabled polling schedule',async()=>{
 let finish;const h=harness();h.api.render(thread());h.options.onRead=()=>new Promise(resolve=>{finish=resolve;});const checkbox=h.byId('chatAutoRefresh');checkbox.checked=true;checkbox.onchange();const pending=tick(h);await new Promise(setImmediate);
 checkbox.checked=false;checkbox.onchange();checkbox.checked=true;checkbox.onchange();const restarted=latestTimer(h);finish(false);await pending;assert.equal(latestTimer(h),restarted);assert.equal(latestTimer(h).delay,60000);
});
test('compact chat shows only its header icons and +/Send strip until tools are requested',()=>{
 let back=0,settings=0,close=0;const h=harness({onBack:()=>back++,onSettings:()=>settings++,onClose:()=>close++,onAccount:()=>{}});h.api.render(thread());
 assert.equal(h.byId('chatMessageText').rows,2);assert.equal(h.find('chat-search').hidden,true);assert.equal(h.find('chat-options-menu').hidden,true);assert.equal(h.find('chat-composer-options').hidden,true);
 assert.deepEqual(h.find('chat-compose-actions').children.map(node=>node.className),['chat-attachment-toggle','chat-send']);
 assert.equal(h.find('chat-refresh').parentElement,h.find('chat-options-menu'));assert.equal(h.find('chat-account').parentElement,h.find('chat-options-menu'));assert.equal(h.byId('chatAutoRefresh').parentElement.parentElement,h.find('chat-options-menu'));
 assert.equal(h.find('chat-save-draft').parentElement,h.find('chat-composer-options'));assert.equal(h.find('chat-attach-context').parentElement.parentElement,h.find('chat-composer-options'));
 assert.equal(h.find('chat-back').textContent,'‹');assert.equal(h.find('chat-back').getAttribute('aria-label'),'Conversations');assert.equal(h.find('chat-close').getAttribute('aria-label'),'Close conversation pane');
 h.find('chat-back').onclick();h.find('chat-close').onclick();assert.equal(back,1);assert.equal(close,1);
 h.find('chat-options-toggle').onclick();assert.equal(h.find('chat-options-menu').hidden,false);h.find('chat-settings').onclick();assert.equal(settings,1);assert.equal(h.find('chat-options-menu').hidden,true);
});
test('tool popovers dismiss outside or Escape, search resets on close, and closing options does not stop enabled polling',()=>{
 const h=harness();h.api.render(thread());h.find('chat-options-toggle').onclick();h.byId('chatAutoRefresh').checked=true;h.byId('chatAutoRefresh').onchange();const polling=latestTimer(h);
 h.events.get('pointerdown')({target:h.doc.body});assert.equal(h.find('chat-options-menu').hidden,true);assert.equal(latestTimer(h),polling);
 h.find('chat-attachment-toggle').onclick();assert.equal(h.find('chat-composer-options').hidden,false);assert.equal(h.find('chat-attachment-toggle').getAttribute('aria-expanded'),'true');h.find('chat-options-toggle').onclick();assert.equal(h.find('chat-composer-options').hidden,true);
 const escape=event('Escape');h.events.get('keydown')(escape);assert.equal(escape.prevented,true);assert.equal(h.find('chat-options-menu').hidden,true);
 h.find('chat-search-toggle').onclick();assert.equal(h.find('chat-search').hidden,false);h.find('chat-search').value='no match';h.find('chat-search').oninput();assert.ok(h.find('chat-empty'));
 h.find('chat-search-toggle').onclick();assert.equal(h.find('chat-search').hidden,true);assert.equal(h.find('chat-search').value,'');assert.equal(h.find('chat-empty'),undefined);
 h.find('chat-attachment-toggle').onclick();assert.equal(h.api.closeMenus(),true);assert.equal(h.api.closeMenus(),false);
});
test('message safety actions live in accessible collapsed disclosures and close outside or on Escape',()=>{
 const h=harness({safetyActions:()=>{const actions=h.doc.createElement('div'),report=h.doc.createElement('button');report.textContent='Report user';actions.append(report);return actions;}});h.api.render(thread());
 assert.equal(h.find('chat-messages').tabIndex,0);const menus=walk(h.container).filter(node=>node.className==='chat-message-more');assert.equal(menus.length,2);assert.ok(menus.every(menu=>menu.open===false));assert.equal(menus[0].children[0].getAttribute('aria-label'),'Message options');
 const first=menus[0],second=menus[1];first.children[0].onclick(event('click'));assert.equal(first.open,true);second.children[0].onclick(event('click'));assert.equal(first.open,false);assert.equal(second.open,true);
 h.events.get('pointerdown')({target:h.doc.body});assert.equal(second.open,false);second.children[0].onclick(event('click'));const escape=event('Escape');h.events.get('keydown')(escape);assert.equal(second.open,false);assert.equal(escape.prevented,true);
 first.children[0].onclick(event('click'));assert.equal(h.api.closeMenus(),true);assert.equal(first.open,false);assert.ok(h.find('chat-reply-action'),'Reply remains available outside the safety menu');
});
