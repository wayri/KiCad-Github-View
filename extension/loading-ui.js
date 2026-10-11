/* Local preparation jobs and an accessible, paintable loading surface. */
((root)=>{
  'use strict';
  const workerURL=new URL('load-worker.js',document.currentScript?.src||location.href).href;
  const logoURL=new URL('app-logo.png',document.currentScript?.src||location.href).href;
  function indicator(host){
    const pane=document.createElement('div');pane.className='loading-surface';pane.hidden=true;pane.setAttribute('role','status');pane.setAttribute('aria-live','polite');
    if(typeof pane.showPopover==='function')pane.setAttribute('popover','manual');
    const bar=document.createElement('progress');bar.className='loading-bar';bar.setAttribute('aria-label','Loading');
    const copy=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('p');title.textContent='Loading';copy.append(title,detail);pane.append(bar,copy);if(root.KiCadAndroidRuntime||document.body?.classList?.contains('android-home')){const logo=document.createElement('img');logo.className='loading-logo';logo.src=logoURL;logo.alt='';logo.width=36;logo.height=36;logo.setAttribute('aria-hidden','true');pane.append(logo);pane.classList.add('loading-branded');}host.append(pane);
    let started=0,timer=null,delay=null,active=false;
    const elapsed=document.createElement('small');copy.append(elapsed);
    return {show(stage,progress){
      detail.textContent=stage||'Please wait…';
      if(Number.isFinite(progress)){bar.max=1;bar.value=Math.max(0,Math.min(1,progress));}else bar.removeAttribute?.('value');
      host.setAttribute('aria-busy','true');
      if(active)return;active=true;started=Date.now();elapsed.textContent='';
      delay=setTimeout(()=>{delay=null;if(!active)return;pane.hidden=false;try{pane.showPopover?.();}catch{}
        const tick=()=>{elapsed.textContent=`${((Date.now()-started)/1000).toFixed(1)} s`;};tick();timer=setInterval(tick,250);
      },300);
    },hide(){active=false;try{pane.hidePopover?.();}catch{}pane.hidden=true;host.setAttribute('aria-busy','false');clearTimeout(delay);delay=null;clearInterval(timer);timer=null;},dispose(){this.hide();pane.remove();}};
  }
  const activities=new Map();let activityUI=null;
  function activity(stage){
    if(!activityUI)activityUI=indicator(document.body);
    const token={};activities.set(token,stage);activityUI.show(stage);
    let ended=false;
    return {update(text,progress){if(!ended){activities.set(token,text);activityUI.show(text,progress);}},end(){if(ended)return;ended=true;activities.delete(token);if(activities.size)activityUI.show([...activities.values()].at(-1));else activityUI.hide();}};
  }
  function track(promise,stage='Loading…'){const task=activity(stage);return Promise.resolve(promise).finally(()=>task.end());}
  function paint(){return typeof requestAnimationFrame==='function'?new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0))):Promise.resolve();}
  function run(job,payload,fallback,{onStage=()=>{},signal}={}){
    if(signal?.aborted)return Promise.reject(new Error('Loading cancelled.'));
    if(typeof Worker!=='function'||root.KiCadVSCodeContext)return paint().then(()=>{if(signal?.aborted)throw Error('Loading cancelled.');return fallback();});
    return new Promise((resolve,reject)=>{
      let worker,timer,settled=false;
      const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);worker?.terminate();error?reject(error):resolve(value);};
      const abort=()=>finish(new Error('Loading cancelled.'));
      try{worker=new Worker(workerURL);}catch{paint().then(()=>{if(signal?.aborted)throw Error('Loading cancelled.');return fallback();}).then(resolve,reject);return;}
      signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>finish(new Error('Preparation exceeded two minutes. Try opening a smaller project.')),120000);
      worker.onmessage=event=>{const value=event.data;if(value?.stage){onStage(value.stage);return;}if(value?.ok)finish(null,value.result);else finish(new Error(value?.error||'KiCad preparation failed.'));};
      worker.onerror=()=>finish(new Error('The loading worker could not start. Reload the extension and retry.'));
      try{worker.postMessage({job,payload});}catch(error){finish(error);}
    });
  }
  root.KiCadLoading={indicator,activity,track,paint,run};
})(globalThis);
