((root)=>{
 'use strict';
 function install(doc,host){
  let press=null,timer=null,expiry=null,tip=null,owner=null,oldDescription=null,suppressed=null;
  const control=target=>target?.closest?.('button,[role=button],[role=tab],a[title]');
  const cancel=()=>{host.clearTimeout(timer);timer=null;press=null;};
  const dismiss=()=>{const shown=Boolean(tip);host.clearTimeout(expiry);tip?.remove();tip=null;if(owner){if(oldDescription===null)owner.removeAttribute('aria-describedby');else owner.setAttribute('aria-describedby',oldDescription);}owner=null;return shown;};
  const show=button=>{
   dismiss();const text=button.getAttribute('title')||button.getAttribute('aria-label')||button.textContent.trim();if(!text)return;
   tip=doc.createElement('div');tip.id='androidTouchTooltip';tip.setAttribute('role','tooltip');tip.textContent=text;owner=button;oldDescription=button.getAttribute('aria-describedby');button.setAttribute('aria-describedby',((oldDescription||'')+' '+tip.id).trim());
   (button.closest('dialog[open]')||doc.body).append(tip);
   const anchor=button.getBoundingClientRect(),box=tip.getBoundingClientRect();
   tip.style.left=Math.max(8,Math.min(anchor.left+(anchor.width-box.width)/2,host.innerWidth-box.width-8))+'px';
   tip.style.top=Math.max(8,Math.min(anchor.bottom+8+box.height<host.innerHeight?anchor.bottom+8:anchor.top-box.height-8,host.innerHeight-box.height-8))+'px';
   suppressed={button,until:Date.now()+1500};expiry=host.setTimeout(dismiss,3500);
  };
  doc.addEventListener('pointerdown',event=>{
   cancel();dismiss();suppressed=null;if(event.pointerType!=='touch'&&event.pointerType!=='pen')return;
   const button=control(event.target);if(!button)return;
   press={button,id:event.pointerId,x:event.clientX,y:event.clientY,held:false};timer=host.setTimeout(()=>{timer=null;if(press){press.held=true;show(press.button);}},500);
  },true);
  doc.addEventListener('pointermove',event=>{if(press&&event.pointerId===press.id&&Math.hypot(event.clientX-press.x,event.clientY-press.y)>8){cancel();dismiss();}},true);
  doc.addEventListener('pointerup',event=>{if(press?.held&&event.pointerId===press.id){event.preventDefault();event.stopImmediatePropagation();}cancel();},true);
  doc.addEventListener('pointercancel',()=>{cancel();dismiss();},true);
  doc.addEventListener('scroll',()=>{cancel();dismiss();},true);
  doc.addEventListener('click',event=>{if(suppressed&&Date.now()<suppressed.until&&control(event.target)===suppressed.button){event.preventDefault();event.stopImmediatePropagation();suppressed=null;}},true);
  doc.addEventListener('contextmenu',event=>{if((press||tip)&&control(event.target)){event.preventDefault();event.stopImmediatePropagation();}},true);
  return{dismiss};
 }
 const api={install};root.KiCadAndroidTooltips=api;if(typeof module==='object'&&module.exports)module.exports=api;
 if(root.document){const init=()=>Object.assign(api,install(root.document,root));if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',init,{once:true});else init();}
})(globalThis);
