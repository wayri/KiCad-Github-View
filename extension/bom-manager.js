/* Saved-design BOM procurement drafts. Management fields do not modify KiCad. */
((root) => {
'use strict';
const FIELDS = ['Manufacturer', 'MPN', 'Supplier', 'SKU', 'Notes', 'status', 'Unit price', 'Currency', 'Assembly'];
const STATUSES = ['not ordered', 'ordered', 'received'];
const ASSEMBLY = ['not started', 'placed', 'soldered', 'verified'];
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
  const management = Object.fromEntries(FIELDS.map(f => [f, text(saved[f] ?? (f === 'status' ? 'not ordered' : f==='Assembly'?'not started':p[f]))]));
  if (!STATUSES.includes(management.status)) management.status = 'not ordered';
  if(!ASSEMBLY.includes(management.Assembly))management.Assembly='not started';
  unique.set(id, {id, object:o, reference:text(o.reference), value:text(p.Value), footprint:text(p.Footprint || p['Library ID']), path:text(o.path), side:text(o.side||p.Side), properties:{...p}, populated:o.populated !== false, excluded:!!o.excludeFromBom, management});
 }
 return [...unique.values()].sort((a,b) => compare(a.reference,b.reference) || compare(a.path,b.path));
}
function query(parts, options = {}) {
 const search = text(options.search).toLocaleLowerCase().trim();
 return parts.filter(p => (options.population !== 'fitted' || p.populated) && (options.population !== 'dnp' || !p.populated) &&
  (options.excluded !== 'hide' || !p.excluded) && (options.excluded !== 'only' || p.excluded) &&
  (!options.status || options.status === 'all' || p.management.status === options.status) &&
  (!options.assembly || options.assembly==='all'||(options.assembly==='unfinished'?assemblyWorkItem(p)&&p.management.Assembly!=='verified':p.management.Assembly===options.assembly)) &&
  (!options.side||options.side==='all'||p.side===options.side) &&
  (!search || [p.reference,p.value,p.footprint,p.path,...Object.values(p.management),...Object.values(p.properties)].some(v => text(v).toLocaleLowerCase().includes(search))))
  .sort((a,b) => (options.sort === 'value' ? compare(a.value,b.value) : compare(a.reference,b.reference)) || compare(a.reference,b.reference) || compare(a.path,b.path));
}
function assemblyWorkItem(part){return !!part.populated&&!part.excluded;}
function nextAssembly(parts,currentId){
 const current=parts.findIndex(p=>p.id===currentId);
 for(let offset=1;offset<=parts.length;offset++){const p=parts[(current+offset)%parts.length];if(assemblyWorkItem(p)&&p.management.Assembly!=='verified')return p;}
 return null;
}
function group(parts) {
 const groups = new Map();
 for (const p of parts) {
  const custom=Object.entries(p.properties||{}).filter(([f])=>!['reference','references','refs','ref','designator','designators','value','footprint','dnp','file','path',...FIELDS.map(f=>f.toLowerCase())].includes(f.toLowerCase())).sort(([a],[b])=>compare(a,b));
  const key = JSON.stringify([p.value,p.footprint,p.populated,p.excluded,p.side,...FIELDS.map(f=>p.management[f]),custom]);
  if (!groups.has(key)) groups.set(key,{id:key,value:p.value,footprint:p.footprint,populated:p.populated,excluded:p.excluded,management:p.management,parts:[],quantity:0});
  const g = groups.get(key); g.parts.push(p); g.quantity++;
 }
 return [...groups.values()];
}
function csv(parts, options={}) {
 const cell = value => { let s = text(value); if (/^[\s]*[=+@-]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g,'""') + '"'; };
 const extra=[...new Set(parts.flatMap(p=>Object.keys(p.properties||{})))].filter(f=>!['Reference','Value','Footprint','DNP','Library ID',...FIELDS].includes(f)).sort(compare).slice(0,128);
 const boards=boardCount(options.boards??1),rows = [['Reference','Value','Footprint','Population','Excluded from BOM','File','Quantity per board','Build quantity','Side',...FIELDS,...extra]];
 for (const row of options.grouped?group(parts):parts){const p=row.parts?.[0]||row,n=row.quantity||1;rows.push([row.parts?row.parts.map(p=>p.reference).join(', '):p.reference,p.value,p.footprint,p.populated?'Fitted':'DNP',p.excluded?'Yes':'No',row.parts?[...new Set(row.parts.map(p=>p.path))].join('; '):p.path,n,p.populated&&!p.excluded?n*boards:0,p.side,...FIELDS.map(f=>p.management[f]),...extra.map(f=>row.parts?[...new Set(row.parts.map(p=>text(p.properties[f])))].join(' | '):p.properties?.[f])]);}
 return rows.map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n';
}
function boardCount(value){const n=Number(value);if(!Number.isSafeInteger(n)||n<1||n>1000000)throw Error('Build quantity must be a whole number from 1 to 1,000,000.');return n;}
function totals(parts, boards=1){boards=boardCount(boards);const currencies=Object.create(null);let fitted=0,unpriced=0,verified=0;
 for(const p of parts){if(!p.populated||p.excluded)continue;fitted++;if(p.management.Assembly==='verified')verified++;const raw=p.management['Unit price'],price=/^\d+(\.\d{1,6})?$/.test(raw)?Number(raw):NaN,currency=p.management.Currency.trim().toUpperCase();if(!Number.isFinite(price)||!/^[A-Z]{3}$/.test(currency)){unpriced++;continue;}currencies[currency]=(currencies[currency]||0)+price*boards;}
 return{boards,fitted,buildParts:fitted*boards,unpriced,verified,currencies};
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
   if (field === 'Assembly' && !ASSEMBLY.includes(value)) throw new Error('Invalid assembly status.');
   if (field === 'Unit price' && value!==''&&(!/^\d+(\.\d{1,6})?$/.test(value)||!Number.isFinite(Number(value))||Number(value)>1e9)) throw new Error('Invalid unit price; use a nonnegative decimal up to 1,000,000,000.');
   if (field === 'Currency' && value!==''&&!/^[A-Za-z]{3}$/.test(value)) throw new Error('Invalid currency; use a three-letter code.');
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
 const dialog = document.createElement('dialog'); dialog.className = 'bom-manager bom-management-dialog';dialog.setAttribute('aria-label','Bill of materials and assembly management');
 const el = (tag, content, cls) => {const node=document.createElement(tag);if(content !== undefined)node.textContent=content;if(cls)node.className=cls;return node;};
 const button = (label, action) => {const b=el('button',label);b.type='button';b.addEventListener('click',action);return b;};
 const header=el('header',undefined,'bom-manager-heading'), title=el('h2','Bill of materials'); header.append(title,button('Close',()=>dialog.close()));
 const note=el('p','Procurement fields are local management metadata for this saved revision. They do not edit KiCad source. Multi-unit schematic symbols count once per saved file/reference; repeated sheet instances are not expanded.','bom-manager-note');
 const controls=el('div',undefined,'bom-manager-controls'), result=el('div',undefined,'bom-manager-results'), feedback=el('p',initialWarning,'bom-manager-feedback'); feedback.setAttribute('role','status');
 const select = (label, pairs) => {const wrap=el('label',label), s=el('select');for(const [value,name] of pairs){const opt=el('option',name);opt.value=value;s.append(opt);}wrap.append(s);controls.append(wrap);s.addEventListener('change',render);return s;};
 const source=select('Source',[['symbol','Schematic symbols'],['footprint','PCB footprints']]);
 if(options.variants?.length){const assemblyVariant=select('Assembly variant',options.variants.map(v=>[v.id,v.name]));assemblyVariant.value=options.variant||'default';assemblyVariant.addEventListener('change',()=>{dialog.close();options.onVariant?.(assemblyVariant.value);});}
 source.value = typeof scope === 'object' && ['symbol','footprint'].includes(scope.kind) ? scope.kind : model(objects,'symbol').length ? 'symbol':'footprint';
 const view=select('View',[['parts','Individual parts'],['groups','Grouped quantities']]);
 const population=select('Population',[['all','All'],['fitted','Fitted'],['dnp','DNP']]);
 const excluded=select('Excluded',[['hide','Hide excluded'],['all','Include excluded'],['only','Only excluded']]);
 const status=select('Procurement status',[['all','All statuses'],...STATUSES.map(s=>[s,s])]);
 const assembly=select('Assembly progress',[['all','All'],['unfinished','Unfinished fitted parts'],...ASSEMBLY.map(s=>[s,s])]);
 const side=select('Side',[['all','All sides'],['F','Front'],['B','Back']]);
 const buildLabel=el('label','Boards to build'),build=el('input');build.type='number';build.min='1';build.max='1000000';build.step='1';build.value='1';build.setAttribute('aria-label','Boards to build');buildLabel.append(build);controls.append(buildLabel);build.addEventListener('input',render);
 const sort=select('Sort',[['reference','Reference'],['value','Value']]);
 const searchLabel=el('label','Search'), search=el('input');search.type='search';search.placeholder='Reference, value, MPN, supplier…';searchLabel.append(search);controls.append(searchLabel);search.addEventListener('input',render);searchLabel.className='bom-manager-search';
 const summary=el('div',undefined,'bom-manager-summary'), actions=el('div',undefined,'bom-manager-actions');
 const filtered = () => query(model(objects,source.value,metadata),{search:search.value,population:population.value,excluded:excluded.value,status:status.value,assembly:assembly.value,side:side.value,sort:sort.value});
 const selectedParts=options.selectedId==null?[]:model(objects,source.value,metadata).filter(p=>p.id===options.selectedId||p.object.id===options.selectedId);
 let assemblyCursor=selectedParts.length===1?selectedParts[0].id:null;
 const nextPart=button('Next unfinished part',()=>{const part=nextAssembly(filtered(),assemblyCursor);if(!part)return;assemblyCursor=part.id;onLocate?.(part.object);feedback.textContent=`${part.reference} · ${part.management.Assembly} · local checklist; status unchanged.`;});nextPart.title='Locate the next fitted, non-excluded, unverified part matching the current filters';controls.append(nextPart);
 const exportFile = (name, content, mime) => {if(onExport){try{return onExport(name,content,mime);}catch(error){feedback.textContent='Export failed: '+error.message;return;}}const url=URL.createObjectURL(new Blob([content],{type:mime}));const a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 actions.append(button('Export visible CSV',()=>{try{exportFile('bom.csv',csv(filtered(),{boards:build.value,grouped:view.value==='groups'}),'text/csv;charset=utf-8');}catch(e){feedback.textContent=e.message;}}),button('Export metadata JSON',()=>{try{exportFile('bom-management.json',metadataJSON(scope,metadata),'application/json');}catch(e){feedback.textContent=e.message;}}));
 const importLabel=el('label','Import metadata JSON', 'bom-manager-import'), importer=el('input');importer.type='file';importer.accept='.json,application/json';importLabel.append(importer);actions.append(importLabel);
 importer.addEventListener('change',async()=>{const file=importer.files[0];if(!file)return;try{if(file.size>MAX_DRAFT)throw new Error('Metadata exceeds 4 MiB.');const incoming=validateMetadata(await file.text(),scope,allIds);if(!persist(incoming))return;metadata=incoming;render();feedback.textContent='Metadata imported for this saved revision.';}catch(e){feedback.textContent='Import failed: '+e.message;}finally{importer.value='';}});
 const content=el('div',undefined,'bom-manager-content android-sheet-content');
 const filters=el('details'),filterHeading=el('summary','Filters and sorting'),filterControls=el('div',undefined,'bom-manager-controls');filters.append(filterHeading,filterControls);filterControls.append(button('Reset filters',()=>{population.value='all';excluded.value='hide';status.value='all';assembly.value='all';side.value='all';sort.value='reference';search.value='';render();}));
 for(const selector of [population,excluded,status,assembly,side,sort])filterControls.append(selector.parentElement);
 const info=el('details'),infoHeading=el('summary','About this BoM');info.append(infoHeading,note);
 const transfers=el('details'),transferHeading=el('summary','Import and export');transfers.append(transferHeading,actions);
 content.append(controls,filters,summary,feedback,result,transfers,info);dialog.append(header,content);document.body.append(dialog);
 function persist(next) {
  let json;try {json=metadataJSON(scope,next);if(!storage)throw new Error('Browser draft storage is unavailable.');storage.setItem(storageKey,json);}
  catch(e){feedback.textContent='Draft was not saved: '+e.message;return false;}
  try{options.onMetadataChanged?.(JSON.parse(json).parts);}catch(e){feedback.textContent='Draft saved; progress refresh failed: '+e.message;}return true;
 }
 function locate(p) {const b=button(p.reference||'(unannotated)',()=>onLocate?.(p.object));b.className='bom-manager-reference';if(!onLocate)b.disabled=true;return b;}
 function edit(part, targets=[part]) {
  for(const child of [...result.children])if(child.className==='bom-manager-editor')child.remove();
  const panel=el('section',undefined,'bom-manager-editor');panel.append(el('h3','Management fields: '+part.reference+(targets.length>1?' · applies to '+targets.length+' parts':'')));
  const form=el('form'), inputs={};
  for(const field of FIELDS){const states=field==='status'?STATUSES:field==='Assembly'?ASSEMBLY:null,label=el('label',field), input=el(states?'select':field==='Notes'?'textarea':'input');if(states){for(const s of states){const opt=el('option',s);opt.value=s;input.append(opt);}}else input.maxLength=MAX_FIELD;input.value=part.management[field];label.append(input);form.append(label);inputs[field]=input;}
  const save=el('button','Save management draft');save.type='submit';save.className='primary';form.append(save,button('Cancel',()=>panel.remove()));
  form.addEventListener('submit',e=>{e.preventDefault();const record=Object.fromEntries(FIELDS.map(f=>[f,inputs[f].value])), next={...metadata,...Object.fromEntries(targets.map(p=>[p.id,record]))};if(persist(next)){metadata=next;render();feedback.textContent='Management draft saved locally.';}});
  panel.append(form);result.prepend(panel);inputs.Manufacturer.focus();
 }
 function editNative(part) {
  Promise.resolve().then(()=>onEdit(part.object)).catch(error=>{feedback.textContent='Source editor failed: '+error.message;});
 }
 function render(limit = 200) {
  if (typeof limit !== 'number') limit = 200;
  result.replaceChildren();const parts=filtered(), all=model(objects,source.value,metadata);
  let total;try{total=totals(parts,build.value);}catch(e){feedback.textContent=e.message;}
  summary.replaceChildren();
  const metric=(label,value,detail)=>{const item=el('div',undefined,'bom-manager-metric');item.append(el('small',label),el('strong',value),el('span',detail));summary.append(item);};
  metric('Visible parts',`${parts.length} / ${all.length}`,`${all.filter(p=>p.populated).length} fitted · ${all.filter(p=>!p.populated).length} DNP · ${all.filter(p=>p.excluded).length} excluded in saved source`);
  if(total){metric('Build requirement',`${total.buildParts} parts`,`${total.boards} boards · ${total.unpriced} unpriced per board`);const overall=totals(all);metric('Assembly verification',`${overall.verified} / ${overall.fitted}`, `${overall.fitted-overall.verified} unfinished in this source · ${total.verified}/${total.fitted} visible verified`);if(Object.keys(total.currencies).length)metric('Visible build cost',Object.entries(total.currencies).map(([c,n])=>`${c} ${n.toFixed(2)}`).join(' · '),'Priced parts only · currencies kept separate');}
  nextPart.disabled=!onLocate||!nextAssembly(parts,assemblyCursor);
  filterHeading.textContent='Filters and sorting'+([population.value!=='all',excluded.value!=='hide',status.value!=='all',assembly.value!=='all',side.value!=='all',sort.value!=='reference'].filter(Boolean).length?' · active':'');
  if(!parts.length){const empty=el('div',undefined,'bom-manager-empty');empty.append(el('strong',all.length?'No parts match your filters':'No saved parts in this source'),el('p',all.length?'Clear search or reset filters to show the full list.':'Choose another source or open a saved schematic or PCB.'));result.append(empty);return;}
  const table=el('table'), head=el('thead'), hr=el('tr');
  const columns=['Reference / quantity','Value / footprint','Population','Manufacturer / MPN','Supplier / SKU','Procurement / assembly / cost','Actions'];for(const c of columns){const th=el('th',c);th.setAttribute('scope','col');hr.append(th);};head.append(hr);table.append(head);const body=el('tbody');table.append(body);
  const rows=view.value==='groups'?group(parts):parts;
  for(const row of rows.slice(0,limit)){const grouped=!!row.parts,tr=el('tr'),refs=el('td');refs.dataset.label=columns[0];if(grouped){refs.append(el('strong',`${row.quantity} × `));let shown=0;const more=button('More references',()=>appendReferences());function appendReferences(){more.remove();for(const p of row.parts.slice(shown,shown+100))refs.append(locate(p),' ');shown+=100;if(shown<row.parts.length)refs.append(more);}appendReferences();}else{refs.append(locate(row),el('small',row.path));}tr.append(refs);
   const values=[row.value+'\n'+row.footprint,(row.populated?'Fitted':'DNP')+(row.excluded?' · Excluded':''),row.management.Manufacturer+'\n'+row.management.MPN,row.management.Supplier+'\n'+row.management.SKU,row.management.status+'\n'+row.management.Assembly+'\n'+row.management.Currency+' '+row.management['Unit price']];values.forEach((v,i)=>{const td=el('td',v);td.dataset.label=columns[i+1];if(i===1){td.className='bom-manager-population';td.dataset.population=row.populated?'fitted':'dnp';}tr.append(td);});
   const td=el('td');td.dataset.label='Actions';if(grouped)td.append(button('Manage group',()=>edit(row.parts[0],row.parts)));else{const advance=button(row.management.Assembly==='verified'?'Verified':'Advance assembly',()=>{if(!assemblyWorkItem(row)||row.management.Assembly==='verified')return;const next={...metadata,[row.id]:{...(metadata[row.id]||{}),Assembly:ASSEMBLY[Math.min(ASSEMBLY.length-1,ASSEMBLY.indexOf(row.management.Assembly)+1)]}};if(persist(next)){metadata=next;render();}});advance.disabled=!assemblyWorkItem(row)||row.management.Assembly==='verified';advance.title=assemblyWorkItem(row)?'Advance this local checklist by one step':'DNP and excluded parts are not assembly work items';td.append(button('Manage',()=>edit(row)),advance);if(onEdit)td.append(button('Edit KiCad fields',()=>editNative(row)));if(row.management.Notes)td.append(el('small',row.management.Notes));const fields=el('details');fields.className='bom-manager-saved-fields';fields.append(el('summary','Saved fields'));for(const [name,value]of Object.entries(row.properties))fields.append(el('p',name+': '+text(value)));td.append(fields);}tr.append(td);body.append(tr);
  }result.append(table);if(rows.length>limit)result.append(button(`Show next ${Math.min(200,rows.length-limit)} rows (${Math.min(limit,rows.length)} of ${rows.length} displayed)`,()=>render(limit+200)));
 }
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});render();dialog.showModal();return dialog;
}
const api={open,identity,model,query,group,csv,validateMetadata,metadataJSON,scopeKey,boardCount,totals,assemblyWorkItem,nextAssembly,FIELDS,STATUSES,ASSEMBLY};
root.KiCadBomManager=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
