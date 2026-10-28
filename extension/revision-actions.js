/* Immutable commit locations; no credentials, checkout or repository writes. */
((root)=>{'use strict';
 const SHA=/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;
 function context(scope,sha){
  if(!SHA.test(sha||''))throw Error('Choose a full saved commit SHA.');
  const provider=scope.provider||'github',parts=String(scope.repository||'').split('/');
  if(!['github','gitlab'].includes(provider)||parts.length<2||provider==='github'&&parts.length!==2||parts.some(p=>!p||p==='.'||p==='..'||!/^[A-Za-z0-9_.-]+$/.test(p)))throw Error('Invalid source repository.');
  const host=new URL(provider==='github'?'https://github.com':scope.host||'https://gitlab.com');
  if(host.protocol!=='https:'||host.username||host.password||host.pathname!=='/'||host.search||host.hash)throw Error('Use an exact HTTPS provider origin.');
  return{provider,host:host.origin,repository:parts.join('/'),sha:sha.toLowerCase()};
 }
 function archiveURL(scope,sha){const c=context(scope,sha),repo=c.repository.split('/').map(encodeURIComponent).join('/');return c.host+'/'+repo+(c.provider==='github'?'/archive/'+c.sha+'.zip':'/-/archive/'+c.sha+'/'+encodeURIComponent(c.repository.split('/').at(-1))+'-'+c.sha+'.zip');}
 function comparisonQuery(scope,selected,current){
  const c=context(scope,selected);if(!SHA.test(current||''))throw Error('Current view has no immutable revision.');
  const file=scope.file;if(typeof file!=='string'||file.length>1000||!file||file.startsWith('/')||/[\\\x00-\x1f\x7f?#]/.test(file)||file.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('Invalid drawing path.');
  const query=new URLSearchParams({repository:c.repository,headRepository:c.repository,file,oldFile:file,base:c.sha,head:current.toLowerCase(),status:'modified'});if(c.provider==='gitlab'){query.set('provider','gitlab');query.set('host',c.host);}return query;
 }
 const api={context,archiveURL,comparisonQuery,validSHA:value=>SHA.test(value||'')};root.KiCadRevisionActions=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
