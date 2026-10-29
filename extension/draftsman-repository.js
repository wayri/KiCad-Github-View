/* Privileged, create-only Draftsman repository export. Never writes board/design sources. */
((root)=>{'use strict';
 const OUTPUT_LIMIT=16*1024*1024,encode=value=>new TextEncoder().encode(value);
 const SHA=/^[a-f0-9]{40}$/i,BRANCH=/^draftsman\/[a-z0-9][a-z0-9-]{0,79}$/,PATH=/^docs\/draftsman\/[A-Za-z0-9][A-Za-z0-9_-]{0,79}\.kivi-draft\.json$/;
 function fields(value,names){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(name=>!names.includes(name)))throw Error('Invalid rendered Draftsman output fields.');}
 function decodeBase64(value){
  if(typeof value!=='string'||!value||value.length>Math.ceil(8*1024*1024/3)*4||value.length%4||/[^A-Za-z0-9+/=]/.test(value))throw Error('Invalid or oversized Draftsman JPEG base64.');const padding=value.indexOf('=');if(padding>=0&&(padding<value.length-2||!/^={1,2}$/.test(value.slice(padding))))throw Error('Invalid Draftsman JPEG base64 padding.');
  let binary;try{binary=root.atob(value);}catch{throw Error('Invalid Draftsman JPEG base64.');}if(binary.length>8*1024*1024||root.btoa(binary)!==value)throw Error('Invalid or oversized Draftsman JPEG base64.');return Uint8Array.from(binary,c=>c.charCodeAt(0));
 }
 function base64(bytes){let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return root.btoa(binary);}
 function outputs(value,doc,content,model,exporter){
  const result=[{path:value.path,content,encoding:'utf-8'}];let total=encode(content).length;
  const add=(path,content,encoding,size)=>{total+=size;if(total>OUTPUT_LIMIT)throw Error('Draftsman output package exceeds 16 MiB. Export fewer sheets or use downloads.');result.push({path,content,encoding});};
  if(value.rendered===undefined)return result;
  fields(value.rendered,['assets','pages']);const rendered=value.rendered;
  if(encode(JSON.stringify(rendered)).length>OUTPUT_LIMIT)throw Error('Rendered Draftsman payload exceeds 16 MiB.');
  fields(rendered.assets,Object.keys(rendered.assets||{}));
  const viewIds=new Set(doc.pages.flatMap(page=>page.items.filter(item=>item.type==='view').map(item=>item.id)));
  if(Object.keys(rendered.assets).length!==viewIds.size||Object.keys(rendered.assets).some(id=>!viewIds.has(id)))throw Error('Rendered assets must match exactly the document view identifiers.');
  for(const id of viewIds){const asset=rendered.assets[id];fields(asset,['image','bounds','warnings']);if(typeof asset.image!=='string')throw Error('Rendered view preview is missing.');}
  if(!Array.isArray(rendered.pages)||rendered.pages.length!==doc.pages.length)throw Error('Rendered PDF pages must match the document sheet count.');
  const images=rendered.pages.map(page=>{fields(page,['base64','width','height']);return{bytes:decodeBase64(page.base64),width:page.width,height:page.height};});
  const size=model.pageSize(doc),pdf=exporter.pdf(images,size.width,size.height),stem=value.path.replace(/\.kivi-draft\.json$/,'');
  for(let i=0;i<doc.pages.length;i++){const svg=model.svg(doc,i,rendered.assets);add(stem+'-sheet-'+(i+1)+'.svg',svg,'utf-8',encode(svg).length);}
  add(stem+'.pdf',base64(pdf),'base64',pdf.length);return result;
 }
 function create({fetch:fetcher,headers,assertWrites,model=root.KiCadDraftsmanModel||(typeof require==='function'?require('./draftsman-model.js'):null),exporter=root.KiCadDraftsmanExport||(typeof require==='function'?require('./draftsman-export.js'):null)}){
  let busy=false;
  async function save(value){
   if(busy)throw Error('A Draftsman repository save is already running.');
   if(value?.confirmed!==true||!['github','gitlab'].includes(value.provider)||!SHA.test(value.ref||'')||!BRANCH.test(value.branch||'')||!PATH.test(value.path||''))throw Error('Confirm a new Draftsman branch and document path before saving.');
   value={...value};
   const provider=value.provider,host=provider==='github'?'https://github.com':value.host||'https://gitlab.com';let url;try{url=new URL(host);}catch{throw Error('Invalid repository host.');}
   if(url.protocol!=='https:'||url.origin!==host||url.username||url.password)throw Error('Invalid repository host.');
   const repo=value.repository;if(typeof repo!=='string'||!(provider==='github'?/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/:/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/).test(repo)||repo.split('/').some(p=>p==='.'||p==='..'))throw Error('Invalid repository.');
   const parsed=model.validate(value.document);if(parsed.source.host&&parsed.source.host!==host)throw Error('Document host does not match the destination.');const doc=model.validate(parsed,{provider,...(parsed.source.host?{host}:{}),repository:repo,ref:value.ref}),content=model.serialize(parsed);if(new TextEncoder().encode(content).length>4*1024*1024)throw Error('Draftsman document exceeds 4 MiB.');
   const artifacts=outputs(value,doc,content,model,exporter);
   busy=true;try{const api=provider==='github'?'https://api.github.com/repos/'+repo:host+'/api/v4/projects/'+encodeURIComponent(repo),auth=await headers(provider,host);if(!auth?.Authorization)throw Error('Connect a repository account with write permission first.');
   async function request(path,body,allowMissing=false){await assertWrites();const current=await headers(provider,host);if(current.Authorization!==auth.Authorization)throw Error('Repository account changed. Nothing further was saved.');const response=await fetcher(api+path,{method:body?'POST':'GET',headers:{...current,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000),...(body?{body:JSON.stringify(body)}:{})});if(allowMissing&&response.status===404)return null;if(!response.ok)throw Error('Draftsman repository save failed (HTTP '+response.status+'). The branch may be protected, already exist, or your account lacks write access.');if(Number(response.headers?.get('content-length'))>2*1024*1024||!response.body?.getReader)throw Error('Repository response exceeds the safety limit or has no bounded body.');const reader=response.body.getReader(),chunks=[];let size=0;try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024)throw Error('Repository response exceeds the safety limit.');chunks.push(value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}const text=new TextDecoder().decode(bytes);try{return JSON.parse(text);}catch{throw Error('Invalid repository response.');}}
    if(provider==='github'){
     if(await request('/git/ref/heads/'+value.branch,undefined,true))throw Error('This branch already exists. Choose a new Draftsman branch.');
     const base=await request('/git/commits/'+value.ref);if(base.sha!==value.ref||!SHA.test(base.tree?.sha||''))throw Error('Source commit could not be verified.');
     const entries=[];for(const artifact of artifacts){const blob=await request('/git/blobs',{content:artifact.content,encoding:artifact.encoding});if(!SHA.test(blob.sha||''))throw Error('Invalid saved document blob.');entries.push({path:artifact.path,mode:'100644',type:'blob',sha:blob.sha});}
     const tree=await request('/git/trees',{base_tree:base.tree.sha,tree:entries});if(!SHA.test(tree.sha||''))throw Error('Invalid saved document tree.');
     const commit=await request('/git/commits',{message:'Add Draftsman document: '+doc.title,tree:tree.sha,parents:[value.ref]});if(!SHA.test(commit.sha||''))throw Error('Invalid saved document commit.');
     const result=await request('/git/refs',{ref:'refs/heads/'+value.branch,sha:commit.sha});if(result.ref!=='refs/heads/'+value.branch||result.object?.sha!==commit.sha)throw Error('Repository did not confirm the new branch. Refresh the repository before retrying.');
     return{branch:value.branch,path:value.path,paths:artifacts.map(item=>item.path),sha:commit.sha,url:host+'/'+repo+'/blob/'+commit.sha+'/'+value.path};
    }
    if(await request('/repository/branches/'+encodeURIComponent(value.branch),undefined,true))throw Error('This branch already exists. Choose a new Draftsman branch.');
    const base=await request('/repository/commits/'+value.ref);if(base.id!==value.ref)throw Error('Source commit could not be verified.');
    const created=await request('/repository/branches',{branch:value.branch,ref:value.ref});if(created.name!==value.branch||created.commit?.id!==value.ref)throw Error('Repository did not confirm the new Draftsman branch.');
    let result;try{result=await request('/repository/commits',{branch:value.branch,commit_message:'Add Draftsman document: '+doc.title,actions:artifacts.map(item=>({action:'create',file_path:item.path,content:item.content,encoding:item.encoding==='base64'?'base64':'text'}))});}catch(error){throw Error(error.message+' The new branch '+value.branch+' may exist without all Draftsman outputs. Check it before retrying.');}if(!SHA.test(result.id||'')||!Array.isArray(result.parent_ids)||result.parent_ids.length!==1||result.parent_ids[0]!==value.ref)throw Error('Repository did not confirm the saved commit. Refresh the repository before retrying.');
    return{branch:value.branch,path:value.path,paths:artifacts.map(item=>item.path),sha:result.id,url:host+'/'+repo+'/-/blob/'+result.id+'/'+value.path};
   }finally{busy=false;}
  }
  return{save};
 }
 const api={create};root.KiCadDraftsmanRepository=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
