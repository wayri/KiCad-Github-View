/* Explicit, read-only connectivity checks; no project data or account credentials. */
((root)=>{'use strict';
 const hosts=['https://github.com/*','https://api.github.com/*','https://raw.githubusercontent.com/*'];
 const required=host=>!host.includes('api.github.com');
 const issues={
  'managed-network-disabled':{kind:'managed-network-disabled',confirmed:true,title:'Extension network access is disabled by administrator policy',message:'The extension’s administrator setting disables network requests. No account change can override this setting.',action:'Ask your administrator about the approved workflow. Open local files only if local review is permitted.'},
  'managed-policy-unavailable':{kind:'managed-policy-unavailable',confirmed:true,title:'Administrator controls could not be verified',message:'The extension cannot verify its administrator settings and disables network requests and provider writes until they can be verified.',action:'Reload the extension. If the problem remains, ask your administrator to check the extension configuration. This does not prove that a particular website is blocked.'},
  'managed-writes-disabled':{kind:'managed-writes-disabled',confirmed:true,title:'Provider writes are disabled by administrator policy',message:'The extension’s administrator setting disables remote changes. Repository viewing can remain available.',action:'Use permitted read-only viewing or local notes. Do not change policy to work around this restriction.'},
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
  if(/^Network access is disabled by administrator policy\.$/i.test(message.trim()))return{...issues['managed-network-disabled']};
  if(/^Provider writes are disabled by administrator policy\.$/i.test(message.trim()))return{...issues['managed-writes-disabled']};
  if(error?.code==='MANAGED_POLICY'||/^Administrator policy is unavailable or invalid\. Network and provider writes are disabled\.$/i.test(message.trim()))return{...issues['managed-policy-unavailable']};
  if(/ERR_BLOCKED_BY_ADMINISTRATOR|blocked (?:by|due to) (?:an? )?(?:administrator|organization|enterprise|administrative|browser policy)|blocked by (?:your )?administrator/i.test(message))return{...issues['organization-block']};
  if(/ERR_BLOCKED_BY_CLIENT/i.test(message))return{...issues['client-block']};
  if(/rate.?limit|HTTP 429\b/i.test(message))return{...issues['rate-limit']};
  if(/HTTP 401\b/i.test(message))return{...issues.authentication};
  if(/HTTP 403\b/i.test(message))return{...issues.forbidden};
  if(/Failed to fetch|NetworkError|network request failed|ERR_NETWORK_ACCESS_DENIED|ERR_CONNECTION_|ERR_NAME_NOT_RESOLVED|timed? ?out|timeout/i.test(message))return{...issues.connection};
  return null;
 }
 function classifyManagedPolicy(policy){
  if(!policy||policy.valid!==true||typeof policy.networkEnabled!=='boolean')return{...issues['managed-policy-unavailable']};
  return policy.networkEnabled?null:{...issues['managed-network-disabled']};
 }
 async function probe(fetcher,url,method,requiredForViewing){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000),feature=requiredForViewing?'project-viewing':'account-review';
  try{
   const response=await fetcher(url,{method,credentials:'omit',redirect:'error',cache:'no-store',signal:controller.signal,headers:{Accept:'application/json'}});
   try{await response.body?.cancel?.();}catch{}
   const accessIssue=classifyAccessError('HTTP '+response.status);
   return{host:new URL(url).hostname,feature,requiredForViewing,reachable:true,status:response.status,...(accessIssue?{accessIssue}:{})};
  }catch(error){return{host:new URL(url).hostname,feature,requiredForViewing,reachable:false,note:'Request failed, timed out or was blocked; cause is unconfirmed unless explicitly reported.',accessIssue:classifyAccessError(error)||{...issues.connection}};}
  finally{clearTimeout(timer);}
 }
 async function check({fetch:fetcher=root.fetch,permissions,version='unknown'}={}){
  const siteAccess=await Promise.all(hosts.map(async host=>{let state='unknown';try{if(permissions?.contains)state=await permissions.contains({origins:[host]})?'granted':'not granted';}catch{}return{host,state,requiredForViewing:required(host)};}));
  const connectivity=await Promise.all([probe(fetcher,'https://github.com/','HEAD',true),probe(fetcher,'https://raw.githubusercontent.com/github/gitignore/main/README.md','HEAD',true),probe(fetcher,'https://api.github.com/rate_limit','GET',false)]);
  const select=(checks,permissions)=>checks.find(item=>item.accessIssue?.kind==='organization-block'||item.accessIssue?.kind?.startsWith('managed-'))?.accessIssue||permissions.some(item=>item.state==='not granted')&&{...issues['site-access']}||checks.find(item=>item.accessIssue)?.accessIssue||null;
  const accessIssue=select(connectivity.filter(item=>item.requiredForViewing),siteAccess.filter(item=>item.requiredForViewing)),accountAccessIssue=select(connectivity.filter(item=>!item.requiredForViewing),siteAccess.filter(item=>!item.requiredForViewing));
  return{version,siteAccess,connectivity,accessIssue,accountAccessIssue,note:'Granted permissions do not prove enterprise policy allows access. A reachable host does not prove a particular file exists. Website/raw hosts are checked for project viewing; API access is optional for account and review actions and does not verify sign-in. No project or account data was sent.'};
 }
 root.KiCadEnvironmentDiagnostics={check,classifyAccessError,classifyManagedPolicy};if(typeof module==='object'&&module.exports)module.exports=root.KiCadEnvironmentDiagnostics;
})(globalThis);
