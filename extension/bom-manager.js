/* Saved-design BOM procurement drafts. Management fields do not modify KiCad. */
((root) => {
'use strict';
const FIELDS = ['Manufacturer', 'MPN', 'Supplier', 'SKU', 'Notes', 'status'];
const STATUSES = ['not ordered', 'ordered', 'received'];
const MAX_PARTS = 100000, MAX_DRAFT = 4 * 1024 * 1024, MAX_FIELD = 4096;
const text = value => String(value ?? '');
const compare = (a, b) => text(a).localeCompare(text(b), undefined, {numeric:true, sensitivity:'base'});
function scopeKey(scope) {
 const key = typeof scope === 'string' ? scope : JSON.stringify(scope);
 if (!key || key.length > 4096) throw new Error('A bounded revision/project scope is required.');
 return key;
}
function identity(o) {
 return JSON.stringify([text(o.path), o.kind, o.kind === 'symbol' ? (o.reference || o.uuid || o.id) : (o.uuid || o.id || o.reference)]);
}
function model(objects, kind = 'symbol', metadata = {}) {
 if (!Array.isArray(objects) || objects.length > MAX_PARTS) throw new Error('BOM object limit exceeded.');
 if (!['symbol','footprint'].includes(kind)) throw new Error('Choose schematic symbols or PCB footprints.');
 const unique = new Map();
 for (const o of objects) {
  if (!o || o.kind !== kind) continue;
  if (!(o.reference || o.uuid || o.id)) continue;
  const id = identity(o); if (unique.has(id)) continue;
  const p = o.properties || {}, saved = metadata[id] || {};
  const management = Object.fromEntries(FIELDS.map(f => [f, text(saved[f] ?? (f === 'status' ? 'not ordered' : p[f]))]));
  if (!STATUSES.includes(management.status)) management.status = 'not ordered';
  unique.set(id, {id, object:o, reference:text(o.reference), value:text(p.Value), footprint:text(p.Footprint || p['Library ID']), path:text(o.path), populated:o.populated !== false, excluded:!!o.excludeFromBom, management});
 }
 return [...unique.values()].sort((a,b) => compare(a.reference,b.reference) || compare(a.path,b.path));
}
function query(parts, options = {}) {
 const search = text(options.search).toLocaleLowerCase().trim();
 return parts.filter(p => (options.population !== 'fitted' || p.populated) && (options.population !== 'dnp' || !p.populated) &&
  (options.excluded !== 'hide' || !p.excluded) && (options.excluded !== 'only' || p.excluded) &&
  (!options.status || options.status === 'all' || p.management.status === options.status) &&
  (!search || [p.reference,p.value,p.footprint,p.path,...Object.values(p.management)].some(v => text(v).toLocaleLowerCase().includes(search))))
  .sort((a,b) => (options.sort === 'value' ? compare(a.value,b.value) : compare(a.reference,b.reference)) || compare(a.reference,b.reference) || compare(a.path,b.path));
}
function group(parts) {
 const groups = new Map();
 for (const p of parts) {
  const key = JSON.stringify([p.value,p.footprint,p.populated,p.excluded,p.management.Manufacturer,p.management.MPN,p.management.Supplier,p.management.SKU,p.management.status]);
  if (!groups.has(key)) groups.set(key,{id:key,value:p.value,footprint:p.footprint,populated:p.populated,excluded:p.excluded,management:p.management,parts:[],quantity:0});
  const g = groups.get(key); g.parts.push(p); g.quantity++;
 }
 return [...groups.values()];
}
function csv(parts) {
 const cell = value => { let s = text(value); if (/^[\s]*[=+@-]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g,'""') + '"'; };
 const rows = [['Reference','Value','Footprint','Population','Excluded from BOM','File',...FIELDS]];
 for (const p of parts) rows.push([p.reference,p.value,p.footprint,p.populated?'Fitted':'DNP',p.excluded?'Yes':'No',p.path,...FIELDS.map(f=>p.management[f])]);
 return rows.map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n';
}
function validateMetadata(input, scope, allowedIds) {
 if (typeof input === 'string') { if (input.length > MAX_DRAFT) throw new Error('Metadata exceeds 4 MiB.'); input = JSON.parse(input); }
 if (!input || typeof input !== 'object' || Array.isArray(input) || input.version !== 1 || input.scope !== scopeKey(scope)) throw new Error('Metadata must use version 1 and the same saved revision scope.');
 if (!input.parts || typeof input.parts !== 'object' || Array.isArray(input.parts)) throw new Error('Metadata parts must be an object.');
 const entries = Object.entries(input.parts); if (entries.length > MAX_PARTS) throw new Error('Metadata part limit exceeded.');
 const result = Object.create(null); let size = 0;
 for (const [id, record] of entries) {
  if (id.length > 8192 || (allowedIds && !allowedIds.has(id))) throw new Error('Metadata contains an unknown saved part identity.');
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Invalid management record.');
  const normalized = Object.create(null);
  for (const [field, value] of Object.entries(record)) {
   if (!FIELDS.includes(field) || typeof value !== 'string' || value.length > MAX_FIELD || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) throw new Error('Invalid or oversized management field.');
   if (field === 'status' && !STATUSES.includes(value)) throw new Error('Invalid procurement status.');
   size += field.length + value.length; normalized[field] = value;
  }
  size += id.length; if (size > MAX_DRAFT) throw new Error('Metadata exceeds 4 MiB.'); result[id] = normalized;
 }
 return result;
}
function metadataJSON(scope, parts) {
 const envelope = {version:1,scope:scopeKey(scope),parts};
 validateMetadata(envelope,scope); const json = JSON.stringify(envelope,null,2);
 if (json.length > MAX_DRAFT) throw new Error('Metadata exceeds 4 MiB.'); return json;
}
function open(options) {
 const {objects,scope,onLocate,onExport,onEdit} = options, document = root.document;
 const revision = scopeKey(scope), storageKey = 'kicad-bom-manager:v1:' + revision;
 const storage = options.storage === undefined ? (()=>{try{return root.localStorage;}catch{return null;}})() : options.storage;
 const allIds = new Set([...model(objects,'symbol'),...model(objects,'footprint')].map(p=>p.id));
 let metadata = Object.create(null), initialWarning = '';
 try { const saved = storage?.getItem(storageKey); if (saved) metadata = validateMetadata(saved,scope,allIds); }
 catch (error) { initialWarning = 'Saved draft could not be loaded: '+error.message; }
 const dialog = document.createElement('dialog'); dialog.className = 'bom-manager';
 const el = (tag, content, cls) => {const node=document.createElement(tag);if(content !== undefined)node.textContent=content;if(cls)node.className=cls;return node;};
 const button = (label, action) => {const b=el('button',label);b.type='button';b.addEventListener('click',action);return b;};
 const header=el('header',undefined,'bom-manager-heading'), title=el('h2','Bill of materials'); header.append(title,button('Close',()=>dialog.close()));
 const note=el('p','Procurement fields are local management metadata for this saved revision. They do not edit KiCad source. Multi-unit schematic symbols count once per saved file/reference; repeated sheet instances are not expanded.','bom-manager-note');
 const controls=el('div',undefined,'bom-manager-controls'), result=el('div',undefined,'bom-manager-results'), feedback=el('p',initialWarning,'bom-manager-feedback'); feedback.setAttribute('role','status');
 const select = (label, pairs) => {const wrap=el('label',label), s=el('select');for(const [value,name] of pairs){const opt=el('option',name);opt.value=value;s.append(opt);}wrap.append(s);controls.append(wrap);s.addEventListener('change',render);return s;};
 const source=select('Source',[['symbol','Schematic symbols'],['footprint','PCB footprints']]);
 source.value = typeof scope === 'object' && ['symbol','footprint'].includes(scope.kind) ? scope.kind : model(objects,'symbol').length ? 'symbol':'footprint';
 const view=select('View',[['parts','Individual parts'],['groups','Grouped quantities']]);
 const population=select('Population',[['all','All'],['fitted','Fitted'],['dnp','DNP']]);
 const excluded=select('Excluded',[['hide','Hide excluded'],['all','Include excluded'],['only','Only excluded']]);
 const status=select('Status',[['all','All statuses'],...STATUSES.map(s=>[s,s])]);
 const sort=select('Sort',[['reference','Reference'],['value','Value']]);
 const searchLabel=el('label','Search'), search=el('input');search.type='search';search.placeholder='Reference, value, MPN, supplier…';searchLabel.append(search);controls.append(searchLabel);search.addEventListener('input',render);
 const summary=el('p',undefined,'bom-manager-summary'), actions=el('div',undefined,'bom-manager-actions');
 const filtered = () => query(model(objects,source.value,metadata),{search:search.value,population:population.value,excluded:excluded.value,status:status.value,sort:sort.value});
 const exportFile = (name, content, mime) => {if(onExport){try{return onExport(name,content,mime);}catch(error){feedback.textContent='Export failed: '+error.message;return;}}const url=URL.createObjectURL(new Blob([content],{type:mime}));const a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 actions.append(button('Export visible CSV',()=>exportFile('bom.csv',csv(filtered()),'text/csv;charset=utf-8')),button('Export metadata JSON',()=>{try{exportFile('bom-management.json',metadataJSON(scope,metadata),'application/json');}catch(e){feedback.textContent=e.message;}}));
 const importLabel=el('label','Import metadata JSON', 'bom-manager-import'), importer=el('input');importer.type='file';importer.accept='.json,application/json';importLabel.append(importer);actions.append(importLabel);
 importer.addEventListener('change',async()=>{const file=importer.files[0];if(!file)return;try{if(file.size>MAX_DRAFT)throw new Error('Metadata exceeds 4 MiB.');const incoming=validateMetadata(await file.text(),scope,allIds);if(!persist(incoming))return;metadata=incoming;render();feedback.textContent='Metadata imported for this saved revision.';}catch(e){feedback.textContent='Import failed: '+e.message;}finally{importer.value='';}});
 const content=el('div',undefined,'bom-manager-content android-sheet-content');
 const filters=el('details'),filterHeading=el('summary','Filters and sorting'),filterControls=el('div',undefined,'bom-manager-controls');filters.append(filterHeading,filterControls);
 for(const selector of [population,excluded,status,sort])filterControls.append(selector.parentElement);
 const info=el('details'),infoHeading=el('summary','About this BoM');info.append(infoHeading,note);
 const transfers=el('details'),transferHeading=el('summary','Import and export');transfers.append(transferHeading,actions);
 content.append(controls,filters,summary,feedback,result,transfers,info);dialog.append(header,content);document.body.append(dialog);
 function persist(next) {
  try {const json=metadataJSON(scope,next);if(!storage)throw new Error('Browser draft storage is unavailable.');storage.setItem(storageKey,json);return true;}
  catch(e){feedback.textContent='Draft was not saved: '+e.message;return false;}
 }
 function locate(p) {const b=button(p.reference||'(unannotated)',()=>onLocate?.(p.object));b.className='bom-manager-reference';if(!onLocate)b.disabled=true;return b;}
 function edit(part) {
  const panel=el('section',undefined,'bom-manager-editor');panel.append(el('h3','Management fields: '+part.reference));
  const form=el('form'), inputs={};
  for(const field of FIELDS){const label=el('label',field), input=el(field==='status'?'select':field==='Notes'?'textarea':'input');if(field==='status'){for(const s of STATUSES){const opt=el('option',s);opt.value=s;input.append(opt);}}else input.maxLength=MAX_FIELD;input.value=part.management[field];label.append(input);form.append(label);inputs[field]=input;}
  const save=el('button','Save management draft');save.type='submit';form.append(save,button('Cancel',()=>panel.remove()));
  form.addEventListener('submit',e=>{e.preventDefault();const record=Object.fromEntries(FIELDS.map(f=>[f,inputs[f].value])), next={...metadata,[part.id]:record};if(persist(next)){metadata=next;render();feedback.textContent='Management draft saved locally.';}});
  panel.append(form);result.prepend(panel);inputs.Manufacturer.focus();
 }
 function editNative(part) {
  Promise.resolve().then(()=>onEdit(part.object)).catch(error=>{feedback.textContent='Source editor failed: '+error.message;});
 }
 function render(limit = 200) {
  if (typeof limit !== 'number') limit = 200;
  result.replaceChildren();const parts=filtered(), all=model(objects,source.value,metadata);
  summary.textContent=`${parts.length} shown / ${all.length} saved parts · ${all.filter(p=>p.populated).length} fitted · ${all.filter(p=>!p.populated).length} DNP · ${all.filter(p=>p.excluded).length} excluded`;
  if(!parts.length){result.append(el('p','No parts match these filters.'));return;}
  const table=el('table'), head=el('thead'), hr=el('tr');
  const columns=['Reference / quantity','Value / footprint','Population','Manufacturer / MPN','Supplier / SKU','Status','Actions'];for(const c of columns)hr.append(el('th',c));head.append(hr);table.append(head);const body=el('tbody');table.append(body);
  const rows=view.value==='groups'?group(parts):parts;
  for(const row of rows.slice(0,limit)){const grouped=!!row.parts,tr=el('tr'),refs=el('td');refs.dataset.label=columns[0];if(grouped){refs.append(el('strong',`${row.quantity} × `));let shown=0;const more=button('More references',()=>appendReferences());function appendReferences(){more.remove();for(const p of row.parts.slice(shown,shown+100))refs.append(locate(p),' ');shown+=100;if(shown<row.parts.length)refs.append(more);}appendReferences();}else{refs.append(locate(row),el('small',row.path));}tr.append(refs);
   const values=[row.value+'\n'+row.footprint,(row.populated?'Fitted':'DNP')+(row.excluded?' · Excluded':''),row.management.Manufacturer+'\n'+row.management.MPN,row.management.Supplier+'\n'+row.management.SKU,row.management.status];values.forEach((v,i)=>{const td=el('td',v);td.dataset.label=columns[i+1];tr.append(td);});
   const td=el('td');td.dataset.label='Actions';if(grouped)td.append(el('span','Switch to individual parts to edit'));else{td.append(button('Manage',()=>edit(row)));if(onEdit)td.append(button('Edit KiCad fields',()=>editNative(row)));if(row.management.Notes)td.append(el('small',row.management.Notes));}tr.append(td);body.append(tr);
  }result.append(table);if(rows.length>limit)result.append(button(`Show next ${Math.min(200,rows.length-limit)} rows (${Math.min(limit,rows.length)} of ${rows.length} displayed)`,()=>render(limit+200)));
 }
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});render();dialog.showModal();return dialog;
}
const api={open,identity,model,query,group,csv,validateMetadata,metadataJSON,scopeKey,FIELDS,STATUSES};
root.KiCadBomManager=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
