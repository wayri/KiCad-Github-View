/* Mechanical-only, orthographic drawing assets; source copper is never exported. */
((root)=>{'use strict';
 const projections=['top','bottom','front','back','left','right','iso'];
 function primitives(items){return items.filter(p=>!p.hidden&&!p.frame&&!['pad','via','zone'].includes(p.type)&&
   (p.hole&&p.kind==='drill'||!p.layer||p.layer==='Edge.Cuts'||/^(?:F|B)\.(?:Fab|SilkS|CrtYd)$/.test(p.layer)||/^(?:Dwgs|Cmts|User)\./.test(p.layer)));}
 let enginePromise;
 function engine(){if(root.SpikeBoard3D?.mountBoard3D)return Promise.resolve(root.SpikeBoard3D);return enginePromise||=(new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='vendor/spike-board3d.bundle.js';script.onload=()=>root.SpikeBoard3D?.mountBoard3D?resolve(root.SpikeBoard3D):reject(Error('Mechanical 3D renderer did not initialize.'));script.onerror=()=>{enginePromise=null;reject(Error('Mechanical 3D renderer is unavailable.'));};document.head.append(script);}));}
 function create({document=root.document,loadEngine=engine,request,source,onScene=()=>{}}){
  const cached=new Map();let disposed=false;const active=new Set(),hosts=new Set();
  async function capture(file,projection='top'){
   if(disposed)throw Error('Mechanical drawing workspace is closed.');
   if(!file||!file.path?.endsWith('.kicad_pcb')||typeof file.content!=='string'||!projections.includes(projection))throw Error('Choose a PCB and supported mechanical view.');
   const key=JSON.stringify([file.path,projection]);if(cached.has(key))return cached.get(key);
   if(cached.size>=16)throw Error('At most 16 distinct mechanical views per session. Save and reopen to reset the preview cache.');
   const work=(async()=>{const renderer=await loadEngine();if(disposed)throw Error('Mechanical drawing workspace is closed.');
    const host=document.createElement('div');Object.assign(host.style,{position:'fixed',left:'-12000px',top:'0',width:'1200px',height:'900px',pointerEvents:'none'});host.setAttribute('aria-hidden','true');document.body.append(host);hosts.add(host);
    let scene;const warnings=[];let paths=[];
    try{
     if(request)try{const result=await request('repo-model-index',{repository:source.repository,ref:source.ref,file:file.path});paths=result.paths||[];warnings.push(...(result.warnings||[]));}catch(error){warnings.push('Linked model inventory unavailable: '+error.message);}
     if(disposed)throw Error('Mechanical drawing workspace is closed.');
     scene=renderer.mountBoard3D(host,file.content,{dark:false,lighting:'universal',quality:'balanced',mechanical:true,boardPath:file.path,assetPaths:paths,assetWarnings:warnings,
      loadAsset:path=>{if(!request)throw Error('Repository model loading is unavailable.');return request('repo-asset',{repository:source.repository,ref:source.ref,file:path});}});
     active.add(scene);onScene(scene);
     if(typeof scene.captureMechanicalView!=='function')throw Error('Reload the viewer to update the mechanical renderer.');
     const result=await scene.captureMechanicalView(projection);if(disposed)throw Error('Mechanical drawing workspace is closed.');
     if(!result?.image?.startsWith('data:image/png;base64,')||!result.bounds)throw Error('Mechanical renderer did not return a drawing asset.');
     return {...result,warnings:[...new Set([...warnings,...(result.warnings||[])])].slice(0,100)};
    }finally{if(scene){active.delete(scene);scene.dispose();}hosts.delete(host);host.remove();}
   })();cached.set(key,work);try{return await work;}catch(error){cached.delete(key);throw error;}
  }
  return {capture,dispose(){disposed=true;for(const scene of active)scene.dispose();for(const host of hosts)host.remove();hosts.clear();active.clear();cached.clear();}};
 }
 root.KiCadDraftsmanMechanical={create,primitives,projections};
 if(typeof module==='object'&&module.exports)module.exports=root.KiCadDraftsmanMechanical;
})(globalThis);
