/* Local product identity only; never reads project data or makes network requests. */
((root)=>{'use strict';
 const valid=value=>typeof value==='string'&&/^\d+(?:\.\d+){1,3}$/.test(value);
 function info(){
  const saved=root.KiCadProductVersion||{};let manifest={};try{manifest=root.chrome?.runtime?.getManifest?.()||{};}catch{}
  const release=valid(manifest.version)?manifest.version:valid(saved.release)?saved.release:valid(root.KiCadVSCodeContext?.version)?root.KiCadVSCodeContext.version:null;
  const appVersion=valid(manifest.version)?manifest.version:valid(saved.appVersion)?saved.appVersion:release;
  const label=typeof manifest.version_name==='string'?manifest.version_name.slice(0,160):'';
  return {release,appVersion,platform:saved.platform&&!saved.platform.startsWith('__')?saved.platform:manifest.manifest_version?'Browser extension':'Development checkout',label};
 }
 function caption(value=info()){return value.release?'Version '+value.appVersion+(value.appVersion!==value.release?' · viewer release '+value.release:''):'Development checkout · not a packaged release';}
 function showAbout(){
  const d=root.document;if(!d)return;const existing=d.getElementById('pocketKiViewAbout');if(existing){existing.focus();return existing;}
  const value=info(),dialog=d.createElement('dialog');dialog.id='pocketKiViewAbout';dialog.setAttribute('aria-label','About KiCad Online');
  dialog.style.cssText='max-width:min(30rem,calc(100vw - 32px));box-sizing:border-box;padding:20px;border:1px solid #8886;border-radius:12px;color:inherit;background:Canvas;overflow:auto;max-height:85dvh';
  const title=d.createElement('h2');title.textContent='KiCad Online';title.style.cssText='font-size:18px;margin:0 0 8px';
  const version=d.createElement('p');version.textContent=caption(value);version.setAttribute('data-product-version','');
  const platform=d.createElement('small');platform.textContent=value.platform+(value.label?' · '+value.label:'');
  const description=d.createElement('p');description.textContent='Independent schematic, PCB and 3D project review. Not affiliated with the KiCad project.';
  const links=d.createElement('p');if(value.release){const release=d.createElement('a');release.textContent='Release notes · v'+value.release;release.href='https://github.com/wayri/KiCad-Online/releases/tag/v'+value.release;release.target='_blank';release.rel='noopener noreferrer';links.append(release);}
  const close=d.createElement('button');close.type='button';close.textContent='Close';close.style.cssText='font:inherit;padding:5px 12px';close.onclick=()=>dialog.close();
  dialog.append(title,version,platform,description,links,close);dialog.addEventListener('close',()=>dialog.remove());dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  d.body.append(dialog);dialog.showModal();close.focus();return dialog;
 }
 function decorate(){for(const node of root.document?.querySelectorAll('[data-product-version]')||[])node.textContent=caption();for(const node of root.document?.querySelectorAll('[data-product-about]')||[])node.addEventListener('click',showAbout);}
 const api={info,caption,showAbout,decorate};if(typeof module==='object'&&module.exports)module.exports=api;else{root.KiCadProductInfo=api;if(root.document?.readyState==='loading')root.document.addEventListener('DOMContentLoaded',decorate,{once:true});else decorate();}
})(globalThis);
