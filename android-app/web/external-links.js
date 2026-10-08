/* External links only prepare a project. They cannot publish or change account state. */
((root)=>{
'use strict';
function parse(value){
 const original=String(value||'');if(/[\x00-\x1f]/.test(original))throw Error('Invalid project link.');let text=original.trim();if(!text||text.length>8192||/[\x00-\x1f]/.test(text))throw Error('Invalid project link.');
 const checkedURL=value=>{const raw=String(value),path=raw.match(/^[a-z]+:\/\/[^/?#]+([^?#]*)/i)?.[1]||'';for(const segment of path.split('/'))for(const part of decodeURIComponent(segment).split('/'))if(part==='.'||part==='..')throw Error('Invalid project path.');return new URL(raw);};
 let u=checkedURL(text);
 if(u.protocol==='kicadvizdiff:'){
  if(u.hostname!=='open'||u.pathname&&u.pathname!=='/'||u.username||u.password||u.hash||[...u.searchParams.keys()].some(k=>k!=='url')||u.searchParams.getAll('url').length!==1)throw Error('Invalid app project link.');
  u=checkedURL(u.searchParams.get('url'));
 }
 if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443')throw Error('Use an HTTPS repository link without credentials.');
 const decode=s=>{const v=decodeURIComponent(s);if(!v||/[\x00-\x1f\\]/.test(v)||v==='.'||v==='..')throw Error('Invalid project path.');return v;};
 const segments=u.pathname.replace(/\/+$/,'').split('/').slice(1).map(decode);
 if(['drive.google.com','docs.google.com'].includes(u.hostname))throw Error('For Drive, use Drive / cloud and choose a project ZIP in the file picker.');
 const github=u.hostname==='github.com';let provider,host,repo,tail;
 if(github){if(segments.length<2)throw Error('Share a repository or KiCad file link.');if(['login','settings','oauth','orgs','users','apps','notifications','search'].includes(segments[0]))throw Error('Share a repository or KiCad file link.');provider='github';host='https://github.com';repo=segments.slice(0,2).join('/');tail=segments.slice(2);root.KiCadAndroidGitHubCore.repository(repo);}
 else{provider='gitlab';host=root.KiCadAndroidGitLabCore.host(u.origin);const divider=segments.indexOf('-');repo=(divider<0?segments:segments.slice(0,divider)).join('/');root.KiCadAndroidGitLabCore.repository(repo,host);tail=divider<0?[]:segments.slice(divider+1);}
 let ref='',file='',warning=provider==='gitlab'&&u.hostname!=='gitlab.com'?'Confirm the selected host is your GitLab server.':'';
 if(tail.length){if(!['blob','tree','raw'].includes(tail[0])||tail.length<2)throw Error('Share a repository, branch or KiCad file link.');ref=tail[1];file=tail.slice(2).join('/');warning+=(warning?' ':'')+'Check the revision below if the branch name contains slashes.';}
 if(ref.length>200)throw Error('Revision is too long.');
 if(file&&!/\.kicad_(sch|pcb|pro)$/i.test(file))file='';
 if(file.split('/').some(p=>p==='.'||p==='..')||file.length>1000)throw Error('Invalid drawing path.');
 return {provider,host,repository:repo,ref,file,warning};
}
root.KiCadAndroidLinks={parse};if(typeof module==='object'&&module.exports){module.exports=root.KiCadAndroidLinks;return;}
root.KiCadAndroidLinks.receive=value=>{
 try{const item=parse(value);for(const modal of document.querySelectorAll('dialog[open]'))if(modal.id!=='androidDraftExit'&&!modal.classList.contains('library-confirm'))modal.close();
  const prefix=item.provider;document.getElementById(prefix+'Repository').value=item.repository;document.getElementById(prefix+'Ref').value=item.ref;
  if(prefix==='gitlab'){const field=document.getElementById('gitlabHost');field.value=item.host;field.dispatchEvent(new Event('change'));}
  root.KiCadAndroidLinks.pending=item;document.getElementById(prefix+'Button').click();
  document.getElementById(prefix+'Status').textContent='Project link received. Tap Add and open project.'+(item.file?' Drawing: '+item.file+'.':'')+(item.warning?' '+item.warning:'');
  document.getElementById(prefix+'Add').focus();
 }catch(error){document.getElementById('importStatus').textContent=error.message;}
};
root.KiCadAndroidLinks.fileFor=(provider,repository,ref)=>{const item=root.KiCadAndroidLinks.pending;return item&&item.provider===provider&&item.repository===repository&&item.ref===ref?item.file:'';};
})(globalThis);
