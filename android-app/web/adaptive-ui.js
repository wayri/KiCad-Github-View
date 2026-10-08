/* Android-only presentation adapter. Shared controls keep their handlers and state. */
((root)=>{
 'use strict';
 const sizeClass=width=>width<600?'compact':width<840?'medium':'expanded';
 const hasParentWorkspace=host=>{try{for(let frame=host.parent,depth=0;frame&&frame!==host&&depth<8;frame=frame.parent,depth++){if(frame.document?.getElementById('androidWorkspaceHeader'))return true;if(frame.parent===frame)break;}}catch{}return false;};
 const API={sizeClass,hasParentWorkspace};root.KiCadAndroidUI=API;
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
  const up=$('sheetUp');if(up&&!up.disabled){up.click();return true;}
  const back=$('sheetBack'),home=$('sheetHome');if(back&&!back.disabled&&(!home||!home.disabled)){back.click();return true;}
  if(visible($('viewer'))&&root.KiCadAndroid?.showHome){root.KiCadAndroid.showHome();return true;}
  return false;
 };
 function shell(){
  if(!d.body.classList.contains('android-home'))return;
  const header=d.querySelector('body>header'),title=header.querySelector('strong');title.id='appTitle';
  const menu=sheet('appMenuDialog','Library and accounts');API.openMenu=()=>openSheet(menu.dialog);
  header.prepend(button('Menu',API.openMenu));header.firstChild.id='appMenuButton';
  for(const id of ['openFiles','openFolder','projectPicker','githubButton','gitlabButton'])menu.content.append($(id));
  for(const id of ['githubButton','gitlabButton'])$(id).addEventListener('click',()=>menu.dialog.close());
  for(const id of ['openFiles','openFolder'])$(id).addEventListener('click',()=>menu.dialog.close());
  const cloud=button('Open from Drive or cloud storage',()=>{$('openFiles').click();});cloud.id='cloudOpen';menu.content.append(cloud,make('p','Choose Drive or another storage provider in Android’s file picker. For a complete cloud project, open its ZIP archive.'));const copy=button('Download project to device',()=>API.downloadProject());copy.id='downloadProject';menu.content.append(copy);
  API.downloadProject=()=>{if(!root.KiCadAndroidProject)return;menu.dialog.close();if(root.AndroidKiCad?.downloadProject)root.AndroidKiCad.downloadProject();else $('importStatus').textContent='Saving ZIP files is available in the installed Android app.';};
  const loading=make('section');loading.id='androidLoadingScreen';loading.hidden=true;loading.setAttribute('role','status');loading.setAttribute('aria-live','polite');const spinner=make('span');spinner.className='android-spinner';spinner.setAttribute('aria-hidden','true');const message=make('p');message.id='androidLoadingMessage';loading.append(spinner,make('strong','Preparing your project'),message);d.body.append(loading);API.loading=text=>{message.textContent=text||'';loading.hidden=!text;$('viewer').setAttribute('aria-busy',String(Boolean(text)));};
  const welcome=$('welcome'),actions=make('div');actions.className='android-welcome-actions';actions.append(button('Open a project folder',()=> $('openFolder').click()),button('Open a file',()=> $('openFiles').click()),button('GitHub projects',()=> $('githubButton').click()),button('GitLab projects',()=> $('gitlabButton').click()),button('Drive / cloud file',()=>cloud.click()));welcome.append(actions);
  const update=()=>{const opened=!$('viewer').hidden;d.body.classList.toggle('android-viewing',opened);copy.disabled=!root.KiCadAndroidProject;const p=root.KiCadAndroidProject;title.textContent=p?.name||'KiCad Visual Review';};new MutationObserver(update).observe($('viewer'),{attributes:true,attributeFilter:['hidden','src']});update();
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
  const selectionSheet=sheet('androidSelectionSheet','Selection');
  const selectButton=button('Select',()=>openSheet(selectionSheet.dialog),'Choose selection mode');
  root.KiCadUIIcons?.decorate?.(selectButton);
  selectButton.textContent='Select';toolbar.insertBefore(selectButton,highlight);
  const modeLabel=make('label','Select');modeLabel.htmlFor='selectionMode';selectionSheet.content.append(modeLabel,$('selectionMode'));
  const modeHelp=make('p','Smart offers parts and nets under your touch. Part selects components; Net highlights connections. Turn on Highlight to add or remove items from a group.');selectionSheet.content.append(modeHelp);
  $('selectionMode').addEventListener('change',()=>{selectButton.textContent=$('selectionMode').value==='all'?'Smart':$('selectionMode').value==='part'?'Part':'Net';selectButton.setAttribute('aria-label','Choose selection mode: '+selectButton.textContent);selectionSheet.dialog.close();});
  search.content.append($('universalSearch').closest('.universal-search'),$('universalSearchResults'));
  $('universalSearch').addEventListener('keydown',e=>{if(e.key==='Enter'&&$('universalSearchResults').hidden)search.dialog.close();});
  $('universalSearchResults').addEventListener('click',event=>{if(event.target.closest('[role=option]'))search.dialog.close();});
  const shortcuts=make('div');shortcuts.className='android-pane-actions';shortcuts.append(button('BoM manager',()=>{$('openBomManager')?.click();}),button('Sheets and parts',()=>showPane('designNavigator','partsButton')),button('Properties',()=>showPane('designInspector','propertiesButton')),button('Clear highlights',()=>{$('clearHighlights').click();$('multiHighlight').checked=false;highlight.setAttribute('aria-pressed','false');tools.dialog.close();}));tools.content.append(shortcuts);
  for(const id of ['topSheetNavigation','drawingTools','highlightControls','variantBar'])if($(id))tools.content.append($(id));
  const selectText=button('Select text mode',()=>{API.setTextSelection(!d.body.classList.contains('text-select-mode'));tools.dialog.close();},'Select text mode');selectText.id='androidSelectText';selectText.setAttribute('aria-pressed','false');tools.content.append(selectText);
  const textSheet=sheet('androidTextSheet','Select and copy drawing text'),textBox=make('textarea');textBox.id='androidCopyText';textBox.readOnly=true;textBox.setAttribute('aria-label','Text from the active drawing');
  textSheet.content.append(make('p','Long-press to select and copy saved drawing text. Comment boxes always support normal copy and paste.'),textBox,button('Select all',()=>{textBox.focus();textBox.select();}));
  root.addEventListener('kicad:drawing-text-result',event=>{textBox.value=String(event.detail?.text||'');openSheet(textSheet.dialog);});
  tools.content.append(button('Copy drawing text',()=>root.dispatchEvent(new Event('kicad:request-drawing-text'))));
  // Include remaining commands, without the redundant desktop identity / controls.
  for(const b of [...$('frameControls').querySelectorAll('button')])if(!['partsButton','propertiesButton','commentsButton','fitDrawing','reviewToolsButton','focusView'].includes(b.id))tools.content.append(b);
  const text=make('p','Use Select to choose Smart, Part or Net. Nearby parts and nets appear in a chooser. Turn on Highlight to select a group. Hold a drawing location for comments and net actions. Double-tap a sheet to enter it.');tools.content.prepend(text);tools.content.addEventListener('click',e=>{if(e.target.closest('button'))tools.dialog.close();});
  const actions=make('div');actions.className='android-comment-actions';for(const id of ['commentPostRow','saveComment','cancelComment'])if($(id))actions.append($(id));$('commentEditor').append(actions);
  exitDraft=sheet('androidDraftExit','Unsaved comment');exitDraft.content.append(make('p','Save this comment as a local draft before leaving, or discard it.'),button('Keep editing',()=>{exitDraft.dialog.close();showPane('commentsSidebar','commentsButton');$('commentText').focus();}),button('Save draft',()=>{exitDraft.dialog.close();showPane('commentsSidebar','commentsButton');$('saveComment').click();}),button('Discard draft',()=>{$('cancelComment').click();exitDraft.dialog.close();}));
  $('addCommentTab')?.addEventListener('click',()=>{if($('commentEditor').hidden)$('newComment').click();});
  // These headings need only Pin and Close on tablets; phone sheets close with Back.
  for(const id of ['expandNavigator','tallNavigator','expandProperties','tallProperties','expandComments','tallComments'])if($(id))$(id).hidden=true;
 }
 function workspace(){
  if(!$('workspaceTabs')||$('androidWorkspaceNav'))return;
  const nav=make('nav');nav.id='androidWorkspaceNav';nav.setAttribute('aria-label','Project views');nav.append($('workspaceTabs'));d.body.append(nav);
  const tools=sheet('androidWorkspaceSheet','Views and revisions');tools.content.append($('projectTools'),$('toolbar'));const bar=make('div');bar.id='androidWorkspaceHeader';bar.append(button('Menu',()=>root.top.KiCadAndroidUI?.openMenu?.(),'Project and accounts'),make('strong',root.top.KiCadAndroidProject?.offline?'Offline project':'KiCad project'),button('Views',()=>openSheet(tools.dialog),'Split view and compare revisions'));$('reviewHeader').append(bar);
 }
 function compactLayers(){
  const strip=$('floatingLayerSelector');if(!strip||$('androidLayerToggle'))return;
  const options=make('div');options.className='android-layer-options';options.append(...strip.children);
  const toggle=button('Layers',()=>{const expanded=strip.classList.toggle('layers-expanded');toggle.setAttribute('aria-expanded',String(expanded));},'Choose PCB layers');toggle.id='androidLayerToggle';toggle.setAttribute('aria-expanded','false');strip.append(toggle,options);
  const update=()=>{const currentOptions=strip.querySelector('.android-layer-options'),currentToggle=strip.querySelector('#androidLayerToggle');if(!currentOptions||!currentToggle)return;const active=[...currentOptions.querySelectorAll('[data-layer][aria-pressed="true"]')].map(b=>b.dataset.layer).filter(name=>name!=='Overview');currentToggle.textContent=active.length===1?active[0]:'Layers';};
  if(!strip.dataset.compactBound){strip.dataset.compactBound='true';strip.addEventListener('click',event=>{if(event.target.closest?.('[data-layer]')){queueMicrotask(update);if(sizeClass(root.innerWidth)==='compact'){strip.classList.remove('layers-expanded');strip.querySelector('#androidLayerToggle')?.setAttribute('aria-expanded','false');}}});
  d.addEventListener('pointerdown',event=>{if(!strip.contains(event.target)){strip.classList.remove('layers-expanded');strip.querySelector('#androidLayerToggle')?.setAttribute('aria-expanded','false');}},true);}update();
 }
 const resize=()=>d.body.dataset.size=sizeClass(root.innerWidth);
 function init(){
  d.addEventListener('click',event=>{const modal=event.target;if(modal?.tagName!=='DIALOG'||!modal.open||modal.classList.contains('library-confirm')||modal.id==='androidDraftExit')return;const r=modal.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)modal.close();});
  d.addEventListener('pointerdown',event=>{if(sizeClass(root.innerWidth)==='expanded')return;for(const[id,close]of panes){const pane=$(id);if(visible(pane)&&!pane.contains(event.target)&&!event.target.closest?.('button,dialog,[role=dialog]'))$(close)?.click();}},true);
  resize();shell();drawing();workspace();compactLayers();root.KiCadAndroidProjectUI?.mount();let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;drawing();workspace();compactLayers();});}).observe(d.body,{childList:true,subtree:true});root.addEventListener('resize',resize);d.addEventListener('keydown',e=>{if(e.key==='Escape'&&API.handleBack()){e.preventDefault();e.stopPropagation();}},true);}
 if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(globalThis);
