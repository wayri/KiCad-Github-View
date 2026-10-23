/* Portable review state for identical loaded designs. No credentials or CAD edits. */
((root)=>{
'use strict';
const comments=root.KiCadReviewComments||(typeof require==='function'?require('./review-comments.js'):null);
const bom=root.KiCadBomManager||(typeof require==='function'?require('./bom-manager.js'):null);
const design=root.KiCadDesignModel||(typeof require==='function'?require('./design-model.js'):null);
const views=root.KiCadViewState||(typeof require==='function'?require('./view-state.js'):null);
const MAX=4*1024*1024,FORMAT='pocket-kiview-review-handoff',bytes=s=>new TextEncoder().encode(s);
const fail=s=>{throw Error(s);};
function bomScope(scope,variant='default'){return JSON.stringify([scope.provider||'github',scope.host||(scope.provider==='gitlab'?'https://gitlab.com':'https://github.com'),scope.repository,scope.ref,scope.file,...(variant==='default'?[]:[variant])]);}
function fields(value,allowed){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))fail('Unsupported review handoff fields.');}
function path(value){comments.normalizeScope({repository:'local/design',ref:'saved',file:value});return value;}
async function fingerprints(files){
 const sources=files.filter(f=>/\.kicad_(sch|pcb)$/i.test(f.path));if(!sources.length||sources.length>128)fail('Transfer requires 1–128 loaded KiCad drawings.');
 let total=0;const seen=new Set(),result=[];
 const crypto=root.crypto||(typeof require==='function'?require('node:crypto').webcrypto:null);if(!crypto?.subtle)fail('Source fingerprinting is unavailable.');
 for(const f of sources){path(f.path);if(seen.has(f.path)||typeof f.content!=='string')fail('Duplicate or unavailable source drawing.');seen.add(f.path);const data=bytes(f.content);if((total+=data.length)>96*1024*1024)fail('Portable source verification exceeds 96 MiB.');const digest=await crypto.subtle.digest('SHA-256',data);result.push({path:f.path,sha256:[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('')});}
 return result.sort((a,b)=>a.path.localeCompare(b.path));
}
function parse(text){
 if(typeof text!=='string'||bytes(text).length>MAX)fail('Review transfer exceeds 4 MiB.');let data;try{data=JSON.parse(text);}catch{fail('Invalid review transfer JSON.');}
 fields(data,['format','version','createdAt','scope','sources','variant','config','bom','comments','view']);
 if(data.format!==FORMAT||data.version!==1||typeof data.createdAt!=='string'||!Number.isFinite(Date.parse(data.createdAt)))fail('Unsupported review transfer format.');
 data.scope=comments.normalizeScope(data.scope);
 if(!Array.isArray(data.sources)||!data.sources.length||data.sources.length>128)fail('Invalid source fingerprint list.');
 const paths=new Set();for(const source of data.sources){fields(source,['path','sha256']);path(source.path);if(paths.has(source.path)||typeof source.sha256!=='string'||! /^[a-f0-9]{64}$/.test(source.sha256))fail('Invalid or duplicate source fingerprint.');paths.add(source.path);}
 if(!paths.has(data.scope.file))fail('The root drawing is absent from the source fingerprints.');
 if(typeof data.variant!=='string'||! /^[A-Za-z0-9_-]{1,64}$/.test(data.variant))fail('Invalid assembly variant.');
 if(data.config!==null)data.config=design.parseVariantConfig(JSON.stringify(data.config),'variants.json');
 if(data.variant!=='default'&&!data.config?.variants.some(v=>v.id===data.variant))fail('The selected variant definition is absent.');
 fields(data.bom,['scope','parts']);if(data.bom.scope!==bomScope(data.scope,data.variant))fail('Assembly metadata belongs to another source scope.');data.bom.parts=bom.validateMetadata({version:1,...data.bom},data.bom.scope);
 data.comments=comments.parseComments(JSON.stringify({format:'kicad-visual-review-comments',version:1,comments:data.comments}));
 for(const note of data.comments){const a=note.anchor,s=data.scope;if(!paths.has(a.file)||a.repository!==s.repository||a.ref!==s.ref||(a.provider||'github')!==(s.provider||'github')||(a.host||'https://gitlab.com')!==(s.host||'https://gitlab.com'))fail('A note belongs to a different source scope.');}
 fields(data.view,['file','camera','selection','ruler']);if(!paths.has(data.view.file))fail('The active drawing is absent from the source fingerprints.');
 if(data.view.camera!==null){fields(data.view.camera,['x','y','zoom']);if(!views.valid(data.view.camera))fail('Invalid portable camera.');}
 if(data.view.selection!==null){fields(data.view.selection,['uuid','kind','netCode']);const s=data.view.selection;if(s.uuid!==undefined&&(typeof s.uuid!=='string'||!s.uuid||s.uuid.length>200))fail('Invalid saved selection UUID.');if(s.netCode!==undefined&&(typeof s.netCode!=='string'||s.netCode.length>600))fail('Invalid saved net selection.');if(typeof s.kind!=='string'||!s.kind||s.kind.length>80||(s.kind==='net'?(!s.netCode||s.uuid!==undefined):(!s.uuid||s.netCode!==undefined)))fail('Invalid saved selection kind.');}
 if(data.view.ruler!==null){fields(data.view.ruler,['kind','points']);const r=data.view.ruler;if(!['distance','angle'].includes(r.kind)||!Array.isArray(r.points)||r.points.length!==(r.kind==='angle'?3:2)||r.points.some(p=>!p||![p.x,p.y].every(n=>Number.isFinite(n)&&Math.abs(n)<=1e6)||Object.keys(p).some(k=>!['x','y'].includes(k))))fail('Invalid portable measurement.');}
 return data;
}
async function create(state,files){const data={format:FORMAT,version:1,createdAt:new Date().toISOString(),...state,sources:await fingerprints(files)};const text=JSON.stringify(data,null,2);parse(text);return text;}
async function prepare(text,target,files){
 const data=parse(text),actual=await fingerprints(files);if(actual.length!==data.sources.length||data.sources.some(s=>!actual.some(t=>s.path===t.path&&s.sha256===t.sha256)))fail('Loaded drawing paths or contents differ. Open the same saved sources before importing this review.');
 const scope=comments.normalizeScope(target.scope);if(scope.file!==data.scope.file)fail('Open the same root drawing before importing this review.');
 if(target.bomScope!==bomScope(scope,data.variant))fail('Invalid target assembly scope.');
 if(target.activeFile!==data.view.file)fail(`Open ${data.view.file} before importing this review view.`);
 let config=data.config||target.config||null;
 if(data.config&&target.config){if(data.config.format!==target.config.format)fail('Existing variant metadata uses a different format. Export it before replacing variants.');const variants=new Map(target.config.variants.map(v=>[v.id,v]));for(const v of data.config.variants){if(variants.has(v.id)&&JSON.stringify(variants.get(v.id))!==JSON.stringify(v))fail(`Variant ${v.id} conflicts with existing metadata. Existing variants were retained.`);variants.set(v.id,v);}config=design.parseVariantConfig(JSON.stringify({schemaVersion:1,...(data.config.format?{format:data.config.format}:{}),variants:[...variants.values()]}),'variants.json');}
 const candidate=design.buildProject(files,config),ids=new Set([...bom.model(candidate.objects,'symbol'),...bom.model(candidate.objects,'footprint')].map(p=>p.id));
 const parts=bom.validateMetadata({version:1,scope:target.bomScope,parts:data.bom.parts},target.bomScope,ids);
 const rebased=data.comments.map(note=>{const anchor={...note.anchor,repository:scope.repository,ref:scope.ref,provider:scope.provider||'github'};delete anchor.host;if(scope.provider==='gitlab')anchor.host=scope.host;return comments.validateComment({...note,anchor,remoteRefs:[],mentions:[],attachments:[]});});
 return {data,config,parts,comments:rebased,translated:JSON.stringify(data.scope)!==JSON.stringify(scope)};
}
function open(options){
 const d=root.document,el=(tag,text)=>{const n=d.createElement(tag);if(text)n.textContent=text;return n;},dialog=el('dialog');dialog.className='bom-manager review-handoff';dialog.setAttribute('aria-label','Transfer review between app and extension');
 const header=el('header'),close=el('button','Close');header.className='bom-manager-heading';close.type='button';close.onclick=()=>dialog.close();header.append(el('h2','Transfer review'),close);
 const body=el('section'),status=el('p','Transfer notes, embedded note screenshots, BoM progress, variants and the current view/measurement. Load the same drawing paths and contents on the other device. Accounts, original photos, models and CAD files are not included.');status.setAttribute('role','status');
 const actions=el('div');actions.className='bom-manager-controls';const exportButton=el('button','Export portable review'),label=el('label','Import portable review'),input=el('input');input.type='file';input.accept='.json,application/json';input.setAttribute('aria-label','Import portable review file');label.append(input);const apply=el('button','Apply verified review');apply.disabled=true;let pending=null,busy=false,preview=0;
 exportButton.type=apply.type='button';exportButton.onclick=async()=>{if(busy)return;busy=true;exportButton.disabled=true;try{const state=await options.getState();options.onExport('pocket-kiview-review.json',await create(state,options.getFiles()),'application/json');status.textContent='Portable review exported. Import it with the same saved drawings on the other device.';}catch(e){status.textContent=e.message;}finally{busy=false;exportButton.disabled=false;}};
 input.onchange=async()=>{const ticket=++preview;apply.disabled=true;pending=null;try{const file=input.files?.[0];if(!file)return;if(file.size>MAX)fail('Review transfer exceeds 4 MiB.');const text=await file.text(),target=options.getTarget(parse(text).variant);const prepared=await prepare(text,target,options.getFiles());if(ticket!==preview)return;pending={text,prepared};const p=prepared;status.textContent=`Verified ${p.data.sources.length} matching drawings · ${p.comments.length} notes · ${Object.keys(p.parts).length} assembly records. ${p.translated?'Source context will be translated to this project. ': ''}Remote publication links, mentions and external attachments are cleared. Existing note IDs and populated management fields are retained. Apply to import locally; no issue or discussion is posted.`;apply.disabled=false;}catch(e){if(ticket===preview)status.textContent=e.message;}finally{if(ticket===preview)input.value='';}};
 apply.onclick=async()=>{if(busy||!pending)return;busy=true;apply.disabled=true;input.disabled=true;exportButton.disabled=true;try{const prepared=await prepare(pending.text,options.getTarget(pending.prepared.data.variant),options.getFiles());const result=await options.onApply(prepared);status.textContent=result||'Review imported.';pending=null;}catch(e){status.textContent=e.message;}finally{busy=false;input.disabled=false;exportButton.disabled=false;}};
 actions.append(exportButton,label,apply);body.append(status,actions);dialog.append(header,body);dialog.addEventListener('close',()=>dialog.remove());d.body.append(dialog);dialog.showModal();return dialog;
}
const api={fingerprints,parse,create,prepare,open,bomScope};root.KiCadReviewHandoff=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis==='object'?globalThis:this);
