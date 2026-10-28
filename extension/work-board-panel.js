/* GitHub Projects / GitLab boards. Provider adapters own credentials and authorization. */
((root)=>{'use strict';
 function mount(options){
  const d=options.document||root.document,container=options.container;
  if(!d||!container||typeof options.request!=='function'||typeof options.getScope!=='function')throw Error('Work board host is unavailable.');
  const make=(tag,cls,text)=>{const n=d.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;};
  const button=(text,action,cls)=>{const n=make('button',cls,text);n.type='button';n.onclick=action;return n;};
  const shell=make('section','work-board-panel'),header=make('header','work-board-header'),selector=make('select','work-board-select'),status=make('p','work-board-status'),columns=make('div','work-board-columns');
  selector.setAttribute('aria-label','Work board');status.setAttribute('role','status');
  const refreshButton=button('Refresh',()=>refresh(),'work-board-refresh'),settings=button('Settings',()=>options.onSettings?.(),'work-board-settings'),link=make('a','work-board-provider-link','Open board');
  settings.hidden=typeof options.onSettings!=='function';link.hidden=true;link.target='_blank';link.rel='noopener noreferrer';
  header.append(selector,refreshButton,settings,link);shell.append(header,status,columns);container.replaceChildren(shell);
  let disposed=false,generation=0,selected=null,board=null,moving=false,scopeKey=null;
  const snapshot=()=>({...options.getScope()}),same=(scope,ticket)=>!disposed&&ticket===generation&&JSON.stringify(options.getScope())===JSON.stringify(scope);
  function gitlabId(value,special=false){if(special&&['open','closed'].includes(value))return value;const id=typeof value==='number'?value:typeof value==='string'&&/^[1-9][0-9]*$/.test(value)?Number(value):NaN;if(!Number.isSafeInteger(id)||id<1)throw Error('Invalid GitLab board identity. Refresh the board before continuing.');return id;}
  function safeUrl(raw,scope){try{const url=new URL(raw),origin=scope.provider==='gitlab'?new URL(scope.host||'https://gitlab.com').origin:'https://github.com';return url.protocol==='https:'&&!url.username&&!url.password&&url.origin===origin?url.href:null;}catch{return null;}}
  function showStatus(text,error=false){status.textContent=String(text||'').slice(0,1500);status.className='work-board-status'+(error?' error':'');}
  function warnings(result){const text=(Array.isArray(result.warnings)?result.warnings:[]).map(v=>String(v).slice(0,300));if(result.hasMore)text.push('Partial board: more items are available on the provider.');return text.join(' ');}
  function setLink(raw,scope){const url=safeUrl(raw,scope);link.hidden=!url;if(url)link.href=url;else link.removeAttribute('href');}
  function renderBoard(result,scope){
   board=result;columns.replaceChildren();setLink(result.url,scope);
   const entries=Array.isArray(result.columns)?result.columns.slice(0,100):[],items=Array.isArray(result.items)?result.items.slice(0,1000):[];
   const memberships=item=>scope.provider==='gitlab'&&Array.isArray(item.columnIds)?item.columnIds.map(String):[String(item.columnId??'')];
   const groups=entries.map(c=>({...c,id:String(c.id)}));if(!groups.some(c=>c.id==='')&&(scope.provider!=='gitlab'||items.some(item=>!memberships(item).some(id=>groups.some(c=>c.id===id)))))groups.push({id:'',title:'Unassigned'});
   if(!groups.length){showStatus(warnings(result)||'This board has no columns.');return;}
   for(const column of groups){
    const section=make('section','work-board-column'),heading=make('h3','',column.title||'Unassigned');section.append(heading);
    const matching=items.filter(item=>memberships(item).some(id=>groups.some(c=>c.id===id))?memberships(item).includes(column.id):column.id==='');
    heading.textContent=String(column.title||'Unassigned')+' · '+matching.length;
    for(const item of matching){
     const card=make('article','work-board-card'),title=button((item.number?'#'+item.number+' ':'')+String(item.title||'Untitled'),()=>{
      if(disposed||JSON.stringify(options.getScope())!==JSON.stringify(scope))return;
      if(Number.isSafeInteger(item.number)&&item.number>0&&['issue','discussion','pull-request','pull'].includes(item.kind))options.onOpenThread?.({kind:item.kind,number:item.number,repository:item.repository||scope.repository,url:item.url});
     },'work-board-card-title');title.disabled=typeof options.onOpenThread!=='function'||!Number.isSafeInteger(item.number)||!['issue','discussion','pull-request','pull'].includes(item.kind);card.append(title);
     if(Array.isArray(item.assignees)&&item.assignees.length)card.append(make('small','work-board-assignees',item.assignees.map(user=>'@'+String(typeof user==='string'?user:user.login||user.username||'').slice(0,100)).join(' ')));
     const target=make('select','work-board-target');target.setAttribute('aria-label','Status for '+String(item.title||'item'));
     for(const entry of groups){if(!entry.id&&scope.provider==='gitlab')continue;const option=make('option','',entry.title||'Unassigned');option.value=entry.id;target.append(option);}target.value=column.id;
     const apply=button('Apply',()=>move(item,target.value,column.id,apply,target,scope),'work-board-apply');apply.disabled=true;target.onchange=()=>{apply.disabled=moving||target.value===column.id;};card.append(target,apply);section.append(card);
    }columns.append(section);
   }showStatus(warnings(result)||(!items.length?'No work items in this board.':''));
  }
  async function read(scope,ticket){
   showStatus('Loading board…');columns.replaceChildren();link.hidden=true;
   try{const result=await options.request('work-board-read',{...scope,boardId:scope.provider==='gitlab'?gitlabId(selected):selected});if(!same(scope,ticket))return false;renderBoard(result,scope);return true;}
   catch(error){if(same(scope,ticket))showStatus(error.message||'Board unavailable. Check account access in Settings.',true);return false;}
  }
  async function refresh(){
   if(disposed)return false;const scope=snapshot(),ticket=++generation,key=JSON.stringify(scope);if(key!==scopeKey){selected=null;board=null;scopeKey=key;}
   showStatus('Loading work boards…');refreshButton.disabled=true;columns.replaceChildren();link.hidden=true;
   try{const result=await options.request('work-board-list',scope);if(!same(scope,ticket))return false;
    const boards=(Array.isArray(result.boards)?result.boards:[]).slice(0,100);selector.replaceChildren();for(const value of boards){const option=make('option','',value.title||'Untitled board');option.value=String(value.id);selector.append(option);}
    if(!boards.some(value=>String(value.id)===selected))selected=boards.length?String(boards[0].id):null;selector.value=selected||'';selector.disabled=!boards.length;
    if(selected===null){showStatus(warnings(result)||'No accessible work boards. Connect or create one on the provider.');return true;}
    const ok=await read(scope,ticket);if(ok&&same(scope,ticket)&&warnings(result))showStatus([status.textContent,warnings(result)].filter(Boolean).join(' '));return ok;
   }catch(error){if(same(scope,ticket))showStatus(error.message||'Work boards unavailable. Check account access in Settings.',true);return false;}
   finally{if(!disposed&&ticket===generation)refreshButton.disabled=false;}
  }
  async function move(item,columnId,fromListId,apply,target,scope){
   if(disposed||moving||columnId===fromListId||JSON.stringify(options.getScope())!==JSON.stringify(scope))return false;
   const ticket=generation,boardId=selected,fieldId=board?.fieldId;moving=true;apply.disabled=target.disabled=true;showStatus('Updating status…');
   try{await options.request('work-board-move',{...scope,boardId:scope.provider==='gitlab'?gitlabId(boardId):boardId,itemId:scope.provider==='gitlab'?gitlabId(item.id):item.id,...(scope.provider==='gitlab'?{listId:gitlabId(columnId,true),fromListId:gitlabId(fromListId,true)}:{fieldId,optionId:columnId,expectedColumnId:item.columnId??''}),...(typeof item.updatedAt==='string'?{expectedUpdatedAt:item.updatedAt}:{}),confirmed:true});if(!same(scope,ticket))return false;return await read(scope,ticket);}
   catch(error){if(same(scope,ticket))showStatus(error.message||'Status update could not be confirmed. Refresh before retrying.',true);return false;}
   finally{moving=false;if(same(scope,ticket)){target.disabled=false;apply.disabled=true;}}
  }
  selector.onchange=()=>{if(disposed)return;selected=selector.value;return read(snapshot(),++generation);};
  const ready=refresh();return{ready,refresh,dispose(){disposed=true;generation++;selector.onchange=null;container.replaceChildren();}};
 }
 const api={mount};if(typeof module==='object'&&module.exports)module.exports=api;root.KiCadWorkBoardPanel=api;
})(typeof globalThis==='object'?globalThis:this);
