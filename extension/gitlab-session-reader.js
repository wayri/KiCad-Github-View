"use strict";
(function(root){
  const MAX=32*1024*1024;
  const pathOK=value=>typeof value==='string'&&value.length<=500&&value!==''&&value.split('/').every(p=>p&&p!=='.'&&p!=='..'&&!/[\\:\x00-\x1f\x7f]/.test(p));
  const repoOK=value=>pathOK(value)&&value.length<=300&&/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/.test(value);
  function validate({host,repository,url,limit},location) {
    const origin=new URL(host),here=new URL(location.href),target=new URL(url);
    if(origin.protocol!=='https:'||origin.pathname!=='/'||origin.username||origin.password||origin.search||origin.hash||host!==origin.origin||!repoOK(repository)||here.origin!==host||!(here.pathname===`/${repository}`||here.pathname.startsWith(`/${repository}/-/`)))throw Error('Open this GitLab project in a signed-in tab on its approved server.');
    if(target.origin!==host||target.username||target.password||target.hash||!Number.isInteger(limit)||limit<1||limit>MAX)throw Error('Invalid GitLab session read.');
    const match=target.pathname.match(/^\/api\/v4\/projects\/([^/]+)(.*)$/);
    if(!match)throw Error('Unsupported GitLab session endpoint.');
    const project=decodeURIComponent(match[1]),endpoint=match[2];
    // Numeric project metadata identifies MR fork repositories; it never reads their files.
    if(project!==repository&&!(endpoint===''&&/^[1-9][0-9]{0,11}$/.test(project)))throw Error('GitLab session project does not match its tab.');
    let allowed;
    if(endpoint==='')allowed=[];
    else if(endpoint==='/repository/tree')allowed=['ref','recursive','per_page','page','path'];
    else if(endpoint==='/repository/branches')allowed=['per_page','page'];
    else if(endpoint==='/repository/commits')allowed=['ref_name','path','per_page','page'];
    else if(endpoint==='/repository/compare')allowed=['from','to','straight'];
    else if(/^\/repository\/commits\/[^/]+$/.test(endpoint))allowed=[];
    else if(/^\/repository\/files\/[^/]+\/raw$/.test(endpoint)){if(!pathOK(decodeURIComponent(endpoint.split('/')[3])))throw Error('Unsafe GitLab file path.');allowed=['ref'];}
    else if(/^\/merge_requests\/[1-9][0-9]{0,8}$/.test(endpoint))allowed=[];
    else throw Error('GitLab session supports repository and merge-request reads only.');
    const seen=new Set();
    for(const [key,value] of target.searchParams){
      if(!allowed.includes(key)||seen.has(key)||value.length>500||/[\x00-\x1f\x7f]/.test(value))throw Error('Unsupported GitLab session query.');seen.add(key);
      if(['per_page','page'].includes(key)&&(!/^[1-9][0-9]{0,3}$/.test(value)||Number(value)>(key==='per_page'?100:1000)))throw Error('Invalid GitLab pagination.');
      if(['recursive','straight'].includes(key)&&!['true','false'].includes(value))throw Error('Invalid GitLab query flag.');
      if(key==='path'&&value!==''&&!pathOK(value))throw Error('Unsafe GitLab directory.');
      if(['ref','ref_name','from','to'].includes(key)&&!pathOK(value))throw Error('Invalid GitLab revision.');
    }
    if(endpoint.includes('/commits/')){if(!pathOK(decodeURIComponent(endpoint.split('/').at(-1))))throw Error('Invalid GitLab revision.');}
    return target.href;
  }
  function create({fetch:fetcher=root.fetch,location=root.location}={}) {
    async function read(message) {
      const url=validate(message,location),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
      try {
        const response=await fetcher(url,{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal});
        if(response.status===404)return null;
        if(!response.ok)throw Error(`GitLab session returned HTTP ${response.status}. Check website access or connect GitLab in settings.`);
        if(/text\/html/i.test(response.headers.get('content-type')||''))throw Error('GitLab returned a login page instead of project data.');
        if(Number(response.headers.get('content-length'))>message.limit){await response.body?.cancel();throw Error('GitLab session response exceeds its size limit.');}
        const reader=response.body.getReader(),chunks=[];let count=0;
        while(true){const {done,value}=await reader.read();if(done)break;count+=value.length;if(count>message.limit){await reader.cancel();throw Error('GitLab session response exceeds its size limit.');}chunks.push(value);}
        const bytes=new Uint8Array(count);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
        let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
        const next=response.headers.get('x-next-page')||'';
        if(next&&!/^[1-9][0-9]{0,3}$/.test(next))throw Error('Invalid GitLab pagination metadata.');
        return {base64:btoa(binary),next,link:/rel="next"/.test(response.headers.get('link')||'')?'<next>; rel="next"':''};
      } finally {clearTimeout(timer);}
    }
    return {read};
  }
  root.KiCadGitLabSessionReader={create,validate};
  if(typeof module==='object'&&module.exports)module.exports=root.KiCadGitLabSessionReader;
})(typeof globalThis==='object'?globalThis:this);
