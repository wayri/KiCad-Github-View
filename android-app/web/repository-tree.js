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
 const d=root.document,$=id=>d.getElementById(id);
 API.open=()=>{const project=root.KiCadAndroidProject;if(!project||!root.KiCadRepositoryExplorer)return;
  const remote=project.remote||project.github,provider=project.remote?.provider||'github',client=provider==='gitlab'?root.KiCadAndroidGitLab:root.KiCadAndroidGitHub;
  function draft(win,depth=0){if(depth>6)return false;try{if(win.KiCadChatDraft?.hasDraft?.())return true;if(!win.document.getElementById('commentEditor')?.hidden&&win.document.getElementById('commentText')?.value?.trim())return true;for(const frame of win.document.querySelectorAll('iframe'))if(!frame.hidden&&draft(frame.contentWindow,depth+1))return true;}catch{}return false;}
  function guarded(action){if(!draft($('viewer').contentWindow)){root.KiCadRepositoryExplorer.close();action();return;}const page=$('repositoryExplorer'),warning=d.createElement('section');warning.className='repo-notice';warning.setAttribute('role','alert');warning.textContent='There is an unfinished comment. Keep editing it, or discard it before opening another drawing.';for(const [text,run]of [['Keep editing',()=>root.KiCadRepositoryExplorer.close()],['Discard and open',()=>{root.KiCadRepositoryExplorer.close();action();}]]){const b=d.createElement('button');b.type='button';b.textContent=text;b.onclick=run;warning.append(b);}page.prepend(warning);}
  root.KiCadRepositoryExplorer.open({repository:remote?.repository||project.name||'Local project',ref:remote?.sha||'a'.repeat(40),file:$('drawingPicker').value,provider,host:remote?.host||'https://github.com',local:!remote,
   request:(type,fields)=>remote?client.request({type,...fields}):Promise.resolve(type==='repository-tree'?{entries:inventory(project),imported:true,hasMore:false,warnings:['Imported files only. Connect a Git repository to browse history.']}:type==='repository-branches'?{branches:[]}:{commits:[],hasMore:false,warnings:[]}),
   canOpenFile:path=>[...project.files,...project.assets].some(f=>f.path===path),onOpenFile:path=>guarded(()=>root.KiCadAndroid.openDrawing(path)),
   ...(remote?{onOpenRevision:sha=>guarded(()=>client.openProject({...remote,ref:sha}))}:{})
  });
 };
 function install(){const header=d.querySelector('body>header');if(!header||$('androidRepositoryButton'))return;const b=d.createElement('button');b.type='button';b.textContent='Repository';b.id='androidRepositoryButton';b.title='Repository files, branches and commit history';b.onclick=API.open;header.append(b);const update=()=>{b.hidden=!root.KiCadAndroidProject||$('viewer').hidden;};new MutationObserver(update).observe($('viewer'),{attributes:true,attributeFilter:['hidden','src']});root.addEventListener('kicad-project-opened',update);update();}
 if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',install);else install();
})(globalThis);
