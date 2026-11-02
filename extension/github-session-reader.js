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
    if(!Array.isArray(objects))throw Error('Invalid GitHub website payload.');
    const routes=[...new Set(objects.flatMap(v=>[v?.payload?.codeViewTreeRoute,v?.payload?.codeViewRepoRoute,
      v?.payload?.tree&&v?.payload?.refInfo?v.payload:null]))].filter(v=>v && (v.path??'/')===(directory||'/'));
    if(!routes.length)throw Error('The GitHub website did not expose a readable repository tree. Check repository website access, then retry.');
    const items=new Map();let sha=null;
    for(const route of routes){
      const oid=route.refInfo?.currentOid,tree=route.tree;
      if(!SHA.test(oid||'')||(SHA.test(ref)?oid.toLowerCase()!==ref.toLowerCase():ref!=='HEAD'&&route.refInfo?.name!==ref))throw Error('GitHub session returned a different revision.');
      if(sha&&sha!==oid.toLowerCase())throw Error('GitHub website returned conflicting directory revisions.');sha=oid.toLowerCase();
      if(!Array.isArray(tree?.items)||tree.items.length>2000||tree.truncated)throw Error('GitHub website directory is incomplete. Open a smaller project folder; additional saved files may exist.');
      const own=new Map();for(const item of tree.items){
        if(!safePath(item?.path)||!['file','directory','symlink','submodule'].includes(item.contentType))throw Error('GitHub session directory contains an unsafe entry.');
        const direct=item.path.split('/').slice(0,-1).join('/')===directory;
        // GitHub compresses single-child folder chains into one directory row.
        // Accept only its explicit marker and exact safe relative display path;
        // files, traversal and entries outside this pinned directory still fail.
        const simplified=!direct&&item.contentType==='directory'&&item.hasSimplifiedPath===true&&safePath(item.name)&&item.name.includes('/')&&item.path===(directory?directory+'/':'')+item.name;
        if(!direct&&!simplified)throw Error('GitHub session directory contains an unsafe entry.');
        for(const previous of [own.get(item.path),items.get(item.path)])if(previous&&previous.type!==item.contentType)throw Error('Conflicting GitHub website entry types: '+item.path);
        const value={path:item.path,type:item.contentType,...(simplified?{hasSimplifiedPath:true}:{})};own.set(item.path,value);items.set(item.path,value);
      }
      if(own.size>1000||tree.totalCount!==own.size)throw Error('GitHub website directory is incomplete. Open a smaller project folder; additional saved files may exist.');
    }
    return {sha,items:[...items.values()]};
  }
  // Service workers have no DOMParser. Read inert JSON script payloads only.
  function htmlObjects(html){
    if(typeof html!=='string'||new TextEncoder().encode(html).length>8*1024*1024)throw Error('GitHub website page exceeds its size limit.');
    const objects=[];for(const match of html.matchAll(/<script\b([^>]*?)>([\s\S]*?)<\/script\s*>/gi)){
      if(!/\btype\s*=\s*(?:"application\/json"|'application\/json'|application\/json)(?=\s|$)/i.test(match[1]))continue;
      if(objects.length>=100)throw Error('GitHub website contains too many JSON payloads.');
      try{objects.push(JSON.parse(match[2]));}catch{}
    }
    return objects;
  }
  function websiteError(status,html=''){
    const text=String(html).slice(0,1024*1024),failure=message=>Object.assign(Error(message),{source:'github-website',status,accessIssue:{kind:status===429?'website-rate-limit':'website-access',confirmed:status===429,title:status===429?'GitHub website temporarily limited':'GitHub website access unavailable',message,action:'Check this repository directly on GitHub and retry. Project discovery reads the website, not the GitHub API.'}});
    if(status===429||/too many requests|secondary rate limit/i.test(text))return failure('GitHub website requests are temporarily limited. Retry shortly. This project read does not use the GitHub API.');
    if(/ERR_BLOCKED_BY_ADMINISTRATOR|blocked by (?:your )?(?:organization|administrator)|organization policy|administrator policy/i.test(text))return failure('Browser or organization policy blocked the GitHub website request. Allow this repository website in the browser policy, then retry.');
    if(status===401||status===403||/SAML|single sign.on|access denied/i.test(text))return failure('GitHub website access was denied'+(status?' (HTTP '+status+')':'')+'. Open this repository on GitHub and complete its sign-in or organization access requirement, then retry.');
    if(status===404)return failure('The GitHub repository, branch or folder was not found (website HTTP 404). Check the saved repository URL and revision.');
    return failure('GitHub did not provide a readable repository page'+(status?' (website HTTP '+status+')':'')+'. Open the repository on GitHub to check access, then retry.');
  }
  function rawText(content,path){
    if(/\.(?:kicad_(?:sch|pcb|pro|mod|sym|dru)|sch|pro|brd|lib)$/i.test(path)&&/^\s*(?:<!doctype\s+html\b|<html\b|<head\b|<body\b|<title\b|<form\b)/i.test(content))throw Error('GitHub returned an HTML website page instead of saved KiCad source. Check repository website access; no source was cached.');
    return content;
  }
  async function bounded(response,limit,signal,binary=false) {
    if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw Error('GitHub session response exceeds its size limit.');}
    const reader=response.body.getReader(), chunks=[];let size=0;
    const cancel=()=>reader.cancel().catch(()=>{});signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Error('GitHub session response exceeds its size limit.');}chunks.push(value);}}finally{signal?.removeEventListener('abort',cancel);}
    if(signal?.aborted)throw Error('Project loading cancelled.');
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return binary?bytes:new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  }
  function create({fetch:fetcher=root.fetch,location=root.location,signal,parseDocument=()=>[...(root.document?.querySelectorAll('script[type="application/json"]')||[])].map(s=>{try{return JSON.parse(s.textContent);}catch{return null;}}),parseHTML=html=>[...new DOMParser().parseFromString(html,'text/html').querySelectorAll('script[type="application/json"]')].map(s=>{try{return JSON.parse(s.textContent);}catch{return null;}})}={}) {
    async function read(message) {
      const {repository,ref,action,path='',limit=8*1024*1024}=message;scope(repository,ref);
      const here=new URL(location.href);
      if(here.origin!=='https://github.com'||here.pathname.split('/').slice(1,3).join('/').toLowerCase()!==repository.toLowerCase())throw Error('A signed-in tab for this repository must remain open.');
      if(!['resolve','directory','file','asset','history'].includes(action)||!safePath(path,true))throw Error('Unsupported GitHub session read.');
      if(!['resolve','history'].includes(action)&&!SHA.test(ref))throw Error('GitHub session reads require a pinned commit.');
      if(signal?.aborted)throw Error('Project loading cancelled.');
      const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(()=>controller.abort(),30000);
      signal?.addEventListener('abort',abort,{once:true});
      try {
        if(action==='history'){
          const url=`https://github.com/${repository}/commits/${encodeURIComponent(ref)}.atom`,response=await fetcher(url,{credentials:'same-origin',redirect:'error',cache:'no-store',signal:controller.signal});
          if(!response.ok||response.url&&response.url!==url||!/atom|xml/i.test(response.headers.get('content-type')||''))throw Error('GitHub website commit history is unavailable for this repository.');
          return {ref,content:await bounded(response,4*1024*1024,controller.signal)};
        }
        if(action==='file'||action==='asset') {
          if(!safePath(path)||!Number.isInteger(limit)||limit<1||limit>32*1024*1024)throw Error('Invalid GitHub session file.');
          const suffix=`/${repository}/${ref}/${path.split('/').map(encodeURIComponent).join('/')}`;
          const response=await fetcher(`https://github.com/${repository}/raw/${ref}/${path.split('/').map(encodeURIComponent).join('/')}`,{credentials:'same-origin',redirect:'follow',cache:'no-store',signal:controller.signal});
          if(response.status===404)return null;
          const final=new URL(response.url);
          if(!response.ok||!(final.origin==='https://raw.githubusercontent.com'&&final.pathname===suffix||final.origin==='https://github.com'&&final.pathname===`/${repository}/raw/${ref}/${path.split('/').map(encodeURIComponent).join('/')}`)||/html/i.test(response.headers.get('content-type')||''))throw Error('GitHub session could not download this file. Check website access or connect GitHub in settings.');
          if(action==='asset') {
            const bytes=await bounded(response,limit,controller.signal,true),pieces=[];
            for(let i=0;i<bytes.length;i+=8192)pieces.push(String.fromCharCode(...bytes.subarray(i,i+8192)));
            return {base64:btoa(pieces.join('')),sha:ref.toLowerCase()};
          }
          return {content:rawText(await bounded(response,limit,controller.signal),path),sha:ref.toLowerCase()};
        }
        const directory=action==='resolve'?'':path;
        // Reuse the repository page already downloaded by Chrome before fetching
        // another HTML directory. treeData still verifies exact pinned identity.
        const rootPage=here.pathname.replace(/\/$/,'').toLowerCase()===`/${repository}`.toLowerCase()&&!here.search;
        if(ref!=='HEAD'||rootPage){try{return treeData(parseDocument(),ref,directory);}catch{}}
        const url=ref==='HEAD'?`https://github.com/${repository}`:`https://github.com/${repository}/tree/${encodeURIComponent(ref)}${directory?'/'+directory.split('/').map(encodeURIComponent).join('/'):''}`;
        const response=await fetcher(url,{credentials:'same-origin',redirect:'error',cache:'no-store',signal:controller.signal});
        if(!response.ok)throw websiteError(response.status,await bounded(response,1024*1024,controller.signal));
        return treeData(parseHTML(await bounded(response,8*1024*1024,controller.signal)),ref,directory);
      } finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);}
    }
    return {read};
  }
  root.KiCadGitHubSessionReader={create,treeData,safePath,htmlObjects,websiteError,rawText};
  if(typeof module==='object'&&module.exports)module.exports=root.KiCadGitHubSessionReader;
})(typeof globalThis==='object'?globalThis:this);
