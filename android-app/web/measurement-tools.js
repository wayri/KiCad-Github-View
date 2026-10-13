/* Touch presentation for the shared KiCad measurement engine. */
((root)=>{
 'use strict';
 const API={};root.KiCadAndroidMeasurements=API;
 if(typeof module==='object'&&module.exports)module.exports=API;
 if(!root.document)return;
 const d=root.document,$=id=>d.getElementById(id);
 const make=(tag,text)=>{const n=d.createElement(tag);if(text)n.textContent=text;return n;};
 const active=()=>$('measureButton')?.getAttribute('aria-pressed')==='true';
 API.handleBack=()=>{if(!active())return false;$('measureButton').click();return true;};
 API.mount=()=>{
  const toolbar=$('androidViewToolbar'),original=$('measureButton'),controls=$('rulerControls');
  if(!toolbar||!original||!controls||$('androidMeasure'))return false;
  const quick=make('button','Measure');quick.id='androidMeasure';quick.type='button';quick.setAttribute('aria-label','Measure layout distance or angle');quick.title='Measure layout distance or angle';const ruler=root.KiCadUIIcons?.icon('ruler');if(ruler)quick.replaceChildren(ruler);quick.onclick=()=>original.click();toolbar.insertBefore(quick,toolbar.lastElementChild);
  const panel=make('section');panel.id='androidMeasurementPanel';panel.setAttribute('aria-label','Drawing measurement');
  const heading=make('div');heading.className='android-measurement-heading';
  const instructions=make('span');instructions.id='androidMeasurementInstructions';
  const exit=make('button','Exit');exit.type='button';exit.setAttribute('aria-label','Exit measurement');exit.onclick=API.handleBack;heading.append(instructions,exit);
  const result=$('measurementStatus');if(result){result.setAttribute('role','status');result.setAttribute('aria-live','polite');}
  const options=make('details'),summary=make('summary','Measurement options');options.append(summary);
  const unitsLabel=make('label','Units '),units=make('select');units.id='androidMeasurementUnits';units.setAttribute('aria-label','Measurement units');
  for(const [value,text]of [['mm','Millimetres'],['mil','Mils']]){const option=make('option',text);option.value=value;units.append(option);}
  unitsLabel.append(units);units.onchange=()=>{const originalUnits=$('rulerUnits');if(!originalUnits)return;originalUnits.value=units.value;originalUnits.dispatchEvent(new root.Event('change',{bubbles:true}));};
  options.append(unitsLabel,controls);panel.append(heading);if(result)panel.append(result);panel.append(options);toolbar.after(panel);
  // The shared ruler controls are never replaced: handlers, validation and snaps survive.
  const sync=()=>{const on=active();panel.hidden=!on;quick.disabled=original.disabled;quick.setAttribute('aria-pressed',String(on));
   const kind=$('rulerKind')?.value;instructions.textContent=kind==='angle'?'Tap endpoint → vertex → endpoint.':'Tap two points on the drawing.';
   units.value=$('rulerUnits')?.value||'mm';
   if(on){$('androidToolsSheet')?.close();d.body.classList.remove('drawing-focused');}
  };
  original.addEventListener('click',sync);$('rulerKind')?.addEventListener('change',sync);$('rulerUnits')?.addEventListener('change',sync);
  new root.MutationObserver(sync).observe(original,{attributes:true,attributeFilter:['aria-pressed','disabled']});
  sync();return true;
 };
 const init=()=>{API.mount();let queued=false;new root.MutationObserver(()=>{if(queued)return;queued=true;root.queueMicrotask(()=>{queued=false;API.mount();});}).observe(d.body,{childList:true,subtree:true});};
 if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(globalThis);
