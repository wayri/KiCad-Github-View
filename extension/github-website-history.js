/* Parse GitHub's bounded Atom website feed; never execute markup or call an API. */
((root)=>{'use strict';
 const SHA=/^[a-f0-9]{40}$/i,MAX_BYTES=4*1024*1024;
 const decode=value=>value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi,entity=>{
  const named={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"};if(named[entity])return named[entity];
  const number=entity[2].toLowerCase()==='x'?parseInt(entity.slice(3,-1),16):parseInt(entity.slice(2,-1),10);return number>=32&&number<=0x10ffff&&!(number>=0xd800&&number<=0xdfff)?String.fromCodePoint(number):'';
 });
 function parseAtom(content,{repository,ref}){
  if(typeof content!=='string'||new TextEncoder().encode(content).length>MAX_BYTES||/<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(content)||!/<feed\b[^>]*xmlns=["']http:\/\/www.w3.org\/2005\/Atom["']/i.test(content))throw Error('GitHub commit history is not a readable Atom feed.');
  const commits=[],seen=new Set();let count=0;
  const field=(body,name,max)=>{const match=new RegExp('<'+name+'(?:\\s[^>]*)?>([^<]*)</'+name+'>','i').exec(body);const value=match?decode(match[1]).trim():'';return value.length<=max&&!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)?value:'';};
  for(const match of content.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)){
   if(++count>100)throw Error('GitHub commit feed exceeds its entry limit.');
   const body=match[1],id=field(body,'id',300),sha=id.split('/').at(-1);if(!SHA.test(sha||''))continue;
   const links=[...body.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?\s*>/gi)];
   if(!links.some(link=>{try{const url=new URL(decode(link[1]));return url.origin==='https://github.com'&&!url.search&&!url.hash&&url.pathname.toLowerCase()===('/'+repository+'/commit/'+sha).toLowerCase();}catch{return false;}}))continue;
   const message=field(body,'title',4000),author=field(body.match(/<author\b[^>]*>([\s\S]*?)<\/author>/i)?.[1]||'','name',300),date=field(body,'updated',100);
   if(!message||!date||!Number.isFinite(Date.parse(date))||seen.has(sha.toLowerCase()))continue;seen.add(sha.toLowerCase());if(commits.length<30)commits.push({sha:sha.toLowerCase(),message,author,date});
  }
  if(count&&!commits.length)throw Error('GitHub commit feed has no valid commits for this repository.');
  if(SHA.test(ref)&&commits[0]?.sha!==ref.toLowerCase())throw Error('GitHub commit feed returned a different pinned revision.');
  return {repository,ref,commits,hasMore:false,nextPage:null,warnings:['GitHub website feed: only the available initial commit window is shown. Enter a commit SHA or open GitHub for older history.']};
 }
 const api={parseAtom,MAX_BYTES};root.KiCadGitHubWebsiteHistory=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
