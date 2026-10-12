/* GitLab transport, bound to one explicitly authorized HTTPS origin. */
((root) => {
  'use strict';
  function forHost(host='https://gitlab.com',{sessionRead}={}){
    const parsed=new URL(host);if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=='/')throw new Error('Invalid GitLab host.');host=parsed.origin;
  const MIB=1024*1024, SHA=/^[a-f0-9]{40}$/i;
  const validRepository=value=>typeof value==='string'&&value.length<=300&&/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/.test(value)&&value.split('/').every(p=>p!=='.'&&p!=='..');
  const validPath=value=>typeof value==='string'&&value.length<=500&&value.length>0&&!value.startsWith('/')&&!/[\\:\x00-\x1f\x7f]/.test(value)&&value.split('/').every(p=>p&&p!=='.'&&p!=='..');
  function scope(repository,ref,file){if(!validRepository(repository)||!root.KiCadBrowserData.validRef(ref)||!validPath(file))throw new Error('Invalid GitLab project location.');}
  function endpoint(repository){if(!validRepository(repository))throw new Error('Invalid GitLab repository.');return host+'/api/v4/projects/'+encodeURIComponent(repository)+'/repository';}
  async function response(url,limit=4*MIB){
    if(new URL(url).origin!==host||!url.startsWith(host+'/api/v4/projects/'))throw new Error('Invalid GitLab API endpoint.');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
    try{const headers=await root.KiCadGitLabReviewApi?.authorizationHeaders(host);const result=await fetch(url,{...(headers&&Object.keys(headers).length?{headers}:{}),credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal});
      if([401,403,404].includes(result.status)&&sessionRead){const session=await sessionRead(url,limit);if(session)return session;}
      if(result.status===404)return null;
      if(!result.ok)throw new Error(`GitLab returned HTTP ${result.status}; check the server, repository access and GitLab connection in extension settings.`);
      if(Number(result.headers.get('content-length'))>limit)throw new Error('GitLab response exceeds its size limit.');
      const reader=result.body.getReader(),chunks=[];let length=0;
      while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit){await reader.cancel();throw new Error('GitLab response exceeds its size limit.');}chunks.push(value);}
      const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      return {bytes,next:result.headers.get('x-next-page')||'',link:result.headers.get('link')||''};
    }catch(error){if(error.name==='AbortError')throw new Error('GitLab retrieval timed out.');throw error;}finally{clearTimeout(timer);}
  }
  async function json(url){const result=await response(url);if(!result)throw new Error('GitLab resource was not found or access is unavailable.');return {...result,value:JSON.parse(new TextDecoder().decode(result.bytes))};}
  async function file(repository,ref,path){scope(repository,ref,path);const result=await response(`${endpoint(repository)}/files/${encodeURIComponent(path)}/raw?ref=${encodeURIComponent(ref)}`,root.KiCadBrowserData.fileByteLimit(path));return result?new TextDecoder().decode(result.bytes):null;}
  async function resolve(repository,ref,path){scope(repository,ref,path);const {value}=await json(`${endpoint(repository)}/commits/${encodeURIComponent(ref)}`);if(!SHA.test(value?.id))throw new Error('GitLab did not resolve an immutable revision.');return {repository,ref,sha:value.id};}
  async function tree(repository,ref,directory='',recursive=true){
    if(directory&&!validPath(directory))throw new Error('Invalid GitLab directory.');
    const entries=[],warnings=[];let more=false;
    for(let page=1;page<=10;page++){
      const query=new URLSearchParams({ref,recursive:String(recursive),per_page:'100',page:String(page),...(directory?{path:directory}:{})});
      const {value,next,link}=await json(`${endpoint(repository)}/tree?${query}`);if(!Array.isArray(value)||value.length>100)throw new Error('Invalid GitLab tree listing.');entries.push(...value);
      more=!!next||/rel="next"/.test(link)||value.length===100;if(!more)break;
    }
    if(more)warnings.push('GitLab tree discovery stopped at 1000 entries; the project listing may be incomplete.');
    return {entries:entries.filter(item=>item?.type==='blob'&&item.mode!=='120000'&&validPath(item.path)),warnings};
  }
  async function directory(repository,ref,path,includeBoards=false){const result=await tree(repository,ref,path,false);if(result.warnings.length)throw new Error(result.warnings[0]);return result.entries.filter(item=>(includeBoards?/\.kicad_(sch|pcb)$/i:/\.kicad_sch$/i).test(item.path)&&item.path.split('/').slice(0,-1).join('/')===path).map(item=>item.path);}
  async function schematics(repository,ref){
    if(!validRepository(repository)||!SHA.test(ref||''))throw new Error('A pinned GitLab commit is required for schematic discovery.');
    const listing=await tree(repository,ref);if(listing.warnings.length)throw new Error(listing.warnings[0]);
    const files=listing.entries.filter(item=>/\.kicad_sch$/i.test(item.path)).map(item=>item.path);
    if(files.length>root.KiCadBrowserData.PROJECT_MAX_FILES)throw new Error('More than 128 parent-sheet candidates; open the project root directly.');
    return files.sort();
  }
  async function inventory(repository,ref,path){scope(repository,ref,path);const snapshot=await resolve(repository,ref,path),listing=await tree(repository,snapshot.sha);return {files:listing.entries.filter(item=>root.KiCadGitHub.filePath(item.path)).sort((a,b)=>a.path.localeCompare(b.path)).map(item=>({path:item.path,size:0})),snapshotRef:snapshot.sha,warnings:listing.warnings};}
  async function projectFile(repository,ref,path){scope(repository,ref,path);if(!root.KiCadGitHub.filePath(path))throw new Error('Unsupported project file.');const content=await file(repository,ref,path);if(content===null)throw new Error('Project file unavailable at this revision.');return {path,content};}
  async function search(repository,ref,path){const listing=await inventory(repository,ref,path),warnings=[...listing.warnings];const drawings=listing.files.filter(item=>root.KiCadBrowserData.validPath(item.path)).sort((a,b)=>(b.path===path?1:0)-(a.path===path?1:0)),settings=listing.files.filter(item=>/\.kicad_pro$/i.test(item.path));const files=[],saved=[];let total=0;
    for(const item of drawings.slice(0,32)){try{const content=await file(repository,listing.snapshotRef,item.path);if(content===null){warnings.push(`${item.path}: unavailable.`);continue;}const bytes=new TextEncoder().encode(content).length;if(total+bytes>root.KiCadBrowserData.PROJECT_MAX_BYTES){warnings.push('Project search reached its 96 MiB source limit.');break;}total+=bytes;files.push({path:item.path,content});}catch(error){warnings.push(`${item.path}: ${error.message}`);}}
    for(const item of settings.slice(0,8)){try{const content=await file(repository,listing.snapshotRef,item.path);if(content!==null&&new TextEncoder().encode(content).length<=MIB)saved.push({path:item.path,content});else warnings.push(`${item.path}: settings unavailable or exceed 1 MiB.`);}catch(error){warnings.push(`${item.path}: ${error.message}`);}}
    if(drawings.length>32)warnings.push('Project search loads at most 32 drawings.');if(settings.length>8)warnings.push('Only the first eight project settings files were retrieved.');return {files,settings:saved,warnings,snapshotRef:listing.snapshotRef,totalDrawings:drawings.length};
  }
  async function branches(repository,ref,path){scope(repository,ref,path);const {value,next,link}=await json(`${endpoint(repository)}/branches?per_page=100&page=1`);if(!Array.isArray(value)||value.length>100)throw new Error('Invalid GitLab branch listing.');return {repository,branches:value.filter(item=>root.KiCadBrowserData.validRef(item?.name)&&SHA.test(item?.commit?.id)).map(item=>({name:item.name,sha:item.commit.id})),warnings:next||/rel="next"/.test(link)||value.length===100?['At most 100 branches shown; enter another branch manually.']:[]};}
  async function commits(repository,ref,path){const snapshot=await resolve(repository,ref,path),query=new URLSearchParams({ref_name:snapshot.sha,path,per_page:'50',page:'1'});const {value,next,link}=await json(`${endpoint(repository)}/commits?${query}`);if(!Array.isArray(value)||value.length>50)throw new Error('Invalid GitLab commit listing.');const clean=value=>typeof value==='string'?value.replace(/[\x00-\x1f\x7f]/g,' ').slice(0,300):'';return {repository,file:path,snapshotRef:snapshot.sha,commits:value.filter(item=>SHA.test(item?.id)).map(item=>({sha:item.id,message:clean(item.title),author:clean(item.author_name),date:clean(item.authored_date)})),warnings:next||/rel="next"/.test(link)||value.length===50?['At most 50 commits shown; enter an older SHA manually.']:[]};}
  async function compareTrees(repository,base,head,headRepository=repository){
    // A truncated tree cannot establish absence: never infer deletions from it.
    const listings=await Promise.all([tree(repository,base),tree(headRepository,head)]);
    if(listings.some(listing=>listing.warnings.length))throw new Error('GitLab repository discovery is incomplete; a complete drawing comparison cannot be established. Compare a smaller project or individual drawing revisions.');
    const indexes=listings.map(listing=>{
      const index=new Map();
      for(const item of listing.entries){
        if(!root.KiCadBrowserData.validPath(item.path))continue;
        if(!SHA.test(item.id)||index.has(item.path))throw new Error('Invalid GitLab drawing identity in comparison tree.');
        index.set(item.path,item.id);
      }
      return index;
    });
    const [before,after]=indexes,files=[],removed=[],added=[];
    for(const [path,id] of before){
      if(!after.has(path))removed.push({path,id});
      else if(after.get(path)!==id)files.push({file:path,oldFile:path,status:'modified'});
    }
    for(const [path,id] of after)if(!before.has(path))added.push({path,id});
    const group=items=>{const result=new Map();for(const item of items){if(!result.has(item.id))result.set(item.id,[]);result.get(item.id).push(item);}return result;};
    const oldIds=group(removed),newIds=group(added),paired=new Set();
    // Only unambiguous, byte-identical moves are established by blob identity.
    for(const [id,old] of oldIds){const next=newIds.get(id);if(old.length===1&&next?.length===1){files.push({file:next[0].path,oldFile:old[0].path,status:'renamed'});paired.add(id);}}
    for(const item of removed)if(!paired.has(item.id))files.push({file:item.path,oldFile:item.path,status:'removed'});
    for(const item of added)if(!paired.has(item.id))files.push({file:item.path,oldFile:item.path,status:'added'});
    files.sort((a,b)=>a.file.localeCompare(b.file)||a.status.localeCompare(b.status));
    return files;
  }
  async function compare(repository,base,head,path){
    scope(repository,base,path);scope(repository,head,path);
    const from=await resolve(repository,base,path),to=await resolve(repository,head,path);
    if(from.sha===to.sha)return {files:[],base:from.sha,head:to.sha,warnings:[]};
    const {value}=await json(`${endpoint(repository)}/compare?${new URLSearchParams({from:from.sha,to:to.sha,straight:'true'})}`);
    if(!Array.isArray(value.diffs)||value.diffs.length>3000)throw new Error('Invalid or oversized GitLab comparison.');
    if(value.compare_timeout){
      const files=await compareTrees(repository,from.sha,to.sha);
      return {files,base:from.sha,head:to.sha,warnings:['GitLab exceeded comparison limits; changed drawings were recovered from complete commit trees. Only unique byte-identical moves are recognized as renames; edited or ambiguous moves appear as added/removed.']};
    }
    const files=value.diffs.flatMap(item=>{
      if(!item||typeof item!=='object')throw new Error('Invalid GitLab comparison entry.');
      const old=item.old_path,newPath=item.new_path;
      const a=item.a_mode!=='120000'&&validPath(old)&&root.KiCadBrowserData.validPath(old),b=item.b_mode!=='120000'&&validPath(newPath)&&root.KiCadBrowserData.validPath(newPath);
      if(a&&b)return [{file:newPath,oldFile:old,status:item.deleted_file?'removed':item.new_file?'added':item.renamed_file?'renamed':'modified'}];
      return [...(a?[{file:old,oldFile:old,status:'removed'}]:[]),...(b?[{file:newPath,oldFile:newPath,status:'added'}]:[])];
    });
    return {files,base:from.sha,head:to.sha,warnings:[]};
  }
  async function mergeRequest(repository,number){
    if(!validRepository(repository)||!Number.isSafeInteger(number)||number<1)throw new Error('Invalid GitLab merge request.');
    const project=endpoint(repository).replace(/\/repository$/,''),url=`${project}/merge_requests/${number}`;
    const read=async()=>{const {value}=await json(url);const refs=value?.diff_refs;
      if(value?.iid!==number||![value.source_project_id,value.target_project_id].every(id=>Number.isSafeInteger(id)&&id>0)||
        !refs||![refs.base_sha,refs.head_sha,refs.start_sha].every(id=>SHA.test(id)))throw new Error('GitLab merge request revisions are unavailable; wait for diff preparation and refresh.');
      return value;
    };
    const value=await read(),refs=value.diff_refs;
    const {value:source}=await json(`${host}/api/v4/projects/${value.source_project_id}`);
    if(source?.id!==value.source_project_id||!validRepository(source.path_with_namespace))throw new Error('GitLab did not identify the source project.');
    const headRepository=source.path_with_namespace;
    // File identities avoid server text-diff size limits and pin both fork sides.
    const files=await compareTrees(repository,refs.base_sha,refs.head_sha,headRepository);
    const current=await read();
    if(current.source_project_id!==value.source_project_id||current.target_project_id!==value.target_project_id||
      ['base_sha','head_sha','start_sha'].some(key=>current.diff_refs[key]!==refs[key]))throw new Error('The GitLab merge request changed during discovery; refresh to compare its latest revision.');
    return {base:refs.base_sha,head:refs.head_sha,baseTip:refs.start_sha,headRepository,files,
      warnings:['Changed drawings are identified from complete commit trees. Only unique byte-identical moves are recognized as renames; edited or ambiguous moves appear as added/removed.']};
  }
  return {validRepository,validPath,file,resolve,directory,schematics,inventory,projectFile,search,branches,commits,compare,mergeRequest,response,endpoint};
  }
  root.KiCadGitLabProvider={...forHost(),forHost};
  if(typeof module==='object'&&module.exports)module.exports=root.KiCadGitLabProvider;
})(typeof globalThis==='object'?globalThis:this);
