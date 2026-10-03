/* No extension APIs, host bridge or reply channel exists in this sandbox. */
(()=>{'use strict';let initialized=false;
 addEventListener('message',event=>{
  if(initialized||event.source!==parent||event.data?.type!=='kicad-html-preview'||typeof event.data.content!=='string')return;
  initialized=true;
  try{document.getElementById('preview').srcdoc=KiCadHTMLPreview.documentFor(event.data.content);}
  catch(error){document.body.textContent=error.message;}
 });
})();
