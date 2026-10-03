/* Untrusted repository HTML is never inserted into a privileged document. */
((root)=>{'use strict';
 const LIMIT=8*1024*1024;
 function documentFor(source,{interactive=true}={}){
  if(typeof source!=='string'||new TextEncoder().encode(source).byteLength>LIMIT)throw Error('HTML preview exceeds 8 MiB.');
  const policy=`default-src 'none'; script-src ${interactive?"'unsafe-inline' 'unsafe-eval'":"'none'"}; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none';`;
  // The policy precedes ALL untrusted content, including malformed documents.
  return '<!doctype html><meta http-equiv="Content-Security-Policy" content="'+policy.replace(/"/g,'&quot;')+'">'+source;
 }
 const api={documentFor,LIMIT};if(typeof module==='object'&&module.exports)module.exports=api;root.KiCadHTMLPreview=api;
})(globalThis);
