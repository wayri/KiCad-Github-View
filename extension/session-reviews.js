'use strict';
const $=id=>document.getElementById(id),repository=new URL(location.href).searchParams.get('repository')||'';
$('repository').value=repository;
const requestedNumber=Number(new URL(location.href).searchParams.get('number'));if(Number.isSafeInteger(requestedNumber)&&requestedNumber>0)$('number').value=String(requestedNumber);
let mutation=crypto.randomUUID(),generation=0,timer=null,busy=false,thread=null,failures=0;
async function request(action,extra={}){const reply=await chrome.runtime.sendMessage({type:'github-session-review',repository,number:Number($('number').value),action,...extra});if(!reply?.ok)throw Error(reply?.error||'Website review unavailable.');return reply.result;}
function schedule(){clearTimeout(timer);if(!document.hidden)timer=setTimeout(()=>load(false),Math.min(120000,15000*2**failures));}
function render(value){
 $('title').textContent='#'+value.number+' · '+value.title;
 const list=[value,...value.comments];$('messages').replaceChildren(...list.map(item=>{
  const row=document.createElement('article'),author=document.createElement('strong'),time=document.createElement('small'),body=document.createElement('p');author.textContent='@'+(item.author||'deleted account');time.textContent=new Date(item.createdAt).toLocaleString();body.textContent=item.body.replace(/\n*<!-- (?:pocket-kiview-session:[A-Za-z0-9_-]+|kicad-review:v1 [A-Za-z0-9+/=_-]+) -->/g,'');row.append(author,time,body);return row;
 }));
 $('send').disabled=!value.capabilities?.create;
}
async function load(force=true){
 if(busy)return;schedule();busy=true;const ticket=++generation;$('load').disabled=true;
 try{const value=await request('read',{force});if(ticket!==generation)return;thread=value;render(value);failures=0;$('status').textContent='Synced through website session @'+value.account+' · '+new Date().toLocaleTimeString()+(value.warnings?.length?' · '+value.warnings.join(' '):'');}
 catch(error){failures=Math.min(failures+1,3);$('status').textContent=error.message;}finally{busy=false;$('load').disabled=false;schedule();}
}
$('load').onclick=()=>load(true);
$('number').onchange=()=>{generation++;thread=null;mutation=crypto.randomUUID();$('send').disabled=true;void load(true);};
$('inspect').onclick=async()=>{try{const result=await request('inspect');$('details').textContent=JSON.stringify(result.diagnostics,null,2);}catch(error){$('details').textContent=error.message;}};
$('send').onclick=async event=>{
 if(!event.isTrusted||busy||!thread||thread.number!==Number($('number').value)||!$('body').value.trim())return;
 busy=true;clearTimeout(timer);$('send').disabled=true;$('number').disabled=true;$('load').disabled=true;const body=$('body').value;
 try{await request('send',{body,clientMutationId:mutation,confirmedSend:true});if($('body').value===body)$('body').value='';mutation=crypto.randomUUID();$('status').textContent='Posted to GitHub. Refreshing…';}
 catch(error){$('status').textContent=error.message;return;}
 finally{busy=false;$('number').disabled=false;$('load').disabled=false;$('send').disabled=!thread?.capabilities?.create;schedule();}
 await load(true);
};
document.addEventListener('visibilitychange',()=>{clearTimeout(timer);if(!document.hidden)void load(false);});
window.addEventListener('focus',()=>{if(!document.hidden)void load(false);});
window.addEventListener('pagehide',()=>clearTimeout(timer));
void load(true);
