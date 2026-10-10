((root)=>{
 'use strict';
 function install(doc,host){
  let press=null,timer=null,expiry=null,tip=null,owner=null,oldDescription=null,suppressed=null;
  // Editing and copying fields must retain Android's native long-press behavior,
  // even when a field is nested inside a clickable card.
  const control=target=>{
   if(target?.closest?.('textarea,select,output,input:not([type=button]):not([type=submit]):not([type=reset]),[contenteditable="true"],[contenteditable=""]'))return null;
   return target?.closest?.('button,[role=button],[role=tab],a[title],input[type=button],input[type=submit],input[type=reset]');
  };
  const cancel=()=>{host.clearTimeout(timer);timer=null;press=null;};
  const dismiss=()=>{const shown=Boolean(tip);cancel();host.clearTimeout(expiry);tip?.remove();tip=null;if(owner){if(oldDescription===null)owner.removeAttribute('aria-describedby');else owner.setAttribute('aria-describedby',oldDescription);}owner=null;return shown;};
  const show=button=>{
   dismiss();const text=button.getAttribute('title')||button.getAttribute('aria-label')||button.textContent.trim();if(!text)return;
   tip=doc.createElement('div');tip.id='androidTouchTooltip';tip.setAttribute('role','tooltip');tip.textContent=text;owner=button;oldDescription=button.getAttribute('aria-describedby');button.setAttribute('aria-describedby',((oldDescription||'')+' '+tip.id).trim());
   (button.closest('dialog[open]')||doc.body).append(tip);
   const anchor=button.getBoundingClientRect(),box=tip.getBoundingClientRect(),viewport=host.visualViewport;
   const left=viewport?.offsetLeft||0,top=viewport?.offsetTop||0,width=viewport?.width||host.innerWidth,height=viewport?.height||host.innerHeight;
   tip.style.left=Math.max(left+8,Math.min(anchor.left+(anchor.width-box.width)/2,left+width-box.width-8))+'px';
   tip.style.top=Math.max(top+8,Math.min(anchor.bottom+8+box.height<top+height?anchor.bottom+8:anchor.top-box.height-8,top+height-box.height-8))+'px';
   suppressed={button,until:Infinity};
  };
  doc.addEventListener('pointerdown',event=>{
   cancel();dismiss();suppressed=null;if(event.pointerType!=='touch'&&event.pointerType!=='pen')return;
   const button=control(event.target);if(!button)return;
   press={button,id:event.pointerId,x:event.clientX,y:event.clientY,held:false};timer=host.setTimeout(()=>{timer=null;if(press){const held=press;show(held.button);press=held;press.held=Boolean(tip);}},500);
  },true);
  doc.addEventListener('pointermove',event=>{if(press&&event.pointerId===press.id&&Math.hypot(event.clientX-press.x,event.clientY-press.y)>8){cancel();dismiss();}},true);
  doc.addEventListener('pointerup',event=>{if(!press||event.pointerId!==press.id)return;if(press.held){event.preventDefault();event.stopImmediatePropagation();suppressed.until=Date.now()+1000;expiry=host.setTimeout(dismiss,4000);}cancel();},true);
  doc.addEventListener('pointercancel',()=>{cancel();dismiss();},true);
  doc.addEventListener('scroll',()=>{cancel();dismiss();},true);
  doc.addEventListener('keydown',event=>{if(event.key==='Escape'&&dismiss()){event.preventDefault();event.stopImmediatePropagation();}},true);
  host.addEventListener?.('blur',dismiss);
  host.visualViewport?.addEventListener?.('resize',dismiss);
  doc.addEventListener('click',event=>{if(suppressed&&Date.now()<suppressed.until&&control(event.target)===suppressed.button){event.preventDefault();event.stopImmediatePropagation();suppressed=null;}},true);
  doc.addEventListener('contextmenu',event=>{if((press||tip)&&control(event.target)){event.preventDefault();event.stopImmediatePropagation();}},true);
  return{dismiss};
 }
 const api={install};root.KiCadAndroidTooltips=api;if(typeof module==='object'&&module.exports)module.exports=api;
 if(root.document){const init=()=>Object.assign(api,install(root.document,root));if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',init,{once:true});else init();}
})(globalThis);
