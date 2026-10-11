/* Repository metadata and imported files share one bounded, touch-friendly navigator. */
((root)=>{
 'use strict';
 function inventory(project){
  const loaded=new Map([...(project.files||[]),...(project.assets||[])].map(f=>[f.path,f]));
  const entries=new Map((project.repositoryTree?.entries||[]).map(e=>[e.path,{...e,loaded:loaded.has(e.path)}]));
  for(const path of loaded.keys())entries.set(path,{path,type:'blob',loaded:true});
  return [...entries.values()].sort((a,b)=>a.path.localeCompare(b.path));
 }
 function children(entries,folder='',query=''){
  const prefix=folder?folder+'/':'',out=new Map(),needle=query.toLowerCase();
  for(const entry of entries){if(!entry.path.startsWith(prefix)||needle&&!entry.path.toLowerCase().includes(needle))continue;
   const rest=entry.path.slice(prefix.length),slash=rest.indexOf('/');if(!rest)continue;
   const path=slash<0?entry.path:prefix+rest.slice(0,slash);
   if(slash>=0)out.set(path,{path,type:'tree'});else if(!out.has(path))out.set(path,entry);
  }
  return [...out.values()].sort((a,b)=>(a.type==='tree'?0:1)-(b.type==='tree'?0:1)||a.path.localeCompare(b.path));
 }
 function sourceURL(project,path){const remote=project.remote||project.github;if(!remote)return null;
  const base=project.remote?remote.host:'https://github.com';
  if(!/^https:\/\//.test(base)||! /^[a-f0-9]{40}$/.test(remote.sha))return null;
  return base+'/'+remote.repository.split('/').map(encodeURIComponent).join('/')+(project.remote?'/-/blob/':'/blob/')+remote.sha+'/'+path.split('/').map(encodeURIComponent).join('/');
 }
 const API={inventory,children,sourceURL};root.KiCadAndroidTree=API;
 if(typeof module==='object'&&module.exports)module.exports=API;
 if(!root.document)return;
 const d=root.document,$=id=>d.getElementById(id),make=(tag,text)=>{const n=d.createElement(tag);if(text)n.textContent=text;return n;};
 const button=(text,action)=>{const b=make('button',text);b.type='button';b.onclick=action;return b;};
 let dialog,body,search,info,branches,branchLoad,historyLoad,epoch=0;
 function close(){dialog.close();}
 function navigate(action){
  function draft(w,depth=0){if(depth>6)return false;try{const editor=w.document.getElementById('commentEditor'),text=w.document.getElementById('commentText');if(editor&&!editor.hidden&&text?.value?.trim())return true;for(const f of w.document.querySelectorAll('iframe'))if(!f.hidden&&draft(f.contentWindow,depth+1))return true;}catch{}return false;}
  if(!draft($('viewer').contentWindow)){action();return;}
  const warning=make('div');warning.setAttribute('role','alert');warning.append(make('p','There is an unfinished comment. Close this panel and save the draft before changing drawings, or discard it.'),button('Keep editing',()=>{warning.remove();close();}),button('Discard draft and open',()=>{warning.remove();action();}));body.prepend(warning);
 }
 function openPath(project,entry){
  if(root.KiCadAndroidProject!==project)return;
  if(entry.loaded&&/\.kicad_(sch|pcb|pro)$/i.test(entry.path)){navigate(()=>{close();root.KiCadAndroid.openDrawing(entry.path);});return;}
  if(entry.loaded&&root.KiCadAndroidLocal.pdfFile(entry.path)){navigate(()=>{close();root.KiCadAndroid.openTools('pdf-viewer.html',entry.path);});return;}
  if(entry.loaded&&root.KiCadAndroidLocal.fabricationFile(entry.path)){navigate(()=>{close();root.KiCadAndroid.openTools('gerber-viewer.html',entry.path);});return;}
  if(entry.loaded&&root.KiCadAndroidLocal.analysisFile(entry.path)){navigate(()=>{close();root.KiCadAndroid.openAnalysis(entry.path);});return;}
  const url=sourceURL(project,entry.path);if(url){if(root.AndroidKiCad?.openRepositorySource)root.AndroidKiCad.openRepositorySource(url);else root.open(url,'_blank','noopener');}
 }
 function render(){
  const project=root.KiCadAndroidProject;body.replaceChildren();branches.replaceChildren();branchLoad.disabled=historyLoad.disabled=!(project?.remote||project?.github);if(!project)return;
  const entries=inventory(project);info.textContent=(project.remote?.repository||project.github?.repository||project.name||'Local project')+' · '+(project.remote?.sha||project.github?.sha||'Imported files').slice(0,12)+(project.repositoryTree?.truncated?' · Repository listing incomplete (10,000-entry limit or unsupported paths)':!project.repositoryTree?' · Imported files only':'');
  const actions=make('div');actions.className='repository-quick-actions';
  actions.append(button('Project overview',()=>navigate(()=>{close();root.KiCadAndroid.openProject($('drawingPicker').value);})),button('Save offline',()=>{close();root.KiCadAndroidLibrary?.saveCurrent(true);}),button('Export ZIP',()=>{close();root.KiCadAndroidUI?.downloadProject();}),button('Comments',()=>{close();const walk=(w,depth=0)=>{if(depth>6)return false;try{const b=w.document.getElementById('commentsButton');if(b){b.click();return true;}for(const f of w.document.querySelectorAll('iframe'))if(!f.hidden&&walk(f.contentWindow,depth+1))return true;}catch{}return false;};if(!walk($('viewer').contentWindow))root.KiCadAndroid.receiveError('Open a drawing to add comments.');}));body.append(actions);
  const tree=make('div');tree.className='repository-file-tree';tree.setAttribute('aria-label','Repository files');body.append(tree);
  function mount(holder,folder){const list=children(entries,folder,search.value);let shown=0;
   function more(){const stop=Math.min(shown+150,list.length);for(;shown<stop;shown++){const entry=list[shown],name=entry.path.split('/').at(-1);
    if(entry.type==='tree'){const details=make('details'),summary=make('summary',name),nested=make('div');details.append(summary,nested);details.addEventListener('toggle',()=>{if(details.open&&!nested.childNodes.length)mount(nested,entry.path);});holder.append(details);}
    else{const row=make('div');row.className='repository-file-row';const model=/\.(step|stp|wrl|vrml|glb)$/i.test(entry.path),supported=entry.loaded&&(/\.kicad_(sch|pcb|pro)$/i.test(entry.path)||root.KiCadAndroidLocal.pdfFile(entry.path)||root.KiCadAndroidLocal.analysisFile(entry.path)||root.KiCadAndroidLocal.fabricationFile(entry.path));
     const b=button(name,()=>openPath(project,entry));b.title=entry.path;b.disabled=!supported&&!sourceURL(project,entry.path);row.append(b,make('small',model?'3D model'+(entry.loaded?' · available':''):entry.loaded?'Imported':entry.type==='commit'?'Submodule':'Source'));holder.append(row);}
   }if(shown<list.length){const next=button('Show more files',()=>{next.remove();more();});holder.append(next);}}
   more();
  }
  mount(tree,'');if(!children(entries,'',search.value).length)tree.textContent='No matching files.';
 }
 async function loadRevisions(history=false){const project=root.KiCadAndroidProject,remote=project?.remote||project?.github;if(!remote)return;const ticket=++epoch;branchLoad.disabled=true;
  try{const client=project.remote?root.KiCadAndroidGitLab:root.KiCadAndroidGitHub;
   const result=await client.request({type:history?'revision-commits':'revision-branches',repository:remote.repository,ref:remote.sha,file:$('drawingPicker').value,...(project.remote?{host:remote.host}:{})});
   if(ticket!==epoch||root.KiCadAndroidProject!==project)return;branches.replaceChildren();const select=make('select');select.setAttribute('aria-label',history?'File revision':'Repository branch');select.append(make('option',history?'Choose a commit':'Choose a branch'));select.firstChild.value='';
   for(const item of (history?result.commits:result.branches)||[]){const option=make('option',history?item.sha.slice(0,8)+' · '+item.message.split('\n')[0]:item.name);option.value=item.sha;select.append(option);}
   const open=button(history?'Open selected commit':'Open selected branch',()=>{if(!select.value)return;const chosen=select.value;const warning=make('div');warning.append(make('p','Open '+(history?'commit ':'branch ')+select.options[select.selectedIndex].textContent+'? Save any unfinished comment draft first.'),button('Cancel',()=>{warning.remove();open.disabled=false;}),button(history?'Open commit':'Open branch',()=>{close();client.openProject({...remote,ref:chosen});}));branches.append(warning);open.disabled=true;});if(history)branches.append(make('p','History of '+result.file));branches.append(select,open);for(const warning of result.warnings||[])branches.append(make('p',warning));
  }catch(error){if(ticket===epoch)branches.textContent=error.message;}finally{if(ticket===epoch&&root.KiCadAndroidProject===project)branchLoad.disabled=false;}
 }
 API.open=()=>{if(!root.KiCadAndroidProject)return;if(!dialog){dialog=make('dialog');dialog.id='androidRepositoryTree';dialog.className='android-repository-sheet';const head=make('header');head.append(make('strong','Repository and quick actions'),button('Close',close));const content=make('section');content.className='android-sheet-content';info=make('p');search=make('input');search.type='search';search.placeholder='Find a file or folder';search.setAttribute('aria-label','Filter repository files');search.oninput=render;branchLoad=button('Browse branches',()=>loadRevisions());historyLoad=button('Current file history',()=>loadRevisions(true));branches=make('div');branches.setAttribute('aria-live','polite');body=make('div');content.append(info,search,branchLoad,historyLoad,branches,body);dialog.append(head,content);d.body.append(dialog);dialog.addEventListener('close',()=>{epoch++;});}search.value='';render();for(const other of d.querySelectorAll('dialog[open]'))if(other!==dialog)other.close();dialog.showModal();};
 function install(){const header=d.querySelector('body>header');if(!header||$('androidRepositoryButton'))return;const b=button('Files & actions',API.open);b.id='androidRepositoryButton';header.append(b);const update=()=>{b.hidden=!root.KiCadAndroidProject||$('viewer').hidden;};new MutationObserver(update).observe($('viewer'),{attributes:true,attributeFilter:['hidden','src']});root.addEventListener('kicad-project-opened',update);update();}
 if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',install);else install();
})(globalThis);
