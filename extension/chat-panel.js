/* Provider chat UI. Host callbacks own authorization, confirmation and source access. */
((root)=>{'use strict';
 const contentApi=typeof module==='object'&&module.exports?require('./chat-content.js'):root.KiCadChatContent;
 const composeApi=typeof module==='object'&&module.exports?require('./comment-compose.js'):root.KiCadCommentCompose;
 function mount(options){
  const d=options.document||root.document,h=options.host||root,container=options.container,comments=options.comments||root.KiCadReviewComments;
  if(!d||!container||typeof options.request!=='function')throw Error('Chat host is unavailable.');
  const make=(tag,className,text)=>{const n=d.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
  const button=(label,action,className)=>{const n=make('button',className,label);n.type='button';n.onclick=action;return n;};
  const append=(parent,...children)=>{parent.append(...children);return parent;};
  const shell=make('section','chat-panel'),header=make('header','chat-header'),heading=make('div','chat-heading'),title=make('h2','','Conversation'),meta=make('p','chat-thread-meta');
  const back=button('‹',()=>options.onBack?.(),'chat-back'),refresh=button('Refresh',()=>{closeOptions();return readCurrent();},'chat-refresh'),account=button('Account',()=>{closeOptions();options.onAccount?.();},'chat-account');back.hidden=!options.onBack;
  const searchToggle=button('⌕',()=>toggleSearch(),'chat-search-toggle'),optionsToggle=button('⋯',()=>setOptions(optionsMenu.hidden),'chat-options-toggle'),close=button('×',()=>options.onClose?.(),'chat-close');close.hidden=!options.onClose;
  for(const [node,label]of [[back,'Conversations'],[searchToggle,'Search messages'],[optionsToggle,'Conversation options'],[close,'Close conversation pane']]){node.title=label;node.setAttribute('aria-label',label);}
  const optionsMenu=make('section','chat-options-menu');optionsMenu.id='chatConversationOptions';optionsMenu.hidden=true;optionsMenu.setAttribute('role','region');optionsMenu.setAttribute('aria-label','Conversation options');optionsToggle.setAttribute('aria-controls',optionsMenu.id);optionsToggle.setAttribute('aria-expanded','false');
  const threadState=button('Close issue',()=>changeThreadState(),'chat-thread-state');threadState.hidden=true;
  const settings=button('Filters & dates',()=>{closeOptions();options.onSettings?.();},'chat-settings');settings.hidden=!options.onSettings;
  const pin=button('Pin pane',()=>{if(pin.hidden)return;options.onPin();syncPin();closeOptions();},'chat-pin');pin.hidden=typeof options.onPin!=='function'||typeof options.isPinned!=='function';
  function syncPin(){if(!pin.hidden){const pinned=!!options.isPinned();pin.textContent=pinned?'Unpin pane':'Pin pane';pin.setAttribute('aria-pressed',String(pinned));}}
  append(heading,title);append(header,back,heading,optionsToggle);
  const find=make('input','chat-search');find.id='chatMessageSearch';find.type='search';find.placeholder='Search messages';find.hidden=true;find.setAttribute('aria-label','Search conversation messages');searchToggle.setAttribute('aria-controls',find.id);searchToggle.setAttribute('aria-expanded','false');
  const autoLabel=make('label','chat-auto-refresh'),autoRefresh=make('input');autoRefresh.id='chatAutoRefresh';autoRefresh.type='checkbox';autoRefresh.checked=false;append(autoLabel,autoRefresh,make('span','','Refresh automatically'));
  const list=make('div','chat-messages');list.tabIndex=0;list.setAttribute('role','log');list.setAttribute('aria-label','Conversation messages');list.setAttribute('aria-live','polite');
  const jump=button('Jump to latest',()=>{list.scrollTop=list.scrollHeight;newCount=0;updateJump();},'chat-jump-latest');jump.hidden=true;
  const composer=make('section','chat-composer'),target=make('div','chat-compose-target'),targetCopy=make('span'),cancelTarget=button('Cancel',()=>resetTarget(),'chat-cancel-target');target.hidden=true;append(target,targetCopy,cancelTarget);
  const input=make('textarea');input.id='chatMessageText';input.rows=2;input.maxLength=60000;input.placeholder='Write a message…';input.setAttribute('aria-label','Message');
  const mentionList=make('div','chat-mention-suggestions');mentionList.id='chatMentionSuggestions';mentionList.hidden=true;mentionList.setAttribute('role','listbox');input.setAttribute('aria-controls',mentionList.id);input.setAttribute('aria-expanded','false');
  const mentionSource=make('select','chat-mention-source');mentionSource.setAttribute('aria-label','Mention suggestions from');
  for(const [value,label]of [['repository','Project contributors'],['users','All users']]){const n=make('option','',label);n.value=value;mentionSource.append(n);}mentionSource.value='repository';
  const contextRow=make('div','chat-context-tools'),attach=button('Attach drawing context',()=>attachContext(),'chat-attach-context'),remove=button('Remove context',()=>{const state=currentDraft();state.annotation=null;state.capture=null;state.capturePending=false;state.captureTicket=(state.captureTicket||0)+1;changed();syncComposer();},'chat-remove-context');
  const severity=make('select'),stateSelect=make('select');severity.setAttribute('aria-label','Annotation severity');stateSelect.setAttribute('aria-label','Annotation state');
  for(const value of ['info','minor','major','critical']){const n=make('option','',value);n.value=value;severity.append(n);}for(const value of ['open','skipped','resolved','wont-fix']){const n=make('option','',value);n.value=value;stateSelect.append(n);}
  severity.value='info';stateSelect.value='open';
  const contextHint=make('p','chat-context-summary'),captureHint=make('p','chat-capture-summary');
  const capturePreview=make('img','chat-capture-preview');capturePreview.id='chatCapturePreview';capturePreview.alt='Pasted drawing screenshot';capturePreview.hidden=true;capturePreview.style.maxWidth='56px';capturePreview.style.maxHeight='40px';capturePreview.style.objectFit='contain';
  const removeCapture=button('Remove screenshot',()=>{const state=currentDraft();state.capture=null;state.capturePending=false;state.captureTicket=(state.captureTicket||0)+1;changed();syncComposer();},'chat-remove-capture');removeCapture.hidden=true;
  append(contextRow,attach,remove,severity,stateSelect);
  const actions=make('div','chat-compose-actions'),save=button('Save local draft',()=>saveDraft(),'chat-save-draft'),send=button('Send',()=>sendMessage(),'chat-send'),status=make('p','chat-status');status.setAttribute('role','status');
  const attachmentToggle=button('+',()=>setComposerOptions(composerOptions.hidden),'chat-attachment-toggle');attachmentToggle.title='Message options and attachments';attachmentToggle.setAttribute('aria-label','Message options and attachments');attachmentToggle.setAttribute('aria-controls','chatComposerOptions');attachmentToggle.setAttribute('aria-expanded','false');
  const formatToggle=button('Aa',()=>{formatTools.hidden=!formatTools.hidden;formatToggle.setAttribute('aria-expanded',String(!formatTools.hidden));closeMenus();input.focus();},'chat-format-toggle');formatToggle.title='Formatting';formatToggle.setAttribute('aria-label','Formatting');formatToggle.setAttribute('aria-expanded','false');formatToggle.setAttribute('aria-controls','chatFormatting');
  const formatTools=make('div','chat-format-tools');formatTools.id='chatFormatting';formatTools.hidden=true;formatTools.setAttribute('role','toolbar');formatTools.setAttribute('aria-label','Message formatting');
  for(const [label,name,prefix,suffix]of [['B','Bold','**','**'],['I','Italic','_','_'],['</>','Code','`','`'],['≡','Bulleted list','- ','']]){const tool=button(label,()=>{if(input.disabled)return;const start=input.selectionStart??input.value.length,end=input.selectionEnd??start,selected=input.value.slice(start,end)||'text';input.value=input.value.slice(0,start)+prefix+selected+suffix+input.value.slice(end);input.setSelectionRange?.(start+prefix.length,start+prefix.length+selected.length);changed();input.focus();},'chat-format-tool');tool.title=name;tool.setAttribute('aria-label',name);tool.onpointerdown=event=>event.preventDefault();formatTools.append(tool);}
  const composerOptions=make('section','chat-composer-options');composerOptions.id='chatComposerOptions';composerOptions.hidden=true;composerOptions.setAttribute('role','region');composerOptions.setAttribute('aria-label','Message options and attachments');append(composerOptions,contextRow,mentionSource,save);
  const captureStrip=make('div','chat-capture-strip');append(captureStrip,capturePreview,captureHint,removeCapture);captureStrip.hidden=true;
  searchToggle.textContent='Search messages';close.textContent='Close conversation';append(optionsMenu,meta,threadState,searchToggle,refresh,settings,account,autoLabel,pin,close);append(actions,attachmentToggle,formatToggle,send);append(composer,target,contextHint,formatTools,input,mentionList,captureStrip,composerOptions,actions,status);append(shell,header,find,optionsMenu,list,jump,composer);container.replaceChildren(shell);
  const drafts=new Map(),seen=new Map(),messageMenus=new Set();let thread=null,key=null,filters={},disposed=false,sending=false,saving=false,stateChanging=false,readTicket=0,readPromise=null,readScopeKey=null,autoTimer=null,autoFailures=0,autoEpoch=0,mentionTicket=0,mentionTimer=null,mentionRows=[],mentionActive=-1,newCount=0;
  const timer=(fn,ms)=>(h.setTimeout||setTimeout)(fn,ms),cancelTimer=id=>(h.clearTimeout||clearTimeout)(id);
  function currentDraft(){return drafts.get(key);}
  function blank(){return{text:'',action:'create',reply:null,annotation:null,capture:null,mutation:null,fingerprint:null,scopeSnapshot:{...options.getScope()},threadSnapshot:thread?{kind:thread.kind,number:thread.number}:null};}
  const dirty=state=>!!state&&(!!state.text.trim()||!!state.capture||!!state.annotation);
  function message(text,error=false){status.textContent=String(text||'').slice(0,1000);status.className='chat-status'+(error?' error':'');}
  function setOptions(open){optionsMenu.hidden=!open;optionsToggle.setAttribute('aria-expanded',String(!!open));if(open){syncPin();setComposerOptions(false);closeMessageMenus();}}
  function closeOptions(){setOptions(false);}
  function setComposerOptions(open){composerOptions.hidden=!open;attachmentToggle.setAttribute('aria-expanded',String(!!open));if(open){closeOptions();closeMessageMenus();}}
  function closeMessageMenus(except){let closed=false;for(const menu of messageMenus)if(menu!==except&&menu.open){closed=true;menu.open=false;menu.children[0].setAttribute('aria-expanded','false');}return closed;}
  function closeMenus(){const open=!optionsMenu.hidden||!composerOptions.hidden,hadMessages=closeMessageMenus();closeOptions();setComposerOptions(false);return open||hadMessages;}
  function toggleSearch(){find.hidden=!find.hidden;searchToggle.setAttribute('aria-expanded',String(!find.hidden));if(!find.hidden){closeMenus();find.focus();}else{find.value='';drawMessages();}}
  function changed(){const state=currentDraft();if(!state)return;state.text=input.value;state.mutation=state.fingerprint=null;closeMentions();message('');}
  function syncThreadState(){const closed=thread?.state==='closed',permission=closed?'canReopen':'canClose';threadState.hidden=typeof options.onThreadState!=='function'||thread?.capabilities?.[permission]!==true;threadState.textContent=(closed?'Reopen ':'Close ')+(thread?.kind==='discussion'?'discussion':'issue');threadState.disabled=sending||saving||stateChanging;}
  async function changeThreadState(){
   if(stateChanging||sending||saving||threadState.hidden)return;
   const captured=thread,capturedKey=key,scope=JSON.stringify(options.getScope()),state=thread.state==='closed'?'open':'closed',expectedUpdatedAt=thread.updatedAt;
   if(typeof expectedUpdatedAt!=='string')return;
   const target={kind:thread.kind,number:thread.number,title:thread.title};stateChanging=true;syncComposer();closeOptions();let changed=false;
   try{
    const confirmed=typeof options.confirmThreadState==='function'?await options.confirmThreadState({thread:target,state}):h.confirm?.((state==='closed'?'Close':'Reopen')+' '+target.kind+' #'+target.number+' on '+(options.provider==='gitlab'?'GitLab':'GitHub')+'?');
    if(confirmed!==true||disposed||key!==capturedKey||thread!==captured||JSON.stringify(options.getScope())!==scope)return;
    await options.onThreadState({thread:target,state,expectedUpdatedAt,confirmed:true});changed=true;
    if(!disposed&&key===capturedKey){if(!await readCurrent(true))throw Error('Refresh failed.');message(state==='closed'?'Conversation closed.':'Conversation reopened.');}
   }catch(error){if(!disposed&&key===capturedKey)message(changed?'State changed, but refresh failed. Refresh this conversation before continuing.':error.message||'State change failed. Refresh before retrying.',true);}
   finally{stateChanging=false;if(!disposed)syncComposer();}
  }
  function syncComposer(){syncThreadState();const state=currentDraft();if(!state)return;
   input.value=state.text;input.maxLength=state.annotation?4000:60000;severity.value=state.annotation?.severity||'info';stateSelect.value=state.annotation?.state||'open';
   target.hidden=state.action==='create';targetCopy.textContent=state.reply?(state.action==='edit'?'Editing your message':'Replying to @'+(state.reply.author||'deleted user'))+' · '+state.reply.body.replace(/\s+/g,' ').slice(0,120):'';
   remove.hidden=severity.hidden=stateSelect.hidden=!state.annotation;contextHint.hidden=!state.annotation;contextHint.textContent=state.annotation?'Drawing context: '+(state.annotation.anchor.reference||state.annotation.anchor.netName||state.annotation.anchor.kind||'drawing')+' · '+state.annotation.anchor.file:'';
   captureStrip.hidden=captureHint.hidden=!state.capture;captureHint.textContent=state.capture?'Screenshot · '+state.capture.width+' × '+state.capture.height:'';
   capturePreview.hidden=removeCapture.hidden=!state.capture;if(state.capture){capturePreview.src=state.capture.dataUrl;}else capturePreview.removeAttribute('src');
   send.textContent='↑';send.title=state.action==='edit'?'Review and save edit':'Review and send (Ctrl+Enter)';send.setAttribute('aria-label',state.action==='edit'?'Review and save edit':'Review and send');const allowed=state.action==='create'?thread?.capabilities?.create:state.action==='reply'?thread?.capabilities?.reply:thread?.capabilities?.edit;
   input.disabled=!allowed||sending||saving||stateChanging;send.disabled=input.disabled||!!state.capturePending;attach.disabled=state.action==='edit'||sending||saving||stateChanging||!allowed;save.disabled=sending||saving||stateChanging||!!state.capturePending;account.hidden=!options.onAccount;
   for(const node of [cancelTarget,remove,removeCapture,severity,stateSelect,mentionSource,attachmentToggle,formatToggle,...formatTools.children])node.disabled=sending||saving||stateChanging||node===formatToggle&&!allowed;
   if(!allowed)message('Conversation is read-only until your account and repository permissions are verified.');
  }
  function resetTarget(){const state=currentDraft();if(!state)return;if(state.action==='edit'){const prior=state.priorDraft||{text:'',annotation:null,capture:null};Object.assign(state,prior);input.value=state.text;}state.action='create';state.reply=null;state.priorDraft=null;changed();syncComposer();input.focus();}
  function closeMentions(){mentionTicket++;if(mentionTimer)cancelTimer(mentionTimer);mentionTimer=null;mentionList.hidden=true;mentionRows=[];mentionActive=-1;input.setAttribute('aria-expanded','false');}
  function selectMention(index){const row=mentionRows[index];if(!row)return;const result=composeApi.insertMention(input.value,input.selectionStart,row.login);input.value=result.text;input.setSelectionRange?.(result.cursor,result.cursor);changed();input.focus();}
  function suggest(){closeMentions();const token=composeApi.mentionAt(input.value,input.selectionStart),ticket=mentionTicket,scopeKey=key,text=input.value,cursor=input.selectionStart,source=mentionSource.value;
   if(!token||source==='users'&&token.query.length<2)return;
   mentionTimer=timer(async()=>{mentionTimer=null;try{
    const result=await options.request('comment-mention-users',{...options.getScope(),repository:options.repository,query:token.query.slice(0,64),source});
    if(disposed||key!==scopeKey||ticket!==mentionTicket||input.value!==text||input.selectionStart!==cursor)return;
    mentionList.replaceChildren();mentionRows=(result?.users||[]).filter(item=>typeof item.login==='string'&&/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,254}$/.test(item.login)).slice(0,12);mentionActive=-1;
    mentionRows.forEach((user,index)=>{const row=button('@'+user.login+(user.name?' · '+String(user.name).slice(0,80):''),()=>selectMention(index));row.setAttribute('role','option');row.setAttribute('aria-selected','false');row.onpointerdown=event=>event.preventDefault();mentionList.append(row);});
    mentionList.hidden=!mentionRows.length;input.setAttribute('aria-expanded',String(!!mentionRows.length));
   }catch(error){if(!disposed&&key===scopeKey&&ticket===mentionTicket)message(error.message||'Suggestions unavailable; enter @usernames manually.',true);}},160);
  }
  async function attachContext(){const state=currentDraft(),scopeKey=key;if(!state||state.action==='edit'||!options.createAnnotation)return;
   state.text=input.value;try{const note=await options.createAnnotation(state.text.trim()||'Drawing context',{id:mutationId(),severity:severity.value,state:stateSelect.value});if(disposed||drafts.get(scopeKey)!==state)return;state.annotation=comments.validateComment(note);state.scopeSnapshot={...state.scopeSnapshot,...comments.normalizeScope(state.annotation.anchor)};state.mutation=state.fingerprint=null;if(key===scopeKey){syncComposer();setComposerOptions(false);message('Drawing context attached.');}}catch(error){if(key===scopeKey)message(error.message,true);}
  }
  async function paste(event){const image=[...(event.clipboardData?.items||[])].find(item=>item.kind==='file'&&/^image\//.test(item.type));if(!image)return;event.preventDefault();const state=currentDraft(),scopeKey=key;if(!state||state.action==='edit'){message('Screenshots can be attached to a new message or reply.',true);return;}
   const blob=image.getAsFile();if(!blob)return;const ticket=(state.captureTicket||0)+1;state.captureTicket=ticket;state.capturePending=true;syncComposer();message('Preparing screenshot…');
   try{if(!state.annotation){const note=await options.createAnnotation(state.text.trim()||'Drawing context',{id:mutationId(),severity:severity.value,state:stateSelect.value});if(disposed||drafts.get(scopeKey)!==state||ticket!==state.captureTicket)return;state.annotation=comments.validateComment(note);state.scopeSnapshot={...state.scopeSnapshot,...comments.normalizeScope(state.annotation.anchor)};}
    const capture=await (h.KiCadCommentCompose||composeApi).normalizeCapture(blob);if(disposed||drafts.get(scopeKey)!==state||ticket!==state.captureTicket)return;state.capture=comments.validateComment({...state.annotation,capture}).capture;state.mutation=state.fingerprint=null;if(key===scopeKey)message('Screenshot attached. Review its destination before sending.');
   }catch(error){if(!disposed&&key===scopeKey)message(error.message||'Screenshot could not be attached.',true);}
   finally{if(ticket===state.captureTicket)state.capturePending=false;if(!disposed&&key===scopeKey)syncComposer();}
  }
  function mutationId(){return h.crypto?.randomUUID?.()||root.crypto?.randomUUID?.()||('chat_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,18));}
  function prepared(state,targetThread=thread,scope=options.getScope()){if(state.capturePending)throw Error('Wait for the screenshot to finish preparing.');const body=state.text.trim();if(!body)throw Error('Write a message before sending.');if(new TextEncoder().encode(body).length>60000)throw Error('Message exceeds 60,000 UTF-8 bytes.');
   const fingerprint=JSON.stringify([state.action,body,state.reply?.id,state.reply?.updatedAt,state.annotation?.anchor,state.annotation?.severity,state.annotation?.state,state.capture,scope.ref,scope.file]);
   if(state.fingerprint!==fingerprint||!state.mutation){state.mutation=mutationId();state.fingerprint=fingerprint;}
   let annotation;if(state.annotation){if(state.annotation.anchor.file!==scope.file||state.annotation.anchor.ref!==scope.ref||state.annotation.anchor.repository!==scope.repository)throw Error('Source changed. Return to the attached drawing and revision before sending, or remove its context.');annotation=comments.validateComment({...state.annotation,id:state.mutation,text:body,mentions:composeApi.extractMentions(body,options.provider||'github'),threadType:targetThread.kind,...(state.capture?{capture:state.capture}:{})});}
   return{...scope,thread:{kind:targetThread.kind,number:targetThread.number},action:state.action,body,clientMutationId:state.mutation,...(annotation?{annotation}:{}),...(state.action==='edit'?{messageId:state.reply.id,expectedUpdatedAt:state.reply.updatedAt}:state.action==='reply'?{replyTo:state.reply.id}:{})};
  }
  async function sendMessage(){if(sending||saving||stateChanging||!thread||disposed)return;const state=currentDraft(),scopeKey=key;state.text=input.value;let payload;try{
    if(!thread.capabilities?.[state.action==='create'?'create':state.action==='reply'?'reply':'edit'])throw Error('Your account is not permitted to post this message.');
    if(state.action==='edit'){const loaded=thread.comments?.find(row=>row.id===state.reply?.id);if(!loaded?.canEdit||loaded.updatedAt!==state.reply.updatedAt)throw Error('The message changed or editing permission was lost. Your draft was kept; refresh and reopen Edit.');}
    payload=prepared(state);
   }catch(error){message(error.message,true);return;}
   const targetThread={kind:thread.kind,number:thread.number,title:thread.title},body=state.text;let sent=false;sending=true;syncComposer();
   try{if(typeof options.confirmSend!=='function')throw Error('Posting confirmation is unavailable. Nothing was sent.');
    const approved=await options.confirmSend({thread:targetThread,action:payload.action,replyTo:state.reply,hasContext:!!payload.annotation,hasCapture:!!state.capture});
    if(!approved||disposed||key!==scopeKey||state.text!==body||state.mutation!==payload.clientMutationId)return;
    const now=options.getScope();if(now.repository!==payload.repository||now.ref!==payload.ref||now.file!==payload.file)throw Error('Source changed during confirmation. Review the destination again before sending.');
    await options.request('chat-message-write',payload);sent=true;Object.assign(state,blank());if(key===scopeKey){syncComposer();message('Message sent. Refreshing conversation…');}
    if(key===scopeKey&&conversationVisible()){if(!await readCurrent(true))throw Error('Refresh failed after posting.');message('Message sent.');}
   }catch(error){if(!disposed&&key===scopeKey)message(sent?'Message sent, but refresh failed. Refresh the conversation to see it.':error.message||'Sending failed. Your draft was kept. Inspect the thread before retrying an uncertain result.',true);}
   finally{sending=false;if(!disposed)syncComposer();}
  }
  async function saveDraft(all=false){if(saving||sending||stateChanging)return false;const state=currentDraft();if(!state)return false;state.text=input.value;const states=all?[...drafts.values()].filter(dirty):[state];saving=true;syncComposer();
   try{for(const pending of states){if(!dirty(pending))continue;if(pending.annotation){if(typeof options.onSaveDraft!=='function')throw Error('Local draft storage is unavailable. Your draft was kept.');const payload=prepared(pending,pending.threadSnapshot,pending.scopeSnapshot);await options.onSaveDraft(payload.annotation);}
     else{if(typeof options.onSaveTextDraft!=='function')throw Error('Local draft storage is unavailable. Your draft was kept.');const text=pending.text.trim();if(!text)continue;pending.mutation ||= mutationId();await options.onSaveTextDraft({text,thread:pending.threadSnapshot,...(pending.reply?{replyTo:pending.reply.id}:{}),id:pending.mutation,scope:pending.scopeSnapshot});}
     Object.assign(pending,blank());
    }setComposerOptions(false);message('Local draft saved. Nothing was posted.');return true;
   }catch(error){message(error.message,true);return false;}finally{saving=false;if(!disposed)syncComposer();}
  }
  function conversationVisible(){if(disposed||d.hidden)return false;for(let node=container;node;node=node.parentElement)if(node.hidden||node.inert||node.getAttribute?.('aria-hidden')==='true')return false;try{if(container.checkVisibility&&!container.checkVisibility({checkVisibilityCSS:true,checkOpacity:true}))return false;}catch{}return true;}
  function readCurrent(quiet=false){if(!thread||disposed)return Promise.resolve(false);if(readPromise)return readScopeKey===key?readPromise:Promise.resolve(false);
   const ticket=++readTicket,scopeKey=key,targetThread={kind:thread.kind,number:thread.number};readScopeKey=scopeKey;refresh.disabled=true;if(!quiet)message('Refreshing conversation…');
   readPromise=Promise.resolve().then(async()=>{try{if(typeof options.onRead!=='function')throw Error('Conversation refresh is unavailable.');const result=await options.onRead(targetThread.kind,targetThread.number);if(result===false)throw Error('Conversation could not be refreshed. Check your connection and account access.');if(!disposed&&key===scopeKey&&ticket===readTicket&&!quiet)message('Conversation refreshed.');return true;
    }catch(error){if(!disposed&&key===scopeKey&&ticket===readTicket)message(error.message||'Conversation refresh failed.',true);return false;
    }finally{readPromise=null;readScopeKey=null;if(!disposed&&ticket===readTicket)refresh.disabled=false;}});return readPromise;
  }
  function stopAuto(){if(autoTimer!==null)cancelTimer(autoTimer);autoTimer=null;}
  function scheduleAuto(delay=60000){stopAuto();if(disposed||!autoRefresh.checked||!thread||d.hidden)return;const epoch=autoEpoch;
   autoTimer=timer(async()=>{autoTimer=null;if(disposed||!autoRefresh.checked||epoch!==autoEpoch)return;if(!conversationVisible()||readPromise||sending||saving||stateChanging){scheduleAuto();return;}
    const scopeKey=key,ok=await readCurrent(true);if(disposed||!autoRefresh.checked||epoch!==autoEpoch)return;if(key!==scopeKey){autoFailures=0;scheduleAuto();return;}
    autoFailures=ok?0:Math.min(autoFailures+1,3);scheduleAuto(Math.min(300000,60000*2**autoFailures));
   },delay);
  }
  autoRefresh.onchange=()=>{autoEpoch++;autoFailures=0;if(autoRefresh.checked)scheduleAuto();else stopAuto();};
  const visibilityChanged=()=>{if(d.hidden)stopAuto();else scheduleAuto(Math.min(300000,60000*2**autoFailures));};d.addEventListener('visibilitychange',visibilityChanged);
  function updateJump(){jump.hidden=!newCount;jump.textContent=(newCount?newCount+' new message'+(newCount===1?'':'s')+' · ':'')+'Jump to latest';}
  const date=value=>typeof value==='string'?Date.parse(value):Number(value);
  function messageMenu(author,url,actions=[]){const safety=options.safetyActions?.(author,url),source=contentApi.safeUrl(url);if(!safety&&!source&&!actions.length)return null;const menu=make('details','chat-message-more'),summary=make('summary','','⋯'),body=make('div','chat-message-menu');menu.open=false;summary.title='Message options';summary.setAttribute('aria-label','Message options');summary.setAttribute('aria-expanded','false');summary.onclick=event=>{event.preventDefault();const open=!menu.open;closeMenus();menu.open=open;summary.setAttribute('aria-expanded',String(open));if(open)body.scrollIntoView?.({block:'nearest'});};body.append(...actions);if(source){const link=make('a','chat-message-source','Open source');link.href=source;link.target='_blank';link.rel='noopener noreferrer';body.append(link);}if(safety)body.append(safety);body.onclick=event=>{if(event.target.closest?.('button,a'))closeMessageMenus();};append(menu,summary,body);messageMenus.add(menu);return menu;}
  function drawMessages(){if(!thread)return;const scroll=list.scrollTop||0,nearBottom=(list.scrollHeight||0)-scroll-(list.clientHeight||0)<80;messageMenus.clear();list.replaceChildren();
   const records=[{...thread,root:true},...(thread.comments||[])].slice(0,200).map((row,index)=>({...row,index})).sort((a,b)=>(date(a.createdAt)||0)-(date(b.createdAt)||0)||a.index-b.index);
   const ids=new Set(records.map(row=>(row.root?'root:':'message:')+row.id)),old=seen.get(key);if(old&&!nearBottom)newCount+=[...ids].filter(id=>!old.has(id)).length;seen.set(key,ids);
   let from=date(filters.from),until=date(filters.until);if(typeof filters.until==='string'&&/^\d{4}-\d\d-\d\d$/.test(filters.until))until+=86400000;
   const query=find.value.trim().toLowerCase(),visible=records.filter(row=>(!Number.isFinite(from)||date(row.createdAt)>=from)&&(!Number.isFinite(until)||date(row.createdAt)<until)&&(!query||(row.author+' '+row.body).toLowerCase().includes(query)));
   for(const row of visible){const article=make('article','chat-message'+(row.replyTo?' chat-reply':'')),avatar=make('span','chat-avatar',(row.author||'?').slice(0,2).toUpperCase()),body=make('div','chat-message-content'),byline=make('div','chat-byline'),author=make('strong','chat-author',row.author||'Deleted user'),time=make('time','chat-time',Number.isFinite(date(row.createdAt))?new Date(row.createdAt).toLocaleString():'');time.dateTime=row.createdAt||'';append(byline,author,time);if(row.updatedAt&&row.updatedAt!==row.createdAt)byline.append(make('span','chat-edited','edited'));if(row.replyTo)byline.append(make('span','chat-reply-reference','↳ reply'));
    body.append(byline);if(options.isBlocked?.(row.author)){body.append(make('p','chat-blocked-message','Message hidden for a blocked author.'));const menu=messageMenu(row.author,row.url);if(menu)byline.append(menu);}else{
     body.append(contentApi.render(d,row.body||'',{provider:options.provider,host:typeof options.host==='string'?options.host:options.getScope().host,repository:options.repository,comments}));const extracted=contentApi.content(row.body||'',{comments});
     for(const anchor of extracted.anchors){const card=make('div','chat-design-context'),label=make('span','',[(anchor.reference||anchor.netName||anchor.kind||'Drawing'),anchor.file].join(' · ')),locate=button('Locate',()=>{if(options.onLocate?.(anchor)===false)message('This context belongs to another drawing or revision. Open its exact saved source first.',true);},'chat-locate');append(card,label,locate);try{const source=comments.normalizeScope(anchor),path=source.file.split('/').map(encodeURIComponent).join('/'),ref=source.ref.split('/').map(encodeURIComponent).join('/'),url=source.provider==='gitlab'?source.host+'/'+source.repository+'/-/blob/'+ref+'/'+path:'https://github.com/'+source.repository+'/blob/'+ref+'/'+path,link=make('a','chat-source-link','Saved source');link.href=url;link.target='_blank';link.rel='noopener noreferrer';card.append(link);}catch{}body.append(card);}
     for(const attachment of extracted.attachments){const url=contentApi.safeUrl(attachment.url);if(url){const link=make('a','chat-attachment-link','Open screenshot · '+attachment.width+' × '+attachment.height);link.href=url;link.target='_blank';link.rel='noopener noreferrer';body.append(link);}}
     const actions=[];
     if(!row.root&&row.canReply&&thread.capabilities?.reply)actions.push(button('Reply',()=>{closeMessageMenus();if(sending||saving||stateChanging)return;const state=currentDraft();state.text=input.value;state.action='reply';state.reply=row;state.mutation=state.fingerprint=null;syncComposer();input.focus();},'chat-reply-action'));
     if(!row.root&&row.canEdit&&thread.capabilities?.edit)actions.push(button('Edit',()=>{closeMessageMenus();if(sending||saving||stateChanging)return;const state=currentDraft();state.text=input.value;if(state.text.trim()&&!h.confirm?.('Replace the current draft with this message for editing?'))return;state.priorDraft={text:state.text,annotation:state.annotation,capture:state.capture,scopeSnapshot:state.scopeSnapshot};state.text=row.body;state.action='edit';state.reply=row;state.annotation=state.capture=null;state.mutation=state.fingerprint=null;syncComposer();input.focus();},'chat-edit-action'));
     const menu=messageMenu(row.author,row.url,actions);if(menu)byline.append(menu);
    }
    append(article,avatar,body);list.append(article);
   }
   if(!visible.length)list.append(make('p','chat-empty','No messages match these filters.'));
   if((nearBottom||!old)&&!query){list.scrollTop=list.scrollHeight;newCount=0;}else list.scrollTop=scroll;updateJump();
  }
  function render(value,nextFilters={}){if(disposed||!value||!['issue','discussion'].includes(value.kind)||!Number.isSafeInteger(value.number)||value.number<1)return;
   if(key&&currentDraft())currentDraft().text=input.value;const nextKey=value.kind+':'+value.number,switching=nextKey!==key;
   if(!drafts.has(nextKey)&&drafts.size>=10){const victim=[...drafts.keys()].find(id=>!dirty(drafts.get(id)));if(victim){drafts.delete(victim);seen.delete(victim);}else{message('Ten conversations have unsaved drafts. Save or discard one before opening another conversation.',true);return false;}}
   if(switching){closeMentions();closeMenus();readTicket++;refresh.disabled=false;newCount=0;autoFailures=0;message('');}
   key=nextKey;thread=value;filters=nextFilters;if(!drafts.has(key))drafts.set(key,blank());
   title.textContent=String(thread.title||'Conversation').slice(0,1024);title.title=title.textContent;meta.textContent=(options.provider==='gitlab'?'GitLab':'GitHub')+' · '+(thread.kind==='discussion'?'Discussion':'Issue')+' #'+thread.number+' · '+(thread.state||'open');drawMessages();syncComposer();if(switching)scheduleAuto();return true;
  }
  input.oninput=()=>{changed();suggest();};input.onpaste=paste;mentionSource.onchange=suggest;
  input.onkeydown=event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();sendMessage();return;}if(event.key==='Escape'){closeMentions();return;}if(!mentionList.hidden&&!event.shiftKey&&['ArrowDown','ArrowUp','Enter'].includes(event.key)){event.preventDefault();if(event.key==='Enter'){selectMention(Math.max(0,mentionActive));return;}mentionActive=(mentionActive+(event.key==='ArrowDown'?1:-1)+mentionRows.length)%mentionRows.length;[...mentionList.children].forEach((row,index)=>row.setAttribute('aria-selected',String(index===mentionActive)));}};
  severity.onchange=stateSelect.onchange=()=>{const state=currentDraft();if(state?.annotation){state.annotation={...state.annotation,severity:severity.value,state:stateSelect.value};changed();}};
  find.oninput=drawMessages;list.onscroll=()=>{if(list.scrollHeight-list.scrollTop-list.clientHeight<80){newCount=0;updateJump();}};
  const outside=event=>{if(!mentionList.contains(event.target)&&event.target!==input&&!mentionSource.contains(event.target))closeMentions();if(!optionsMenu.contains(event.target)&&!optionsToggle.contains(event.target))closeOptions();if(!composerOptions.contains(event.target)&&!attachmentToggle.contains(event.target))setComposerOptions(false);for(const menu of messageMenus)if(!menu.contains(event.target)){menu.open=false;menu.children[0].setAttribute('aria-expanded','false');}};d.addEventListener('pointerdown',outside);
  const escape=event=>{if(event.key!=='Escape')return;const hadMenu=closeMenus(),hadSearch=!find.hidden,hadFormat=!formatTools.hidden;if(hadFormat){formatTools.hidden=true;formatToggle.setAttribute('aria-expanded','false');}if(hadSearch){find.hidden=true;find.value='';searchToggle.setAttribute('aria-expanded','false');drawMessages();}if(hadMenu||hadSearch||hadFormat){event.preventDefault();event.stopPropagation?.();input.focus();}};d.addEventListener('keydown',escape,true);
  return{render,closeMenus,hasDraft(){if(key&&currentDraft())currentDraft().text=input.value;return[...drafts.values()].some(dirty);},draft(){const state=currentDraft();if(!state)return null;state.text=input.value;return{text:state.text,action:state.action,replyTo:state.reply?.id,annotation:state.annotation,capture:state.capture,thread:thread?{kind:thread.kind,number:thread.number}:null};},saveDraft,focus(){input.focus();},discard(all=false){if(all)drafts.clear();if(key)drafts.set(key,blank());closeMentions();syncComposer();message('Draft discarded.');},dispose(){disposed=true;readTicket++;stopAuto();closeMentions();d.removeEventListener('pointerdown',outside);d.removeEventListener('visibilitychange',visibilityChanged);d.removeEventListener('keydown',escape,true);drafts.clear();seen.clear();shell.remove();}};
 }
 const api={mount};root.KiCadChatPanel=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
