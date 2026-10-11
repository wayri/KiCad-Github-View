/* Assisted, reference-based visual population evidence. No pretrained recognition. */
(function(root){
  'use strict';
  const LIMITS=Object.freeze({templates:2000,referencesPerObject:16,observations:10000,variants:200,parts:10000});
  const DEFAULTS=Object.freeze({maxDistance:.35,minMargin:.2,minSeparation:.65,minContrast:8,minEdge:.08});
  function str(v,name){if(typeof v!=='string'||!v||v.length>1024)throw Error('Invalid '+name);return v;}
  function scopeOf(s){if(!s)throw Error('Missing source scope');const out={};for(const k of ['objectId','path','uuid','sourceFingerprint'])out[k]=str(s[k],k);if(!['front','back'].includes(s.side))throw Error('Invalid board side');out.side=s.side;return out;}
  function same(a,b){return ['objectId','path','uuid','side','sourceFingerprint'].every(k=>a[k]===b[k]);}
  function bounded(a,n,name){if(!Array.isArray(a)||a.length>n)throw Error('Invalid or excessive '+name);return a;}
  function thresholds(t){const out={...DEFAULTS};if(t)for(const k of Object.keys(t)){if(!(k in out)||!Number.isFinite(t[k]))throw Error('Invalid threshold');out[k]=t[k];}if(out.maxDistance<.05||out.maxDistance>.5||out.minMargin<.15||out.minMargin>1||out.minSeparation<.5||out.minSeparation>2||out.minContrast<5||out.minContrast>64||out.minEdge<.04||out.minEdge>1)throw Error('Threshold outside conservative bounds');return out;}
  function features(p){
    if(!p||![32,64].includes(p.width)||p.height!==p.width)throw Error('Patch must be 32 or 64 square');
    const n=p.width*p.height,d=p.data;if(!d||![n,n*4].includes(d.length))throw Error('Invalid pixel buffer');
    const g=new Float64Array(n);let mean=0;
    for(let i=0;i<n;i++){const v=d.length===n?d[i]:.2126*d[i*4]+.7152*d[i*4+1]+.0722*d[i*4+2];if(!Number.isFinite(v)||v<0||v>255)throw Error('Invalid pixel value');if(d.length!==n&&d[i*4+3]!==255)throw Error('Transparent patches unsupported');g[i]=v;mean+=v;}
    mean/=n;let variance=0;for(const v of g)variance+=(v-mean)**2;const contrast=Math.sqrt(variance/n),scale=Math.max(contrast,1);for(let i=0;i<n;i++)g[i]=(g[i]-mean)/scale;
    // Spatial luminance and signed edges retain position; a brightness shift cancels.
    const vector=[];let edge=0;for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++){const i=y*p.width+x;vector.push(g[i]);if(x){const e=g[i]-g[i-1];vector.push(e*.5);edge+=Math.abs(e);}if(y){const e=g[i]-g[i-p.width];vector.push(e*.5);edge+=Math.abs(e);}}
    return {vector,quality:{contrast,edge:edge/(2*p.width*(p.width-1)),width:p.width,height:p.height}};
  }
  function distance(a,b){if(a.length!==b.length)return Infinity;let sum=0;for(let i=0;i<a.length;i++)sum+=(a[i]-b[i])**2;return Math.sqrt(sum/a.length);}
  function createTemplate(input){const scope=scopeOf(input.scope);if(input.reviewed!==true||!['populated','absent'].includes(input.state))throw Error('A reference needs an explicitly reviewed population state');const imageHash=str(input.imageHash,'imageHash'),f=features(input.patch);return {version:1,scope,state:input.state,reviewed:true,imageHash,features:f.vector,quality:f.quality};}
  function validTemplate(t){scopeOf(t.scope);str(t.imageHash,'imageHash');if(t.version!==1||t.reviewed!==true||!['populated','absent'].includes(t.state)||!Array.isArray(t.features)||![3008,12160].includes(t.features.length)||t.features.some(v=>!Number.isFinite(v)||Math.abs(v)>100)||!t.quality||![32,64].includes(t.quality.width)||t.quality.height!==t.quality.width||!Number.isFinite(t.quality.contrast)||!Number.isFinite(t.quality.edge))throw Error('Invalid reference template');return t;}
  function importTemplates(value){if(typeof value==='string'){if(value.length>4*1024*1024)throw Error('Reference import exceeds 4 MiB');value=JSON.parse(value);}const refs=bounded(value,LIMITS.templates,'templates').map(validTemplate);if(JSON.stringify(refs).length>4*1024*1024)throw Error('Reference import exceeds 4 MiB');return JSON.parse(JSON.stringify(refs));}
  function classify(input){
    const scope=scopeOf(input.scope),t=thresholds(input.thresholds),f=features(input.patch),refs=bounded(input.templates,LIMITS.referencesPerObject,'references per object').map(validTemplate);
    const base={state:'unknown',confidence:0,reason:'',quality:f.quality,distances:null,margin:0,referenceHashes:[]};
    // A mixed scope is an error, not a silent cross-board or cross-side match.
    if(refs.some(r=>!same(scope,r.scope)))throw Error('Reference scope does not match object, source, or side');
    if(f.quality.contrast<t.minContrast||f.quality.edge<t.minEdge)return {...base,reason:'low-contrast-or-blurred-photo'};
    const usable=refs.filter(r=>r.quality.width===f.quality.width&&r.quality.contrast>=t.minContrast&&r.quality.edge>=t.minEdge),yes=usable.filter(r=>r.state==='populated'),no=usable.filter(r=>r.state==='absent');
    if(!yes.length||!no.length)return {...base,reason:'both-reviewed-reference-states-required'};
    let separation=Infinity;for(const a of yes)for(const b of no)separation=Math.min(separation,distance(a.features,b.features));
    if(separation<t.minSeparation)return {...base,reason:'reference-states-not-distinguishable',separation};
    const populated=Math.min(...yes.map(r=>distance(f.vector,r.features))),absent=Math.min(...no.map(r=>distance(f.vector,r.features))),winner=populated<absent?'populated':'absent',best=Math.min(populated,absent),margin=Math.abs(populated-absent),result={...base,distances:{populated,absent},margin,separation,referenceHashes:[...new Set(usable.map(r=>r.imageHash))]};
    if(best>t.maxDistance)return {...result,reason:'photo-does-not-match-reviewed-references'};
    if(margin<t.minMargin)return {...result,reason:'ambiguous-reference-match'};
    return {...result,state:winner,confidence:Math.min(.95,(1-best/t.maxDistance)*Math.min(1,margin/(t.minMargin*2))),reason:'reference-match-requires-review'};
  }
  function key(o){return JSON.stringify([str(o.objectId||o.id,'objectId'),str(o.path,'path'),str(o.uuid,'uuid')]);}
  function inferVariant(input){
    const variants=bounded(input.variants,LIMITS.variants,'variants'),observations=bounded(input.observations,LIMITS.observations,'observations'),ids=new Set(),maps=variants.map(v=>{str(v.id,'variant id');if(ids.has(v.id))throw Error('Duplicate variant id');ids.add(v.id);const m=new Map();for(const o of bounded(v.objects,LIMITS.parts,'variant parts')){const k=key(o);if(m.has(k)||typeof o.populated!=='boolean')throw Error('Duplicate or invalid variant part');m.set(k,o.populated);}return m;});
    const known=new Map();for(const o of observations){if(!['front','back'].includes(o.side)||!['populated','absent','unknown'].includes(o.state))throw Error('Invalid observation');const k=key(o);if(o.state==='unknown'||!(o.reviewed===true||Number.isFinite(o.confidence)&&o.confidence>=.9))continue;const state=o.state==='populated';if(known.has(k)&&known.get(k)!==state)throw Error('Contradictory observations for same part');known.set(k,state);}
    const distinguishing=new Set();for(const k of new Set(maps.flatMap(m=>[...m.keys()])))if(maps.every(m=>m.has(k))&&new Set(maps.map(m=>m.get(k))).size>1)distinguishing.add(k);
    const seen=[...known.keys()].filter(k=>distinguishing.has(k));
    const ranked=variants.map((v,i)=>{let matches=0,contradictions=0;for(const [k,state] of known)if(maps[i].has(k)){if(maps[i].get(k)===state)matches++;else contradictions++;}return {id:v.id,name:v.name||v.id,matches,contradictions,observedDiscriminating:seen.length};}).sort((a,b)=>a.contradictions-b.contradictions||b.matches-a.matches);
    const possible=ranked.filter(v=>v.contradictions===0),enough=seen.length>=2;
    return {inferredId:enough&&possible.length===1?possible[0].id:null,ranked,reason:!enough?'insufficient-visible-population-differences':possible.length!==1?'ambiguous-or-contradictory-variants':'unique-population-match',observedDiscriminating:seen.length,totalDiscriminating:distinguishing.size,coverage:distinguishing.size?seen.length/distinguishing.size:0};
  }
  function report(input){
    const observations=bounded(input.observations,LIMITS.observations,'observations').map(o=>{key(o);if(!['front','back'].includes(o.side)||!['populated','absent','unknown'].includes(o.state))throw Error('Invalid observation');return {objectId:o.objectId,reference:String(o.reference||'').slice(0,256),path:o.path,uuid:o.uuid,side:o.side,state:o.state,reviewed:o.reviewed===true,confidence:Number.isFinite(o.confidence)?o.confidence:0,reason:String(o.reason||'').slice(0,1024),imageHash:String(o.imageHash||'').slice(0,1024),referenceHashes:(o.referenceHashes||[]).slice(0,20)};});
    const inference=inferVariant({variants:input.variants||[],observations}),selected=(input.variants||[]).find(v=>v.id===input.selectedVariant),expected=new Map((selected?.objects||[]).map(o=>[key(o),o.populated]));
    const mismatches=observations.filter(o=>o.state!=='unknown'&&expected.has(key(o))&&expected.get(key(o))!==(o.state==='populated')).map(o=>({objectId:o.objectId,path:o.path,uuid:o.uuid,side:o.side,observed:o.state,expected:expected.get(key(o))?'populated':'absent',reviewed:o.reviewed}));
    const json={version:1,method:'assisted-reference-comparison',scope:input.scope||{},selectedVariant:input.selectedVariant||null,inference,counts:{populated:observations.filter(o=>o.state==='populated').length,absent:observations.filter(o=>o.state==='absent').length,unknown:observations.filter(o=>o.state==='unknown').length,mismatches:mismatches.length},photos:bounded(input.photos||[],20,'photos').map(p=>({side:p.side,imageHash:String(p.imageHash||'').slice(0,1024),width:p.width,height:p.height})),observations,mismatches};
    const clean=v=>String(v??'').replace(/[|\r\n<>]/g,' '),lines=['# Board population inspection','','Assisted reference comparison; automatic findings require review.','',`Selected variant: ${clean(json.selectedVariant||'none')}`,`Inferred variant: ${clean(inference.inferredId||'undetermined')} (${clean(inference.reason)})`,'', '| Part / file | Side | Observed | Reviewed | Evidence hash |','| --- | --- | --- | --- | --- |',...observations.map(o=>`| ${clean(o.reference||o.objectId)} / ${clean(o.path)} | ${o.side} | ${o.state} | ${o.reviewed?'yes':'no'} | ${clean(o.imageHash)} |`),'',`Population mismatches: ${mismatches.length}. Unknown observations: ${json.counts.unknown}.`];
    let markdown=lines.join('\n');if(markdown.length>3500)markdown=markdown.slice(0,3350).split('\n').slice(0,-1).join('\n')+'\n\nReport truncated. Export the inspection JSON for all observations and mismatches.';
    return {json,markdown};
  }
  const api={LIMITS,DEFAULTS,createTemplate,importTemplates,classify,inferVariant,report};if(typeof module==='object'&&module.exports)module.exports=api;root.KiCadPopulationInspection=api;
})(typeof globalThis!=='undefined'?globalThis:this);
