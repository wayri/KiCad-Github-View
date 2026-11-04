/* Optional, explicit action-only host. Repository scripts never receive viewer messages. */
(function(root){'use strict';
 const PAGES=new Set(['project-viewer.html','browser-viewer.html','gerber-viewer.html','project-launcher.html']);
 function create({document=root.document,location=root.location,runtime=root.chrome?.runtime,MutationObserver=root.MutationObserver,events=root}={}){
  let current=null;
  function viewerURL(value){
   if(typeof value!=='string'||value.length>10000)throw Error('Invalid in-page viewer URL.');
   const url=new URL(value),own=new URL(runtime.getURL(''));
   if(!['chrome-extension:','moz-extension:'].includes(own.protocol)||url.protocol!==own.protocol||url.host!==own.host||url.username||url.password||url.hash||!PAGES.has(url.pathname.slice(1))||url.pathname!==('/'+url.pathname.slice(1)))throw Error('In-page viewer must use this extension’s viewer.');
   return url.href;
  }
  function close({restoreFocus=true}={}){
   const view=current;if(!view)return false;current=null;view.observer?.disconnect();
   for(const [target,type,callback]of view.listeners)target.removeEventListener?.(type,callback);
   view.host.remove();if(restoreFocus&&view.previousFocus?.isConnected)view.previousFocus.focus?.();return true;
  }
  function open(request){
   const url=viewerURL(request?.url),source=location.href;
   if(request.sourceUrl&&request.sourceUrl!==source)throw Error('Repository navigation changed; click the extension icon again.');
   close({restoreFocus:false});
   const main=document.querySelector('main')||document.body;if(!main)throw Error('Repository page is not ready.');
   const host=document.createElement('section');host.setAttribute('aria-label','KiCad in-page viewer');host.setAttribute('data-kicad-inline-viewer','');
   const shadow=host.attachShadow({mode:'closed'}),style=document.createElement('style');
   style.textContent=':host{display:block;position:relative;margin:8px 0;isolation:isolate;color-scheme:dark light}.surface{display:flex;flex-direction:column;height:min(78vh,840px);min-height:320px;resize:vertical;overflow:hidden;border:1px solid #596773;border-radius:6px;background:#111a23;color:#dce7ef;font:12px/1.3 system-ui,sans-serif}.bar{display:flex;align-items:center;gap:8px;min-height:34px;padding:0 6px 0 10px;border-bottom:1px solid #596773;flex-shrink:0}.title{font-weight:600;flex:1}.bar button{font:inherit;color:inherit;background:transparent;border:1px solid #596773;border-radius:4px;min-height:26px;padding:3px 8px;cursor:pointer}.bar button:hover,.bar button:focus-visible{background:#294858;outline:1px solid #7bc9c1}.bar button:disabled{opacity:.6;cursor:wait}.status:empty{display:none}.status{padding:4px 10px;font-size:11px;color:#eab69b}iframe{display:block;width:100%;border:0;flex:1;min-height:0;background:#111a23}@media(max-width:600px){.surface{height:76vh;min-height:280px}.bar{min-height:38px}.bar button{min-height:32px}}';
   const surface=document.createElement('div');surface.className='surface';const bar=document.createElement('div');bar.className='bar';
   const title=document.createElement('span');title.className='title';title.textContent='KiCad review';
   const popout=document.createElement('button');popout.type='button';popout.textContent='Open in tab';popout.title='Open this viewer in its own tab';
   const dismiss=document.createElement('button');dismiss.type='button';dismiss.textContent='×';dismiss.title='Close in-page viewer';dismiss.setAttribute('aria-label','Close in-page viewer');
   const status=document.createElement('div');status.className='status';status.setAttribute('role','status');
   const frame=document.createElement('iframe');frame.title='KiCad project viewer';frame.referrerPolicy='no-referrer';frame.src=url;
   const view={host,frame,url,source,previousFocus:document.activeElement,listeners:[],observer:null};current=view;
   frame.addEventListener('error',()=>{if(current===view)status.textContent='This page could not embed the viewer. Use Open in tab; browser or organization policy may restrict embedded content.';});
   dismiss.addEventListener('click',()=>close());
   popout.addEventListener('click',async()=>{if(current!==view)return;popout.disabled=true;status.textContent='';try{
    const result=await runtime.sendMessage({type:'inline-project-open-tab',url:view.url});
    if(!result?.ok)throw Error(result?.error||'Could not open the viewer tab.');
    if(current===view)close();
   }catch(error){if(current===view)status.textContent=error.message;}finally{if(current===view)popout.disabled=false;}});
   const navigation=()=>{if(current===view&&(location.href!==source||!host.isConnected))close({restoreFocus:false});};
   const leaving=()=>{if(current===view)close({restoreFocus:false});};
   function listen(target,type,callback){target.addEventListener?.(type,callback);view.listeners.push([target,type,callback]);}
   for(const type of ['popstate','hashchange'])listen(events,type,navigation);listen(events,'pagehide',leaving);
   for(const type of ['turbo:before-visit','pjax:start'])listen(document,type,leaving);
   if(MutationObserver){view.observer=new MutationObserver(navigation);view.observer.observe(document.documentElement,{childList:true,subtree:true});}
   bar.append(title,popout,dismiss);surface.append(bar,status,frame);shadow.append(style,surface);main.prepend(host);host.scrollIntoView?.({block:'start',behavior:'auto'});
   return {opened:true,mode:'inline'};
  }
  return {open,close,viewerURL};
 }
 if(typeof module==='object'&&module.exports)module.exports={create};
 if(root.chrome?.runtime?.onMessage&&root.document&&!root.KiCadInlineProjectView){
  const controller=create();root.KiCadInlineProjectView=controller;
  root.chrome.runtime.onMessage.addListener((message,sender,reply)=>{
   if(sender?.id!==root.chrome.runtime.id||sender.tab||message?.type!=='inline-project-open')return false;
   try{reply({ok:true,result:controller.open(message)});}catch(error){reply({ok:false,error:error.message});}return false;
  });
 }
})(globalThis);
