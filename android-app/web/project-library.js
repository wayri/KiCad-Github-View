/* Native encrypted project library. Only bookmark metadata crosses this API. */
((root)=>{'use strict';
 function metadata(project){
  if(!project)throw Error('Open a project first.');
  if(project.offline&&project.libraryId)return{id:project.libraryId,name:project.name||'Offline project'};
  const remote=project.remote||project.github;
  return{name:project.name||remote?.repository||project.files.find(f=>/\.kicad_pro$/i.test(f.path))?.path||project.files[0]?.path||'KiCad project',
   repository:remote?.repository||'',host:project.remote?.host||(project.github?'https://github.com':''),provider:project.remote?.provider||(project.github?'github':'local'),ref:remote?.sha||'',...(project.libraryId?{id:project.libraryId}:{})};
 }
 function filter(items,mode,query){const q=String(query||'').trim().toLowerCase();return items.filter(item=>(mode!=='starred'||item.starred)&&(mode!=='offline'||item.offline)&&(!q||[item.name,item.repository,item.host].join(' ').toLowerCase().includes(q))).sort((a,b)=>Number(b.starred)-Number(a.starred)||b.updated-a.updated);}
 function bridge(native,later=root.setTimeout,clear=root.clearTimeout){let next=0;const pending=new Map();return{
  request:message=>new Promise((resolve,reject)=>{if(!native()?.libraryRequest)return reject(Error('Project library requires the updated Android app.'));if(pending.size>=4)return reject(Error('Wait for the current library operation.'));
   const id=++next,timer=later(()=>{pending.delete(id);reject(Error('Project library operation timed out. Reopen the library to check its status.'));},600000);pending.set(id,{resolve,reject,timer});try{native().libraryRequest(id,message);}catch{clear(timer);pending.delete(id);reject(Error('Project library is unavailable.'));}}),
  reply:(id,value)=>{const task=pending.get(id);if(!task||typeof value?.ok!=='boolean')return;pending.delete(id);clear(task.timer);value.ok?task.resolve(value.result):task.reject(Error(value.error||'Library operation failed.'));},
  close:()=>{for(const task of pending.values()){clear(task.timer);task.reject(Error('Library closed.'));}pending.clear();}
 };}
 root.KiCadAndroidLibraryCore={metadata,filter,bridge};if(typeof module==='object'&&module.exports){module.exports=root.KiCadAndroidLibraryCore;return;}
 const api=bridge(()=>root.AndroidKiCad),d=root.document,make=(tag,text)=>{const n=d.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 let items=[],mode='all',busy=false;
 const dialog=make('dialog');dialog.id='projectLibraryDialog';const header=make('header'),body=make('section');body.className='android-sheet-content';header.append(make('strong','Your projects'));dialog.append(header,body);d.body.append(dialog);
 const status=make('p');status.setAttribute('role','status');status.className='library-status';
 function button(label,icon,action){const b=make('button');b.type='button';b.title=label;b.setAttribute('aria-label',label);if(root.KiCadUIIcons)b.append(root.KiCadUIIcons.icon(icon));b.append(make('span',label));b.onclick=action;return b;}
 header.append(button('Close','close',()=>dialog.close()));
 const tabs=make('nav');tabs.className='library-filters';tabs.setAttribute('aria-label','Project collections');
 for(const [value,label,icon]of [['all','All','folder'],['starred','Starred','star'],['offline','Offline','import']]){const b=button(label,icon,()=>{mode=value;render();});b.dataset.filter=value;tabs.append(b);}
 const search=make('input');search.type='search';search.placeholder='Search your projects';search.setAttribute('aria-label','Search your projects');search.oninput=()=>render();
 const current=make('div');current.className='library-current';const bookmark=button('Bookmark current','bookmark',()=>saveCurrent(false)),offline=button('Save offline','import',()=>saveCurrent(true));current.append(bookmark,offline);
 const rows=make('div');rows.id='projectLibraryRows';body.append(tabs,search,current,status,rows,make('p','Offline copies are encrypted inside this app and remain after sign-out. Removing an offline copy keeps its bookmark. Clearing app data or uninstalling removes this library.'));
 async function refresh(){const value=await api.request({action:'list'});items=value.items||[];render();}
 async function operation(task,message){if(busy)return;busy=true;status.textContent=message;render();try{await task();await refresh();status.textContent='Library updated.';}catch(error){status.textContent=error.message;}finally{busy=false;render();}}
 async function saveCurrent(copy){if(!dialog.open){for(const modal of d.querySelectorAll('dialog[open]'))modal.close();dialog.showModal();}return operation(async()=>{const project=root.KiCadAndroidProject;const meta=metadata(project);await api.request({action:'save',...meta,offline:copy||meta.provider==='local'});},copy?'Saving encrypted offline copy…':'Saving bookmark…');}
 function render(){bookmark.disabled=offline.disabled=busy||!root.KiCadAndroidProject;for(const b of tabs.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.filter===mode));rows.replaceChildren();const matches=filter(items,mode,search.value);
  if(!matches.length){rows.append(make('p',items.length?'No projects match this filter.':'Bookmark a viewed project or save it offline to start your library.'));return;}
  for(const item of matches){const card=make('article');card.className='library-card';const open=button(item.name,'folder',()=>openItem(item));open.className='library-open';open.disabled=busy;
   const detail=make('small',`${item.offline?'Offline copy':'Online bookmark'}${item.repository?' · '+item.repository:''}${item.ref?' · '+item.ref.slice(0,12):''}`);const actions=make('div');actions.className='library-actions';
   const star=button(item.starred?'Unstar':'Star','star',()=>operation(()=>api.request({action:'star',id:item.id,value:!item.starred}),'Updating star…'));star.setAttribute('aria-pressed',String(Boolean(item.starred)));
   const remove=button('Remove bookmark','close',()=>{confirmRemoval(item,false);});actions.append(star);
   if(item.offline)actions.append(button('Remove offline copy','import',()=>confirmRemoval(item,true)));actions.append(remove);for(const b of actions.querySelectorAll('button'))b.disabled=busy;card.append(open,detail,actions);rows.append(card);
  }
 }
 function confirmRemoval(item,copy){const confirm=make('dialog');confirm.className='library-confirm';const content=make('section');content.className='android-sheet-content';content.append(make('h2',copy?'Remove offline copy?':'Remove project from library?'),make('p',copy?'The bookmark will remain. You will need a connection to reopen it.':'This removes the bookmark and any saved offline copy. Your original project files and review notes are kept.'),button('Cancel','close',()=>{confirm.close();confirm.remove();}),button('Remove','close',()=>{confirm.close();confirm.remove();operation(()=>api.request({action:copy?'remove-offline':'remove',id:item.id}),'Updating library…');}));confirm.append(content);confirm.addEventListener('cancel',()=>confirm.remove());d.body.append(confirm);confirm.showModal();}
 async function openItem(item){if(busy)return;status.textContent='Opening project…';try{
  if(item.offline){busy=true;render();await api.request({action:'open',id:item.id});dialog.close();}
  else if(item.provider==='github'){dialog.close();root.KiCadAndroidGitHub.openProject({repository:item.repository,ref:item.ref});}
  else if(item.provider==='gitlab'){dialog.close();root.KiCadAndroidGitLab.openProject({repository:item.repository,host:item.host,ref:item.ref});}
  else throw Error('This local bookmark has no saved copy. Reopen its folder and save it offline.');
 }catch(error){status.textContent=error.message;}finally{busy=false;render();}}
 root.KiCadAndroidLibrary={reply:api.reply,saveCurrent,open:async()=>{for(const modal of d.querySelectorAll('dialog[open]'))modal.close();dialog.showModal();status.textContent='Loading library…';try{await refresh();status.textContent='';}catch(error){status.textContent=error.message;}},refresh};
 function mount(){const menu=d.querySelector('#appMenuDialog .android-sheet-content');if(menu&&!d.getElementById('openLibrary')){const b=button('Your projects','folder',()=>root.KiCadAndroidLibrary.open());b.id='openLibrary';menu.prepend(b);}const welcome=d.getElementById('welcome');if(welcome&&!d.getElementById('welcomeLibrary')){const b=button('Your projects','folder',()=>root.KiCadAndroidLibrary.open());b.id='welcomeLibrary';welcome.append(b);}}
 if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',mount);else mount();new MutationObserver(mount).observe(d.body,{childList:true,subtree:true});
 root.addEventListener('kicad-project-opened',render);root.addEventListener('pagehide',api.close);dialog.addEventListener('cancel',e=>e.preventDefault());
})(globalThis);
