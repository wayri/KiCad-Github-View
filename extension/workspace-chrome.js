/* Shared web/VS Code presentation. Existing controllers still own every action. */
((root)=>{'use strict';
 const installations=new WeakMap();
 const secondary=['filterTestpoints','highlightTestpoints','openBoardAnalytics','openRepositoryExplorer','openCalculators','openEngineeringTools','openReviewHandoff'];
 function install(doc,host=root){
  if(host.KiCadAndroidRuntime||doc.body.classList.contains('android-design'))return null;
  doc.body.setAttribute('data-workspace-chrome','');
  if(host.KiCadVSCodeContext)doc.body.setAttribute('data-editor-host','vscode');
  const toolbar=doc.getElementById('frameControls'),rail=doc.getElementById('drawingTools');
  if(!toolbar||!rail||!doc.getElementById('selectionMode'))return null;
  if(installations.has(toolbar))return installations.get(toolbar);
  const create=(tag,className,text)=>{const node=doc.createElement(tag);node.className=className;if(text)node.textContent=text;return node;};
  const menu=create('section','workspace-tools-menu');menu.id='workspaceToolsMenu';menu.hidden=true;menu.setAttribute('aria-label','More tools');
  const heading=create('header','workspace-menu-heading','More tools');menu.append(heading);
  const trigger=create('button','workspace-more-tools icon-only','More tools');trigger.type='button';trigger.id='workspaceMoreTools';trigger.title='More tools';trigger.setAttribute('aria-label','More tools');trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls',menu.id);trigger.setAttribute('data-icon','tools');
  const moved=[];
  const quick=create('div','workspace-quick-tools');
  for(const [id,label,icon]of [['measureButton','Measure','ruler'],['viewRuleChecks','Rules','rules'],['mode3d','3D','cube'],['openBomManager','BoM','assembly'],['openSavedReports','Reports','analytics']]){
   const action=create('button','',label);action.type='button';action.setAttribute('data-icon',icon);action.title=label;action.setAttribute('aria-label',label==='Reports'?'Saved analysis and KiCad Monkey reports':label==='Rules'?'Rules and ERC or DRC findings':label==='3D'?'Switch 2D and 3D view':label);
   action.onclick=()=>{const target=doc.getElementById(id);if(target&&!target.disabled&&!target.hidden)target.click();};action.dataset.target=id;quick.append(action);
  }menu.append(quick);
  const search=create('input','workspace-tool-search');search.type='search';search.placeholder='Find a tool…';search.setAttribute('aria-label','Find drawing tool');menu.append(search);
  for(const id of secondary){const node=doc.getElementById(id);if(!node||node.parentNode!==rail)continue;
   moved.push({node,parent:node.parentNode,next:node.nextSibling});menu.append(node);
  }
  const settings=doc.getElementById('settingsButton');rail.insertBefore(trigger,settings?.parentNode===rail?settings:null);doc.body.append(menu);
  function close(restore=false){if(menu.hidden)return;menu.hidden=true;trigger.setAttribute('aria-expanded','false');if(restore)trigger.focus();}
  function place(){if(menu.hidden)return;const rect=trigger.getBoundingClientRect();menu.style.right=Math.max(8,host.innerWidth-rect.left+6)+'px';menu.style.top=Math.max(8,Math.min(rect.top,host.innerHeight-menu.offsetHeight-8))+'px';}
  function filter(){const nodes=[...menu.querySelectorAll('button')],query=search.value.trim().toLowerCase();for(const node of nodes)if(node.dataset.searchHidden){node.hidden=false;delete node.dataset.searchHidden;}for(const node of nodes){const target=node.dataset.target&&doc.getElementById(node.dataset.target),unavailable=Boolean(node.dataset.target&&(!target||target.hidden)),filtered=Boolean(query&&!((node.getAttribute('aria-label')||'')+' '+node.textContent+' '+node.title).toLowerCase().includes(query));node.hidden=unavailable||filtered;if(filtered&&!unavailable)node.dataset.searchHidden='true';if(node.dataset.target)node.disabled=!target||target.disabled;}place();}
  search.oninput=filter;
  function open(){menu.hidden=false;search.value='';filter();trigger.setAttribute('aria-expanded','true');place();search.focus();}
  trigger.onclick=()=>menu.hidden?open():close();
  const outside=event=>{if(!menu.contains(event.target)&&!trigger.contains(event.target))close();};
  const keys=event=>{if(menu.hidden)return;if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return;}
   if(event.target===search&&['Home','End'].includes(event.key))return;
   if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){const items=[...menu.querySelectorAll('button:not(:disabled)')].filter(node=>!node.hidden);if(!items.length)return;event.preventDefault();const index=items.indexOf(doc.activeElement),next=event.key==='Home'?0:event.key==='End'?items.length-1:index<0?(event.key==='ArrowUp'?items.length-1:0):(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next].focus();}
  };
  menu.addEventListener('click',event=>{if(event.target.closest('button'))close();});
  doc.addEventListener('pointerdown',outside);doc.addEventListener('keydown',keys,true);host.addEventListener('resize',place);
  // Move infrequent display options out of the primary drawing toolbar.
  const extra=doc.getElementById('extraReviewControls'),display=create('div','workspace-display-options');
  if(extra){display.append(create('h3','','Display options'));for(const id of ['netClassColors','viewOppositeDrawing','ratsnestToggle']){const node=doc.getElementById(id);if(node&&node.parentNode===toolbar){moved.push({node,parent:toolbar,next:node.nextSibling});display.append(node);}}extra.prepend(display);}
  const selection=doc.getElementById('selectionMode');if(selection){selection.setAttribute('aria-label','Select parts or nets');selection.options[0].textContent='Smart select';selection.options[1].textContent='Parts';selection.options[2].textContent='Nets';}
  const options=doc.getElementById('reviewToolsButton');if(options){options.classList.add('workspace-view-options');options.setAttribute('data-icon','settings');options.setAttribute('aria-label','View options, variants and rendering notes');options.title='View options, variants and rendering notes';}
  host.KiCadUIIcons?.decorate?.(trigger);host.KiCadUIIcons?.decorate?.(quick);host.KiCadUIIcons?.decorate?.(options);
  const instance={close,dispose(){close();doc.removeEventListener('pointerdown',outside);doc.removeEventListener('keydown',keys,true);host.removeEventListener('resize',place);for(const item of moved.reverse())item.parent.insertBefore(item.node,item.next?.parentNode===item.parent?item.next:null);menu.remove();trigger.remove();display.remove();installations.delete(toolbar);}};
  installations.set(toolbar,instance);return instance;
 }
 if(typeof module==='object'&&module.exports){module.exports={install,secondary};return;}
 root.KiCadWorkspaceChrome={install};
 if(root.document){const start=()=>install(root.document,root);if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});else start();}
})(globalThis);
