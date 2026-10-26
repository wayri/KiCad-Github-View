/* Normalize explicit pane dismissal controls without changing their handlers. */
((root)=>{'use strict';
 function decorate(scope){
  const buttons=[...(scope.matches?.('button')?[scope]:[]),...(scope.querySelectorAll?.('button')||[])];
  for(const button of buttons){const label=button.textContent?.trim();if(label!=='Close'||!button.closest?.('header,.sidebar-heading,.panel-heading,.section-page-header'))continue;
   if(button.closest?.('.chat-panel'))continue;
   if(!button.getAttribute('aria-label'))button.setAttribute('aria-label','Close');
   if(!button.getAttribute('title'))button.setAttribute('title',button.getAttribute('aria-label'));
   button.classList.add('surface-dismiss');button.textContent='×';
  }
 }
 function install(d,host){decorate(d);const observer=new host.MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)decorate(node);});observer.observe(d.body,{childList:true,subtree:true});return()=>observer.disconnect();}
 const api={decorate,install};if(typeof module==='object'&&module.exports)module.exports=api;root.KiCadCompactSurfaces=api;
 if(root.document){const start=()=>install(root.document,root);if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});else start();}
})(globalThis);
