/* Same-origin, explicit-session cross-window selection. No network or stored identifiers. */
((root)=>{'use strict';
 const paired=root.KiCadPairedReview||(typeof module==='object'&&module.exports?require('./paired-review.js'):null);
 const MAX_BYTES=256*1024,MAX_RATE=64,MAX_SENDERS=128;
 const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
 const text=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v);
 const token=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{32,128}$/.test(v);
 const selection=v=>v===null||plain(v)&&paired?.validSelection(v);
 const encoded=v=>{try{return JSON.stringify(v);}catch{return null;}};
 function mount({session,scope,onSelection,onEnabled,initialEnabled=true}={}){
  if(typeof initialEnabled!=='boolean')throw new Error('initialEnabled must be boolean.');
  if(!token(session)||!text(scope,4096))throw new Error('Window link requires a random session token and explicit project/revision scope.');
  if(typeof root.BroadcastChannel!=='function'||typeof root.crypto?.randomUUID!=='function'||!paired)throw new Error('Secure cross-window linking is unavailable.');
  const sender=root.crypto.randomUUID(),channel=new root.BroadcastChannel('kicad-window-link:'+session),seen=new Map();
  let enabled=initialEnabled,clock=initialEnabled?0:1,owner=initialEnabled?'':sender,disposed=false,sequence=0,lastSelection,delivering=false,inStart=Date.now(),inCount=0,outStart=Date.now(),outCount=0;
  function rate(incoming){const now=Date.now();if(incoming){if(now-inStart>=1000||now<inStart){inStart=now;inCount=0;}return ++inCount<=MAX_RATE;}if(now-outStart>=1000||now<outStart){outStart=now;outCount=0;}return ++outCount<=MAX_RATE;}
  function send(type,value){if(disposed||delivering||!rate(false)||sequence>=Number.MAX_SAFE_INTEGER)return false;const message={version:1,session,scope,sender,sequence:++sequence,type,value},json=encoded(message);if(json===null||new TextEncoder().encode(json).byteLength>MAX_BYTES)return false;try{channel.postMessage(JSON.parse(json));return true;}catch{return false;}}
  // Validate the envelope before serialization; selection validation bounds all nested fields.
  function handle(event){
   if(disposed||!rate(true))return;const m=event?.data;
   if(!plain(m)||Object.keys(m).length!==7||Object.keys(m).some(k=>!['version','session','scope','sender','sequence','type','value'].includes(k)))return;
   if(m.version!==1||m.session!==session||m.scope!==scope||!token(m.sender)||m.sender===sender||!Number.isSafeInteger(m.sequence)||m.sequence<=0||!['selection','enabled','state-request','state'].includes(m.type))return;
   if(m.type==='selection'){if(!selection(m.value))return;}else if(m.type==='state-request'){if(m.value!==null)return;}else{const value=m.value,keys=m.type==='state'?['enabled','clock','owner','target']:['enabled','clock','owner'];if(!plain(value)||Object.keys(value).length!==keys.length||Object.keys(value).some(k=>!keys.includes(k))||typeof value.enabled!=='boolean'||!Number.isSafeInteger(value.clock)||value.clock<0||(value.clock===0?value.owner!=='':!token(value.owner))||(m.type==='state'&&!token(value.target))||(m.type==='enabled'&&(value.owner!==m.sender||value.clock===0)))return;}
   const json=encoded(m);if(json===null||new TextEncoder().encode(json).byteLength>MAX_BYTES)return;
   const prior=seen.get(m.sender);if(prior!==undefined&&m.sequence<=prior)return;
   if(prior===undefined&&seen.size>=MAX_SENDERS)return;seen.set(m.sender,m.sequence);
   if(m.type==='state-request'){send('state',{enabled,clock,owner,target:m.sender});return;}
   if(m.type==='state'&&m.value.target!==sender)return;
   if(m.type==='selection'&&!enabled)return;
   delivering=true;
   try{if(m.type==='enabled'||m.type==='state'){const value=m.value;if(value.clock>clock||(value.clock===clock&&value.owner>owner)){clock=value.clock;owner=value.owner;if(enabled!==value.enabled){enabled=value.enabled;onEnabled?.(enabled);}}}else{const key=encoded(m.value);if(key!==lastSelection){lastSelection=key;onSelection?.(JSON.parse(key));}}}finally{delivering=false;}
  }
  channel.addEventListener('message',handle);
  send('state-request',null);
  return {
   publish(value){if(disposed||!enabled||delivering||!selection(value))return false;const key=encoded(value);if(key===null||key===lastSelection)return false;if(!send('selection',value))return false;lastSelection=key;return true;},
   get enabled(){return enabled;},
   getEnabled(){return enabled;},
   setEnabled(value){if(disposed||typeof value!=='boolean')return false;if(value===enabled)return true;if(delivering||clock>=Number.MAX_SAFE_INTEGER)return false;const previous={enabled,clock,owner};enabled=value;clock++;owner=sender;if(!send('enabled',{enabled,clock,owner})){enabled=previous.enabled;clock=previous.clock;owner=previous.owner;return false;}onEnabled?.(enabled);return true;},
   dispose(){if(disposed)return;disposed=true;channel.removeEventListener('message',handle);channel.close();seen.clear();lastSelection=undefined;}
  };
 }
 const api={mount};root.KiCadWindowLink=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
