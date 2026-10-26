/* Local-only startup diagnostics. Never capture design URLs, credentials or source. */
((root)=>{'use strict';
 const records=[],seen=new Set();let panel=null,queued=false,accessBadge=null,accessPanel=null;
 const accessCopy={
  'script-access':['Viewer script could not load','A required viewer script is missing or blocked. Reload or update the extension and check its site access. If the browser is managed, ask your administrator to check its policy. The browser has not confirmed an organization block.'],
  'organization-block':['Blocked by browser policy','The browser explicitly reported an administrator or organization policy block. Ask your browser administrator to allow the extension and required repository hosts.'],
  'client-block':['Blocked by this browser','The browser reported a client-side block. Check site access, browser protection settings and installed extensions. An organization policy is not confirmed.'],
  connection:['Repository connection failed','The browser did not identify the cause. Check your network and run Check viewer connection in extension settings. Network, proxy, firewall or browser policy may be responsible.'],
  'site-access':['Required site access is disabled','Allow the required repository site access in extension settings. If your organization has locked it, contact your browser administrator.'],
  forbidden:['Repository access denied','The repository service returned HTTP 403. Check account permissions and rate limits. This response alone does not establish an organization policy block.'],
  authentication:['Repository sign-in required','The repository service rejected the current credentials (HTTP 401). Reconnect your account in extension settings.'],
  'rate-limit':['Repository request limit reached','Wait for the repository service limit to reset or connect your account in extension settings.']
 };
 function showAccessIssue(issue){
  const copy=accessCopy[issue?.kind];if(!copy)return;
  const d=root.document;if(!d)return;
  if(!d.body){d.addEventListener('DOMContentLoaded',()=>showAccessIssue(issue),{once:true});return;}
  if(!accessBadge){
   accessBadge=d.createElement('button');accessBadge.id='viewerAccessWarning';accessBadge.type='button';accessBadge.textContent='!';
   accessBadge.setAttribute('aria-controls','viewerAccessDetails');accessBadge.setAttribute('aria-expanded','true');
   Object.assign(accessBadge.style,{position:'fixed',top:'6px',right:'8px',zIndex:'2147483647',width:'28px',height:'28px',minHeight:'28px',padding:'0',border:'1px solid #fca5a5',borderRadius:'50%',background:'#b91c1c',color:'#fff',font:'bold 19px/1 system-ui',cursor:'pointer',boxShadow:'0 2px 8px #0004'});
   accessPanel=d.createElement('section');accessPanel.id='viewerAccessDetails';accessPanel.setAttribute('role','alert');
   Object.assign(accessPanel.style,{position:'fixed',top:'42px',right:'8px',zIndex:'2147483646',width:'min(390px,calc(100vw - 16px))',maxHeight:'min(340px,55vh)',overflow:'auto',boxSizing:'border-box',padding:'14px',border:'1px solid #e17c87',borderRadius:'9px',background:'#fff3f4',color:'#661521',font:'13px/1.5 system-ui',boxShadow:'0 8px 24px #0004'});
   const title=d.createElement('strong');title.id='viewerAccessTitle';const help=d.createElement('p');help.id='viewerAccessHelp';help.style.margin='8px 0 12px';
   const settings=d.createElement('button');settings.type='button';settings.textContent='Extension settings';settings.hidden=!root.chrome?.runtime?.openOptionsPage;settings.onclick=()=>root.chrome.runtime.openOptionsPage();
   const dismiss=d.createElement('button');dismiss.type='button';dismiss.textContent='Dismiss';dismiss.onclick=()=>{accessPanel.hidden=true;accessBadge.setAttribute('aria-expanded','false');accessBadge.focus?.();};
   for(const button of [settings,dismiss])Object.assign(button.style,{minHeight:'32px',padding:'5px 9px',marginRight:'6px',border:'1px solid #d6a3ab',borderRadius:'5px',background:'#fff',color:'#661521',font:'inherit',cursor:'pointer'});
   accessPanel.append(title,help,settings,dismiss);d.body.append(accessBadge,accessPanel);
   accessBadge.onclick=()=>{accessPanel.hidden=!accessPanel.hidden;accessBadge.setAttribute('aria-expanded',String(!accessPanel.hidden));};
   root.addEventListener('keydown',event=>{if(event.key==='Escape'&&!accessPanel.hidden){event.preventDefault();accessPanel.hidden=true;accessBadge.setAttribute('aria-expanded','false');accessBadge.focus?.();}});
   root.addEventListener('pointerdown',event=>{if(!accessPanel.hidden&&!accessPanel.contains(event.target)&&!accessBadge.contains(event.target)){accessPanel.hidden=true;accessBadge.setAttribute('aria-expanded','false');}});
  }
  accessBadge.hidden=false;accessBadge.title=copy[0];accessBadge.setAttribute('aria-label',copy[0]);accessBadge.setAttribute('aria-expanded','true');
  accessPanel.hidden=false;accessPanel.querySelector('#viewerAccessTitle').textContent=copy[0];accessPanel.querySelector('#viewerAccessHelp').textContent=copy[1];
 }
 function clearAccessIssue(){if(accessBadge)accessBadge.hidden=true;if(accessPanel)accessPanel.hidden=true;}
 const filename=value=>{try{const name=new URL(value,root.location?.href).pathname.split('/').pop();return /^[a-z0-9_.-]{1,90}$/i.test(name)?name:'viewer script';}catch{return 'viewer script';}};
 function report(kind,file,line=0,name='Error'){
  const record={kind,file:filename(file),line:Number.isSafeInteger(line)?line:0,name:/^[A-Za-z]+Error$/.test(name)?name:'Error'};
  const key=JSON.stringify(record);if(seen.has(key)||records.length>=6)return;seen.add(key);records.push(record);render();
 }
 function diagnostics(){let version='development';try{version=root.chrome?.runtime?.getManifest?.().version||root.KiCadVSCodeContext?.version||version;}catch{}
  return ['KiCad viewer diagnostics','Version: '+version,...records.map(r=>r.kind+': '+r.file+(r.line?':'+r.line:'')+' ('+r.name+')')].join('\n');
 }
 function render(){
  const d=root.document;if(!d)return;
  if(!d.body){if(!queued){queued=true;d.addEventListener('DOMContentLoaded',()=>{queued=false;render();},{once:true});}return;}
  if(!panel){
   panel=d.createElement('section');panel.id='viewerStartupError';panel.setAttribute('role','alert');
   Object.assign(panel.style,{position:'fixed',inset:'auto 8px 8px',zIndex:'2147483647',padding:'12px',border:'1px solid #b55035',borderRadius:'8px',background:'#fff5ed',color:'#392113',font:'14px/1.4 system-ui',maxHeight:'45vh',overflow:'auto',boxShadow:'0 2px 12px #0004'});
   const title=d.createElement('strong');title.textContent='The viewer encountered a script error';
   const help=d.createElement('p');help.textContent='Reload the viewer. If this continues, update or reinstall the extension and share the diagnostics below with support.';
   const details=d.createElement('pre');details.id='viewerStartupDetails';details.style.whiteSpace='pre-wrap';
   const reload=d.createElement('button');reload.type='button';reload.textContent='Reload viewer';reload.onclick=()=>root.location.reload();
   const close=d.createElement('button');close.type='button';close.textContent='Dismiss';close.onclick=()=>{panel.hidden=true;};
   for(const button of [reload,close])Object.assign(button.style,{minHeight:'44px',marginRight:'8px',padding:'8px 12px',border:'1px solid #99694c',borderRadius:'6px',color:'#392113',background:'#fff'});
   panel.append(title,help,details,reload,close);d.body.append(panel);
  }
  panel.hidden=false;panel.querySelector('#viewerStartupDetails').textContent=diagnostics();
  // A top-layer loading popover must not mask a fatal startup diagnostic.
  for(const loader of d.querySelectorAll('.loading-surface')){try{loader.hidePopover?.();}catch{}loader.hidden=true;}
 }
 const api={report,diagnostics,filename,showAccessIssue,clearAccessIssue};root.KiCadStartupHealth=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(!root.document)return;
 root.addEventListener('error',event=>{
  if(event.target?.tagName==='SCRIPT'){report('Missing or blocked script',event.target.src);showAccessIssue({kind:'script-access'});if(accessPanel){accessPanel.hidden=true;accessBadge.setAttribute('aria-expanded','false');}return;}
  if(event.error||event.filename)report('Runtime error',event.filename,event.lineno,event.error?.name);
 },true);
 root.addEventListener('unhandledrejection',event=>{const reason=event.reason;if(reason?.name==='AbortError')return;report('Unhandled operation','viewer-script',0,reason?.name);});
})(globalThis);
