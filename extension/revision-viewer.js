"use strict";

/* Native extension entry point: no external 2D visualization engine. */

(() => {

  const params=new URLSearchParams(location.search),repository=params.get('repository'),requestedFile=params.get('file');let rootFile=requestedFile,ref=params.get('ref');

  const provider=params.get('provider')||'github',providerContext=provider==='gitlab'?{provider,host:params.get('host')||'https://gitlab.com'}:{};const send=message=>chrome.runtime.sendMessage({...message,...providerContext});
  if(params.get('workspace')==='1')document.body.dataset.workspace='true';
  const status=document.getElementById('status'),pcb=/\.kicad_pcb$/i.test(rootFile||'');

  const loading=globalThis.KiCadLoading?.indicator(document.body);
  const loadController=typeof AbortController==='function'?new AbortController():null;
  let dark=pcb,workspace=null,canvas=null,scene=null,modelAssetCache=null,disposed=false,applying=false,crossApplying=false,lastView='',lastFile='';

  const own=new URL(chrome.runtime.getURL('browser-viewer.html')),ownOrigin=`${own.protocol}//${own.host}`;

  const $=id=>document.getElementById(id);

  const label=(id,text)=>rootLabel($(id),text);

  function rootLabel(node,text){if(globalThis.KiCadUIIcons)KiCadUIIcons.label(node,text);else node.textContent=text;}

  function updateDiagnostics(){const count=[$('engineNotice'),$('reviewNotice')].filter(node=>node&&!node.hidden&&node.textContent).length;if($('diagnostics'))$('diagnostics').hidden=!count;if($('diagnosticCount'))$('diagnosticCount').textContent=count?`${count} rendering / review notes`:'Rendering notes';}

  async function start(){

    if(!KiCadBrowserData.validRepository(repository,provider)||!KiCadBrowserData.validRef(ref)||!KiCadBrowserData.validPath(rootFile))throw new Error('Invalid GitHub design location.');

    const kind=document.body.dataset.viewer;if(kind&&kind!=='auto'&&kind!==(pcb?'pcb':'schematic'))throw new Error('This file belongs in the other dedicated viewer.');

    if(provider==='gitlab'&&!/^[a-f0-9]{40}$/i.test(ref)){const resolved=await send({type:'revision-resolve',repository,ref,file:rootFile});if(!resolved?.ok||!/^[a-f0-9]{40}$/i.test(resolved.result?.sha||''))throw new Error(resolved?.error||'GitLab revision could not be resolved.');ref=resolved.result.sha;}
    loading?.show('Fetching drawing files and discovering sheets…');
    const reply=await send({type:'project',repository,ref,file:rootFile});

    if(!reply?.ok)throw new Error(reply?.error||'Could not retrieve the KiCad project.');

    const files=reply.result;if(!Array.isArray(files)||!files.some(file=>file.path===rootFile))throw new Error('No KiCad file at this revision.');

    if(!pcb){const resolvedRoot=KiCadBrowserData.rootSheetPath(files,requestedFile);if(resolvedRoot)rootFile=resolvedRoot;else if(files.length&&!files.some(file=>file.discoveryWarning))files[0].discoveryWarning='The saved schematic hierarchy has no unambiguous root. Choose a sheet in the navigator.';}
    const focusedEntry=params.has('focusX')&&params.has('focusY')&&['focusX','focusY'].every(key=>Number.isFinite(Number(params.get(key)))&&Math.abs(Number(params.get(key)))<=1e6);
    const initialFile=focusedEntry?requestedFile:rootFile;

    const preferenceKey=JSON.stringify(['kicad-review-preferences',...(provider==='gitlab'?['gitlab',providerContext.host]:[]),repository,rootFile]);

    let preferences={uiTheme:pcb?'dark':'light',drawingTheme:pcb?'dark':'light',rulerUnits:'mm',acceleration:'auto'};

    try{const stored=await chrome.storage?.local?.get(preferenceKey),value=stored?.[preferenceKey];if(value&&['dark','light'].includes(value.uiTheme)&&['dark','light'].includes(value.drawingTheme)&&['mm','mil'].includes(value.rulerUnits))preferences=value;}catch{}

    dark=preferences.drawingTheme==='dark';document.body.dataset.uiTheme=preferences.uiTheme;

    // buildProject enforces source/file/project limits before the geometry parser runs.

    loading?.show('Preparing saved objects and drawing geometry…');
    const prepare=()=>({model:KiCadDesignModel.buildProject(files)});
    const prepared=globalThis.KiCadLoading?await KiCadLoading.run('drawing',{files,rootFile:initialFile,pcb},prepare,{signal:loadController?.signal,onStage:stage=>loading.show(stage)}):prepare();
    if(disposed)return;
    if(prepared.rules)Object.defineProperty(prepared.model,'_rules',{value:new Map(prepared.rules)});

    if($('refBadge')){$('refBadge').textContent=ref.length>20?ref.slice(0,17)+'…':ref;$('refBadge').title=ref;}

    const designs=new Map(prepared.design?[[initialFile,prepared.design]]:[]),host=$('drawingHost');globalThis.KiCadUIIcons?.decorate();$('frameControls').hidden=false;

    canvas=KiCadOwnedCanvas.mount(host,{dark,pcb,acceleration:preferences.acceleration});status.remove();

    const currentFile=()=>canvas.document?.filename||initialFile;

    const report=force=>{

      if(applying||scene||disposed)return;

      const view=KiCadViewState.read(canvas.viewport.camera),file=currentFile();if(!view)return;

      const signature=JSON.stringify([file,view.x,view.y,view.zoom]);if(!force&&signature===lastView)return;

      const phase=lastFile===file?'change':'ready';lastView=signature;lastFile=file;

      parent.postMessage({type:'kicad-review:view',phase,file,view},ownOrigin);

    };

    const afterFrame=()=>{workspace?.draw();if(!scene&&$('renderMode'))$('renderMode').textContent=canvas.motionActive?'2D · WebGL':'2D';host.dataset.renderBackend=canvas.motionActive?'webgl-motion':'canvas2d';if($('accelerationStatus'))$('accelerationStatus').textContent=canvas.motionFailed?'WebGL unavailable; using Canvas2D.':canvas.acceleration==='off'?'Canvas2D only.':'WebGL gesture previews on large drawings when available; source geometry is redrawn after each gesture.';if($('viewScale'))$('viewScale').textContent=Math.round(canvas.viewport.camera.zoom/4*100)+'%';if($('drawingViewLabel'))$('drawingViewLabel').textContent=canvas.netHighlight?(canvas.highlightCount>1?`${canvas.highlightCount} highlight groups`:canvas.netHighlight.name?'Highlighted net · '+canvas.netHighlight.name:'Highlighted components'):canvas.paperVisible?(pcb?'PCB worksheet':'Schematic sheet'):'Board view';report(false);};
    const originalDraw=canvas.draw.bind(canvas);canvas.draw=()=>{originalDraw();afterFrame();};canvas.addEventListener('kicad:viewframe',afterFrame);

    canvas.canvas.addEventListener?.('pointermove',event=>{const rect=canvas.canvas.getBoundingClientRect(),point=canvas.viewport.camera.screen_to_world({x:event.clientX-rect.left,y:event.clientY-rect.top});if($('cursorCoords'))$('cursorCoords').textContent=`${point.x.toFixed(2)}, ${point.y.toFixed(2)} mm`;});

    const focus=position=>{

      if(!position||![position.x,position.y].every(Number.isFinite)||Math.abs(position.x)>1e6||Math.abs(position.y)>1e6||scene)return false;

      canvas.resize();const c=canvas.viewport.camera,b=c.bbox,w=Math.max(12,Math.min(40,b.w)),h=Math.max(12,Math.min(40,b.h));c.bbox={x:position.x-w/2,y:position.y-h/2,w,h};canvas.draw();return true;

    };

    const layerList=$('layerList');

    function layers(){

      if(!layerList)return;layerList.replaceChildren();$('layerPanel').hidden=!pcb;

      const query=($('layerSearch').value||'').trim().toLowerCase();

      for(const layer of canvas.design.layers||[]){

        if(!layer.toLowerCase().includes(query))continue;

        const row=document.createElement('div'),label=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span'),button=document.createElement('button');

        row.className='layer-row';row.dataset.focused=String(canvas.focusedLayer===layer);input.type='checkbox';input.checked=canvas.visibleLayers.has(layer);text.textContent=layer;label.className='check';

        const swatch=document.createElement('span');swatch.className='layer-swatch';swatch.style.background=KiCadPCBRenderer.colorFor?.(layer)||canvas.design.primitives.find(p=>p.layer===layer)?.color||'#8c9cab';

        input.onchange=()=>{input.checked?canvas.visibleLayers.add(layer):canvas.visibleLayers.delete(layer);if(!input.checked&&canvas.focusedLayer===layer)canvas.focusedLayer=null;layers();canvas.draw();};

        label.append(input,swatch,text);button.textContent='Focus';button.setAttribute('aria-label','Focus layer '+layer);button.setAttribute('aria-pressed',String(canvas.focusedLayer===layer));button.disabled=Boolean(scene);

        button.onclick=()=>{canvas.focusLayer(layer,$('layerFocusMode').value||'dim');layers();canvas.draw();};row.append(label,button);layerList.append(row);

      }

      $('layerFocusStatus').textContent=canvas.focusedLayer?`${canvas.focusedLayer} · ${canvas.layerFocusMode==='isolate'?'isolated':'other visible layers dimmed'}`:'No layer focus';

      $('fitLayer').disabled=!canvas.focusedLayer||Boolean(scene);$('clearLayerFocus').disabled=!canvas.focusedLayer||Boolean(scene);$('layersRestore').disabled=!canvas.layerSnapshot||Boolean(scene);

    }

    $('layerSearch').oninput=layers;

    $('layerFocusMode').onchange=()=>{if(canvas.focusedLayer)canvas.focusLayer(canvas.focusedLayer,$('layerFocusMode').value);layers();canvas.draw();};

    for(const [id,preset] of [['layersAll','all'],['layersNone','none'],['layersFront','front'],['layersBack','back'],['layersCopper','copper']])$(id).onclick=()=>{if(scene)return;canvas.layerPreset(preset);layers();canvas.draw();};

    $('layersRestore').onclick=()=>{canvas.restoreLayers();layers();canvas.draw();};

    $('clearLayerFocus').onclick=()=>{canvas.focusedLayer=null;layers();canvas.draw();};

    $('fitLayer').onclick=()=>{if(!canvas.fitLayer())$('layerFocusStatus').textContent='No drawable geometry on the focused layer.';canvas.draw();};

    function openSheet(path,position){

      if(scene)return;const file=files.find(source=>source.path===path);if(!file)throw new Error('The referenced sheet is absent.');

      if(/\.kicad_pcb$/i.test(path)!==pcb)throw new Error('Cannot mix board and schematic drawings.');

      if(!designs.has(path)){const ast=KiCadDesignDiff.parse(file.content),engine=pcb?KiCadPCBRenderer:KiCadSchematicRenderer;const sheets=files.filter(source=>/\.kicad_sch$/i.test(source.path));designs.set(path,engine.build(ast,path,{sheetNumber:sheets.findIndex(source=>source.path===path)+1,sheetCount:sheets.length,sheetName:path===rootFile?"/":"/"+path.split("/").at(-1).replace(/\.kicad_sch$/i,"")+"/"}));}

      canvas.setDocument(designs.get(path),path);layers();workspace?.attachCanvas(canvas);workspace?.draw();

      $('engineNotice').textContent=canvas.design.warnings?.join(' ')||'';$('engineNotice').hidden=!$('engineNotice').textContent;updateDiagnostics();

      if(position)focus(position);

    }

    loading?.show('Displaying drawing…');
    await globalThis.KiCadLoading?.paint();
    if(disposed)return;
    workspace=KiCadReviewWorkspace.mount({initialModel:prepared.model,initialDesign:prepared.design,initialNetModel:prepared.nets,files,repository,provider,host:providerContext.host,ref,rootFile,pcb,pairedFile:params.get('pairedFile')||undefined,getCanvas:()=>canvas,currentFile,focus,openSheet,getRulerUnits:()=>preferences.rulerUnits,

      getDesigns:()=>designs,updateDiagnostics,
      onHierarchy(hierarchy){if(!disposed)parent.postMessage({type:'kicad-review:hierarchy',repository,ref,hierarchy},ownOrigin);},
      onSelection(selection){if(crossApplying||!globalThis.KiCadPairedReview?.validSelection(selection))return;if(globalThis.KiCadVSCodeBridge?.selection)globalThis.KiCadVSCodeBridge.selection(selection);else parent.postMessage({type:'kicad-review:selection',selection},ownOrigin);},
      onCommentsChanged(){if(globalThis.KiCadVSCodeBridge?.onCommentsChanged)globalThis.KiCadVSCodeBridge.onCommentsChanged();else parent.postMessage({type:'kicad-review:comments-changed'},ownOrigin);},pullNumber:Number(params.get('pullNumber'))||null,pullRepository:params.get('pullRepository')||repository});

    workspace.attachCanvas(canvas);openSheet(initialFile);loading?.hide();

    $('frameControls').hidden=false;label('fitDrawing',pcb?'Fit board':'Fit drawing');

    const fit=kind=>{if(scene)return;kind==='page'?canvas.zoom_to_page():canvas.zoom_to_board();canvas.draw();};

    const zoom=factor=>{if(scene)return;const c=canvas.viewport.camera;c.zoom=Math.max(.001,Math.min(10000,c.zoom*factor));canvas.draw();};

    $('fitDrawing').onclick=()=>fit('drawing');$('fitPage').onclick=()=>fit('page');$('zoomIn').onclick=()=>zoom(1.25);$('zoomOut').onclick=()=>zoom(1/1.25);

    $('themeButton').title=pcb?'Toggle board theme (D)':'Toggle paper theme (D)';$('themeButton').setAttribute('aria-pressed',String(dark));

    const savePreferences=()=>chrome.storage?.local?.set({[preferenceKey]:preferences}).catch(error=>{$('pageSetupStatus').textContent=error.message;});

    const applyTheme=()=>{dark=preferences.drawingTheme==='dark';canvas.dark=dark;canvas.acceleration=preferences.acceleration==='off'?'off':'auto';scene?.setTheme(dark);document.body.dataset.uiTheme=preferences.uiTheme;$('uiTheme').value=preferences.uiTheme;$('drawingTheme').value=preferences.drawingTheme;$('rulerUnits').value=preferences.rulerUnits;if($('acceleration'))$('acceleration').value=canvas.acceleration;$('themeButton').setAttribute('aria-pressed',String(dark));if($('displayPreset'))$('displayPreset').value=preferences.uiTheme==='light'&&preferences.drawingTheme===(pcb?'dark':'light')?'kicad':preferences.uiTheme===preferences.drawingTheme?preferences.uiTheme:'custom';if(!scene)canvas.draw();};

    $('themeButton').onclick=()=>{preferences.drawingTheme=dark?'light':'dark';applyTheme();savePreferences();};

    for(const [id,key] of [['uiTheme','uiTheme'],['drawingTheme','drawingTheme'],['rulerUnits','rulerUnits']])$(id).onchange=()=>{preferences[key]=$(id).value;applyTheme();savePreferences();};applyTheme();
    if($('acceleration'))$('acceleration').onchange=()=>{preferences.acceleration=$('acceleration').value;applyTheme();savePreferences();};

    if($('displayPreset'))$('displayPreset').onchange=()=>{const preset=$('displayPreset').value;if(preset==='custom')return;preferences.uiTheme=preset==='dark'?'dark':'light';preferences.drawingTheme=preset==='kicad'?(pcb?'dark':'light'):preset;applyTheme();savePreferences();};

    const savedPages=new Map();

    function populatePage(){const page=canvas.design.page,title=page.titleBlock||{};for(const id of ['pageWidth','pageHeight'])$(id).disabled=Boolean(KiCadReviewTools.papers[page.format]);$('pageFormat').value=KiCadReviewTools.papers[page.format]?page.format:'User';$('pageWidth').value=page.width;$('pageHeight').value=page.height;$('pagePortrait').checked=page.height>page.width;for(const key of ['Title','Company','Date','Rev'])$('page'+key).value=title[key.toLowerCase()]||'';for(let i=0;i<9;i++)$('pageComment'+i).value=title.comments?.[i]||'';$('pageSetupStatus').textContent='Display settings for '+currentFile();}

    const closeSettings=()=>{$('viewerSettings').hidden=true;$('settingsButton').setAttribute('aria-expanded','false');$('settingsButton').focus?.();};$('settingsButton').setAttribute('aria-controls','viewerSettings');$('settingsButton').setAttribute('aria-expanded','false');$('settingsButton').onclick=()=>{if(!$('viewerSettings').hidden){closeSettings();return;}populatePage();$('viewerSettings').hidden=false;$('settingsButton').setAttribute('aria-expanded','true');$('displayPreset')?.focus?.();};$('closeSettings').onclick=closeSettings;

    $('pageFormat').onchange=()=>{const size=KiCadReviewTools.papers[$('pageFormat').value];if(size){$('pageWidth').value=size[0];$('pageHeight').value=size[1];}for(const id of ['pageWidth','pageHeight'])$(id).disabled=Boolean(size);};

    const replacePage=page=>{const design=canvas.design;design.page=page;design.primitives=[...design.primitives.filter(p=>!p.frame),...KiCadWorksheet.build(page,currentFile(),{sheetNumber:files.findIndex(f=>f.path===currentFile())+1,sheetCount:files.length})];canvas.primitives=design.primitives;canvas.zoom_to_page();canvas.draw();};

    $('applyPage').onclick=()=>{try{const page=KiCadReviewTools.page({format:$('pageFormat').value,width:$('pageWidth').value,height:$('pageHeight').value,portrait:$('pagePortrait').checked,title:$('pageTitle').value,company:$('pageCompany').value,date:$('pageDate').value,rev:$('pageRev').value,comments:Array.from({length:9},(_,i)=>$('pageComment'+i).value)});if(!savedPages.has(currentFile()))savedPages.set(currentFile(),canvas.design.page);replacePage(page);$('pageSetupStatus').textContent='Review page applied; the source file is unchanged.';}catch(error){$('pageSetupStatus').textContent=error.message;}};

    $('resetPage').onclick=()=>{const saved=savedPages.get(currentFile());if(saved){replacePage(saved);savedPages.delete(currentFile());}populatePage();};

    $('gridButton').onclick=()=>{canvas.grid=!canvas.grid;$('gridButton').setAttribute('aria-pressed',String(canvas.grid));canvas.draw();};

    $('flipButton').hidden=!pcb;$('flipButton').onclick=()=>{canvas.viewport.camera.flipped=!canvas.viewport.camera.flipped;$('flipButton').setAttribute('aria-pressed',String(canvas.viewport.camera.flipped));canvas.draw();};

    if(pcb){

      modelAssetCache=KiCadBrowserData.createModelAssetCache(async path=>{const result=await send({type:'repo-asset',repository,ref,file:path});if(!result?.ok)throw new Error(result?.error||'Repository model unavailable.');return result.result;});

      const mode=$('mode3d'),pane=$('threePane');mode.hidden=false;let busy=false,loading=null;

      const load=()=>loading||=new Promise((resolve,reject)=>{if(globalThis.SpikeBoard3D?.mountBoard3D){resolve(SpikeBoard3D);return;}const script=document.createElement('script');script.src='vendor/spike-board3d.bundle.js';script.onload=()=>globalThis.SpikeBoard3D?.mountBoard3D?resolve(SpikeBoard3D):reject(new Error('SPIKE 3D did not initialize.'));script.onerror=()=>{loading=null;reject(new Error('SPIKE 3D could not be loaded.'));};document.head.append(script);});

      const lock=value=>{for(const id of ['fitDrawing','fitPage','zoomIn','zoomOut','gridButton','flipButton','applyPage','resetPage'])$(id).disabled=value;};

      mode.onclick=async()=>{

        if(busy)return;if(scene){scene.dispose();scene=null;pane.hidden=true;canvas.canvas.hidden=false;workspace.setScene(null);$('drawingLegend').hidden=false;lock(false);mode.setAttribute('aria-pressed','false');if($('renderMode'))$('renderMode').textContent='2D';canvas.resize();canvas.draw();return;}

        busy=true;mode.disabled=true;

        try{const engine=await load();if(disposed)return;pane.hidden=false;canvas.canvas.hidden=true;

          scene=engine.mountBoard3D(pane,files.find(file=>file.path===rootFile).content,{dark,boardPath:rootFile,loadAsset:modelAssetCache.load,onSelect:record=>workspace?.select3D(record),onComment:record=>workspace?.comment3D(record)});

          workspace.setScene(scene);$('drawingLegend').hidden=true;lock(true);mode.setAttribute('aria-pressed','true');if($('renderMode'))$('renderMode').textContent='3D';

        }catch(error){scene?.dispose();scene=null;pane.hidden=true;canvas.canvas.hidden=false;workspace.setScene(null);$('engineNotice').textContent=error.message;$('engineNotice').hidden=false;updateDiagnostics();}

        finally{busy=false;mode.disabled=false;}

      };

    }

    const related=selection=>{if(!globalThis.KiCadPairedReview?.validSelection(selection))return;crossApplying=true;try{workspace.highlightRelated?.(selection);}finally{crossApplying=false;}};
    addEventListener('kicad-review:related',event=>{if(globalThis.KiCadVSCodeContext)related(event.detail);});
    addEventListener('kicad-review:comments-refresh',()=>{if(globalThis.KiCadVSCodeContext)workspace.refreshComments?.();});
    addEventListener('message',event=>{

      if(event.source!==parent||event.origin!==ownOrigin||event.data?.type!=='kicad-review:command')return;

      const msg=event.data;
      if(msg.command==='open-sheet'){workspace.followSheet?.(msg.file);return;}
      if(msg.command==='refresh-comments'){workspace.refreshComments?.();return;}
      if(msg.command==='highlight-related'){if(!scene||msg.selection?.kind==='part')related(msg.selection);return;}
      if(scene)return;

      if(msg.command==='fit-drawing')fit('drawing');else if(msg.command==='fit-page')fit('page');else if(msg.command==='focus')focus(msg.position);else if(msg.command==='report-view')report(true);

      else if(msg.command==='set-view'&&msg.file===currentFile()){applying=true;try{if(KiCadViewState.apply(canvas.viewport.camera,msg.view))canvas.draw();}finally{applying=false;}}

    });

    addEventListener('keydown',event=>{

      if(event.composedPath().some(node=>node?.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(node?.tagName||''))||event.ctrlKey||event.altKey||event.metaKey)return;
      if(scene){if(event.key.toLowerCase()==='f'||event.key==='Home'){event.preventDefault();scene.fit?.(event.key==='Home');}else if(['+','='].includes(event.key)){event.preventDefault();scene.zoom?.(1.25);}else if(['-','_'].includes(event.key)){event.preventDefault();scene.zoom?.(.8);}return;}

      if(event.key==='Escape'&&!$('viewerSettings').hidden){event.preventDefault();closeSettings();return;}
      if(event.key==='Escape'&&canvas.focusedLayer){canvas.restoreLayers();layers();canvas.draw();}else if(['[',']'].includes(event.key)&&pcb){const choices=canvas.design.layers||[],index=choices.indexOf(canvas.focusedLayer||canvas.activeLayer);if(choices.length){event.preventDefault();canvas.focusLayer(choices[(index+(event.key===']'?1:-1)+choices.length)%choices.length],$('layerFocusMode').value||'dim');layers();canvas.draw();}}else if(event.shiftKey&&event.key.toLowerCase()==='f'&&canvas.focusedLayer){event.preventDefault();$('fitLayer').click();}else if(['+','='].includes(event.key)){event.preventDefault();zoom(1.25);}else if(['-','_'].includes(event.key)){event.preventDefault();zoom(1/1.25);}else if(event.key.toLowerCase()==='f'){event.preventDefault();fit('drawing');}else if(event.key==='Home'){event.preventDefault();fit('page');}else if(event.key.toLowerCase()==='d'){event.preventDefault();$('themeButton').click();}

    });

    if(params.has('focusX')&&params.has('focusY'))focus({x:Number(params.get('focusX')),y:Number(params.get('focusY'))});

  }

  addEventListener('pagehide',()=>{disposed=true;loadController?.abort();loading?.dispose();modelAssetCache?.clear();workspace?.dispose();scene?.dispose();canvas?.dispose();});

  start().catch(error=>{loading?.hide();if(disposed)return;status.textContent=error.message;status.classList.add('error');if(!status.isConnected)$('drawingHost').append(status);});

})();
