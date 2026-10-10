/* Android-only presentation adapter. Shared controls keep their handlers and state. */
((root)=>{
 'use strict';
 const sizeClass=width=>width<600?'compact':width<840?'medium':'expanded';
 const hasParentWorkspace=host=>{try{for(let frame=host.parent,depth=0;frame&&frame!==host&&depth<8;frame=frame.parent,depth++){if(frame.document?.getElementById('androidWorkspaceHeader'))return true;if(frame.parent===frame)break;}}catch{}return false;};
 const isField=node=>Boolean(node?.closest?.('input,textarea,select,output,[contenteditable=true]'));
 const API={sizeClass,hasParentWorkspace,isField};root.KiCadAndroidUI=API;
 if(typeof module==='object'&&module.exports)module.exports=API;
 if(!root.document)return;
 const d=root.document,$=id=>d.getElementById(id),make=(tag,text)=>{const n=d.createElement(tag);if(text)n.textContent=text;return n;};
 const button=(text,action,label=text)=>{const b=make('button',text);b.type='button';b.setAttribute('aria-label',label);b.onclick=action;return b;};
 const panes=[['designNavigator','closeNavigator','pinNavigator'],['designInspector','closeInspector','pinProperties'],['commentsSidebar','closeComments','pinComments']];
 const visible=node=>node&&!node.hidden&&[...node.getClientRects()].some(rect=>rect.width>0&&rect.height>0);
 let lastFocus=null,exitDraft=null;
 API.setTextSelection=enabled=>{d.body.classList.toggle('text-select-mode',Boolean(enabled));$('androidSelectText')?.setAttribute('aria-pressed',String(Boolean(enabled)));if(!enabled)root.getSelection?.()?.removeAllRanges();};
 function closePanes(except){for(const[id,close]of panes)if(id!==except&&visible($(id)))$(close)?.click();}
 function sheet(id,title){const dialog=make('dialog');dialog.id=id;const header=make('header');header.append(make('strong',title),button('Close',()=>dialog.close(),'Close '+title));const content=make('div');content.className='android-sheet-content';dialog.append(header,content);d.body.append(dialog);dialog.addEventListener('cancel',e=>e.preventDefault());dialog.addEventListener('close',()=>lastFocus?.focus?.());return{dialog,content};}
 function openSheet(dialog){lastFocus=d.activeElement;for(const other of d.querySelectorAll('dialog[open]'))if(other!==dialog)other.close();closePanes();if(!dialog.open)dialog.showModal();}
 function showPane(id,trigger){for(const modal of d.querySelectorAll('dialog[open]'))modal.close();if(sizeClass(root.innerWidth)!=='expanded')closePanes(id);if($(id)?.hidden)$(trigger)?.click();if(sizeClass(root.innerWidth)!=='expanded'){const pin=panes.find(p=>p[0]===id)?.[2];if($(pin)?.getAttribute('aria-pressed')==='false')$(pin).click();}}
 API.handleBack=()=>{
  if(root.KiCadAndroidTooltips?.dismiss?.())return true;
  if(root.top?.KiCadAndroidPresentation?.stop?.())return true;
  const modal=[...d.querySelectorAll('dialog[open]')].at(-1);if(modal){modal.close();return true;}
  for(const frame of [...d.querySelectorAll('iframe')].reverse())if(visible(frame)){try{if(frame.contentWindow.KiCadAndroidUI?.handleBack())return true;}catch{}}
  if(visible($('ruleWindow'))){$('closeRuleWindow')?.click();return true;}
  if(visible($('viewerSettings'))){$('closeSettings')?.click();return true;}
  for(const id of ['objectMenu','companionChooser','extraReviewControls'])if(visible($(id))){$(id).hidden=true;return true;}
  for(const[id,close]of [...panes].reverse())if(visible($(id))){$(close)?.click();return true;}
  for(const detail of d.querySelectorAll('details[open]'))if(visible(detail)){detail.open=false;return true;}
  if(exitDraft&&!$('commentEditor')?.hidden&&$('commentText')?.value.trim()){openSheet(exitDraft.dialog);return true;}
  // Shared sheet navigation knows the actual parent, including scattered subsheets.
  if(d.body?.classList.contains('text-select-mode')){API.setTextSelection(false);return true;}
  const overview=root.KiCadSheetOverview;if(overview?.isOpen?.()||visible($('sheetOverview'))){overview?.close?.();return true;}
  const up=$('sheetUp');if(up&&!up.disabled){up.click();return true;}
  const back=$('sheetBack'),home=$('sheetHome');if(back&&!back.disabled&&(!home||!home.disabled)){back.click();return true;}
  if(visible($('viewer'))&&root.KiCadAndroid?.showHome){root.KiCadAndroid.showHome();return true;}
  return false;
 };
 function shell(){
  if(!d.body.classList.contains('android-home'))return;
  const header=d.querySelector('body>header'),title=header.querySelector('strong');title.id='appTitle';
  const menu=sheet('appMenuDialog','Library and accounts');API.openMenu=()=>openSheet(menu.dialog);
  const privacy=sheet('androidPrivacyDialog','Privacy');const policy=make('iframe');policy.title='Pocket KiVi privacy policy';policy.src='privacy.html';policy.setAttribute('sandbox','');policy.style.cssText='width:100%;height:65vh;border:0;background:white;';privacy.content.append(policy);const privacyButton=button('Privacy policy',()=>openSheet(privacy.dialog));privacyButton.id='androidPrivacyButton';menu.content.append(privacyButton);
  header.prepend(button('Menu',API.openMenu));header.firstChild.id='appMenuButton';
  const globalHeading=make('h3','Open a project');globalHeading.className='android-menu-group-title';menu.content.append(globalHeading);for(const id of ['openFiles','openFolder'])menu.content.append($(id));const accountHeading=make('h3','Online accounts');accountHeading.className='android-menu-group-title';menu.content.append(accountHeading);for(const id of ['githubButton','gitlabButton'])menu.content.append($(id));
  for(const id of ['githubButton','gitlabButton'])$(id).addEventListener('click',()=>menu.dialog.close());
  for(const id of ['openFiles','openFolder'])$(id).addEventListener('click',()=>menu.dialog.close());
  const cloud=button('Open from Drive or cloud storage',()=>{$('openFiles').click();});cloud.id='cloudOpen';menu.content.append(cloud,make('p','Choose Drive or another storage provider in the Android file picker. For a complete cloud project, open its ZIP archive.'));menu.content.insertBefore(cloud,accountHeading);menu.content.append(privacyButton);const copy=button('Download project to device',()=>API.downloadProject());copy.id='downloadProject';const projectMenu=sheet('androidProjectActionsSheet','This project');const contextHeading=make('p','Actions apply only to the project you are viewing.');contextHeading.className='hint';projectMenu.content.append(contextHeading,$('projectPicker'),button('Bookmark project',()=>root.KiCadAndroidLibrary?.saveCurrent(false)),button('Save offline in app',()=>root.KiCadAndroidLibrary?.saveCurrent(true)),copy);API.openProjectActions=()=>{if(!root.KiCadAndroidProject)return;menu.dialog.close();openSheet(projectMenu.dialog);};
  const tempCopy=button('Temporary download (6 hours)',()=>{const project=root.KiCadAndroidProject,remote=project?.remote||project?.github;if(!remote)return;projectMenu.dialog.close();const source={...remote,ref:remote.sha,temporaryDownload:true};(project.remote?root.KiCadAndroidGitLab:root.KiCadAndroidGitHub)?.openProject(source);});tempCopy.id='temporaryProjectDownload';projectMenu.content.append(tempCopy);
  API.downloadProject=()=>{if(!root.KiCadAndroidProject)return;menu.dialog.close();projectMenu.dialog.close();if(root.AndroidKiCad?.downloadProject)root.AndroidKiCad.downloadProject();else $('importStatus').textContent='Saving ZIP files is available in the installed Android app.';};
  const loading=make('section');loading.id='androidLoadingScreen';loading.hidden=true;loading.setAttribute('role','status');loading.setAttribute('aria-live','polite');const spinner=make('span');spinner.className='android-spinner';spinner.setAttribute('aria-hidden','true');const message=make('p');message.id='androidLoadingMessage';loading.append(spinner,make('strong','Preparing your project'),message);d.body.append(loading);API.loading=text=>{message.textContent=text||'';loading.hidden=!text;$('viewer').setAttribute('aria-busy',String(Boolean(text)));};
  const welcome=$('welcome'),actions=make('div');actions.className='android-welcome-actions';actions.append(button('Open a project folder',()=> $('openFolder').click()),button('Open a file',()=> $('openFiles').click()),button('GitHub projects',()=> $('githubButton').click()),button('GitLab projects',()=> $('gitlabButton').click()),button('Drive / cloud file',()=>cloud.click()));welcome.append(actions);
  for(const provider of ['github','gitlab']){
   const content=$(provider+'Dialog').querySelector('.github-content'),repository=$(provider+'Repository').closest('label'),ref=$(provider+'Ref').closest('label');
   const advanced=make('details');advanced.className='android-repository-options';advanced.append(make('summary','Branch or revision'),ref);
   const intro=make('p','Paste a project link to view it. Connect an account below for private projects and publishing.');intro.className='github-help';
   const heading=make('h3','Account access');heading.className='android-menu-group-title';
   const account=$(provider+'Account');content.insertBefore(heading,account);
   // Keep all original handlers and IDs, including progress and account state.
   const first=content.firstChild;for(const node of [intro,repository,advanced,$(provider+'Add'),$(provider+'Status'),$(provider+'Spinner')])content.insertBefore(node,first);
   const scopeHelp=[...content.children].find(node=>node.classList?.contains('github-help')&&node!==intro);
   if(scopeHelp){const info=make('details');info.append(make('summary','Permissions and privacy'),scopeHelp);content.insertBefore(info,account.nextElementSibling?.nextElementSibling||null);}
  }
  const update=()=>{const opened=!$('viewer').hidden;d.body.classList.toggle('android-viewing',opened);copy.disabled=!root.KiCadAndroidProject;tempCopy.disabled=!(root.KiCadAndroidProject?.github||root.KiCadAndroidProject?.remote);const p=root.KiCadAndroidProject;title.textContent=p?.name||'Pocket KiVi';};new MutationObserver(update).observe($('viewer'),{attributes:true,attributeFilter:['hidden','src']});update();
 }
 function drawing(){
  if(!$('frameControls')||$('androidViewToolbar')||!$('universalSearch'))return;
  const tools=sheet('androidToolsSheet','Drawing tools'),search=sheet('androidSearchSheet','Search project');
  const toolbar=make('nav');toolbar.id='androidViewToolbar';toolbar.setAttribute('aria-label','Drawing actions');
  const menu=button('Menu',()=>root.top.KiCadAndroidUI?.openMenu?.(),'Project and accounts');menu.hidden=hasParentWorkspace(root);
  const fit=button('Fit',()=> $('fitDrawing')?.click(),'Fit drawing');
  const searchButton=button('Search',()=>{openSheet(search.dialog);$('universalSearch').focus();});
  const highlight=button('Highlight',()=>{const multi=$('multiHighlight');multi.checked=!multi.checked;multi.dispatchEvent(new Event('change',{bubbles:true}));highlight.setAttribute('aria-pressed',String(multi.checked));},'Toggle group highlighting');highlight.setAttribute('aria-pressed','false');
  const comments=button('Comments',()=>showPane('commentsSidebar','commentsButton'));
  const more=button('More',()=>openSheet(tools.dialog),'More drawing tools');const paths=['M4 6h16M4 12h16M4 18h16','M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 6 6','M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5','M3 17 15 5l4 4L7 21H3v-4ZM13 7l4 4','M3 4h18v13H9l-6 4V4Z','M5 12h.01M12 12h.01M19 12h.01'];[menu,searchButton,fit,highlight,comments,more].forEach((b,i)=>{const icon=d.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('width','24');icon.setAttribute('height','24');icon.setAttribute('aria-hidden','true');const path=d.createElementNS(icon.namespaceURI,'path');path.setAttribute('d',paths[i]);path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','2');path.setAttribute('stroke-linecap','round');icon.append(path);b.title=b.getAttribute('aria-label');b.replaceChildren(icon);});toolbar.append(menu,searchButton,fit,highlight,comments,more);d.body.prepend(toolbar);
  const mode3d=$('mode3d');if(mode3d){toolbar.insertBefore(mode3d,more);mode3d.classList.add('android-3d-toggle');const sync3d=()=>{const active=mode3d.getAttribute('aria-pressed')==='true';mode3d.textContent=active?'2D':'3D';mode3d.setAttribute('aria-label',active?'Switch layout to 2D':'Switch layout to 3D');mode3d.title=active?'Return to PCB layout':'View board in 3D';};sync3d();new MutationObserver(sync3d).observe(mode3d,{attributes:true,attributeFilter:['aria-pressed']});}
  const selection=$('selectionMode');selection.classList.add('android-selection-mode');for(const option of selection.options)if(option.value==='all')option.textContent='Smart';selection.title='Smart: choose a part or net under your touch. Part: components only. Net: connections only.';selection.setAttribute('aria-label','Selection mode');
  toolbar.insertBefore(selection,highlight);
  // Preserve the shared select element, its current value and existing handlers.
  highlight.title='Group selection: add or remove parts and nets';
  search.content.append($('universalSearch').closest('.universal-search'),$('universalSearchResults'));
  $('universalSearch').addEventListener('keydown',e=>{if(e.key==='Enter'&&$('universalSearchResults').hidden)search.dialog.close();});
  $('universalSearchResults').addEventListener('click',event=>{if(event.target.closest('[role=option]'))search.dialog.close();});
  const allSheets=button('All sheets',()=>{root.KiCadSheetOverview?.open?.();tools.dialog.close();});allSheets.id='androidAllSheetsButton';allSheets.hidden=!root.KiCadSheetOverview;const shortcuts=make('div');shortcuts.className='android-pane-actions';shortcuts.append(allSheets,button('BoM manager',()=>{$('openBomManager')?.click();}),button('Sheets and parts',()=>showPane('designNavigator','partsButton')),button('Properties',()=>showPane('designInspector','propertiesButton')),button('Clear highlights',()=>{$('clearHighlights').click();$('multiHighlight').checked=false;highlight.setAttribute('aria-pressed','false');tools.dialog.close();}));tools.content.append(shortcuts);
  for(const id of ['topSheetNavigation','drawingTools','highlightControls','variantBar'])if($(id))tools.content.append($(id));
  const selectText=button('Select text mode',()=>{API.setTextSelection(!d.body.classList.contains('text-select-mode'));tools.dialog.close();},'Select text mode');selectText.id='androidSelectText';selectText.setAttribute('aria-pressed','false');tools.content.append(selectText);
  const textSheet=sheet('androidTextSheet','Select and copy drawing text'),textBox=make('textarea');textBox.id='androidCopyText';textBox.readOnly=true;textBox.setAttribute('aria-label','Text from the active drawing');
  textSheet.content.append(make('p','Long-press to select and copy saved drawing text. Comment boxes always support normal copy and paste.'),textBox,button('Select all',()=>{textBox.focus();textBox.select();}));
  root.addEventListener('kicad:drawing-text-result',event=>{textBox.value=String(event.detail?.text||'');openSheet(textSheet.dialog);});
  tools.content.append(button('Copy drawing text',()=>root.dispatchEvent(new Event('kicad:request-drawing-text'))));
  // Include remaining commands, without the redundant desktop identity / controls.
  for(const b of [...$('frameControls').querySelectorAll('button')])if(!['partsButton','propertiesButton','commentsButton','fitDrawing','reviewToolsButton','focusView','allSheetPagesButton'].includes(b.id))tools.content.append(b);
  const help=make('details');help.className='android-tool-help';help.append(make('summary','Touch controls'),make('p','Select chooses Smart, Part or Net. Highlight adds items to a group. Hold the drawing for comments and net actions; double-tap a sheet to enter it.'));tools.content.append(help);
  // Close only launch actions. Toggles, navigation and field controls stay available.
  shortcuts.addEventListener('click',e=>{if(e.target.closest('button'))tools.dialog.close();});
  const actions=make('div');actions.className='android-comment-actions';actions.addEventListener('pointerdown',event=>{if(sizeClass(root.innerWidth)==='compact'&&d.activeElement===$('commentText')&&event.target.closest?.('button'))event.preventDefault();});for(const id of ['commentPostRow','saveComment','cancelComment'])if($(id))actions.append($(id));$('commentEditor').append(actions);
  exitDraft=sheet('androidDraftExit','Unsaved comment');exitDraft.content.append(make('p','Save this comment as a local draft before leaving, or discard it.'),button('Keep editing',()=>{exitDraft.dialog.close();showPane('commentsSidebar','commentsButton');$('commentText').focus();}),button('Save draft',()=>{exitDraft.dialog.close();showPane('commentsSidebar','commentsButton');$('saveComment').click();}),button('Discard draft',()=>{$('cancelComment').click();exitDraft.dialog.close();}));
  $('addCommentTab')?.addEventListener('click',()=>{if($('commentEditor').hidden)$('newComment').click();});
  // These headings need only Pin and Close on tablets; phone sheets close with Back.
  for(const id of ['expandNavigator','tallNavigator','expandProperties','tallProperties','expandComments','tallComments'])if($(id))$(id).hidden=true;
 }
 function workspace(){
  if(!$('workspaceTabs')||$('androidWorkspaceNav'))return;
  const nav=make('nav');nav.id='androidWorkspaceNav';nav.setAttribute('aria-label','Project views');nav.append($('workspaceTabs'));d.body.append(nav);
  const tools=sheet('androidWorkspaceSheet','Views and revisions');const actions=make('div');actions.className='android-pane-actions';actions.append(button('This project',()=>{tools.dialog.close();root.top.KiCadAndroidUI?.openProjectActions?.();},'Bookmark, save offline or download this project'));tools.content.append(actions,$('projectTools'),$('toolbar'));const bar=make('div');bar.id='androidWorkspaceHeader';bar.append(button('Library',()=>root.top.KiCadAndroidUI?.openMenu?.(),'Library and accounts'),make('strong',root.top.KiCadAndroidProject?.name||root.top.KiCadAndroidProject?.github?.repository||'KiCad project'),button('Project',()=>openSheet(tools.dialog),'Project actions and view options'));$('reviewHeader').append(bar);
 }
 function workspaceActions(){
  const nav=$('androidWorkspaceNav'),tools=$('androidWorkspaceSheet');if(!nav||!tools)return;
  let quick=$('androidWorkspaceActions');if(!quick){quick=make('div');quick.id='androidWorkspaceActions';quick.setAttribute('aria-label','Split and revision comparison');nav.append(quick);}
  const split=$('splitView');if(split&&!$('androidQuickSplit')){const b=button('Split',()=>split.click(),'Split schematic and layout');b.id='androidQuickSplit';b.dataset.icon='flip';quick.append(b);root.KiCadUIIcons?.decorate?.(quick);const update=()=>{b.disabled=split.disabled;b.setAttribute('aria-pressed',split.getAttribute('aria-pressed')||'false');};update();new MutationObserver(update).observe(split,{attributes:true,attributeFilter:['disabled','aria-pressed']});}
  const picker=d.querySelector('.revision-picker');if(picker&&!$('androidQuickCompare')){const b=button('Compare',()=>{openSheet(tools);picker.open=true;picker.querySelector('input')?.focus();},'Compare commits');b.id='androidQuickCompare';b.dataset.icon='compare';quick.append(b);root.KiCadUIIcons?.decorate?.(quick);}
  // A split with several companions still uses the existing validated chooser.
  const chooser=$('pairChooser');if(chooser&&!chooser.dataset.androidBound){chooser.dataset.androidBound='true';let showing=false;new MutationObserver(()=>{if(!chooser.hidden){showing=true;openSheet(tools);}else if(showing){showing=false;tools.close();}}).observe(chooser,{attributes:true,attributeFilter:['hidden']});}
 }
 API.workspaceActions=workspaceActions;
 function compactLayers(){
  const strip=$('floatingLayerSelector');if(!strip||$('androidLayerToggle'))return;
  const options=make('div');options.className='android-layer-options';options.append(...strip.children);
  const toggle=button('Layers',()=>{const expanded=strip.classList.toggle('layers-expanded');toggle.setAttribute('aria-expanded',String(expanded));},'Choose PCB layers');toggle.id='androidLayerToggle';toggle.setAttribute('aria-expanded','false');strip.append(toggle,options);
  const update=()=>{const currentOptions=strip.querySelector('.android-layer-options'),currentToggle=strip.querySelector('#androidLayerToggle');if(!currentOptions||!currentToggle)return;const active=[...currentOptions.querySelectorAll('[data-layer][aria-pressed="true"]')].map(b=>b.dataset.layer).filter(name=>name!=='Overview');currentToggle.textContent=active.length===1?active[0]:'Layers';};
  if(!strip.dataset.compactBound){strip.dataset.compactBound='true';strip.addEventListener('click',event=>{if(event.target.closest?.('[data-layer]')){queueMicrotask(update);if(sizeClass(root.innerWidth)==='compact'){strip.classList.remove('layers-expanded');strip.querySelector('#androidLayerToggle')?.setAttribute('aria-expanded','false');}}});
  d.addEventListener('pointerdown',event=>{if(!strip.contains(event.target)){strip.classList.remove('layers-expanded');strip.querySelector('#androidLayerToggle')?.setAttribute('aria-expanded','false');}},true);}update();
 }
 const resize=()=>d.body.dataset.size=sizeClass(root.innerWidth);
 const preparedGroups=new WeakSet();function propertyBasics(){const all=$('allSheetPagesButton'),toolbar=$('androidViewToolbar');if(all&&toolbar){all.hidden=false;if(all.parentElement!==toolbar){all.classList.add('android-all-sheets');all.title='Toggle all schematic sheets on one canvas';all.setAttribute('aria-label','Toggle all sheets');toolbar.insertBefore(all,toolbar.lastElementChild);}}if($('androidAllSheetsButton'))$('androidAllSheetsButton').hidden=!root.KiCadSheetOverview;if(sizeClass(root.innerWidth)!=='compact')return;for(const group of d.querySelectorAll('#propertyList details'))if(!preparedGroups.has(group)){preparedGroups.add(group);const title=group.querySelector('summary')?.textContent||'';group.open=/^(Identity|Electrical|Connected nets)$/.test(title);}}
 function init(){
  d.addEventListener('click',event=>{const modal=event.target;if(modal?.tagName!=='DIALOG'||!modal.open||modal.classList.contains('library-confirm')||modal.id==='androidDraftExit')return;const r=modal.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)modal.close();});
  d.addEventListener('pointerdown',event=>{if(sizeClass(root.innerWidth)==='expanded'||isField(event.target))return;for(const[id,close]of panes){const pane=$(id);if(visible(pane)&&!pane.contains(event.target)&&!event.target.closest?.('button,dialog,[role=dialog]'))$(close)?.click();}},true);
  // A field tap must never bubble into drawing selection or outside-dismiss handlers.
  for(const type of ['click','dblclick','contextmenu'])d.addEventListener(type,event=>{if(isField(event.target))event.stopPropagation();});
  resize();shell();drawing();workspace();workspaceActions();compactLayers();root.KiCadAndroidProjectUI?.mount();let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;drawing();workspace();workspaceActions();compactLayers();propertyBasics();});}).observe(d.body,{childList:true,subtree:true});root.addEventListener('resize',resize);d.addEventListener('keydown',e=>{if(e.key==='Escape'&&API.handleBack()){e.preventDefault();e.stopPropagation();}},true);}
 if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(globalThis);
