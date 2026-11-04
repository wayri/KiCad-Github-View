/* Mechanical-only, orthographic drawing assets; source copper is never exported. */
((root)=>{'use strict';
 const projections=['top','bottom','front','back','left','right','iso'];
 function primitives(items){return items.filter(p=>!p.hidden&&!p.frame&&!['pad','via','zone'].includes(p.type)&&
   (p.hole&&p.kind==='drill'||!p.layer||p.layer==='Edge.Cuts'||/^(?:F|B)\.(?:Fab|SilkS|CrtYd)$/.test(p.layer)||/^(?:Dwgs|Cmts|User)\./.test(p.layer)));}
 // Draftsman does not render electrical copper. Remove only complete root-level
 // routing forms before the 3D parsers allocate their AST/mesh data. Footprints,
 // their pads/drills/models, saved stackup and all board graphics stay byte-exact.
 // This is a bounded lexical scan, not regex rewriting of nested S-expressions.
 function mechanicalSource(source,{maxBytes=64*1024*1024}={}){
  if(typeof source!=='string'||!Number.isSafeInteger(maxBytes)||maxBytes<1||source.length>maxBytes||!/^\s*\(kicad_pcb(?:\s|\))/.test(source))throw Error('Mechanical capture requires a bounded KiCad PCB source.');
  if(new TextEncoder().encode(source).length>maxBytes)throw Error('Mechanical PCB source exceeds its byte budget.');
  const omit=new Set(['segment','arc','via','zone']),removed={segment:0,arc:0,via:0,zone:0},parts=[];
  let depth=0,quoted=false,escaped=false,comment=false,closed=false,start=-1,drop=null,last=0;
  for(let i=0;i<source.length;i++){
   const ch=source[i];
   if(comment){if(ch==='\n'||ch==='\r')comment=false;continue;}
   if(quoted){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')quoted=false;continue;}
   if(ch===';'){comment=true;continue;}
   if(closed){if(!/\s/.test(ch))throw Error('Unexpected data after the mechanical PCB.');continue;}
   if(ch==='"'){if(!depth)throw Error('Invalid mechanical PCB structure.');quoted=true;continue;}
   if(ch==='('){
    if(depth>=96)throw Error('Mechanical PCB S-expression is too deep.');
    if(depth===1){start=i;let at=i+1;while(at<source.length){if(/\s/.test(source[at])){at++;continue;}if(source[at]===';'){while(at<source.length&&!/[\r\n]/.test(source[at]))at++;continue;}break;}let end=at;while(end<source.length&&!/[\s();"]/.test(source[end]))end++;const type=source.slice(at,end);drop=omit.has(type)?type:null;}
    depth++;continue;
   }
   if(ch===')'){
    if(!depth)throw Error('Unexpected closing parenthesis in mechanical PCB.');
    depth--;if(depth===1&&drop){parts.push(source.slice(last,start));last=i+1;removed[drop]++;drop=null;}if(!depth)closed=true;
   }
  }
  if(quoted||escaped||depth||!closed)throw Error('Incomplete mechanical PCB S-expression.');
  parts.push(source.slice(last));return{source:parts.join(''),removed};
 }
 let enginePromise;
 function engine(){if(root.SpikeBoard3D?.mountBoard3D)return Promise.resolve(root.SpikeBoard3D);return enginePromise||=(new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='vendor/spike-board3d.bundle.js';script.onload=()=>root.SpikeBoard3D?.mountBoard3D?resolve(root.SpikeBoard3D):reject(Error('Mechanical 3D renderer did not initialize.'));script.onerror=()=>{enginePromise=null;reject(Error('Mechanical 3D renderer is unavailable.'));};document.head.append(script);}));}
 function create({document=root.document,loadEngine=engine,request,source,onScene=()=>{},onProgress=()=>{}}){
  // One GPU scene and one serial capture queue: projections share decoded models,
  // while concurrent callers can never change the camera during another capture.
  const cached=new Map(),identities=new Map();let disposed=false,current=null,queue=Promise.resolve(),sequence=0;
  const checkOpen=()=>{if(disposed)throw Error('Mechanical drawing workspace is closed.');};
  function release(){if(!current)return;const old=current;current=null;try{old.scene?.dispose();}finally{old.host.remove();}}
  function identity(file){let value=identities.get(file.path);if(!value||value.content!==file.content){value={id:++sequence,content:file.content};identities.set(file.path,value);}return value;}
  async function sceneFor(file,boardKey){
   checkOpen();if(current?.key===boardKey)return current;
   release();onProgress('Preparing mechanical renderer…');const renderer=await loadEngine();checkOpen();
   const warnings=[];let paths=[];
   if(request)try{onProgress('Finding linked assembly models…');const result=await request('repo-model-index',{repository:source.repository,ref:source.ref,file:file.path});checkOpen();paths=result.paths||[];warnings.push(...(result.warnings||[]));}catch(error){checkOpen();warnings.push('Linked model inventory unavailable: '+error.message);}
   checkOpen();const host=document.createElement('div');Object.assign(host.style,{position:'fixed',left:'-12000px',top:'0',width:'1200px',height:'900px',pointerEvents:'none'});host.setAttribute('aria-hidden','true');document.body.append(host);
   current={key:boardKey,host,warnings,scene:null};
   // Let the status update reach the screen before synchronous CAD parsing and
   // WebGL allocation. Subsequent projections avoid this work entirely.
   await new Promise(resolve=>setTimeout(resolve,0));checkOpen();
   try{const record=file.identity||identity(file);if(!record.mechanical){onProgress('Reading mechanical board data…');record.mechanical=mechanicalSource(file.content);}const projected=record.mechanical;if(projected.removed.via)warnings.push('Mechanical drawing omits '+projected.removed.via+' routing-via holes; footprint and mounting drills are retained.');onProgress('Loading board and assembly geometry…');const scene=renderer.mountBoard3D(host,projected.source,{dark:false,lighting:'universal',quality:'balanced',mechanical:true,boardPath:file.path,assetPaths:paths,assetWarnings:warnings,
     loadAsset:path=>{checkOpen();if(!request)throw Error('Repository model loading is unavailable.');return request('repo-asset',{repository:source.repository,ref:source.ref,file:path});}});
    current.scene=scene;onScene(scene);checkOpen();if(typeof scene.captureMechanicalView!=='function')throw Error('Reload the viewer to update the mechanical renderer.');return current;
   }catch(error){release();throw error;}
  }
  async function capture(file,projection='top'){
   checkOpen();if(!file||!/\.kicad_pcb$/i.test(file.path)||typeof file.content!=='string'||!projections.includes(projection))throw Error('Choose a PCB and supported mechanical view.');
   const record=identity(file),boardKey=JSON.stringify([file.path,record.id]),key=JSON.stringify([boardKey,projection]);if(cached.has(key))return cached.get(key);
   if(cached.size>=16)throw Error('At most 16 distinct mechanical views per session. Save and reopen to reset the preview cache.');
   // Snapshot the source before queuing so caller mutation cannot substitute a board.
   const snapshot={path:file.path,content:file.content,identity:record};
   const work=queue.then(async()=>{checkOpen();const active=await sceneFor(snapshot,boardKey);checkOpen();onProgress('Rendering mechanical '+projection+' view…');
    try{const result=await active.scene.captureMechanicalView(projection);checkOpen();if(!result?.image?.startsWith('data:image/png;base64,')||!result.bounds)throw Error('Mechanical renderer did not return a drawing asset.');return {...result,bounds:{...result.bounds},warnings:[...new Set([...active.warnings,...(result.warnings||[])])].slice(0,100)};
    }catch(error){release();throw error;}
   });
   cached.set(key,work);queue=work.then(()=>{},()=>{});try{return await work;}catch(error){if(cached.get(key)===work)cached.delete(key);throw error;}
  }
  return {capture,dispose(){if(disposed)return;disposed=true;release();cached.clear();identities.clear();}};
 }
 root.KiCadDraftsmanMechanical={create,primitives,projections,mechanicalSource};
 if(typeof module==='object'&&module.exports)module.exports=root.KiCadDraftsmanMechanical;
})(globalThis);
