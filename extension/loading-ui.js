/* Local preparation jobs and an accessible, paintable loading surface. */
((root)=>{
  'use strict';
  const workerURL=new URL('load-worker.js',document.currentScript?.src||location.href).href;
  function indicator(host){
    const pane=document.createElement('div');pane.className='loading-surface';pane.hidden=true;pane.setAttribute('role','status');pane.setAttribute('aria-live','polite');
    const spinner=document.createElement('span');spinner.className='loading-spinner';spinner.setAttribute('aria-hidden','true');
    const copy=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('p');title.textContent='Loading KiCad project';copy.append(title,detail);pane.append(spinner,copy);host.append(pane);
    let started=0,timer=null;
    const elapsed=document.createElement('small');copy.append(elapsed);
    return {show(stage){if(pane.hidden){started=Date.now();elapsed.textContent='';timer=setInterval(()=>{elapsed.textContent=`${Math.floor((Date.now()-started)/1000)} seconds elapsed`;},1000);}pane.hidden=false;detail.textContent=stage;host.setAttribute('aria-busy','true');},hide(){pane.hidden=true;host.setAttribute('aria-busy','false');clearInterval(timer);timer=null;},dispose(){this.hide();pane.remove();}};
  }
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
  root.KiCadLoading={indicator,paint,run};
})(globalThis);
