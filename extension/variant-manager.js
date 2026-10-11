/* Revision-scoped assembly overlays. Never writes KiCad source. */
((root)=>{'use strict';
 const D=()=>root.KiCadDesignModel||(typeof require==='function'?require('./design-model.js'):null);
 function validate(config){return D().parseVariantConfig(JSON.stringify(config),'variants.json');}
 function apply(objects,config,id){
  const checked=validate(config),variant=checked.variants.find(v=>v.id===id),warnings=[];
  const rows=objects.map(o=>({...o,properties:{...o.properties}}));if(id==='default')return{objects:rows,warnings};if(!variant)throw Error('Unknown assembly variant.');
  for(const rule of variant.parts){const matches=rows.filter(o=>['symbol','footprint'].includes(o.kind)&&(!rule.path||o.path===rule.path)&&(rule.uuid?o.uuid===rule.uuid:o.reference===rule.reference));
   if(!matches.length){warnings.push('Unmatched part: '+(rule.reference||rule.uuid));continue;}
   if(new Set(matches.map(o=>o.path)).size>1||rule.uuid&&matches.length>1){warnings.push('Ambiguous part: '+(rule.reference||rule.uuid)+'; specify file and UUID.');continue;}
   for(const o of matches){Object.assign(o.properties,rule.properties||{});if(rule.populated!==undefined){o.populated=rule.populated;o.properties.DNP=rule.populated?'No':'Yes';}}
  }return{objects:rows,warnings};
 }
 function setPart(config,id,object,change){
  const next=structuredClone(config||{schemaVersion:1,variants:[]}),v=next.variants.find(v=>v.id===id);if(!v)throw Error('Choose an editable variant.');
  const key=o=>JSON.stringify([o.path,o.uuid?'uuid':'reference',o.uuid||o.reference]);const rule={path:object.path,...(object.uuid?{uuid:object.uuid}:{reference:object.reference}),...change};
  v.parts=v.parts.filter(r=>key(r)!==key(rule));if(change.populated!==undefined||Object.keys(change.properties||{}).length)v.parts.push(rule);return validate(next);
 }
 function open({objects,config,onSave,onExport}){
  const doc=root.document,el=(t,s)=>{const n=doc.createElement(t);if(s!==undefined)n.textContent=s;return n;},button=(s,f)=>{const n=el('button',s);n.type='button';n.onclick=f;return n;};
  let draft=validate(config||{schemaVersion:1,variants:[]}),selected=draft.variants[0]?.id||'',limit=100;
  const dialog=el('dialog');dialog.className='bom-manager';const head=el('header');head.className='bom-manager-heading';head.append(el('h2','Assembly variants'),button('Close',()=>dialog.close()));
  const body=el('div');body.className='bom-manager-content android-sheet-content';const controls=el('div');controls.className='bom-manager-controls';const choice=el('select');choice.setAttribute('aria-label','Variant to edit');
  const name=el('input');name.placeholder='Variant name';name.maxLength=100;name.setAttribute('aria-label','Variant name');const search=el('input');search.type='search';search.placeholder='Find a part';search.setAttribute('aria-label','Find variant part');const status=el('p');status.setAttribute('role','status');const rows=el('div');
  function run(f){try{f();status.textContent='Changes are staged. Save variants to apply them.';render();}catch(e){status.textContent=e.message;}}
  function create(copy){const id='assembly-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,6);draft.variants.push({id,name:name.value.trim()||'New assembly',parts:copy?structuredClone(draft.variants.find(v=>v.id===selected)?.parts||[]):[]});draft=validate(draft);selected=id;}
  controls.append(choice,name,button('New variant',()=>run(()=>create(false))),button('Duplicate',()=>run(()=>create(true))),button('Rename',()=>run(()=>{draft.variants.find(v=>v.id===selected).name=name.value.trim();draft=validate(draft);})),button('Delete variant',()=>run(()=>{draft.variants=draft.variants.filter(v=>v.id!==selected);selected=draft.variants[0]?.id||'';})),search);
  choice.onchange=()=>{selected=choice.value;limit=100;render();};search.oninput=()=>{limit=100;render();};
  const actions=el('div');actions.className='bom-manager-actions';actions.append(button('Save variants',async()=>{try{draft=validate(draft);await onSave(draft);dialog.close();}catch(e){status.textContent='Variants were not saved: '+e.message;}}),button('Export variants JSON',()=>{try{const text=JSON.stringify(validate(draft),null,2);if(onExport)onExport('assembly-variants.json',text,'application/json');else{const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=el('a');a.href=url;a.download='assembly-variants.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}catch(e){status.textContent=e.message;}}));
  body.append(el('p','Create fitted/DNP and value, footprint or MPN overrides for a saved assembly. Drafts affect the BoM and drawing overlays; source files stay unchanged.'),controls,status,rows,actions);dialog.append(head,body);doc.body.append(dialog);
  function render(){choice.replaceChildren();for(const v of draft.variants){const o=el('option',v.name);o.value=v.id;choice.append(o);}choice.value=selected;name.value=draft.variants.find(v=>v.id===selected)?.name||'';rows.replaceChildren();if(!selected){rows.append(el('p','Create a variant to start.'));return;}
   const applied=apply(objects,draft,selected);status.textContent=applied.warnings.join(' ')||status.textContent;
   const parts=applied.objects.filter(o=>['symbol','footprint'].includes(o.kind)&&o.reference&&[o.reference,o.path,o.properties.Value].join(' ').toLowerCase().includes(search.value.toLowerCase())),seen=new Set();
   const unique=parts.filter(o=>{const k=JSON.stringify([o.path,o.kind,o.reference]);if(seen.has(k))return false;seen.add(k);return true;});
   for(const o of unique.slice(0,limit)){const panel=el('details');panel.append(el('summary',o.reference+' · '+(o.properties.Value||'')+' · '+(o.populated===false?'DNP':'Fitted')+' · '+o.path));const form=el('form');form.className='bom-manager-controls';const population=el('select');for(const [value,label]of [['saved','Saved population'],['true','Fitted'],['false','DNP']]){const opt=el('option',label);opt.value=value;population.append(opt);}const existing=draft.variants.find(v=>v.id===selected).parts.find(r=>r.path===o.path&&(r.uuid? r.uuid===o.uuid:r.reference===o.reference));population.value=existing?.populated===undefined?'saved':String(existing.populated);const inputs={};const pl=el('label','Population');pl.append(population);form.append(pl);
    for(const field of ['Value','Footprint','MPN']){const l=el('label',field),i=el('input');i.maxLength=4096;i.placeholder='Use saved '+field;i.value=existing?.properties?.[field]||'';inputs[field]=i;l.append(i);form.append(l);}const save=el('button','Stage part override');save.type='submit';form.append(save,button('Reset to saved part',()=>run(()=>{draft=setPart(draft,selected,o,{});})));form.onsubmit=e=>{e.preventDefault();run(()=>{const properties=Object.fromEntries(Object.entries(inputs).filter(([,i])=>i.value!=='').map(([k,i])=>[k,i.value]));draft=setPart(draft,selected,o,{...(population.value==='saved'?{}:{populated:population.value==='true'}),properties});});};panel.append(form);rows.append(panel);
   }if(unique.length>limit)rows.append(button('Show more parts',()=>{limit+=100;render();}));
  }dialog.addEventListener('close',()=>dialog.remove(),{once:true});render();dialog.showModal();return dialog;
 }
 const API={validate,apply,setPart,open};root.KiCadVariantManager=API;if(typeof module==='object'&&module.exports)module.exports=API;
})(globalThis);
