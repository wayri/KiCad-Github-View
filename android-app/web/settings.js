/* App preferences reuse shared viewer controls and their existing drawing palettes. */
((root)=>{
 'use strict';
 const KEY='kivi:app-settings:v1',defaults={appearance:'system',drawing:'kicad',units:'mm',acceleration:'auto'};
 function normalize(value){const result={...defaults};for(const [key,allowed]of Object.entries({appearance:['system','kicad-light','kicad-dark','light','dark'],drawing:['kicad','light','dark'],units:['mm','mil'],acceleration:['auto','off']}))if(allowed.includes(value?.[key]))result[key]=value[key];return result;}
 function themes(value,darkSystem,pcb){const settings=normalize(value),ui=settings.appearance==='system'?(darkSystem?'dark':'light'):settings.appearance.endsWith('dark')?'dark':'light';return{ui,drawing:settings.drawing==='kicad'?(settings.appearance==='light'||settings.appearance==='dark'?ui:pcb?'dark':'light'):settings.drawing};}
 if(typeof module==='object'&&module.exports)module.exports={normalize,themes,KEY};
 if(!root.document)return;
 const d=root.document,media=root.matchMedia?.('(prefers-color-scheme: dark)'),watched=new WeakSet(),frames=new WeakSet(),initialized=new WeakMap();let settings=normalize(),dialog,status,applying=false;
 try{settings=normalize(JSON.parse(root.localStorage.getItem(KEY)||'null'));}catch{}
 const make=(tag,text)=>{const node=d.createElement(tag);if(text)node.textContent=text;return node;};
 function applyDocument(doc,force=false){
  if(!doc?.body)return;
  const pcb=/\.kicad_pcb$/i.test(new URLSearchParams(doc.location?.search||'').get('file')||''),theme=themes(settings,Boolean(media?.matches),pcb);
  const controls=initialized.get(doc)||new WeakMap();initialized.set(doc,controls);
  // Each onchange remains owned by the viewer, including its canvas/3D redraw.
  for(const [id,value]of [['uiTheme',theme.ui],['drawingTheme',theme.drawing],['rulerUnits',settings.units],['acceleration',settings.acceleration]]){const control=doc.getElementById(id);if(control&&typeof control.onchange==='function'&&(force||controls.get(control)!==control.onchange)){controls.set(control,control.onchange);if(control.value!==value){control.value=value;control.onchange();}}}
  if((force||!watched.has(doc))&&doc.body.dataset.uiTheme!==theme.ui)doc.body.dataset.uiTheme=theme.ui;
  if(!watched.has(doc)){watched.add(doc);if(root.MutationObserver)new root.MutationObserver(()=>apply()).observe(doc.body,{subtree:true,childList:true,attributes:true,attributeFilter:['data-ui-theme']});}
  for(const frame of doc.querySelectorAll('iframe')){if(!frames.has(frame)){frames.add(frame);frame.addEventListener('load',()=>apply());}try{applyDocument(frame.contentDocument,force);}catch{}}
 }
 function apply(force=false){if(applying)return;applying=true;try{applyDocument(d,force);}finally{applying=false;}}
 function update(key,value){const next=normalize({...settings,[key]:value});try{root.localStorage.setItem(KEY,JSON.stringify(next));settings=next;if(status)status.textContent='Settings saved on this device.';apply(true);return true;}catch{if(status)status.textContent='Settings could not be saved. Try again.';return false;}}
 function mount(){
  const menu=d.getElementById('appMenuDialog')?.querySelector('.android-sheet-content');if(!menu||d.getElementById('androidSettingsButton'))return;
  dialog=make('dialog');dialog.id='androidSettingsDialog';dialog.className='android-app-settings';dialog.setAttribute('aria-label','App settings');
  const header=make('header'),close=make('button','Close');close.type='button';close.onclick=()=>dialog.close();header.append(make('strong','Settings'),close);
  const content=make('div');content.className='android-sheet-content';content.append(make('h2','Appearance'),make('p','KiCad themes use a dark PCB and light schematic. App and drawing colors can be chosen separately.'));
  function field(key,title,choices){const label=make('label',title),select=make('select');select.setAttribute('aria-label',title);select.id='androidSetting'+key[0].toUpperCase()+key.slice(1);for(const [value,text]of choices){const item=make('option',text);item.value=value;select.append(item);}select.value=settings[key];select.onchange=()=>{if(!update(key,select.value))select.value=settings[key];};label.append(select);content.append(label);}
  field('appearance','App theme',[['system','Follow system'],['kicad-light','KiCad light'],['kicad-dark','KiCad dark'],['light','Light throughout'],['dark','Dark throughout']]);
  field('drawing','Drawing colors',[['kicad','Use theme defaults'],['light','Light canvas'],['dark','Dark canvas']]);
  content.append(make('h2','Drawing tools'));
  field('units','Ruler units',[['mm','Millimetres'],['mil','Mils']]);field('acceleration','2D rendering',[['auto','Automatic acceleration'],['off','Canvas2D only']]);
  status=make('p');status.id='androidSettingsStatus';status.setAttribute('role','status');content.append(status);dialog.append(header,content);d.body.append(dialog);
  const button=make('button','Settings');button.id='androidSettingsButton';button.type='button';button.dataset.icon='gear';button.setAttribute('aria-haspopup','dialog');button.onclick=()=>{for(const modal of d.querySelectorAll('dialog[open]'))if(modal!==dialog)modal.close();dialog.showModal();};menu.prepend(button);
  dialog.addEventListener('close',()=>button.focus());apply();
 }
 root.KiCadAndroidSettings={get:()=>({...settings}),update,apply,open:()=>{mount();d.getElementById('androidSettingsButton')?.click();}};
 media?.addEventListener?.('change',()=>{if(settings.appearance==='system')apply(true);});root.addEventListener?.('storage',event=>{if(event.key!==KEY)return;try{settings=normalize(JSON.parse(event.newValue||'null'));for(const key of Object.keys(defaults)){const field=d.getElementById('androidSetting'+key[0].toUpperCase()+key.slice(1));if(field)field.value=settings[key];}apply(true);}catch{}});
 if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',mount,{once:true});else mount();apply();
})(globalThis);
