"use strict";
(() => {
  const $=id=>document.getElementById(id),status=$('gitlabStatus'),hostSelect=$('gitlabHost');
  if (typeof location !== 'undefined' && /^https?:$/.test(location.protocol)) {
    status.textContent='Local preview only. Connect GitLab in the installed extension’s settings.';
    for(const id of ['gitlabHost','gitlabAddHost','gitlabRemoveHost','gitlabSaveToken','gitlabSignOut','gitlabReset','gitlabOAuth','gitlabToken','gitlabClientId']) $(id).disabled=true;
    return;
  }
  let oauthSupported=false;
  const send=async(type,extra={})=>{
    const reply=await chrome.runtime.sendMessage({type,provider:'gitlab',host:hostSelect.value||'https://gitlab.com',...extra});
    if(!reply?.ok)throw new Error(reply?.error||'GitLab settings request failed.');return reply.result;
  };
  async function refreshHosts(selected){
    const result=await send('gitlab-host-list');hostSelect.replaceChildren();
    for(const host of result.hosts){const option=document.createElement('option');option.value=host;option.textContent=host;hostSelect.append(option);}
    hostSelect.value=result.hosts.includes(selected)?selected:'https://gitlab.com';await refresh();
  }
  async function refresh(){
    const result=await send('gitlab-auth-status');
    $('gitlabClientId').value=result.clientId||'';
    $('gitlabRedirectUri').value=result.redirectUri||'';
    oauthSupported=Boolean(result.oauthSupported);$('gitlabOAuth').disabled=!oauthSupported;
    $('gitlabRemoveHost').disabled=hostSelect.value==='https://gitlab.com';
    status.textContent=result.configured?'Connected to '+result.host+'. Credentials are encrypted; background restart requires sign-in again.':
      'Not connected. Public files work without login. Use a repository-authorized token or configure OAuth below.';
    $('gitlabAppLink').href=hostSelect.value+'/user_settings/applications';
  }
  async function action(button,work){button.disabled=true;try{await work();}catch(error){status.textContent=error.message;}finally{button.disabled=button.id==='gitlabRemoveHost'&&hostSelect.value==='https://gitlab.com'||button.id==='gitlabOAuth'&&!oauthSupported;}}
  hostSelect.addEventListener('change',()=>refresh().catch(error=>status.textContent=error.message));
  $('gitlabAddHost').addEventListener('click',event=>action(event.currentTarget,async()=>{
    const value=$('gitlabNewHost').value.trim(),url=new URL(value);
    if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Enter an exact HTTPS server origin, such as https://gitlab.example.com.');
    if(!await chrome.permissions.request({origins:[url.origin+'/*']}))throw new Error('Server access permission was not granted.');
    const result=await send('gitlab-host-add',{host:url.origin});await refreshHosts(result.host);
  }));
  $('gitlabRemoveHost').addEventListener('click',event=>action(event.currentTarget,async()=>{await send('gitlab-host-remove');await refreshHosts();}));
  $('gitlabSaveToken').addEventListener('click',event=>action(event.currentTarget,async()=>{
    const token=$('gitlabToken').value;$('gitlabToken').value='';await send('gitlab-auth-set',{token});await refresh();
  }));
  $('gitlabSignOut').addEventListener('click',event=>action(event.currentTarget,async()=>{$('gitlabToken').value='';await send('gitlab-auth-clear');await refresh();}));
  $('gitlabReset').addEventListener('click',event=>action(event.currentTarget,async()=>{$('gitlabToken').value='';await send('gitlab-auth-reset');await refresh();}));
  $('gitlabOAuth').addEventListener('click',event=>action(event.currentTarget,async()=>{
    const clientId=$('gitlabClientId').value.trim();if(clientId)await send('gitlab-client-set',{clientId});
    status.textContent='Complete authorization in the GitLab sign-in window.';await send('gitlab-oauth-start');await refresh();
  }));
  refreshHosts().catch(error=>status.textContent=error.message);
})();
