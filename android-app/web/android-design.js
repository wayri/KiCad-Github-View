/* A focused Android shell. Existing controllers continue owning actions and data. */
((root)=>{'use strict';
 const structureChanged=records=>records.some(record=>[...record.addedNodes,...record.removedNodes].some(node=>node.nodeType===1&&node.namespaceURI!=='http://www.w3.org/2000/svg'));
 const d=root.document;if(!d)return;
 const make=(tag,text)=>{const n=d.createElement(tag);if(text)n.textContent=text;return n;};
 function home(){
  const welcome=d.getElementById('welcome');if(!welcome)return;
  const title=welcome.querySelector('h1');if(title&&title.textContent!=='Your projects')title.textContent='Your projects';
  const sources=welcome.querySelector('.android-source-actions');
  if(sources&&!d.getElementById('androidOpenProjectPage')){
   const page=make('dialog');page.id='androidOpenProjectPage';const header=make('header'),back=make('button','Back');back.type='button';back.setAttribute('aria-label','Back');const backIcon=root.KiCadUIIcons?.icon('back');if(backIcon)back.replaceChildren(backIcon);back.onclick=()=>page.close();header.append(back,make('strong','Open project'));
   const content=make('div');content.className='android-sheet-content';content.append(make('p','Choose where your design is saved.'));const entries=make('div');entries.className='android-source-list';entries.append(...sources.children);for(const [index,entry]of [...entries.children].entries())entry.dataset.icon=['folder','sheet','github','gitlab','cloud'][index];root.KiCadUIIcons?.decorate?.(entries);content.append(entries);page.append(header,content);d.body.append(page);
   const open=make('button','Open project');open.type='button';open.id='androidOpenProject';open.dataset.icon='folder';open.onclick=()=>page.showModal();sources.append(open);root.KiCadUIIcons?.decorate?.(sources);
   entries.addEventListener('click',e=>{if(e.target.closest('button'))page.close();});
   const heading=sources.previousElementSibling;if(heading?.classList.contains('android-launch-heading'))heading.hidden=true;
  }
  for(const actions of [...welcome.querySelectorAll('.android-engineering-actions')])if(!actions.closest('#androidHomeTools')){
   const heading=actions.previousElementSibling;const group=make('details');group.id='androidHomeTools';group.append(make('summary','Engineering tools'));actions.before(group);if(heading?.classList.contains('android-launch-heading'))heading.hidden=true;group.append(actions);
  }
  const library=d.getElementById('welcomeLibrary'),heading=d.querySelector('#recentProjects>h2');if(library&&heading&&library.parentElement!==heading){library.textContent='See all';library.setAttribute('aria-label','See all saved projects');heading.append(library);}
  const menu=d.querySelector('#appMenuDialog>.android-sheet-content');if(menu){
   for(const [id,title,ids]of [['accounts','Accounts',['githubButton','gitlabButton']],['files','Open from device',['openFiles','openFolder','cloudOpen']],['help','Help & about',['androidAboutButton','androidReadMeButton','androidTermsButton','androidPrivacyButton']]]){
    let group=d.getElementById('androidMenu-'+id);if(!group){group=make('details');group.id='androidMenu-'+id;group.className='android-menu-section';group.append(make('summary',title));menu.append(group);}
    for(const key of ids){const action=d.getElementById(key);if(action?.parentElement===menu)group.append(action);}
   }
   const tools=menu.querySelector('.android-engineering-actions');if(tools&&!tools.closest('.android-menu-section')){const group=make('details');group.className='android-menu-section';group.append(make('summary','Engineering tools'));menu.append(group);group.append(tools);}
  }
 }
 function drawing(){
  const rail=d.getElementById('androidViewToolbar');if(!rail)return;
  if(!rail.dataset.focused){rail.dataset.focused='true';d.body.classList.add('android-rail-hidden');const toggle=d.getElementById('androidRailToggle');if(toggle){toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Show drawing tools');toggle.title='Show drawing tools';const icon=root.KiCadUIIcons?.icon('tools');if(icon)toggle.replaceChildren(icon);}
   const properties=d.getElementById('androidRailProperties');if(properties)properties.hidden=true;
   const fit=make('button');fit.id='androidRailFit';fit.type='button';fit.setAttribute('aria-label','Fit drawing');fit.title='Fit drawing';fit.onclick=()=>d.getElementById('fitDrawing')?.click();fit.append(root.KiCadUIIcons?.icon('fit')||d.createTextNode('Fit'));rail.insertBefore(fit,rail.children[1]||null);
  }
  const selection=d.getElementById('selectionMode'),group=d.querySelector('#androidToolGroup-highlight>.android-tool-section-body');
  if(selection&&group&&selection.parentElement===rail){const label=make('label','Selection mode');label.className='android-selection-field';label.append(selection);group.prepend(label);}
 }
 function workspaceMenu(){
  const page=d.getElementById('androidWorkspaceSheet'),content=page?.querySelector('.android-sheet-content');if(!content)return;
  const section=(id,title,details=false)=>{let group=d.getElementById(id);if(!group){group=make(details?'details':'section');group.id=id;group.className='android-menu-group';group.append(make(details?'summary':'h2',title));content.append(group);}return group;};
  const view=section('androidWorkspaceViewActions','Workspace'),project=section('androidWorkspaceProjectActions','Project'),presentation=section('androidWorkspacePresentation','Presentation',true);
  const quick=d.getElementById('androidWorkspaceActions');if(quick&&quick.parentElement!==view)view.append(quick);
  for(const [id,label]of [['androidQuickSplit','Split schematic & layout'],['androidQuickCompare','Compare revisions']]){const action=d.getElementById(id);if(action&&!action.dataset.menuPrepared){action.dataset.menuPrepared='true';action.textContent=label;root.KiCadUIIcons?.decorate?.(quick);}}
  const original=d.getElementById('projectTools');if(original){
   if(original.parentElement!==view)view.append(original);
   for(const action of original.querySelectorAll(':scope>button')){
    // Android's pop-out transport opens the current view; it is not a separate
    // window. Keep that duplicate and the original split trigger out of the menu.
    if(action.id==='splitView'||/pop out/i.test(action.textContent)){if(!action.hidden)action.hidden=true;continue;}
    if(/fit panes/i.test(action.textContent)&&!action.dataset.menuPrepared){action.dataset.menuPrepared='true';action.dataset.icon='fit';action.textContent='Fit drawing panes';root.KiCadUIIcons?.decorate?.(action.parentElement);}
   }
  }
  const manage=page.querySelector('button[aria-label="Bookmark, save offline or download this project"]');if(manage&&manage.parentElement!==project){manage.textContent='Storage & sharing';manage.dataset.icon='folder';project.append(manage);root.KiCadUIIcons?.decorate?.(project);}
  const launch=content.querySelector('.presentation-launch');if(launch&&launch.parentElement!==presentation)presentation.append(launch);
  const heading=page.querySelector('header strong');if(heading&&heading.textContent!=='Project menu')heading.textContent='Project menu';
 }
 let scheduled=false;function refresh(){scheduled=false;home();drawing();workspaceMenu();}
 const schedule=()=>{if(scheduled)return;scheduled=true;queueMicrotask(refresh);};
 const start=()=>{d.body.classList.add('android-design');refresh();new MutationObserver(records=>{if(structureChanged(records))schedule();}).observe(d.body,{childList:true,subtree:true});};
 if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(globalThis);
