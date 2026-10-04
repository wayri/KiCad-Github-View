/* Bundled parser worker: no repository requests, credentials or dynamic code. */
'use strict';
importScripts('design-diff.js','design-model.js','file-compatibility.js','worksheet.js','schematic-renderer.js','pcb-renderer.js','net-model.js','project-settings.js');
onmessage=event=>{
  try{
    const {job,payload}=event.data||{};let result;
    if(job==='settings'){
      postMessage({stage:'Reading saved board settings…'});
      result=KiCadProjectSettings.parse(payload.content,{file:payload.file});
    }else if(job==='drawing'){
      postMessage({stage:'Indexing saved project objects…'});
      const {files,rootFile,pcb}=payload,model=KiCadDesignModel.buildProject(files),file=files.find(f=>f.path===rootFile);
      if(!file)throw Error('The requested drawing is absent.');
      postMessage({stage:'Building drawing geometry…'});
      const sheets=files.filter(f=>/\.kicad_sch$/i.test(f.path));
      const design=(pcb?KiCadPCBRenderer:KiCadSchematicRenderer).build(KiCadDesignDiff.parse(file.content),rootFile,{sheetNumber:sheets.findIndex(f=>f.path===rootFile)+1,sheetCount:sheets.length,sheetName:'/'});
      postMessage({stage:'Resolving saved connectivity…'});
      const nets=KiCadNetModel.build(files,new Map([[rootFile,design]]));
      result={model,rules:[...model._rules],design,nets};
    }else throw Error('Unknown preparation job.');
    postMessage({ok:true,result});
  }catch(error){postMessage({ok:false,error:error.message||'KiCad preparation failed.'});}
};
