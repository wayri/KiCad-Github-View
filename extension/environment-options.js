/* Options-only diagnostics. Policy is checked before any connectivity request. */
(()=>{'use strict';
 const button=document.getElementById('runViewerDiagnostics'),output=document.getElementById('viewerDiagnostics');if(!button||!output)return;
 const diagnostics=globalThis.KiCadEnvironmentDiagnostics;
 async function request(type){let timeout;try{return await Promise.race([chrome.runtime.sendMessage({type}),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Object.assign(Error('The extension worker did not respond.'),{code:'DIAGNOSTIC_WORKER_TIMEOUT'})),20000);})]);}finally{clearTimeout(timeout);}}
 function showIssue(issue){output.textContent=['! '+issue.title,issue.message,issue.action,'Open local files below if your organization permits local review.'].join('\n');output.style.color='light-dark(#a51d2d,#ff9aa8)';output.setAttribute('role','alert');}
 button.onclick=async()=>{
  button.disabled=true;output.style.color='';output.setAttribute('role','status');output.textContent='Checking administrator controls, site access and public repository connectivity…';
  try{
   const policyReply=await request('managed-policy-status');
   if(!policyReply?.ok){showIssue(diagnostics.classifyManagedPolicy(null));return;}
   const policy=policyReply.result,policyIssue=diagnostics.classifyManagedPolicy(policy);
   if(policyIssue){showIssue(policyIssue);return;}
   const reply=await request('viewer-diagnostics');
   if(!reply?.ok)throw Object.assign(Error(reply?.error||'CHECK_FAILED'),{code:reply?.code});
   const result=reply.result;
   output.textContent=[...(result.accessIssue?['! Project viewing: '+result.accessIssue.title,result.accessIssue.message,result.accessIssue.action,'']:['Project viewing: public website/raw checks completed.']),...(result.accountAccessIssue?['Account/review warning: '+result.accountAccessIssue.title,result.accountAccessIssue.message,'An API-only failure does not mean website/raw project viewing is blocked.','']:[]),...(policy.providerWritesEnabled===false?['Administrator setting: remote writes disabled; read-only viewing remains permitted.','']:[]),'Extension '+result.version,...result.siteAccess.map(item=>item.host+': '+item.state+(item.requiredForViewing?' (project viewing)':' (optional account/review access)')),...result.connectivity.map(item=>item.host+': '+(item.reachable?'HTTP '+item.status+' (reachable)':item.note)+(item.requiredForViewing?' · project viewing':' · optional account/review check')),result.note].join('\n');
   if(result.accessIssue){output.style.color='light-dark(#a51d2d,#ff9aa8)';output.setAttribute('role','alert');}
  }catch(error){const issue=error?.code==='DIAGNOSTIC_WORKER_TIMEOUT'?null:diagnostics.classifyAccessError(error);if(issue)showIssue(issue);else showIssue({title:'The connection checks could not finish',message:'The extension worker did not respond or returned an unusable diagnostic result. This does not establish an organization policy block.',action:'Reload the extension and try again. If this is an office browser, ask its administrator to review the extension configuration.'});}
  finally{button.disabled=false;}
 };
})();
