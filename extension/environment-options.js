/* Options-only diagnostic UI. No automatic probes or changes to organization policy. */
(()=>{'use strict';
 const button=document.getElementById('runViewerDiagnostics'),output=document.getElementById('viewerDiagnostics');if(!button||!output)return;
 button.onclick=async()=>{
  button.disabled=true;output.style.color='';output.setAttribute('role','status');output.textContent='Checking site access and public GitHub connectivity…';let timeout;
  try{
   const reply=await Promise.race([chrome.runtime.sendMessage({type:'viewer-diagnostics'}),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('The extension worker did not respond. Reload the extension; if this browser is managed, ask your administrator to check its extension policy.')),20000);})]);
   if(!reply?.ok)throw Error(reply?.error||'The checks could not run.');const result=reply.result;
   output.textContent=[...(result.accessIssue?['! '+result.accessIssue.title,result.accessIssue.message,result.accessIssue.action,'']:[]),'Extension '+result.version,...result.siteAccess.map(item=>item.host+': '+item.state),...result.connectivity.map(item=>item.host+': '+(item.reachable?'HTTP '+item.status+' (reachable)':item.note)),result.note].join('\n');
   if(result.accessIssue){output.style.color='light-dark(#a51d2d,#ff9aa8)';output.setAttribute('role','alert');}
  }catch(error){output.textContent='! '+(error.message||'The checks failed. Contact your browser administrator.');output.style.color='light-dark(#a51d2d,#ff9aa8)';output.setAttribute('role','alert');}
  finally{clearTimeout(timeout);button.disabled=false;}
 };
})();
