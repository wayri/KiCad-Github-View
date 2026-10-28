/* Provider-relative, injectable workflow. Credentials and HTTP stay in the host. */
((root)=>{'use strict';
 const SHA=/^[a-fA-F0-9]{40}$/,SLUG=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/,LOGIN=/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
 const active=new Set();
 const failure=message=>Object.assign(Error(message),{definitive:true});
 function path(value){return typeof value==='string'&&value.length>0&&value.length<=500&&!/[\\:\x00-\x1f\x7f]/.test(value)&&value.split('/').every(p=>p&&p!=='.'&&p!=='..');}
 function ref(value){return path(value)&&!/[ ~^?*\[]/.test(value)&&!value.includes('..')&&!value.includes('@{')&&!value.endsWith('.')&&!value.split('/').some(p=>p.startsWith('.')||p.endsWith('.lock'));}
 function validate(message){
  if(!message||message.confirmed!==true)throw failure('Confirm creation of a new remote fork first.');
  const provider=message.provider||'github',repository=message.repository,sha=message.sha;
  if(!['github','gitlab'].includes(provider)||typeof repository!=='string'||repository.length>300||!repository.split('/').every(p=>SLUG.test(p))||repository.split('/').length<(provider==='github'?2:2)||provider==='github'&&repository.split('/').length!==2)throw failure('Invalid source repository.');
  if(!SHA.test(sha||'')||!ref(message.ref)||!path(message.file))throw failure('Select a full commit SHA and valid source drawing scope.');
  const name=message.name||repository.split('/').at(-1)+'-review-'+sha.slice(0,12),branch=message.branch||'review/'+sha.slice(0,12);
  if(!SLUG.test(name)||!ref(branch)||branch.length>200)throw failure('Invalid fork name or branch.');
  const namespace=message.destinationNamespace;
  if(namespace!==undefined&&namespace!==''&&(provider==='github'?!LOGIN.test(namespace):!/^\d{1,15}$/.test(String(namespace))||!Number.isSafeInteger(Number(namespace))||Number(namespace)<1))throw failure(provider==='github'?'Use a GitHub account or organization name.':'Use a numeric GitLab namespace ID.');
  const host=provider==='github'?'https://github.com':message.host||'https://gitlab.com';
  let url;try{url=new URL(host);}catch{throw failure('Invalid provider host.');}
  if(url.protocol!=='https:'||url.origin!==host||url.username||url.password||provider==='github'&&message.host!==undefined&&message.host!==host)throw failure('Invalid provider host.');
  return {provider,host,repository,sha:sha.toLowerCase(),ref:message.ref,file:message.file,name,branch,destinationNamespace:namespace||undefined};
 }
 const pause=(ms,signal)=>new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(failure('Fork preparation cancelled.'));};const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();});
 async function create(message,{request,authorize,sleep=pause,signal}={}){
  const args=validate(message);if(typeof request!=='function'||typeof authorize!=='function')throw failure('Fork transport authorization is unavailable.');
  const key=JSON.stringify([args.provider,args.host,args.repository,args.destinationNamespace,args.name]);
  if(active.has(key)||active.size>=8)throw failure('A fork operation is already active; wait for its result.');
  active.add(key);
  try{return await run(args,{request,authorize,sleep,signal});}finally{active.delete(key);}
 }
 async function run(args,{request,authorize,sleep,signal}){
  const {provider,host,repository,sha,name,branch,destinationNamespace}=args,gh=provider==='github';let calls=0,created=false,attempted=false,target,id;
  async function http(method,p,body,missing=false){
   if(signal?.aborted)throw failure('Fork preparation cancelled.');
   if(++calls>24)throw failure('Fork preparation request limit reached.');
   await authorize();const result=await request(method,p,body);
   if(missing&&result?.status===404)return null;
   if(!result||result.status<200||result.status>=300||!result.data||typeof result.data!=='object')throw failure('Provider did not confirm the fork operation.');
   return result;
  }
  const get=async(p,missing=false)=>(await http('GET',p,undefined,missing))?.data||null;
  let source=gh?'/repos/'+repository:'/api/v4/projects/'+encodeURIComponent(repository);
  const user=await get(gh?'/user':'/api/v4/user');
  if(!Number.isSafeInteger(user.id)||user.id<1||!(gh?LOGIN:/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/).test(gh?user.login:user.username))throw failure('Provider account could not be verified.');
  let namespace=gh?user.login:user.username,namespaceId;
  if(destinationNamespace){
   if(gh){namespace=destinationNamespace;if(namespace.toLowerCase()!==user.login.toLowerCase()){
    const membership=await get('/user/memberships/orgs/'+namespace);
    if(membership.state!=='active'||membership.organization?.login?.toLowerCase()!==namespace.toLowerCase())throw failure('An active membership in the destination organization is required.');
   }}else{
    namespaceId=Number(destinationNamespace);const ns=await get('/api/v4/namespaces/'+namespaceId);
    if(ns.id!==namespaceId||!['user','group'].includes(ns.kind)||typeof ns.full_path!=='string'||!ns.full_path.split('/').every(p=>SLUG.test(p)))throw failure('GitLab returned another destination namespace.');
    if(ns.kind==='user'&&ns.full_path!==user.username)throw failure('Choose your own namespace or an authorized group.');
    namespace=ns.full_path;
   }
  }
  target=namespace+'/'+name;
  if(target.toLowerCase()===repository.toLowerCase())throw failure('The fork must have a different destination from the source.');
  const metadata=await get(source);
  if(!Number.isSafeInteger(metadata.id)||metadata.id<1||(gh?metadata.full_name?.toLowerCase()!==repository.toLowerCase():metadata.path_with_namespace!==repository)||metadata.allow_forking===false||metadata.forking_access_level==='disabled')throw failure('Source repository identity or fork permission could not be verified.');
  if(!gh)source='/api/v4/projects/'+metadata.id;
  const commit=await get(source+(gh?'/commits/':'/repository/commits/')+sha);
  if((gh?commit.sha:commit.id)?.toLowerCase()!==sha)throw failure('Selected commit does not belong to the source repository.');
  const targetPath=gh?'/repos/'+target:'/api/v4/projects/'+encodeURIComponent(target);
  if(await get(targetPath,true))throw failure('Destination already exists. Choose a new fork name; existing repositories are never modified.');
  const resultBase=()=>({provider,host,repository:target,branch,sha,url:host+'/'+target,created});
  try{
   attempted=true;
   const response=await http('POST',source+(gh?'/forks':'/fork'),gh?{name,default_branch_only:false,...(namespace.toLowerCase()!==user.login.toLowerCase()?{organization:namespace}:{})}:{name,path:name,...(namespaceId?{namespace_id:namespaceId}:{})});
   const fork=response.data;
   if(response.status!==(gh?202:201)||!Number.isSafeInteger(fork.id)||fork.id<1||fork.id===metadata.id||(gh?fork.full_name?.toLowerCase()!==target.toLowerCase()||fork.fork!==true||fork.parent?.id!==metadata.id:fork.path_with_namespace!==target||fork.forked_from_project?.id!==metadata.id))throw failure('Provider did not confirm a newly created fork at the requested destination. Inspect the destination before retrying.');
   id=fork.id;created=true;const forkPath=gh?targetPath:'/api/v4/projects/'+id;
   let ready=false;
   for(let attempt=0;attempt<10;attempt++){
    if(attempt)await sleep(1000,signal);
    const current=await get(forkPath,true);if(!current)continue;
    if(current.id!==id||(gh?current.full_name?.toLowerCase()!==target.toLowerCase():current.path_with_namespace!==target))throw failure('Fork identity changed during preparation.');
    if(current.default_branch===branch)throw failure('Choose a review branch distinct from the fork default branch.');
    if(!gh){if(current.import_status==='failed')throw failure('GitLab fork import failed.');if(current.import_status!=='finished')continue;}
    const copied=await get(forkPath+(gh?'/commits/':'/repository/commits/')+sha,true);
    if((gh?copied?.sha:copied?.id)?.toLowerCase()===sha){ready=true;break;}
   }
   if(!ready)throw failure('Fork is still being prepared. Inspect it before creating the selected-commit branch.');
   const existing=await get(forkPath+(gh?'/git/ref/heads/':'/repository/branches/')+encodeURIComponent(branch),true);
   if(existing)throw failure('The review branch already exists; it was not changed.');
   const made=(await http('POST',forkPath+(gh?'/git/refs':'/repository/branches'),gh?{ref:'refs/heads/'+branch,sha}:{branch,ref:sha})).data;
   if(gh?made.ref!=='refs/heads/'+branch||made.object?.sha?.toLowerCase()!==sha:made.name!==branch||made.commit?.id?.toLowerCase()!==sha)throw failure('Provider did not confirm the exact selected-commit branch. Inspect the fork before retrying.');
   return {...resultBase(),partial:false,url:host+'/'+target+(gh?'/tree/':'/-/tree/')+encodeURIComponent(branch)};
  }catch(error){
   if(!attempted)throw error;
   return {...resultBase(),partial:true,uncertain:!created,message:created?'The fork was created, but its selected-commit branch was not confirmed. Inspect the fork before taking further action.':'Fork creation was not confirmed. Inspect the destination before retrying.',reason:error?.definitive?error.message:'Provider request failed or was cancelled; its remote outcome may be uncertain.'};
  }
 }
 const api={create,validate};root.KiCadRevisionFork=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
