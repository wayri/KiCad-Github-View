/* A short, replayable Android introduction. No project or account is required. */
((root)=>{
 'use strict';
 const steps=[
  {icon:'folder',title:'Bring your project',text:'Open a project folder or ZIP to include its sheets and board. GitHub and GitLab projects can be opened from the library.',hint:'Local files stay on your device. Save an online project offline to reopen it without a connection.'},
  {icon:'search',title:'Explore with your fingers',text:'Drag to pan and pinch to zoom. Tap a part or connection to inspect it; Smart selection offers a choice when objects overlap.',hint:'Double-tap a subsheet to enter it. Back returns to its parent. Hold a toolbar button for help.'},
  {icon:'comment',title:'Review without losing the drawing',text:'Hold the drawing for review actions. Open Comments to write a note or read a thread. Pull a panel handle up for more detail; tap outside to return to the drawing.',hint:'Local review drafts stay on this device. Publishing shares them with the selected GitHub or GitLab thread.'}
 ];
 const key='pocket-kivi.quick-start.v1';
 const completed=storage=>{try{return storage?.getItem(key)==='done';}catch{return false;}};
 const finish=storage=>{try{storage?.setItem(key,'done');}catch{}};
 const API={steps,completed,finish};root.KiCadQuickStart=API;
 if(typeof module==='object'&&module.exports)module.exports=API;
 if(!root.document)return;
 function init(){
  const d=root.document,welcome=d.getElementById('welcome');if(!welcome)return;
  let storage=null;try{storage=root.localStorage;}catch{}
  const make=(tag,text)=>{const n=d.createElement(tag);if(text)n.textContent=text;return n;};
  const button=(text,action)=>{const b=make('button',text);b.type='button';b.onclick=action;return b;};
  const dialog=make('dialog');dialog.id='androidQuickStart';dialog.setAttribute('aria-labelledby','quickStartTitle');
  const header=make('header'),title=make('strong','Quick start');title.id='quickStartTitle';
  const close=button('Skip',()=>{finish(storage);dialog.close();});close.setAttribute('aria-label','Skip introduction');header.append(title,close);
  const content=make('div');content.className='android-sheet-content quick-start-content';
  const progress=make('p');progress.className='quick-start-progress';progress.setAttribute('aria-live','polite');
  const icon=make('span');icon.className='quick-start-icon';icon.setAttribute('aria-hidden','true');
  const heading=make('h2'),text=make('p'),hint=make('p');hint.className='quick-start-hint';
  const controls=make('div');controls.className='quick-start-controls';let step=0,previousFocus=null;
  const back=button('Back',()=>{step=Math.max(0,step-1);render();});
  const next=button('Next',()=>{if(step===steps.length-1){finish(storage);dialog.close();}else{step++;render();}});
  next.className='quick-start-primary';controls.append(back,next);content.append(progress,icon,heading,text,hint,controls);dialog.append(header,content);d.body.append(dialog);
  function render(){const data=steps[step];progress.textContent=`${step+1} of ${steps.length}`;heading.textContent=data.title;text.textContent=data.text;hint.textContent=data.hint;icon.replaceChildren();const svg=root.KiCadUIIcons?.icon?.(data.icon);if(svg)icon.append(svg);else icon.textContent=['1','2','3'][step];back.disabled=step===0;next.textContent=step===steps.length-1?'Start exploring':'Next';}
  API.open=()=>{previousFocus=d.activeElement;step=0;render();for(const other of d.querySelectorAll('dialog[open]'))if(other!==dialog)other.close();if(!dialog.open)dialog.showModal();};
  dialog.addEventListener('close',()=>previousFocus?.focus?.());
  const help=button('Quick start & touch guide',API.open);help.id='androidQuickStartButton';help.dataset.icon='help';
  const menu=d.querySelector('#appMenuDialog .android-sheet-content');if(menu)menu.append(help);
  const privacy=d.getElementById('androidPrivacyButton');if(menu&&privacy)menu.append(privacy);
  const homeHelp=button('Quick start',API.open);homeHelp.className='quick-start-link';welcome.append(homeHelp);
  // Keep the landing screen concise; the guide carries the interaction details.
  welcome.querySelector('h1').textContent='Your designs, anywhere';
  for(const p of [...welcome.children])if(p.tagName==='P'&&!p.classList.contains('app-subtitle'))p.remove();
  const intro=make('p','Open a KiCad folder, ZIP or online repository. Pick up a recent project below.');intro.className='home-intro';welcome.insertBefore(intro,welcome.querySelector('.android-welcome-actions'));
  for(const id of ['androidProjectHome','recentProjects']){const section=d.getElementById(id);if(section&&welcome.contains(section))welcome.insertBefore(section,homeHelp);}
  root.KiCadUIIcons?.decorate?.(d.body);
  // Defer until the shell is ready, and never interrupt an external project link.
  if(!completed(storage)&&!root.location?.search&&!root.location?.hash&&d.getElementById('viewer')?.hidden)API.open();
 }
 if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(globalThis);
