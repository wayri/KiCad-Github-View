/* Explicit, read-only connectivity checks; no project data or account credentials. */
((root)=>{'use strict';
 const hosts=['https://github.com/*','https://api.github.com/*','https://raw.githubusercontent.com/*'];
 const issues={
  'organization-block':{kind:'organization-block',confirmed:true,title:'Blocked by browser policy',message:'The browser explicitly reported an administrator or organization policy block.',action:'Ask your browser administrator to allow the extension and its required repository hosts. Check chrome://policy or edge://policy.'},
  'client-block':{kind:'client-block',confirmed:true,title:'Blocked by this browser',message:'The browser reported a client-side block. Another extension or a browser protection rule may be responsible.',action:'Check site access, browser protection settings and installed extensions. An organization policy is not confirmed.'},
  connection:{kind:'connection',confirmed:false,title:'Repository connection failed',message:'The repository request failed. Network, proxy, firewall or browser policy may be responsible; the browser did not identify the cause.',action:'Check your connection and run Check viewer connection in extension settings. If this browser is managed, ask your administrator to review its policy.'},
  'site-access':{kind:'site-access',confirmed:true,title:'Required site access is disabled',message:'The extension does not have a required repository host permission.',action:'Allow the required site access in extension settings. If it is locked by your organization, contact your browser administrator.'},
  forbidden:{kind:'forbidden',confirmed:false,title:'Repository access denied',message:'The repository service returned HTTP 403. Account permissions, rate limits or service restrictions may be responsible.',action:'Check repository access and account permissions in extension settings. HTTP 403 alone does not establish an organization policy block.'},
  authentication:{kind:'authentication',confirmed:true,title:'Repository sign-in required',message:'The repository service rejected the current credentials (HTTP 401).',action:'Reconnect your account in extension settings.'},
  'rate-limit':{kind:'rate-limit',confirmed:true,title:'Repository request limit reached',message:'The repository service reported a rate limit.',action:'Wait for its limit to reset or connect your account in extension settings.'}
 };
 function classifyAccessError(error){
  const message=typeof error==='string'?error:String(error?.message||'');
  if(/ERR_BLOCKED_BY_ADMINISTRATOR|blocked (?:by|due to) (?:an? )?(?:administrator|organization|enterprise|administrative|browser policy)|blocked by (?:your )?administrator/i.test(message))return{...issues['organization-block']};
  if(/ERR_BLOCKED_BY_CLIENT/i.test(message))return{...issues['client-block']};
  if(/rate.?limit|HTTP 429\b/i.test(message))return{...issues['rate-limit']};
  if(/HTTP 401\b/i.test(message))return{...issues.authentication};
  if(/HTTP 403\b/i.test(message))return{...issues.forbidden};
  if(/Failed to fetch|NetworkError|network request failed|ERR_NETWORK_ACCESS_DENIED|ERR_CONNECTION_|ERR_NAME_NOT_RESOLVED|timed? ?out|timeout/i.test(message))return{...issues.connection};
  return null;
 }
 async function probe(fetcher,url,method){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  try{
   const response=await fetcher(url,{method,credentials:'omit',redirect:'error',cache:'no-store',signal:controller.signal,headers:{Accept:'application/json'}});
   try{await response.body?.cancel?.();}catch{}
   const accessIssue=classifyAccessError('HTTP '+response.status);
   return{host:new URL(url).hostname,reachable:true,status:response.status,...(accessIssue?{accessIssue}:{})};
  }catch(error){return{host:new URL(url).hostname,reachable:false,note:'Request failed, timed out or was blocked. Check network and browser policy.',accessIssue:classifyAccessError(error)||{...issues.connection}};}
  finally{clearTimeout(timer);}
 }
 async function check({fetch:fetcher=root.fetch,permissions,version='unknown'}={}){
  const siteAccess=await Promise.all(hosts.map(async host=>{let state='unknown';try{if(permissions?.contains)state=await permissions.contains({origins:[host]})?'granted':'not granted';}catch{}return{host,state};}));
  const connectivity=await Promise.all([probe(fetcher,'https://api.github.com/rate_limit','GET'),probe(fetcher,'https://raw.githubusercontent.com/github/gitignore/main/README.md','HEAD')]);
  const accessIssue=connectivity.find(item=>item.accessIssue?.kind==='organization-block')?.accessIssue||siteAccess.some(item=>item.state==='not granted')&&{...issues['site-access']}||connectivity.find(item=>item.accessIssue)?.accessIssue||null;
  return{version,siteAccess,connectivity,accessIssue,note:'Granted permissions do not prove enterprise policy allows access. A reachable host does not prove a particular file exists. No project or account data was sent.'};
 }
 root.KiCadEnvironmentDiagnostics={check,classifyAccessError};if(typeof module==='object'&&module.exports)module.exports=root.KiCadEnvironmentDiagnostics;
})(globalThis);
