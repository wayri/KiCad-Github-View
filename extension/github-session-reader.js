"use strict";
(function(root) {
  const SHA=/^[a-f0-9]{40}$/i, REPO=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
  function safePath(path, empty=false) {
    return typeof path==='string' && path.length<=500 && (empty&&path==='' || path!==''&&path.split('/').every(p=>p&&p!=='.'&&p!=='..'&&!/[\\:\x00-\x1f\x7f]/.test(p)));
  }
  function scope(repository,ref) {
    if(!REPO.test(repository||'')||repository.split('/').some(p=>p==='.'||p==='..')||typeof ref!=='string'||!ref||ref.length>200||ref.split('/').some(p=>!p||p==='.'||p==='..')||/[\\:\x00-\x1f\x7f?#]/.test(ref))throw Error('Invalid GitHub session location.');
  }
  function treeData(objects, ref, directory) {
    const routes=objects.map(v=>v?.payload?.codeViewTreeRoute).filter(v=>v && v.path===(directory||'/'));
    if(routes.length!==1)throw Error('GitHub did not return a readable repository tree. Keep its signed-in tab open, or connect GitHub in settings.');
    const route=routes[0], sha=route.refInfo?.currentOid, tree=route.tree;
    if(!SHA.test(sha||'') || (SHA.test(ref)?sha.toLowerCase()!==ref.toLowerCase():route.refInfo?.name!==ref))throw Error('GitHub session returned a different revision.');
    if(!Array.isArray(tree?.items)||tree.items.length>1000||tree.totalCount!==tree.items.length||tree.truncated)throw Error('GitHub session directory is incomplete. Connect GitHub for larger repositories.');
    const seen=new Set(),items=tree.items.map(item=>{
      if(!safePath(item?.path)||item.path.split('/').slice(0,-1).join('/')!==directory||seen.has(item.path)||!['file','directory','symlink','submodule'].includes(item.contentType))throw Error('GitHub session directory contains an unsafe entry.');
      seen.add(item.path);return {path:item.path,type:item.contentType};
    });
    return {sha:sha.toLowerCase(),items};
  }
  async function bounded(response,limit,signal) {
    if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw Error('GitHub session response exceeds its size limit.');}
    const reader=response.body.getReader(), chunks=[];let size=0;
    const cancel=()=>reader.cancel().catch(()=>{});signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Error('GitHub session response exceeds its size limit.');}chunks.push(value);}}finally{signal?.removeEventListener('abort',cancel);}
    if(signal?.aborted)throw Error('Project loading cancelled.');
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  }
  function create({fetch:fetcher=root.fetch,location=root.location,signal,parseHTML=html=>[...new DOMParser().parseFromString(html,'text/html').querySelectorAll('script[type="application/json"]')].map(s=>{try{return JSON.parse(s.textContent);}catch{return null;}})}={}) {
    async function read(message) {
      const {repository,ref,action,path='',limit=8*1024*1024}=message;scope(repository,ref);
      const here=new URL(location.href);
      if(here.origin!=='https://github.com'||here.pathname.split('/').slice(1,3).join('/').toLowerCase()!==repository.toLowerCase())throw Error('A signed-in tab for this repository must remain open.');
      if(!['resolve','directory','file'].includes(action)||!safePath(path,true))throw Error('Unsupported GitHub session read.');
      if(action!=='resolve'&&!SHA.test(ref))throw Error('GitHub session reads require a pinned commit.');
      if(signal?.aborted)throw Error('Project loading cancelled.');
      const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(()=>controller.abort(),30000);
      signal?.addEventListener('abort',abort,{once:true});
      try {
        if(action==='file') {
          if(!safePath(path)||!Number.isInteger(limit)||limit<1||limit>32*1024*1024)throw Error('Invalid GitHub session file.');
          const suffix=`/${repository}/${ref}/${path.split('/').map(encodeURIComponent).join('/')}`;
          const response=await fetcher(`https://github.com/${repository}/raw/${ref}/${path.split('/').map(encodeURIComponent).join('/')}`,{credentials:'same-origin',redirect:'follow',cache:'no-store',signal:controller.signal});
          if(response.status===404)return null;
          const final=new URL(response.url);
          if(!response.ok||!(final.origin==='https://raw.githubusercontent.com'&&final.pathname===suffix||final.origin==='https://github.com'&&final.pathname===`/${repository}/raw/${ref}/${path.split('/').map(encodeURIComponent).join('/')}`)||/html/i.test(response.headers.get('content-type')||''))throw Error('GitHub session could not download this file. Check website access or connect GitHub in settings.');
          return {content:await bounded(response,limit,controller.signal),sha:ref.toLowerCase()};
        }
        const directory=action==='resolve'?'':path;
        const url=`https://github.com/${repository}/tree/${encodeURIComponent(ref)}${directory?'/'+directory.split('/').map(encodeURIComponent).join('/'):''}`;
        const response=await fetcher(url,{credentials:'same-origin',redirect:'error',cache:'no-store',signal:controller.signal});
        if(!response.ok)throw Error('GitHub session access is unavailable. Open this repository on GitHub or connect GitHub in settings.');
        return treeData(parseHTML(await bounded(response,8*1024*1024,controller.signal)),ref,directory);
      } finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);}
    }
    return {read};
  }
  root.KiCadGitHubSessionReader={create,treeData,safePath};
  if(typeof module==='object'&&module.exports)module.exports=root.KiCadGitHubSessionReader;
})(typeof globalThis==='object'?globalThis:this);
