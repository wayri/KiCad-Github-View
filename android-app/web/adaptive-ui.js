/* Android-only presentation adapter. Shared controls keep their handlers and state. */
((root)=>{
 'use strict';
 const structureChanged=records=>records.some(record=>[...record.addedNodes,...record.removedNodes].some(node=>node.nodeType===1&&node.namespaceURI!=='http://www.w3.org/2000/svg'));
 const sizeClass=(width,height=root.innerHeight||Infinity)=>width<600?'compact':width<840||height<=500?'medium':'expanded';
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
  if(root.KiCadRepositoryExplorer?.close?.())return true;
  if(root.KiCadSectionPages?.back())return true;
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
  if(root.KiCadAndroidMeasurements?.handleBack?.())return true;
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
  const privacy=sheet('androidPrivacyDialog','Privacy policy');privacy.dialog.classList.add('android-reader-dialog');const policy=make('iframe');policy.title='Pocket KiView privacy policy';policy.src='privacy.html';policy.setAttribute('sandbox','');privacy.content.append(policy);const privacyButton=button('Privacy policy',()=>openSheet(privacy.dialog));privacyButton.id='androidPrivacyButton';menu.content.append(privacyButton);
  for(const [id,title,file,icon]of [['androidAbout','About','about.html','info'],['androidReadMe','Read Me','readme.html','sheet'],['androidTerms','Terms & disclaimers','terms.html','info']]){
   const reader=sheet(id+'Dialog',title);reader.dialog.classList.add('android-reader-dialog');const frame=make('iframe');frame.title='Pocket KiView '+title;frame.src=file;frame.setAttribute('sandbox','');reader.content.append(frame);
   const entry=button(title,()=>openSheet(reader.dialog));entry.id=id+'Button';entry.dataset.icon=icon;menu.content.append(entry);
  }
  header.prepend(button('Menu',API.openMenu));header.firstChild.id='appMenuButton';
  const globalHeading=make('h3','Open a project');globalHeading.className='android-menu-group-title';menu.content.append(globalHeading);for(const id of ['openFiles','openFolder'])menu.content.append($(id));const accountHeading=make('h3','Online accounts');accountHeading.className='android-menu-group-title';menu.content.append(accountHeading);for(const id of ['githubButton','gitlabButton'])menu.content.append($(id));
  for(const id of ['githubButton','gitlabButton'])$(id).addEventListener('click',()=>menu.dialog.close());
  for(const id of ['openFiles','openFolder'])$(id).addEventListener('click',()=>menu.dialog.close());
  const cloud=button('Open from Drive or cloud storage',()=>{$('openFiles').click();});cloud.id='cloudOpen';menu.content.append(cloud,make('p','Choose Drive or another storage provider in the Android file picker. For a complete cloud project, open its ZIP archive.'));menu.content.insertBefore(cloud,accountHeading);menu.content.append(privacyButton);const copy=button('Download project to device',()=>API.downloadProject());copy.id='downloadProject';const projectMenu=sheet('androidProjectActionsSheet','This project');const contextHeading=make('p','Actions apply only to the project you are viewing.');contextHeading.className='hint';projectMenu.content.append(contextHeading,$('projectPicker'),button('Bookmark project',()=>root.KiCadAndroidLibrary?.saveCurrent(false)),button('Save offline in app',()=>root.KiCadAndroidLibrary?.saveCurrent(true)),copy);API.openProjectActions=()=>{if(!root.KiCadAndroidProject)return;menu.dialog.close();openSheet(projectMenu.dialog);};
  const tempCopy=button('Temporary download',()=>{const project=root.KiCadAndroidProject,remote=project?.remote||project?.github;if(!remote)return;projectMenu.dialog.close();const source={...remote,ref:remote.sha,temporaryDownload:true};(project.remote?root.KiCadAndroidGitLab:root.KiCadAndroidGitHub)?.openProject(source);});tempCopy.id='temporaryProjectDownload';projectMenu.content.append(tempCopy);
  API.downloadProject=()=>{if(!root.KiCadAndroidProject)return;menu.dialog.close();projectMenu.dialog.close();if(root.AndroidKiCad?.downloadProject)root.AndroidKiCad.downloadProject();else $('importStatus').textContent='Saving ZIP files is available in the installed Android app.';};
  let loadingTask=null;API.loading=text=>{if(text){if(loadingTask)loadingTask.update(text);else loadingTask=root.KiCadLoading?.activity(text);}else{loadingTask?.end();loadingTask=null;}$('viewer').setAttribute('aria-busy',String(Boolean(text)));};
  const welcome=$('welcome'),actions=make('div');actions.className='android-welcome-actions';actions.dataset.actionGroup='open';actions.append(button('Open a project folder',()=> $('openFolder').click()),button('Open a file',()=> $('openFiles').click()),button('GitHub projects',()=> $('githubButton').click()),button('GitLab projects',()=> $('gitlabButton').click()),button('Drive / cloud file',()=>cloud.click()));welcome.append(actions);
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
  const update=()=>{const opened=!$('viewer').hidden;d.body.classList.toggle('android-viewing',opened);copy.disabled=!root.KiCadAndroidProject;tempCopy.disabled=!(root.KiCadAndroidProject?.github||root.KiCadAndroidProject?.remote);const p=root.KiCadAndroidProject;title.textContent=p?.name||'Pocket KiView';};new MutationObserver(update).observe($('viewer'),{attributes:true,attributeFilter:['hidden','src']});update();
 }
 function drawing(){
  if(!$('frameControls')||$('androidViewToolbar')||!$('universalSearch'))return;
  const tools=sheet('androidToolsSheet','Drawing tools'),search=sheet('androidSearchSheet','Search project');
  const toolbar=make('nav');toolbar.id='androidViewToolbar';toolbar.classList.add('android-drawing-rail');toolbar.setAttribute('aria-label','Drawing actions');
  const railToggle=button('Tools',()=>{const hidden=d.body.classList.toggle('android-rail-hidden');railToggle.setAttribute('aria-expanded',String(!hidden));railToggle.setAttribute('aria-label',hidden?'Show drawing tools':'Hide drawing tools');railToggle.title=railToggle.getAttribute('aria-label');},'Hide drawing tools');railToggle.id='androidRailToggle';railToggle.setAttribute('aria-controls','androidViewToolbar');railToggle.setAttribute('aria-expanded','true');const railIcon=root.KiCadUIIcons?.icon('inspect');if(railIcon)railToggle.replaceChildren(railIcon);d.body.append(railToggle);
  const menu=button('Menu',()=>root.top.KiCadAndroidUI?.openMenu?.(),'Project and accounts');menu.hidden=hasParentWorkspace(root);
  const fit=button('Fit',()=> $('fitDrawing')?.click(),'Fit drawing');fit.id='androidFitDrawing';
  const searchButton=button('Search',()=>{openSheet(search.dialog);$('universalSearch').focus();});
  const highlight=button('Highlight',()=>{const multi=$('multiHighlight');multi.checked=!multi.checked;multi.dispatchEvent(new Event('change',{bubbles:true}));highlight.setAttribute('aria-pressed',String(multi.checked));},'Toggle group highlighting');highlight.id='androidGroupHighlight';highlight.setAttribute('aria-pressed','false');
  const comments=button('Comments',()=>showPane('commentsSidebar','commentsButton'));
  const unselect=button('Unselect',()=> $('unselect')?.click());unselect.id='androidUnselect';
  const clearHighlights=button('Clear highlights',()=> $('clearHighlights')?.click());clearHighlights.id='androidClearHighlights';
  const more=button('More',()=>openSheet(tools.dialog),'More drawing tools');const paths=['M4 6h16M4 12h16M4 18h16','M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 6 6','M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5','M3 17 15 5l4 4L7 21H3v-4ZM13 7l4 4','M3 4h18v13H9l-6 4V4Z','M4 4h5M4 4v5M20 4h-5M20 4v5M4 20h5M4 20v-5M20 20h-5M20 20v-5M9 9l6 6M15 9l-6 6','M3 17 15 5l4 4L7 21H3v-4M5 3l16 18','M5 12h.01M12 12h.01M19 12h.01'];[menu,searchButton,fit,highlight,comments,unselect,clearHighlights,more].forEach((b,i)=>{const icon=d.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('width','24');icon.setAttribute('height','24');icon.setAttribute('aria-hidden','true');const path=d.createElementNS(icon.namespaceURI,'path');path.setAttribute('d',paths[i]);path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','2');path.setAttribute('stroke-linecap','round');if(b===more){for(const x of [5,12,19]){const dot=d.createElementNS(icon.namespaceURI,'circle');dot.setAttribute('cx',String(x));dot.setAttribute('cy','12');dot.setAttribute('r','1.8');dot.setAttribute('fill','currentColor');icon.append(dot);}}else icon.append(path);b.title=b.getAttribute('aria-label');b.replaceChildren(icon);});toolbar.append(menu,searchButton,fit,highlight,comments,unselect,clearHighlights,more);d.body.prepend(toolbar);
  const mode3d=$('mode3d');if(mode3d){toolbar.insertBefore(mode3d,more);mode3d.classList.add('android-3d-toggle');const sync3d=()=>{const active=mode3d.getAttribute('aria-pressed')==='true',icon=root.KiCadUIIcons?.icon(active?'board':'cube');if(icon)mode3d.replaceChildren(icon);else mode3d.textContent=active?'2D':'3D';mode3d.setAttribute('aria-label',active?'Switch layout to 2D':'Switch layout to 3D');mode3d.title=active?'Return to PCB layout':'View board in 3D';};sync3d();new MutationObserver(sync3d).observe(mode3d,{attributes:true,attributeFilter:['aria-pressed']});}
  const selection=$('selectionMode');selection.classList.add('android-selection-mode');for(const option of selection.options)if(option.value==='all')option.textContent='Smart';selection.title='Smart: choose a part or net under your touch. Part: components only. Net: connections only.';selection.setAttribute('aria-label','Selection mode');
  toolbar.insertBefore(selection,highlight);
  for(const [id,label,pane,trigger,icon] of [['androidRailExplorer','Project explorer','designNavigator','partsButton','folder'],['androidRailProperties','Properties','designInspector','propertiesButton','inspect']]){const action=button(label,()=>showPane(pane,trigger),label);action.id=id;action.title=label;const svg=root.KiCadUIIcons?.icon(icon);if(svg)action.replaceChildren(svg);toolbar.insertBefore(action,searchButton);}
  const layers=button('Layers',()=>{$('androidLayerToggle')?.click();},'Choose PCB layers');layers.id='androidRailLayers';layers.title='Choose PCB layers';const layerIcon=root.KiCadUIIcons?.icon('layers');if(layerIcon)layers.replaceChildren(layerIcon);layers.hidden=!$('floatingLayerSelector');toolbar.insertBefore(layers,more);
  // Preserve the shared select element, its current value and existing handlers.
  highlight.title='Group selection: add or remove parts and nets';
  search.content.append($('universalSearch').closest('.universal-search'),$('universalSearchResults'));
  $('universalSearch').addEventListener('keydown',e=>{if(e.key==='Enter'&&$('universalSearchResults').hidden)search.dialog.close();});
  $('universalSearchResults').addEventListener('click',event=>{if(event.target.closest('[role=option]'))search.dialog.close();});
  const allSheets=button('All sheets',()=>{root.KiCadSheetOverview?.open?.();tools.dialog.close();});allSheets.id='androidAllSheetsButton';allSheets.hidden=!root.KiCadSheetOverview;const shortcuts=make('div');shortcuts.className='android-pane-actions';shortcuts.append(allSheets,button('Sheets and parts',()=>showPane('designNavigator','partsButton')),button('Properties',()=>showPane('designInspector','propertiesButton')));tools.content.append(shortcuts);
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
  const tools=sheet('androidWorkspaceSheet','Views and revisions');const actions=make('div');actions.className='android-pane-actions';actions.append(button('This project',()=>{tools.dialog.close();root.top.KiCadAndroidUI?.openProjectActions?.();},'Bookmark, save offline or download this project'));tools.content.append(actions,$('projectTools'),$('toolbar'));const bar=make('div');bar.id='androidWorkspaceHeader';const back=button('Library',()=>root.top.KiCadAndroid?.showHome?.(),'Back to project library');back.dataset.icon='back';const options=button('Project',()=>openSheet(tools.dialog),'Project actions and view options');options.dataset.icon='menu';bar.append(back,make('strong',root.top.KiCadAndroidProject?.name||root.top.KiCadAndroidProject?.github?.repository||'KiCad project'),options);root.KiCadUIIcons?.decorate?.(bar);$('reviewHeader').append(bar);
 }
 function workspaceActions(){
  const nav=$('androidWorkspaceNav'),tools=$('androidWorkspaceSheet');if(!nav||!tools)return;
  let quick=$('androidWorkspaceActions');if(!quick){quick=make('div');quick.id='androidWorkspaceActions';quick.setAttribute('aria-label','Split and revision comparison');(tools.querySelector?.('.android-sheet-content')||tools).append(quick);}
  const split=$('splitView');if(split&&!$('androidQuickSplit')){const b=button('Split',()=>split.click(),'Split schematic and layout');b.id='androidQuickSplit';b.dataset.icon='flip';quick.append(b);root.KiCadUIIcons?.decorate?.(quick);const update=()=>{b.disabled=split.disabled;b.setAttribute('aria-pressed',split.getAttribute('aria-pressed')||'false');};update();new MutationObserver(update).observe(split,{attributes:true,attributeFilter:['disabled','aria-pressed']});}
  const picker=d.querySelector('.revision-picker');if(picker&&!$('androidQuickCompare')){const b=button('Compare',()=>{openSheet(tools);picker.open=true;picker.querySelector('input')?.focus();},'Compare commits');b.id='androidQuickCompare';b.dataset.icon='compare';quick.append(b);root.KiCadUIIcons?.decorate?.(quick);}
  // A split with several companions still uses the existing validated chooser.
  const chooser=$('pairChooser');if(chooser&&!chooser.dataset.androidBound){chooser.dataset.androidBound='true';let showing=false;new MutationObserver(()=>{if(!chooser.hidden){showing=true;openSheet(tools);}else if(showing){showing=false;tools.close();}}).observe(chooser,{attributes:true,attributeFilter:['hidden']});}
 }
 API.workspaceActions=workspaceActions;
 function organizeHomeActions(){
  const welcome=$('welcome'),menu=$('appMenuDialog')?.querySelector('.android-sheet-content');
  for(const host of [welcome,menu])if(host){
   for(const actions of [...host.children].filter(node=>node.classList.contains('android-welcome-actions'))){
    if(actions.dataset.organized)continue;
    actions.dataset.organized='true';
    const opening=actions.dataset.actionGroup==='open',heading=make('h2',opening?'Open project':'Engineering tools');
    heading.className='android-launch-heading';
    actions.classList.add(opening?'android-source-actions':'android-engineering-actions');
    host.insertBefore(heading,actions);
    // Engineering tools arrive after the quick-start links; keep help at the end.
    const help=[...host.children].find(node=>node.classList.contains('quick-start-link'));
    if(help&&!opening){host.insertBefore(heading,help);host.insertBefore(actions,help);}
   }
  }
 }
 API.organizeHomeActions=organizeHomeActions;
 function organizeDrawingTools(){
  const content=$('androidToolsSheet')?.querySelector('.android-sheet-content'),drawing=$('drawingTools');if(!content||!drawing)return;
  if(!content.dataset.organized){
   content.dataset.organized='true';drawing.classList.add('android-primary-tools');content.prepend(drawing);
   const heading=make('h3','Inspect drawing');heading.id='androidPrimaryToolsHeading';content.prepend(heading);
   for(const [id,title]of [['display','Display'],['highlight','Selection'],['navigation','Navigation'],['more','Engineering & utilities']]){const group=make('details');group.id='androidToolGroup-'+id;group.className='android-tool-section';const body=make('div');body.className='android-tool-section-body';group.append(make('summary',title),body);content.append(group);}
  }
  const groups=Object.fromEntries(['display','highlight','navigation','more'].map(id=>[id,$('androidToolGroup-'+id).querySelector('.android-tool-section-body')]));
  const primary=new Set(['openBomManager','openTestpoints','measureButton','androidMeasure','viewRuleChecks']);
  const display=new Set(['populationHighlight','gridButton','flipButton','toggleRuleMarkers','themeButton','settingsButton','androidCopperControls','variantBar','mode3d','netClassColors','ratsnestButton']);
  const highlight=new Set(['highlightControls','highlightTestpoints','androidGroupHighlight','androidUnselect','androidClearHighlights','androidSelectText']);
  const nav=new Set(['topSheetNavigation','fitPage','zoomOut','zoomIn','androidAllSheetsButton','projectButton','fitSelected','androidFitDrawing','openRepositoryExplorer']);
  const move=(node,target)=>{if(node.parentElement!==target)target.append(node);};
  // Move existing controls, preserving listeners, values and accessibility names.
  const secondarySelection=['androidGroupHighlight','androidUnselect','androidClearHighlights','androidFitDrawing','androidMeasure'].map($).filter(Boolean);
  for(const [id,label]of [['androidGroupHighlight','Group highlight'],['androidUnselect','Unselect'],['androidClearHighlights','Clear highlights'],['androidFitDrawing','Fit drawing'],['androidMeasure','Measure']]){
   const action=$(id);if(action&&!action.querySelector('.button-label')){const caption=make('span',label);caption.className='button-label';action.append(caption);}
  }
  // The late mobile measurement proxy shares the original handler and state.
  // Show one named tool, leaving room for Sidebar and More on a 320 px phone.
  if($('androidMeasure')&&$('measureButton'))$('measureButton').hidden=true;
  for(const node of [...drawing.children,...content.children,...secondarySelection]){
   if(node===drawing||node.id==='androidPrimaryToolsHeading'||node.classList.contains('android-tool-section'))continue;
   let target=primary.has(node.id)?drawing:display.has(node.id)?groups.display:highlight.has(node.id)?groups.highlight:nav.has(node.id)||node.classList.contains('android-pane-actions')?groups.navigation:groups.more;
   if(node.classList.contains('presentation-launch'))target=groups.more;
   move(node,target);
  }
  root.KiCadUIIcons?.decorate?.(content);
 }
 API.organizeDrawingTools=organizeDrawingTools;
 function copperControls(){
  const strip=$('floatingLayerSelector'),tools=$('androidToolsSheet')?.querySelector('.android-sheet-content');if(!strip||!tools||$('androidCopperControls'))return;
  const group=make('fieldset');group.id='androidCopperControls';group.append(make('legend','Copper zones'));const controls=[];
  for(const [name,text,id]of [['Filled copper','Show filled copper','androidShowFilledCopper'],['Zone outlines','Show zone outlines','androidShowZoneOutlines']]){const label=make('label'),input=make('input');input.type='checkbox';input.id=id;input.setAttribute('aria-label',text);label.append(input,make('span',text));group.append(label);input.onchange=()=>{const original=[...strip.querySelectorAll('[data-layer]')].find(b=>b.dataset.layer===name);if(original&&(original.getAttribute('aria-pressed')==='true')!==input.checked)original.click();sync();};controls.push({input,name});}
  const sync=()=>{group.hidden=strip.hidden;for(const {input,name}of controls){const original=[...strip.querySelectorAll('[data-layer]')].find(b=>b.dataset.layer===name);input.disabled=!original;input.checked=original?.getAttribute('aria-pressed')==='true';}};
  tools.prepend(group);sync();new MutationObserver(sync).observe(strip,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-pressed','hidden']});
 }
 function compactLayers(){
  copperControls();
  const strip=$('floatingLayerSelector');if(!strip||$('androidLayerToggle'))return;
  const options=make('div');options.className='android-layer-options';options.append(...strip.children);
  const toggle=button('Layers',()=>{const expanded=strip.classList.toggle('layers-expanded');toggle.setAttribute('aria-expanded',String(expanded));},'Choose PCB layers');toggle.id='androidLayerToggle';toggle.setAttribute('aria-expanded','false');strip.append(toggle,options);
  const update=()=>{const currentOptions=strip.querySelector('.android-layer-options'),currentToggle=strip.querySelector('#androidLayerToggle');if(!currentOptions||!currentToggle)return;const active=[...currentOptions.querySelectorAll('[data-layer][aria-pressed="true"]')].map(b=>b.dataset.layer).filter(name=>name!=='Overview');currentToggle.textContent=active.length===1?active[0]:'Layers';};
  if(!strip.dataset.compactBound){strip.dataset.compactBound='true';strip.addEventListener('click',event=>{if(event.target.closest?.('[data-layer]')){queueMicrotask(update);if(sizeClass(root.innerWidth)==='compact'){strip.classList.remove('layers-expanded');strip.querySelector('#androidLayerToggle')?.setAttribute('aria-expanded','false');}}});
  d.addEventListener('pointerdown',event=>{if(!strip.contains(event.target)){strip.classList.remove('layers-expanded');strip.querySelector('#androidLayerToggle')?.setAttribute('aria-expanded','false');}},true);}update();
 }
 const resize=()=>{const area=root.KiCadAndroidUsableViewport;const width=area?.width||root.innerWidth,height=area?.height||root.innerHeight;d.body.dataset.size=sizeClass(width,height);d.body.dataset.orientation=width>height?'landscape':'portrait';compactLayers();propertyBasics();};
 function syncWorkspaceOverlay(){try{const frame=root.frameElement;if(!frame)return;const blocked=panes.some(([id])=>visible($(id)))||Boolean(d.querySelector('dialog[open]'));const value=String(blocked);if(frame.dataset.androidOverlayOpen!==value)frame.dataset.androidOverlayOpen=value;}catch{}}
 function normalizeCloseButtons(){for(const b of d.querySelectorAll('dialog>header button,.sidebar-header button,.viewer-settings header button,#closeNavigator,#closeInspector,#closeComments,#closeRuleWindow,#closeSettings')){if(b.classList.contains('android-close-button')&&b.textContent==='×')continue;if(b.classList.contains('section-page-back'))continue;const text=b.textContent.trim(),label=b.getAttribute('aria-label')||'';if(!/^close\b/i.test(label)&&!/^close$|^[×✕]$/i.test(text)&&!['closeNavigator','closeInspector','closeComments','closeRuleWindow','closeSettings'].includes(b.id))continue;b.classList.add('android-close-button');b.removeAttribute('data-icon');b.type='button';b.setAttribute('aria-label',label||'Close panel');b.title=label||'Close panel';b.textContent='×';}}
 const preparedGroups=new WeakSet();function propertyBasics(){const all=$('allSheetPagesButton'),toolbar=$('androidViewToolbar');if(all&&toolbar){const navigation=$('androidToolGroup-navigation')?.querySelector('.android-tool-section-body');if(navigation){all.hidden=false;all.title='Toggle all schematic sheets on one canvas';all.setAttribute('aria-label','Toggle all sheets');if(all.parentElement!==navigation)navigation.append(all);}}if($('androidAllSheetsButton'))$('androidAllSheetsButton').hidden=!root.KiCadSheetOverview;if(sizeClass(root.innerWidth)!=='compact')return;for(const group of d.querySelectorAll('#propertyList details'))if(!preparedGroups.has(group)){preparedGroups.add(group);const title=group.querySelector('summary')?.textContent||'';group.open=/^(Identity|Electrical|Connected nets)$/.test(title);}}
 function init(){
  d.addEventListener('click',event=>{const modal=event.target;if(modal?.tagName!=='DIALOG'||!modal.open||modal.classList.contains('library-confirm')||modal.id==='androidDraftExit')return;const r=modal.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)modal.close();});
  d.addEventListener('pointerdown',event=>{if(sizeClass(root.innerWidth)==='expanded'||isField(event.target))return;for(const[id,close]of panes){const pane=$(id);if(visible(pane)&&!pane.contains(event.target)&&!event.target.closest?.('button,dialog,[role=dialog]'))$(close)?.click();}},true);
  // A field tap must never bubble into drawing selection or outside-dismiss handlers.
  for(const type of ['click','dblclick','contextmenu'])d.addEventListener(type,event=>{if(isField(event.target))event.stopPropagation();});
  resize();shell();drawing();workspace();workspaceActions();compactLayers();root.KiCadAndroidProjectUI?.mount();normalizeCloseButtons();organizeDrawingTools();organizeHomeActions();let queued=false;new MutationObserver(records=>{if(!structureChanged(records)||queued)return;queued=true;queueMicrotask(()=>{queued=false;drawing();workspace();workspaceActions();compactLayers();propertyBasics();normalizeCloseButtons();organizeDrawingTools();organizeHomeActions();syncWorkspaceOverlay();});}).observe(d.body,{childList:true,subtree:true});new MutationObserver(syncWorkspaceOverlay).observe(d.body,{attributes:true,subtree:true,attributeFilter:['hidden','open','class']});root.addEventListener('resize',resize);root.addEventListener('kicad-usable-viewport-changed',resize);d.addEventListener('keydown',e=>{if(e.key==='Escape'&&API.handleBack()){e.preventDefault();e.stopPropagation();}},true);}
 if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(globalThis);
