/* Phone sidebar visibility is shared between schematic and layout frames. */
((root)=>{'use strict';
 const KEY='kiview:phone-sidebar-visible';
 const phone=(width,height)=>width<600||(width<840&&height<=500);
 function install(doc,host){
  let shown=false,toggle=null;const decorated=new WeakSet();try{shown=host.localStorage.getItem(KEY)==='1';}catch{}
  const compact=()=>phone(host.innerWidth,host.innerHeight);
  const closePanels=()=>{for(const [panel,close]of [['designNavigator','closeNavigator'],['designInspector','closeInspector'],['commentsSidebar','closeComments']])if(doc.getElementById(panel)?.hidden===false)doc.getElementById(close)?.click();};
  function sync(){doc.body.classList.toggle('phone-sidebars-visible',shown);if(toggle){toggle.hidden=!compact();toggle.setAttribute('aria-pressed',String(shown));toggle.setAttribute('aria-expanded',String(shown));const label=shown?'Hide sidebar':'Show sidebar';toggle.setAttribute('aria-label',label);toggle.title=label;}}
  function set(value,{persist=true,open=false}={}){shown=Boolean(value);if(persist)try{host.localStorage.setItem(KEY,shown?'1':'0');}catch{}if(compact()&&!shown)closePanels();sync();if(open&&shown&&compact()&&doc.getElementById('designNavigator')?.hidden)doc.getElementById('partsButton')?.click();}
  function scan(){if(!doc.getElementById('reviewWorkspace'))return;const toolbar=doc.getElementById('androidViewToolbar')||doc.getElementById('frameControls');if(toolbar&&!toggle){toggle=doc.createElement('button');toggle.id='phoneSidebarToggle';toggle.type='button';toggle.className='phone-sidebar-toggle';toggle.setAttribute('aria-controls','phoneExplorerDock phoneInspectionDock');if(host.KiCadUIIcons)toggle.append(host.KiCadUIIcons.icon('inspect'));else toggle.textContent='Sidebar';toggle.onclick=()=>set(!shown,{open:!shown});toolbar.prepend(toggle);}
   if(toolbar&&toggle&&toggle.parentElement!==toolbar)toolbar.prepend(toggle);
   for(const rail of doc.querySelectorAll('.sidebar-dock')){rail.id=rail.classList.contains('left')?'phoneExplorerDock':'phoneInspectionDock';for(const button of rail.querySelectorAll('.dock-tab'))if(!decorated.has(button)){decorated.add(button);const name=button.textContent.trim();button.setAttribute('aria-label',name);button.title=name;if(host.KiCadUIIcons){const caption=doc.createElement('span');caption.className='mobile-sidebar-label';caption.textContent=name;button.replaceChildren(host.KiCadUIIcons.icon(button.id==='dockNavigator'?'folder':button.id==='dockComments'?'comment':'inspect'),caption);}}}sync();
  }
  const observer=new host.MutationObserver(scan);observer.observe(doc.body,{subtree:true,childList:true});scan();host.addEventListener('resize',sync);host.addEventListener('kicad-usable-viewport-changed',sync);host.addEventListener('storage',event=>{if(event.key===KEY)set(event.newValue==='1',{persist:false});});return{set,get:()=>shown,scan};
 }
 const api={KEY,phone,install};if(typeof module==='object'&&module.exports){module.exports=api;return;}if(root.document){const start=()=>{root.KiCadPhoneSidebar=install(root.document,root);};if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});else start();}
})(globalThis);
