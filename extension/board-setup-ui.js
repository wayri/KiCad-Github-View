/* KiCad-style Board Setup presentation of saved values. No rule evaluation or writes. */
((root)=>{'use strict';
 const escape=s=>String(s).replace(/~/g,'~0').replace(/\//g,'~1');
 const label=s=>String(s).replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());
 const groups=[
  ['Copper',[['min_clearance','Minimum clearance'],['min_track_width','Minimum track width'],['min_connection','Minimum connection width'],['min_copper_edge_clearance','Copper to edge clearance']]],
  ['Holes',[['min_through_hole_diameter','Minimum through hole'],['min_hole_clearance','Copper to hole clearance'],['min_hole_to_hole','Hole to hole clearance']]],
  ['Vias',[['min_via_diameter','Minimum via diameter'],['min_via_annular_width','Minimum annular width'],['min_microvia_diameter','Minimum microvia diameter'],['min_microvia_drill','Minimum microvia hole']]],
  ['Silkscreen',[['min_silk_clearance','Minimum item clearance'],['min_text_height','Minimum text height'],['min_text_thickness','Minimum text thickness'],['min_silk_text_height','Minimum text height (legacy)'],['min_silk_text_thickness','Minimum text thickness (legacy)']]],
  ['Zones',[['min_resolved_spokes','Minimum thermal relief spokes']]],
  ['Arc / circle approximation',[['max_error','Maximum allowed deviation']]],
  ['Length calculation',[['use_height_for_length_calcs','Include stackup height in track length calculations']]]
 ];
 const classKeys=['name','clearance','track_width','via_diameter','via_drill','microvia_diameter','microvia_drill','diff_pair_width','diff_pair_gap','diff_pair_via_gap'];
 const classLabels=['Net class','Clearance','Track width','Via diameter','Via hole','µVia diameter','µVia hole','DP width','DP gap','DP via gap'];
 function model(settings){
  const design=settings?.tree?.board?.design_settings||{},rules=design.rules||{},known=new Set(groups.flatMap(([,fields])=>fields.map(([key])=>key)));
  const field=(key,title,value,path,unit='')=>({key,label:title,value,path,unit});
  const constraintGroups=groups.map(([title,fields])=>({title,fields:fields.filter(([key])=>Object.hasOwn(rules,key)).map(([key,title])=>field(key,title,rules[key],'/board/design_settings/rules/'+escape(key),typeof rules[key]==='number'&&key!=='min_resolved_spokes'?'mm':''))})).filter(g=>g.fields.length);
  const extra=Object.keys(rules).filter(key=>!known.has(key)).map(key=>field(key,label(key),rules[key],'/board/design_settings/rules/'+escape(key),/clearance|width|diameter|drill|thickness/.test(key)&&typeof rules[key]==='number'?'mm':''));if(extra.length)constraintGroups.push({title:'Additional saved constraints',fields:extra});
  function table(title,rows,keys,base,labels=keys.map(label),units=keys.map(()=>'')){
   return{title,columns:keys.map((key,i)=>({key,label:labels[i],unit:units[i]})),rows:(Array.isArray(rows)?rows:[]).map((row,i)=>keys.map((key,k)=>field(key,labels[k],key===''?row:row?.[key],base+'/'+i+(key?'/' +escape(key):''),units[k])))};
  }
  const pages=[
   {id:'constraints',title:'Constraints',groups:constraintGroups},
   {id:'sizes',title:'Pre-defined Sizes',tables:[table('Track widths',design.track_widths,[''],'/board/design_settings/track_widths',['Width'],['mm']),table('Via sizes',design.via_dimensions,['diameter','drill'],'/board/design_settings/via_dimensions',['Diameter','Hole'],['mm','mm']),table('Differential pairs',design.diff_pair_dimensions,['width','gap','via_gap'],'/board/design_settings/diff_pair_dimensions',['Width','Gap','Via gap'],['mm','mm','mm'])]},
   {id:'netclasses',title:'Net Classes',tables:[table('Net classes',settings?.tree?.net_settings?.classes,classKeys,'/net_settings/classes',classLabels,classKeys.map(key=>key==='name'?'':'mm')),table('Netclass assignments',settings?.tree?.net_settings?.netclass_patterns,['pattern','netclass'],'/net_settings/netclass_patterns',['Pattern','Net class'])]},
   {id:'custom',title:'Custom Rules',custom:true,rules:settings?.rules||[]},
   {id:'severity',title:'Violation Severity',severity:Object.entries(design.rule_severities||{}).map(([key,value])=>field(key,label(key),value,'/board/design_settings/rule_severities/'+escape(key)))},
   {id:'teardrops',title:'Teardrops',tables:[]},
   {id:'tuning',title:'Length-tuning Patterns',groups:[]}
  ];
  for(const key of ['teardrop_options','teardrop_parameters']){const rows=design[key];if(Array.isArray(rows)){const keys=[...new Set(rows.flatMap(row=>Object.keys(row||{})))];pages.find(p=>p.id==='teardrops').tables.push(table(label(key),rows,keys,'/board/design_settings/'+key));}}
  const tuning=Object.entries(design).filter(([key])=>/tuning/.test(key));for(const[key,value]of tuning)pages.find(p=>p.id==='tuning').groups.push({title:label(key),fields:[field(key,label(key),value,'/board/design_settings/'+key)]});
  const assignments=settings?.tree?.net_settings?.netclass_assignments;
  if(assignments&&typeof assignments==='object')pages.find(p=>p.id==='netclasses').groups=[{title:'Explicit netclass assignments',fields:Object.entries(assignments).map(([key,value])=>field(key,key,value,'/net_settings/netclass_assignments/'+escape(key)))}];
  return pages;
 }
 const states=new WeakMap();let id=0;
 function render(holder,settings,{query='',inspect=()=>{},source='',openRules,openStackup}={}){
  const doc=holder.ownerDocument,el=(tag,text)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;return n;},pages=model(settings);let selected=states.get(holder)|| (settings?.kind==='custom-rules'?'custom':'constraints');if(settings?.kind==='custom-rules')selected='custom';
  holder.replaceChildren();holder.className='board-setup-workspace';
  const nav=el('nav');nav.className='board-setup-nav';nav.setAttribute('aria-label','Board Setup sections');
  nav.append(el('strong','Board Setup'));if(openStackup){const b=el('button','Physical Stackup');b.type='button';b.onclick=openStackup;nav.append(b);}nav.append(el('h3','Design Rules'));
  const picker=el('select');picker.className='board-setup-picker';picker.setAttribute('aria-label','Board Setup section');
  for(const page of pages){const b=el('button',page.title);b.type='button';b.setAttribute('aria-current',selected===page.id?'page':'false');b.onclick=()=>{states.set(holder,page.id);render(holder,settings,{query,inspect,source,openRules,openStackup});};nav.append(b);const o=el('option',page.title);o.value=page.id;picker.append(o);}picker.value=selected;picker.onchange=()=>{states.set(holder,picker.value);render(holder,settings,{query,inspect,source,openRules,openStackup});};
  const page=pages.find(p=>p.id===selected),content=el('section');content.className='board-setup-page';content.append(el('h2',page.title),el('p','Saved settings · read-only'));const matches=f=>!query||[f.label,f.path,JSON.stringify(f.value)].join(' ').toLowerCase().includes(query);
  function input(f){const wrap=el('div');wrap.className='board-setup-input';let control;
   if(typeof f.value==='boolean'){control=el('input');control.type='checkbox';control.checked=f.value;control.disabled=true;}
   else if(typeof f.value==='number'){control=el('input');control.type='number';control.step='any';control.value=String(f.value);control.readOnly=true;}
   else if(typeof f.value==='string'){control=el('input');control.type='text';control.value=f.value;control.readOnly=true;}
   else{control=el('input');control.type='text';control.value=f.value===undefined?'Not saved':JSON.stringify(f.value);control.readOnly=true;}
   control.id='board-setup-field-'+(++id);control.setAttribute('aria-label',f.label+(f.unit?' ('+f.unit+')':''));control.title=f.path;wrap.append(control);if(f.unit)wrap.append(el('span',f.unit));if(f.value!==undefined){const info=el('button','i');info.type='button';info.className='setting-info';info.setAttribute('aria-label','Inspect saved source for '+f.label);info.onclick=()=>inspect(f);wrap.append(info);}return wrap;
  }
  for(const group of page.groups||[]){const fields=group.fields.filter(matches);if(!fields.length)continue;const fs=el('fieldset');fs.append(el('legend',group.title));for(const f of fields){const row=el('div');row.className='board-setup-field';const value=input(f),title=el('label',f.label);title.htmlFor=value.firstChild.id;row.append(title,value);fs.append(row);}content.append(fs);}
  for(const data of page.tables||[]){content.append(el('h3',data.title));const scroll=el('div');scroll.className='board-setup-table-scroll';const table=el('table'),thead=el('thead'),head=el('tr'),body=el('tbody');table.setAttribute('aria-label',data.title);for(const col of data.columns){const th=el('th',col.label+(col.unit?' ('+col.unit+')':''));th.scope='col';head.append(th);}thead.append(head);let shown=0;for(const row of data.rows){if(!row.some(matches))continue;if(shown++>=2000)break;const tr=el('tr');for(const f of row){const td=el('td');td.append(input(f));tr.append(td);}body.append(tr);}table.append(thead,body);scroll.append(table);content.append(scroll);if(!shown)content.append(el('p',query?'No matching saved rows.':'No saved entries.'));if(data.rows.length>2000)content.append(el('p','First 2,000 rows shown. Narrow the search to inspect more.'));}
  if(page.severity){const table=el('table'),head=el('tr'),thead=el('thead'),body=el('tbody');table.className='board-setup-severity';table.setAttribute('aria-label','DRC violation severity');for(const title of ['Violation','Error','Warning','Ignore']){const th=el('th',title);th.scope='col';head.append(th);}thead.append(head);for(const f of page.severity.filter(matches)){const row=el('tr');row.append(el('th',f.label));for(const choice of ['error','warning','ignore']){const td=el('td'),radio=el('input');radio.type='radio';radio.name='severity-'+(++id);radio.checked=f.value===choice;radio.disabled=true;radio.setAttribute('aria-label',f.label+': '+choice);td.append(radio);row.append(td);}body.append(row);}table.append(thead,body);content.append(table);if(!page.severity.length)content.append(el('p','No saved DRC severities in this file.'));}
  if(page.custom){if(settings?.kind==='custom-rules'){const text=el('textarea');text.className='board-setup-rule-source';text.readOnly=true;text.value=source;text.setAttribute('aria-label','Saved custom rules');content.append(text);const rules=el('table'),head=el('tr');for(const title of ['Rule','Condition','Layer','Severity','Constraints'])head.append(el('th',title));rules.append(head);for(const rule of page.rules){const row=el('tr');for(const value of [rule.name,rule.condition,rule.layer,rule.severity,JSON.stringify(rule.constraints)])row.append(el('td',value??'Not saved'));rules.append(row);}const scroll=el('div');scroll.className='board-setup-table-scroll';scroll.append(rules);content.append(scroll,el('p','Rule syntax and applicability are not evaluated by this viewer.'));}else{content.append(el('p','Custom rules are saved separately in the project’s .kicad_dru file.'));if(openRules){const b=el('button','Open custom rules file');b.type='button';b.onclick=openRules;content.append(b);}}}
  if(!page.custom&&!page.tables?.length&&!page.groups?.length&&!page.severity?.length)content.append(el('p','No saved values for this section in the selected file. Open the project’s .kicad_pro file to inspect design rules.'));
  if(query&&page.groups&&!page.groups.some(group=>group.fields.some(matches)))content.append(el('p','No matching saved settings.'));
  holder.append(picker,nav,content);
 }
 const api={model,render};if(typeof module==='object'&&module.exports)module.exports=api;else root.KiCadBoardSetupUI=api;
})(globalThis);
