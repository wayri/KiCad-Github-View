"use strict";

/* Native extension entry point: no external 2D visualization engine. */

(() => {

  const params=new URLSearchParams(location.search),repository=params.get('repository'),requestedFile=params.get('file');let rootFile=requestedFile,ref=params.get('ref');

  const provider=params.get('provider')||'github',providerContext=provider==='gitlab'?{provider,host:params.get('host')||'https://gitlab.com'}:{};const send=message=>chrome.runtime.sendMessage({...message,...providerContext}).then(reply=>{if(reply?.accessIssue)globalThis.KiCadStartupHealth?.showAccessIssue(reply.accessIssue);return reply;});
  if(params.get('workspace')==='1')document.body.dataset.workspace='true';
  const status=document.getElementById('status'),pcb=/\.kicad_pcb$/i.test(rootFile||'');

  const loadController=typeof AbortController==='function'?new AbortController():null;
  const loadId=globalThis.crypto?.randomUUID?.()||('load-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
  const remoteLoad=!globalThis.KiCadLocalRuntime&&(!globalThis.KiCadVSCodeContext||globalThis.KiCadAndroidRuntime);
  let loadFinished=false;
  const stopLoading=(message='Loading stopped.')=>{if(loadFinished||loadController?.signal.aborted)return;loadController?.abort(Object.assign(new Error(message),{name:'AbortError'}));};
  const loading=globalThis.KiCadLoading?.indicator(document.body,{onStop:()=>stopLoading()});
  function loadWait(promise){return new Promise((resolve,reject)=>{const signal=loadController?.signal,abort=()=>reject(signal?.reason||Object.assign(Error('Loading stopped.'),{name:'AbortError'}));if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});Promise.resolve(promise).then(value=>{signal?.removeEventListener('abort',abort);signal?.aborted?abort():resolve(value);},error=>{signal?.removeEventListener('abort',abort);reject(error);});});}
  const loadSend=message=>{const pending=send({...message,...(remoteLoad?{loadId}:{})});const signal=loadController?.signal,abort=()=>{if(remoteLoad)void send({type:'load-cancel',loadId}).catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});return loadWait(pending).finally(()=>signal?.removeEventListener('abort',abort));};
  let sheetOverview=null,compatibilityUI=null;
  let dark=pcb,workspace=null,canvas=null,scene=null,modelAssetCache=null,disposed=false,applying=false,crossApplying=false,lastView='',lastFile='';

  const own=new URL(chrome.runtime.getURL('browser-viewer.html')),ownOrigin=`${own.protocol}//${own.host}`;

  const $=id=>document.getElementById(id);

  const label=(id,text)=>rootLabel($(id),text);

  function rootLabel(node,text){if(globalThis.KiCadUIIcons)KiCadUIIcons.label(node,text);else node.textContent=text;}

  function updateDiagnostics(){const count=[$('engineNotice'),$('reviewNotice')].filter(node=>node&&!node.hidden&&node.textContent).length;if($('diagnostics'))$('diagnostics').hidden=!count;if($('diagnosticCount'))$('diagnosticCount').textContent=count?`${count} rendering / review notes`:'Rendering notes';}

  async function start(){

    if(!KiCadBrowserData.validRepository(repository,provider)||!KiCadBrowserData.validRef(ref)||!KiCadBrowserData.validPath(rootFile))throw new Error('Invalid GitHub design location.');

    const kind=document.body.dataset.viewer;if(kind&&kind!=='auto'&&kind!==(pcb?'pcb':'schematic'))throw new Error('This file belongs in the other dedicated viewer.');

    loading?.show('Resolving drawing revision…');
    if(!globalThis.KiCadVSCodeContext&&!/^[a-f0-9]{40}$/i.test(ref)){const resolved=await loadSend({type:'revision-resolve',repository,ref,file:rootFile});if(!resolved?.ok||!/^[a-f0-9]{40}$/i.test(resolved.result?.sha||''))throw new Error(resolved?.error||'Git revision could not be resolved.');ref=resolved.result.sha;}
    loading?.show('Fetching drawing files and discovering sheets…');
    const reply=await loadSend({type:'project',repository,ref,file:rootFile});

    if(!reply?.ok)throw new Error(reply?.error||'Could not retrieve the KiCad project.');

    const files=reply.result;if(!Array.isArray(files)||!files.some(file=>file.path===rootFile))throw new Error('No KiCad file at this revision.');

    if(!pcb){const resolvedRoot=KiCadBrowserData.rootSheetPath(files,requestedFile);if(resolvedRoot)rootFile=resolvedRoot;else if(files.length&&!files.some(file=>file.discoveryWarning))files[0].discoveryWarning='The saved schematic hierarchy has no unambiguous root. Choose a sheet in the navigator.';}
    const focusedEntry=params.has('focusX')&&params.has('focusY')&&['focusX','focusY'].every(key=>Number.isFinite(Number(params.get(key)))&&Math.abs(Number(params.get(key)))<=1e6);
    const initialFile=focusedEntry?requestedFile:rootFile;

    const preferenceKey=JSON.stringify(['kicad-review-preferences',...(provider==='gitlab'?['gitlab',providerContext.host]:[]),repository,rootFile]);

    let preferences={uiTheme:pcb?'dark':'light',drawingTheme:pcb?'dark':'light',rulerUnits:'mm',acceleration:'auto'};

    try{const stored=await loadWait(chrome.storage?.local?.get(preferenceKey)),value=stored?.[preferenceKey];if(value&&['dark','light'].includes(value.uiTheme)&&['dark','light'].includes(value.drawingTheme)&&['mm','mil'].includes(value.rulerUnits))preferences=value;}catch{}

    if(loadController?.signal.aborted)throw loadController.signal.reason;
    dark=preferences.drawingTheme==='dark';document.body.dataset.uiTheme=preferences.uiTheme;

    // buildProject enforces source/file/project limits before the geometry parser runs.

    loading?.show('Preparing saved objects and drawing geometry…');
    const prepare=()=>{
      const snapshot=KiCadDesignDiff.prepareProject(files),model=KiCadDesignModel.buildProject(files,null,snapshot);
      const sheets=files.filter(file=>/\.kicad_sch$/i.test(file.path));
      const design=(pcb?KiCadPCBRenderer:KiCadSchematicRenderer).build(KiCadDesignDiff.preparedFile(snapshot,initialFile),initialFile,{sheetNumber:sheets.findIndex(file=>file.path===initialFile)+1,sheetCount:sheets.length,sheetName:'/'});
      const nets=globalThis.KiCadNetModel?.build(files,new Map([[initialFile,design]]),snapshot);
      return {model,design,nets};
    };
    const prepared=globalThis.KiCadLoading?await KiCadLoading.run('drawing',{files,rootFile:initialFile,pcb},prepare,{signal:loadController?.signal,onStage:stage=>loading.show(stage)}):prepare();
    if(disposed)return;if(loadController?.signal.aborted)throw loadController.signal.reason;
    if(prepared.rules)Object.defineProperty(prepared.model,'_rules',{value:new Map(prepared.rules)});

    if($('refBadge')){$('refBadge').textContent=ref.length>20?ref.slice(0,17)+'…':ref;$('refBadge').title=ref;}

    const designs=new Map(prepared.design?[[initialFile,prepared.design]]:[]),host=$('drawingHost');globalThis.KiCadUIIcons?.decorate();$('frameControls').hidden=false;

    canvas=KiCadOwnedCanvas.mount(host,{dark,pcb,acceleration:preferences.acceleration});status.remove();
    compatibilityUI=globalThis.KiCadFileCompatibility?.mountStatus($('frameControls'),()=>canvas.design?.compatibility);

    const currentFile=()=>canvas.document?.filename||initialFile;

    const report=force=>{

      if(applying||scene||disposed)return;

      const view=KiCadViewState.read(canvas.viewport.camera),file=currentFile();if(!view)return;

      const signature=JSON.stringify([file,view.x,view.y,view.zoom]);if(!force&&signature===lastView)return;

      const phase=lastFile===file?'change':'ready';lastView=signature;lastFile=file;

      parent.postMessage({type:'kicad-review:view',phase,file,view},ownOrigin);

    };

    const setStatusText=(id,value)=>{const node=$(id);if(node&&node.textContent!==value)node.textContent=value;};
    let syncFloatingLayers=()=>{};
    const afterFrame=()=>{syncFloatingLayers();workspace?.draw();if(!scene)setStatusText('renderMode',canvas.motionActive?'2D · WebGL':'2D');const backend=canvas.motionActive?'webgl-motion':'canvas2d';if(host.dataset.renderBackend!==backend)host.dataset.renderBackend=backend;setStatusText('accelerationStatus',canvas.motionFailed?'WebGL unavailable; using Canvas2D.':canvas.acceleration==='off'?'Canvas2D only.':'WebGL gesture previews on large drawings when available; source geometry is redrawn after each gesture.');setStatusText('viewScale',Math.round(canvas.viewport.camera.zoom/4*100)+'%');setStatusText('drawingViewLabel',canvas.netHighlight?(canvas.highlightCount>1?`${canvas.highlightCount} highlight groups`:canvas.netHighlight.name?'Highlighted net · '+canvas.netHighlight.name:'Highlighted components'):canvas.paperVisible?(pcb?'PCB worksheet':'Schematic sheet'):'Board view');report(false);};
    const originalDraw=canvas.draw.bind(canvas);canvas.draw=()=>{originalDraw();afterFrame();};canvas.addEventListener('kicad:viewframe',afterFrame);

    canvas.canvas.addEventListener?.('pointermove',event=>{const rect=canvas.canvas.getBoundingClientRect(),point=canvas.viewport.camera.screen_to_world({x:event.clientX-rect.left,y:event.clientY-rect.top});setStatusText('cursorCoords',`${point.x.toFixed(2)}, ${point.y.toFixed(2)} mm`);});

    const focus=position=>{

      if(!position||![position.x,position.y].every(Number.isFinite)||Math.abs(position.x)>1e6||Math.abs(position.y)>1e6||scene)return false;

      canvas.resize();const c=canvas.viewport.camera,b=c.bbox,w=Math.max(12,Math.min(40,b.w)),h=Math.max(12,Math.min(40,b.h));c.bbox={x:position.x-w/2,y:position.y-h/2,w,h};canvas.draw();return true;

    };

    const layerList=$('layerList');
    // An overlay keeps layer switching available without opening an explorer pane.
    const floatingLayers=document.createElement('div'),floatingButtons=new Map();
    floatingLayers.id='floatingLayerSelector';floatingLayers.className='floating-layer-selector';
    floatingLayers.setAttribute('role','group');floatingLayers.setAttribute('aria-label','PCB layer selector');
    floatingLayers.hidden=true;if(pcb)host.append(floatingLayers);
    let floatingSignature='',floatingToggle=null;
    const compactLayerBar=!globalThis.KiCadAndroidUI;
    if(compactLayerBar)addEventListener('pointerdown',event=>{if(!floatingLayers.contains(event.target)&&floatingToggle){floatingLayers.classList.remove('layers-expanded');floatingToggle.setAttribute('aria-expanded','false');}});
    syncFloatingLayers=()=>{
      const copper=(canvas.design?.layers||[]).filter(layer=>layer.endsWith('.Cu'));
      const hidden=!pcb||Boolean(scene)||!copper.length;if(floatingLayers.hidden!==hidden)floatingLayers.hidden=hidden;if(hidden)return;
      const signature=JSON.stringify(copper);
      if(signature!==floatingSignature){
        floatingSignature=signature;floatingLayers.replaceChildren();floatingButtons.clear();
        const layerOptions=document.createElement('div');
        if(compactLayerBar){
          layerOptions.className='compact-layer-options';floatingToggle=document.createElement('button');floatingToggle.type='button';floatingToggle.className='compact-layer-toggle';floatingToggle.setAttribute('aria-label','Choose PCB layers');floatingToggle.setAttribute('aria-expanded','false');floatingToggle.textContent='Layers';
          floatingToggle.onclick=()=>{const expanded=floatingToggle.getAttribute('aria-expanded')!=='true';floatingToggle.setAttribute('aria-expanded',String(expanded));floatingLayers.classList.toggle('layers-expanded',expanded);};
          floatingLayers.classList.remove('layers-expanded');floatingLayers.append(floatingToggle,layerOptions);
        }
        const add=(name,title,action,color)=>{
          const button=document.createElement('button');button.type='button';button.title=title;
          button.setAttribute('aria-label',title);button.dataset.layer=name;
          if(color){const swatch=document.createElement('span');swatch.className='layer-swatch';swatch.style.background=color;button.append(swatch);}
          const label=document.createElement('span');label.textContent=name;button.append(label);
          button.onclick=()=>{if(scene)return;action();layers();canvas.draw();if(floatingToggle){floatingLayers.classList.remove('layers-expanded');floatingToggle.setAttribute('aria-expanded','false');}};
          floatingButtons.set(name,button);(compactLayerBar?layerOptions:floatingLayers).append(button);
        };
        for(const layer of copper)add(layer,'Show only '+layer,()=>{canvas.focusLayer(layer,'isolate');$('layerFocusMode').value='isolate';},KiCadPCBRenderer.colorFor?.(layer)||'#8c9cab');
        add('All','Show all saved board layers',()=>canvas.layerPreset('all'));
        add('Overview','Restore layer view before focusing',()=>canvas.restoreLayers());
        add('Filled copper','Toggle saved filled copper zones',()=>canvas.setZoneVisibility({filled:canvas.showFilledCopper===false}));
        add('Zone outlines','Toggle saved zone boundary outlines',()=>canvas.setZoneVisibility({outlines:canvas.showZoneOutlines===false}));
        add('Net names','Show saved copper net names in 2D',()=>{preferences.showNetNames=!canvas.showNetNames;applyTheme();savePreferences();});
      }
      for(const [name,button] of floatingButtons){
        const selected=name==='Net names'?canvas.showNetNames===true:name==='Filled copper'?canvas.showFilledCopper!==false:name==='Zone outlines'?canvas.showZoneOutlines!==false:name==='All'?!canvas.focusedLayer&&(canvas.design.layers||[]).every(layer=>canvas.visibleLayers.has(layer)):name==='Overview'?!canvas.focusedLayer&&!canvas.layerSnapshot:canvas.focusedLayer===name;
        if(button.getAttribute('aria-pressed')!==String(selected))button.setAttribute('aria-pressed',String(selected));
      }
      if(floatingToggle&&floatingToggle.textContent!==(canvas.focusedLayer||'Layers'))floatingToggle.textContent=canvas.focusedLayer||'Layers';
    };

    function layers(){

      syncFloatingLayers();if(!layerList)return;layerList.replaceChildren();$('layerPanel').hidden=!pcb;

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

    function buildSheet(path){
      if(!designs.has(path)){
        const file=files.find(source=>source.path===path);
        if(!file)throw new Error('The referenced sheet is absent.');
        const sheets=files.filter(source=>/\.kicad_sch$/i.test(source.path));
        designs.set(path,(pcb?KiCadPCBRenderer:KiCadSchematicRenderer).build(KiCadDesignDiff.parse(file.content),path,{sheetNumber:sheets.findIndex(source=>source.path===path)+1,sheetCount:sheets.length,sheetName:path===rootFile?'/':'/'+path.split('/').at(-1).replace(/\.kicad_sch$/i,'')+'/'}));
      }
      return designs.get(path);
    }
    function openSheet(path,position){
      sheetOverview?.close();

      if(scene)return;const file=files.find(source=>source.path===path);if(!file)throw new Error('The referenced sheet is absent.');

      if(/\.kicad_pcb$/i.test(path)!==pcb)throw new Error('Cannot mix board and schematic drawings.');

      buildSheet(path);

      canvas.setDocument(designs.get(path),path);compatibilityUI?.refresh();layers();workspace?.attachCanvas(canvas);workspace?.draw();

      $('engineNotice').textContent=canvas.design.warnings?.join(' ')||'';$('engineNotice').hidden=!$('engineNotice').textContent;updateDiagnostics();

      if(position)focus(position);

    }

    loading?.show('Displaying drawing…');
    await globalThis.KiCadLoading?.paint();
    if(disposed)return;if(loadController?.signal.aborted)throw loadController.signal.reason;
    workspace=KiCadReviewWorkspace.mount({initialModel:prepared.model,initialDesign:prepared.design,initialNetModel:prepared.nets,files,repository,provider,host:providerContext.host,ref,rootFile,pcb,pairedFile:params.get('pairedFile')||undefined,getCanvas:()=>canvas,currentFile,focus,openSheet,getRulerUnits:()=>preferences.rulerUnits,

      getDesigns:()=>designs,updateDiagnostics,onOverviewHighlights:()=>sheetOverview?.refresh(),
      onHierarchy(hierarchy){if(!disposed)parent.postMessage({type:'kicad-review:hierarchy',repository,ref,hierarchy},ownOrigin);},
      onSelection(selection){if(crossApplying||!globalThis.KiCadPairedReview?.validSelection(selection))return;if(globalThis.KiCadVSCodeBridge?.selection)globalThis.KiCadVSCodeBridge.selection(selection);else parent.postMessage({type:'kicad-review:selection',selection},ownOrigin);},
      onCommentsChanged(){if(globalThis.KiCadVSCodeBridge?.onCommentsChanged)globalThis.KiCadVSCodeBridge.onCommentsChanged();else parent.postMessage({type:'kicad-review:comments-changed'},ownOrigin);},pullNumber:Number(params.get('pullNumber'))||null,pullRepository:params.get('pullRepository')||repository});

    workspace.attachCanvas(canvas);openSheet(initialFile);loading?.hide();
    if(!pcb){
      const gallery=document.createElement('section');gallery.id='sheetOverview';gallery.hidden=true;gallery.setAttribute('aria-label','All schematic sheets');host.append(gallery);
      const heading=document.createElement('header'),title=document.createElement('strong'),back=document.createElement('button'),unselect=document.createElement('button'),clear=document.createElement('button'),fitAll=document.createElement('button'),hierarchyToggle=document.createElement('button'),help=document.createElement('small');
      title.textContent='All sheets';back.type=unselect.type=clear.type=fitAll.type=hierarchyToggle.type='button';back.textContent='Single sheet';unselect.textContent='Unselect';unselect.setAttribute('aria-label','Unselect');clear.textContent='Clear highlights';clear.setAttribute('aria-label','Clear highlights');fitAll.textContent='Fit';hierarchyToggle.textContent='Hierarchy links';hierarchyToggle.title='Show saved parent → child sheet placements';hierarchyToggle.setAttribute('aria-pressed','true');unselect.onclick=()=>$('unselect').click();clear.onclick=()=>$('clearHighlights').click();heading.append(title,back,unselect,clear,fitAll,hierarchyToggle,help);gallery.append(heading);
      const stacks=document.createElement('details'),stackTitle=document.createElement('summary'),stackList=document.createElement('div');stacks.className='sheet-instance-stacks';stackTitle.textContent='Repeated sheets';stacks.append(stackTitle,stackList);heading.insertBefore(stacks,help);
      const surface=document.createElement('div');surface.className='sheet-shared-canvas';gallery.append(surface);
      let overviewView=null,opened=false,ticket=0,composition=null,hierarchyGraph=null;const frontInstances=new Map();
      hierarchyToggle.onclick=()=>{hierarchyToggle.setAttribute('aria-pressed',String(hierarchyToggle.getAttribute('aria-pressed')!=='true'));overviewView?.draw();};
      const clearOverviewSelection=()=>{if(overviewView){overviewView.selected=null;overviewView.draw();}};
      $('unselect').addEventListener('click',clearOverviewSelection);$('clearHighlights').addEventListener('click',clearOverviewSelection);
      const fitOverview=()=>{if(!overviewView||!composition)return;overviewView.resize();overviewView.viewport.camera.bbox={x:-12,y:-4,w:composition.design.page.width+12,h:composition.design.page.height+4};overviewView.draw();};
      const rebuild=async()=>{
        const generation=++ticket,allEntries=workspace.overviewSheets(),entries=allEntries.filter(entry=>entry.sheet);
        const active=entries.some(entry=>workspace.overviewSelection(entry.sheet.path).netActive);
        const limits=entries.flatMap(e=>workspace.overviewSelection(e.sheet.path).limits||[]);
        help.textContent=(active?'Connected sheets only · ':'')+'Pan and zoom · select a net · double-click/tap a sheet to enter'+(entries.some(e=>e.instanceCount>1)?' · Choose a placement in Repeated sheets.':'')+(entries.some(e=>e.instanceTruncated)?' · Instance counts capped at 4,096 placements.':'')+(limits.length?' · '+[...new Set(limits)].join(' '):'');
        const shown=active?entries.filter(entry=>workspace.overviewSelection(entry.sheet.path).netIds.length):entries,rendered=[];
        const repeated=shown.filter(entry=>entry.instanceCount>1);stacks.hidden=!repeated.length;stackList.replaceChildren();
        for(const entry of repeated){const group=document.createElement('section'),name=document.createElement('strong');name.textContent=`${entry.sheet.path} · ${entry.instanceCount} instances`;group.append(name);const selection=workspace.overviewSelection(entry.sheet.path),placements=(entry.placements||[]).filter(p=>!active||!selection.instanceIds?.length||selection.instanceIds.includes(p.id));for(const placement of placements.slice(0,256)){const choice=document.createElement('button');choice.type='button';choice.textContent=placement.label;choice.setAttribute('aria-pressed',String((frontInstances.get(entry.sheet.path)||placements[0]?.id)===placement.id));choice.onclick=()=>{frontInstances.set(entry.sheet.path,placement.id);rebuild();};group.append(choice);}if(placements.length>256){const note=document.createElement('p');note.textContent='First 256 placements shown.';group.append(note);}stackList.append(group);}
        for(const entry of shown){
          await new Promise(resolve=>setTimeout(resolve,0));if(!opened||generation!==ticket)return;
          const path=entry.sheet.path,design=buildSheet(path),nets=KiCadNetModel.build([files.find(file=>file.path===path)],new Map([[path,design]])).nets,selection=workspace.overviewSelection(path);
          const placements=(entry.placements||[]).filter(p=>!active||!selection.instanceIds?.length||selection.instanceIds.includes(p.id));
          const front=placements.find(p=>p.id===frontInstances.get(path))||placements[0];if(front)frontInstances.set(path,front.id);
          rendered.push({path,label:entry.instanceCount>1?path:(entry.sheet.label||path),instanceCount:placements.length||entry.instanceCount,totalInstanceCount:entry.instanceCount,instances:placements.map(p=>p.label),placements:front?[front,...placements.filter(p=>p!==front)]:placements,instanceId:front?.id,instanceLabel:entry.instanceCount>1?front?.label:null,design,groups:KiCadReviewWorkspace.sheetPageHighlights(nets,workspace.overviewSelection(path,front?.id),design,path)});
        }
        if(!opened||generation!==ticket)return;
        composition=KiCadReviewWorkspace.composeSheetOverview(rendered,workspace.overviewNetLinks?.()||[],dark);
        hierarchyGraph=globalThis.KiCadSheetHierarchyLinks?.build(composition.pages)||null;
        const missingTargets=allEntries.filter(entry=>entry.unavailable).length;
        help.textContent+=(hierarchyGraph?' · Teal arrows: saved parent → child sheets.':' · Hierarchy links unavailable.')+' Gold dashed lines: highlighted nets.'+
          (hierarchyGraph&&!hierarchyGraph.links.length&&shown.length>1?' No resolved parent → child link among shown sheets.':'')+
          (missingTargets?` · ${missingTargets} unloaded child target${missingTargets===1?'':'s'} omitted.`:'')+
          (hierarchyGraph?.unresolved?` · ${hierarchyGraph.unresolved} unresolved placement${hierarchyGraph.unresolved===1?'':'s'} omitted.`:'')+
          (hierarchyGraph?.omitted?` · ${hierarchyGraph.omitted} hierarchy link${hierarchyGraph.omitted===1?'':'s'} beyond display limit.`:'');
        if(!overviewView){
          overviewView=KiCadOwnedCanvas.mount(surface,{dark,pcb:false,acceleration:'off'});
          const baseDraw=overviewView.draw.bind(overviewView);overviewView.draw=()=>{
            baseDraw();if(!composition)return;const ctx=overviewView.ctx;if(!ctx)return;
            ctx.save();ctx.setLineDash([6,4]);for(const wire of composition.airwires)overviewView.paint(wire);ctx.restore();
            if(hierarchyToggle.getAttribute('aria-pressed')==='true')globalThis.KiCadSheetHierarchyLinks?.draw(overviewView,hierarchyGraph,dark);
          };
          overviewView.addEventListener('kicad:select',()=>{const hit=overviewView.selected;if(hit?.sourcePath&&hit.uuid)workspace.selectOverviewNet?.(hit.sourcePath,hit.uuid,hit.sourceInstanceId);});
          overviewView.canvas.addEventListener('dblclick',event=>{
            const rect=overviewView.canvas.getBoundingClientRect(),at=overviewView.viewport.camera.screen_to_world({x:event.clientX-rect.left,y:event.clientY-rect.top});
            const page=composition.pages.find(p=>at.x>=p.x&&at.x<=p.x+p.w&&at.y>=p.y&&at.y<=p.y+p.h);if(page){close();workspace.followSheet(page.path);}
          });
        }
        overviewView.dark=dark;overviewView.setDocument(composition.design,'all-sheets');overviewView.paperVisible=false;
        overviewView.setNetHighlights(composition.highlighted.length?[{primitives:composition.highlighted}]:[],{mode:'bright'});fitOverview();
      };
      const close=()=>{if(!opened)return;opened=false;ticket++;gallery.hidden=true;canvas.canvas.hidden=false;overviewView?.dispose();overviewView=null;composition=null;hierarchyGraph=null;toggle.setAttribute('aria-pressed','false');canvas.resize();canvas.draw();};
      const open=()=>{if(opened)return;opened=true;gallery.hidden=false;canvas.canvas.hidden=true;toggle.setAttribute('aria-pressed','true');return rebuild();};
      const toggle=document.createElement('button');toggle.id='allSheetPagesButton';toggle.type='button';toggle.textContent='All sheets';toggle.title='See every loaded schematic page on one canvas';toggle.setAttribute('aria-pressed','false');toggle.onclick=()=>opened?close():open();
      ($('sheetHome')?.parentElement||$('frameControls')).append(toggle);back.onclick=close;fitAll.onclick=fitOverview;
      sheetOverview={open,close,isOpen:()=>opened,toggle:()=>opened?close():open(),refresh(){if(opened)return rebuild();},dispose(){close();$('unselect').removeEventListener('click',clearOverviewSelection);$('clearHighlights').removeEventListener('click',clearOverviewSelection);gallery.remove();toggle.remove();}};globalThis.KiCadSheetOverview=sheetOverview;
      addEventListener('keydown',event=>{if(event.key==='Escape'&&opened){event.preventDefault();close();}});
    }

    $('frameControls').hidden=false;label('fitDrawing',pcb?'Fit board':'Fit drawing');

    const fit=kind=>{if(scene){scene.fit?.(kind==='page');return;}kind==='page'?canvas.zoom_to_page():canvas.zoom_to_board();canvas.draw();};

    const zoom=factor=>{if(scene){scene.zoom?.(factor);return;}const c=canvas.viewport.camera;c.zoom=Math.max(.001,Math.min(10000,c.zoom*factor));canvas.draw();};

    $('fitDrawing').onclick=()=>fit('drawing');$('fitPage').onclick=()=>fit('page');$('zoomIn').onclick=()=>zoom(1.25);$('zoomOut').onclick=()=>zoom(1/1.25);

    $('themeButton').title=pcb?'Toggle board theme (D)':'Toggle paper theme (D)';$('themeButton').setAttribute('aria-pressed',String(dark));

    const savePreferences=()=>chrome.storage?.local?.set({[preferenceKey]:preferences}).catch(error=>{$('pageSetupStatus').textContent=error.message;});

    $('netNamesSetting').hidden=!pcb;$('showNetNames').onchange=()=>{preferences.showNetNames=$('showNetNames').checked;applyTheme();savePreferences();};
    const applyTheme=()=>{canvas.showNetNames=preferences.showNetNames===true;$('showNetNames').checked=canvas.showNetNames;dark=preferences.drawingTheme==='dark';canvas.dark=dark;canvas.acceleration=preferences.acceleration==='off'?'off':'auto';scene?.setTheme(dark);document.body.dataset.uiTheme=preferences.uiTheme;$('uiTheme').value=preferences.uiTheme;$('drawingTheme').value=preferences.drawingTheme;$('rulerUnits').value=preferences.rulerUnits;if($('acceleration'))$('acceleration').value=canvas.acceleration;$('themeButton').setAttribute('aria-pressed',String(dark));if($('displayPreset'))$('displayPreset').value=preferences.uiTheme==='light'&&preferences.drawingTheme===(pcb?'dark':'light')?'kicad':preferences.uiTheme===preferences.drawingTheme?preferences.uiTheme:'custom';if(!scene)canvas.draw();};

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
      let modelIndex=null,assetWarnings=[];
      const safeModelPath=path=>typeof path==='string'&&path.length<=500&&/\.(?:wrl|vrml|glb|step|stp)$/i.test(path)&&!/[\\:\x00-\x1f\x7f?#%]/.test(path)&&path.split('/').every(part=>part&&part!=='.'&&part!=='..');
      const assetPaths=()=>modelIndex||=send({type:'repo-model-index',repository,ref}).then(result=>{
        if(!result?.ok||!Array.isArray(result.result?.paths)){assetWarnings=['Project model inventory is unavailable; explicit relative model paths can still be loaded.'];return [];}
        assetWarnings=Array.isArray(result.result.warnings)?result.result.warnings.filter(w=>typeof w==='string').slice(0,48).map(w=>w.slice(0,500)):[];
        if(result.result.paths.length>2000)assetWarnings.push('Model inventory was limited to 2000 paths.');
        return result.result.paths.slice(0,2000).filter(safeModelPath);
      }).catch(()=>{assetWarnings=['Project model inventory could not be read; explicit relative model paths can still be loaded.'];return [];});

      const load=()=>loading||=new Promise((resolve,reject)=>{if(globalThis.SpikeBoard3D?.mountBoard3D){resolve(SpikeBoard3D);return;}const script=document.createElement('script');script.src='vendor/spike-board3d.bundle.js';script.onload=()=>globalThis.SpikeBoard3D?.mountBoard3D?resolve(SpikeBoard3D):reject(new Error('SPIKE 3D did not initialize.'));script.onerror=()=>{loading=null;reject(new Error('SPIKE 3D could not be loaded.'));};document.head.append(script);});

      const lock=value=>{for(const id of ['gridButton','flipButton','applyPage','resetPage'])$(id).disabled=value;};

      mode.onclick=async()=>{

        if(busy)return;if(scene){scene.dispose();scene=null;pane.hidden=true;canvas.canvas.hidden=false;workspace.setScene(null);$('drawingLegend').hidden=false;lock(false);mode.setAttribute('aria-pressed','false');if($('renderMode'))$('renderMode').textContent='2D';canvas.resize();canvas.draw();return;}

        busy=true;mode.disabled=true;

        try{const engine=await load(),modelPaths=await assetPaths();if(disposed)return;pane.hidden=false;canvas.canvas.hidden=true;

          scene=engine.mountBoard3D(pane,files.find(file=>file.path===rootFile).content,{dark,boardPath:rootFile,assetPaths:modelPaths,assetWarnings,loadAsset:modelAssetCache.load,externalInspector:true,onMeasurementMode:active=>{$("measureButton").setAttribute("aria-pressed",String(active));$("measurementStatus").textContent=active?"3D measurement: select two model surface points.":"";},onSelect:record=>workspace?.select3D(record),onInspect:record=>workspace?.inspect3D(record),onComment:record=>workspace?.comment3D(record)});

          workspace.setScene(scene);syncFloatingLayers();$('drawingLegend').hidden=true;lock(true);mode.setAttribute('aria-pressed','true');if($('renderMode'))$('renderMode').textContent='3D';

        }catch(error){scene?.dispose();scene=null;pane.hidden=true;canvas.canvas.hidden=false;workspace.setScene(null);syncFloatingLayers();$('engineNotice').textContent=error.message;$('engineNotice').hidden=false;updateDiagnostics();}

        finally{busy=false;mode.disabled=false;}

      };

    }

    const related=selection=>{if(!globalThis.KiCadPairedReview?.validSelection(selection))return;crossApplying=true;try{workspace.highlightRelated?.(selection);}finally{crossApplying=false;}};
    addEventListener('kicad-review:related',event=>{if(globalThis.KiCadVSCodeContext)related(event.detail);});
    addEventListener('kicad-review:comments-refresh',()=>{if(globalThis.KiCadVSCodeContext)workspace.refreshComments?.();});
    addEventListener('message',event=>{

      if(event.source!==parent||event.origin!==ownOrigin||event.data?.type!=='kicad-review:command')return;

      const msg=event.data;
      if(msg.command==='restore-controls'){workspace.restoreFocusView?.();return;}
      if(msg.command==='open-sheet'){workspace.followSheet?.(msg.file);return;}
      if(msg.command==='refresh-comments'){workspace.refreshComments?.();return;}
      if(msg.command==='highlight-related'){related(msg.selection);return;}
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

    if(params.get('focusUuid'))workspace?.focusSaved(requestedFile,params.get('focusUuid'));
    if(params.has('focusX')&&params.has('focusY'))focus({x:Number(params.get('focusX')),y:Number(params.get('focusY'))});

  }

  addEventListener('pagehide',()=>{disposed=true;loadController?.abort();loading?.dispose();modelAssetCache?.clear();sheetOverview?.dispose();compatibilityUI?.dispose();workspace?.dispose();scene?.dispose();canvas?.dispose();});

  const deadline=setTimeout(()=>stopLoading('Loading stopped after 5 minutes. Retry or open a smaller project.'),300000);
  start().catch(error=>{loading?.hide();if(disposed)return;workspace?.dispose();canvas?.dispose();$('frameControls').hidden=true;status.textContent=loadController?.signal.aborted?(loadController.signal.reason?.message||'Loading stopped.'):error.message;if(error.name!=='AbortError')status.classList.add('error');const retry=document.createElement('button');retry.type='button';retry.textContent='Retry loading';retry.onclick=()=>location.reload();status.append(retry);if(!status.isConnected)$('drawingHost').append(status);}).finally(()=>{loadFinished=true;clearTimeout(deadline);});

})();
