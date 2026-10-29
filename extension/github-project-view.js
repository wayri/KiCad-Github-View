/* API-free GitHub drawing reads. Provider writes and issue actions are separate. */
((root) => {
  'use strict';
  const TYPES = new Set(['project','project-file','project-inventory','drawing-files','revision-resolve',
    'repository-tree','repo-model-index','repo-asset','pdf-file','project-search-files',
    'repository-branches','revision-branches','repository-history','revision-commits','rule-report']);
  function create({buffer,data=root.KiCadBrowserData,paths=root.KiCadGitHub}) {
    const SHA=/^[a-f0-9]{40}$/i;
    async function read(message,signal) {
      const {type,repository,ref='HEAD',file}=message;
      if(!TYPES.has(type)||!data.validRepository(repository)||!data.validRef(ref))throw Error('Invalid GitHub project read.');
      if(type==='repo-model-index'&&!SHA.test(ref))throw Error('Model discovery requires an immutable revision.');
      if(type==='repository-history'&&message.page!==undefined&&(!Number.isInteger(message.page)||message.page<1||message.page>100))throw Error('Invalid repository page.');
      if(['project','project-file','project-inventory','drawing-files','project-search-files','revision-resolve','revision-commits','revision-branches'].includes(type)&&!paths.filePath(file))throw Error('Invalid GitHub project file.');
      const snapshot=SHA.test(ref)?{sha:ref.toLowerCase()}:await buffer.resolve(repository,ref,signal);
      const sha=snapshot.sha;
      if(type==='revision-resolve')return {repository,ref,sha};
      const get=(path,limit=data.fileByteLimit(path))=>buffer.file(repository,sha,path,limit,signal);
      if(type==='rule-report'){
        const path=message.reportPath;
        if(!paths.filePath(file)||!root.KiCadGitHubSessionReader.safePath(path)||!path.endsWith('.json'))throw Error('Invalid repository report path.');
        const content=await get(path,4*1024*1024);if(content===null)throw Error('Report was not found at this revision.');return {content,path};
      }
      if(type==='project-file'){const content=await get(file);if(content===null)throw Error('Project file is unavailable at this commit.');return {path:file,content,snapshotRef:sha};}
      if(type==='repo-asset'||type==='pdf-file'){
        const pdf=type==='pdf-file',path=message.file;
        if(!root.KiCadGitHubSessionReader.safePath(path)||!(pdf?/\.pdf$/i:/\.(?:step|stp|wrl|vrml|glb)$/i).test(path)||/[?#%]/.test(path))throw Error('Invalid repository asset path.');
        const asset=await buffer.asset(repository,sha,path,pdf?24*1024*1024:8*1024*1024,signal);
        if(!asset)throw Error('Repository asset is unavailable at this commit.');
        const extension=path.split('.').pop().toLowerCase();return {...asset,mediaType:pdf?'application/pdf':extension==='glb'?'model/gltf-binary':['step','stp'].includes(extension)?'model/step':'model/vrml'};
      }
      if(type==='repository-branches'||type==='revision-branches')return {repository,branches:[],warnings:['API-free viewing: select a branch on GitHub or enter its name directly.']};
      if(type==='repository-history'||type==='revision-commits')return {repository,ref,sha,snapshotRef:sha,commits:[],hasMore:false,nextPage:null,warnings:['API-free viewing: use GitHub commit history, then enter the selected commit SHA to compare.']};
      const inventory=await buffer.inventory(repository,sha,signal),warnings=[...(inventory.warnings||[])];
      const files=inventory.files.filter(item=>paths.filePath(item.path));
      if(type==='project-inventory')return {files,snapshotRef:sha,warnings};
      const incomplete=warnings.some(warning=>/incomplete|limited|limit reached/i.test(warning));
      if(type==='repo-model-index')return {paths:incomplete?[]:inventory.files.map(item=>item.path).filter(path=>/\.(step|stp|wrl|vrml|glb)$/i.test(path)),snapshotRef:sha,warnings:incomplete?[...warnings,'Library model matching is disabled for an incomplete inventory; explicit saved paths remain available.']:warnings};
      if(type==='drawing-files')return {files:files.map(item=>item.path).filter(path=>/\.kicad_(sch|pcb)$/i.test(path)&&path.split('/').slice(0,-1).join('/')===file.split('/').slice(0,-1).join('/')).sort(),warnings};
      if(type==='repository-tree'){
        const directory=message.directory;
        if(directory!==undefined&&!root.KiCadGitHubSessionReader.safePath(directory,true))throw Error('Invalid repository directory.');
        const page=message.page??1;
        if(!Number.isInteger(page)||page<1||page>100||directory===undefined&&page!==1)throw Error('Invalid repository page.');
        const all=(inventory.entries||inventory.files.map(item=>({...item,type:'file'})))
          .filter(item=>directory===undefined||item.path.split('/').slice(0,-1).join('/')===directory)
          .map(item=>({path:item.path,type:item.type==='directory'?'tree':item.type==='submodule'?'commit':'blob',mode:item.type==='symlink'?'120000':item.type==='directory'?'040000':item.type==='submodule'?'160000':'100644',size:0}));
        const entries=directory===undefined?all:all.slice((page-1)*100,page*100),hasMore=directory!==undefined&&page*100<all.length;
        return {repository,ref,sha,snapshotRef:sha,directory:directory||'',entries,truncated:incomplete,hasMore,nextPage:hasMore?page+1:null,warnings};
      }
      if(type==='project'){
        const sources=await data.loadProject(repository,sha,file,(_repo,_sha,path)=>get(path),null,'github',async()=>{if(incomplete)throw Error('Repository inventory is incomplete');return files.map(item=>item.path).filter(path=>/\.kicad_sch$/i.test(path));});
        Object.defineProperty(sources,'recentSnapshotRef',{value:sha});return sources;
      }
      const sources=[],settings=[];let bytes=0;
      for(const item of files.filter(item=>data.validPath(item.path)).sort((a,b)=>(b.path===file?1:0)-(a.path===file?1:0)).slice(0,32)){
        try{const content=await get(item.path);if(content===null){warnings.push(`${item.path}: source unavailable.`);continue;}const size=new TextEncoder().encode(content).byteLength;
          if(bytes+size>data.PROJECT_MAX_BYTES){warnings.push('Project search reached its source byte budget.');break;}bytes+=size;sources.push({path:item.path,content});
        }catch(error){if(signal?.aborted)throw error;warnings.push(`${item.path}: ${error.message}`);}
      }
      for(const item of files.filter(item=>/\.kicad_pro$/i.test(item.path)).slice(0,8)){try{const content=await get(item.path,1024*1024);if(content!==null)settings.push({path:item.path,content});}catch(error){if(signal?.aborted)throw error;warnings.push(`${item.path}: ${error.message}`);}}
      if(files.length>32)warnings.push('Search loads at most 32 drawing files.');
      return {files:sources,settings,snapshotRef:sha,totalDrawings:files.filter(item=>data.validPath(item.path)).length,warnings};
    }
    return {read};
  }
  root.KiCadGitHubProjectView={create,types:TYPES};
  if(typeof module==='object'&&module.exports)module.exports=root.KiCadGitHubProjectView;
})(typeof globalThis==='object'?globalThis:this);
