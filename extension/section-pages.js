/* Full-page section navigation; existing controllers retain their fields and state. */
((root)=>{'use strict';
 const selector='#androidOpenProjectPage,#androidProjectSettingsSheet,#appMenuDialog,#androidSettingsDialog,#projectLibraryDialog,#githubDialog,#gitlabDialog,#androidProjectActionsSheet,#androidWorkspaceSheet,#androidToolsSheet,#androidSearchSheet,.android-reader-dialog,dialog.bom-manager,#toolOverflow,#testpointSummaryPage,#viewerSettings';
 function install(doc,host){
  const prepared=new WeakSet(),parents=new WeakMap(),inert=new Map();let active=null,origin=null;
  function isolate(){for(const [node,value]of inert)node.inert=value;inert.clear();if(!active)return;for(const node of doc.body.children||[])if(node!==active&&!node.contains(active)&&!(node.tagName==='DIALOG'&&node.open)){inert.set(node,node.inert);node.inert=true;}}
  const visible=page=>page?.isConnected&&(page.tagName==='DIALOG'?page.open:!page.hidden);
  function back(){if(!visible(active))return false;const page=active,parent=parents.get(page);origin=null;if(page.tagName==='DIALOG')page.close();else page.hidden=true;active=null;if(parent?.isConnected){if(parent.tagName==='DIALOG')parent.showModal();else parent.hidden=false;active=parent;}isolate();return true;}
  function entered(page){if(active===page)return;const parent=visible(active)?active:origin;if(parent&&parent!==page){parents.set(page,parent);if(parent.tagName==='DIALOG')parent.close();else parent.hidden=true;}active=page;isolate();page.querySelector('.section-page-back')?.focus();}
  function prepare(page){if(prepared.has(page))return;prepared.add(page);page.classList.add('section-page');page.setAttribute('role','region');page.removeAttribute('aria-modal');
   if(page.tagName==='DIALOG'){const show=page.show.bind(page);page.showModal=()=>{if(!page.open)show();entered(page);};page.addEventListener('close',()=>{if(active===page){active=null;isolate();}});}
   const header=page.querySelector('header,.panel-heading,.tool-overflow-heading');if(header){header.classList.add('section-page-header');const close=[...header.querySelectorAll('button')].find(button=>/close|collapse/i.test(button.getAttribute('aria-label')||button.textContent));if(close){close.classList.add('section-page-back');close.setAttribute('aria-label','Back');close.title='Back';close.replaceChildren(root.KiCadUIIcons?.icon('back')||doc.createTextNode('←'));close.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();active=page;back();},{capture:true});header.prepend(close);}}
  }
  function scan(){for(const page of doc.querySelectorAll(selector)){prepare(page);if(visible(page)&&active!==page)entered(page);}if(active&&!visible(active)){active=null;isolate();}}
  const observer=new host.MutationObserver(records=>{if(records.some(record=>record.type==='attributes'?record.target.matches?.(selector):[...record.addedNodes,...record.removedNodes].some(node=>node.nodeType===1&&node.namespaceURI!=='http://www.w3.org/2000/svg')))scan();});observer.observe(doc.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','open']});
  doc.addEventListener('click',()=>{scan();origin=active;host.setTimeout(()=>{origin=null;},0);},{capture:true});
  doc.addEventListener('keydown',event=>{if(event.key==='Escape'&&active&&!doc.querySelector('dialog[open]:not(.section-page)')){event.preventDefault();back();}});
  scan();return{back,scan};
 }
 if(typeof module==='object'&&module.exports){module.exports={selector,install};return;}
 if(root.document){const start=()=>{root.KiCadSectionPages=install(root.document,root);};if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});else start();}
})(globalThis);
