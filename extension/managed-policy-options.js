/* Policy is read from the privileged dispatcher, never from editable settings. */
(()=>{'use strict';const status=document.getElementById('managedPolicyStatus');if(!status)return;
 async function refresh(){try{const reply=await chrome.runtime.sendMessage({type:'managed-policy-status'});if(!reply?.ok)throw Error();const p=reply.result;status.textContent=!p.valid?'Administrator policy could not be verified. Network access and provider writes are disabled.':!p.available?'Managed policy is unavailable in this browser; standard access applies.':`Administrator controls: network ${p.networkEnabled?'enabled':'disabled'}; provider writes ${p.networkEnabled&&p.providerWritesEnabled?'enabled':'disabled'}. These controls cannot be changed here.`;}catch{status.textContent='Administrator policy status is unavailable. Requests must pass the background policy check.';}}
 chrome.storage.onChanged?.addListener((_,area)=>{if(area==='managed')void refresh();});void refresh();
})();
