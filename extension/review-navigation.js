/* Source-bound project search and imported KiCad rule-check navigation. */
((root)=>{
  'use strict';
  function mount(options){
    const $=id=>document.getElementById(id),make=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);return n;};
    const button=(text,fn)=>{const n=make('button',text);n.type='button';n.onclick=fn;return n;};
    const searchHelp=$('projectSearch')?.parentElement?.querySelector?.('.search-help');
    if(searchHelp){const hint=make('p','Patterns: ref:glob:R* or ref:regex:^R[0-9]+$ . Glob * matches any sequence, ? one character, over the whole field. Regex supports literals, character classes, . , ^ $ and single-atom * + ?; use query OR for alternatives. Matching ignores case. Pattern limits produce an explicit error.');hint.className='hint';searchHelp.append(hint);}
    let indexNotes=[],index=null,searchObjects=[],searchNets=[],queryResults=[],reports=[],selectedFinding=null,selectedItem=0,searchBusy=false,disposed=false,epoch=0,reportEpoch=0,identityObjects=null,identitySearch=null,classSettings=null,identities=new Map();
    const status=(text)=>{$('projectSearchStatus').textContent=text;};
    const currentObjects=()=>options.getObjects();
    function buildIndex(objects,nets,classes=null,sheets=[]){
      const networkObjects=nets.map(net=>({id:net.id,path:net.path,kind:'net',label:net.name,position:net.members.find(m=>m.position)?.position,properties:{Net:net.name},netName:net.name}));
      const indexNets=nets.map(net=>({...net,objectIds:[...(net.objectIds||[]),net.id]}));
      const classObjects=[];
      if(classes){const groups=new Map();for(const net of nets)for(const name of KiCadProjectSearch.netClasses(net.name,classes)){const key=JSON.stringify([net.path,name]);if(!groups.has(key))groups.set(key,{path:net.path,name,nets:[]});groups.get(key).nets.push(net);}for(const group of groups.values()){const id=`${group.path}/class:${group.name}`;classObjects.push({id,path:group.path,kind:'netclass',label:group.name,className:group.name,properties:{Class:group.name,Net:group.nets.map(n=>n.name).join(' ')}});for(const net of indexNets)if(group.nets.some(n=>n.id===net.id))net.objectIds.push(id);}}
      return KiCadProjectSearch.createIndex([...objects,...networkObjects,...classObjects],{nets:indexNets,netClasses:classes,sheets});
    }
    function indexFiles(files,settings=[]){
      const model=KiCadDesignModel.buildProject(files),designs=new Map(),warnings=[...(model.warnings||[])];
      for(const file of files){try{const ast=KiCadDesignDiff.parse(file.content),engine=/\.kicad_pcb$/i.test(file.path)?KiCadPCBRenderer:KiCadSchematicRenderer;designs.set(file.path,engine.build(ast,file.path));}catch(error){warnings.push(`${file.path}: ${error.message}`);}}
      const netModel=KiCadNetModel.build(files,designs);warnings.push(...netModel.warnings);
      searchObjects=model.objects;searchNets=netModel.nets;
      let classConfig=null;
      if(settings.length===1&&root.KiCadProjectSearch.parseNetClasses){try{classConfig=KiCadProjectSearch.parseNetClasses(settings[0].content);options.setNetClasses?.(classConfig);}catch(error){warnings.push(error.message);}}
      else if(settings.length>1)warnings.push('Multiple project settings found. Import the desired .kicad_pro file to select its net classes.');
      classSettings=classConfig;index=buildIndex(searchObjects,searchNets,classConfig,model.sheets);
      return warnings;
    }
    function renderSearch(){
      if(!index)index=buildIndex(currentObjects(),options.getNets(),classSettings);
      const result=KiCadProjectSearch.search(index,$('projectSearch').value,{limit:200});queryResults=result.results;
      $('projectResults').replaceChildren();$('projectSearchCount').textContent=result.error?result.error:`${result.total} matches${result.truncated?' (first 200 shown)':''}`;
      for(const match of queryResults){const object=match.object,row=button('',event=>options.selectSearchObject(object,Boolean($('multiHighlight').checked),event));row.className='object-row search-result';
        row.setAttribute('aria-pressed',String(options.isHighlighted?.(object)||false));
        row.append(make('strong',object.label||object.reference||object.kind),make('small',`${object.kind} · ${object.path}`),make('small',(match.snippets||[]).map(s=>typeof s==='string'?s:`${s.field}: ${s.text}`).join(' · ').slice(0,240)));
        $('projectResults').append(row);
      }
      $('projectIndexWarnings').textContent=[...indexNotes,...(result.warnings||[])].join(' ');
    }
    async function loadProject(){
      if(searchBusy)return;searchBusy=true;const ticket=++epoch;$('loadProjectSearch').disabled=true;status('Loading repository/workspace drawings at one source revision…');
      try{const result=await options.request('project-search-files',{repository:options.repository,ref:options.ref,file:options.rootFile});if(disposed||ticket!==epoch)return;
        options.addSearchFiles(result.files);const warnings=indexFiles(result.files,result.settings||[]);
        status(`Indexed ${result.files.length} of ${result.totalDrawings??result.files.length} drawings · ${result.snapshotRef||options.ref}`);
        indexNotes=[...(result.warnings||[]),...warnings.slice(0,30)];renderSearch();updateAssociations();
      }catch(error){status(`Project search could not load: ${error.message}`);}finally{searchBusy=false;$('loadProjectSearch').disabled=false;}
    }
    function identityIndex(){const current=currentObjects();if(identityObjects===current&&identitySearch===searchObjects)return identities;identityObjects=current;identitySearch=searchObjects;identities=new Map();for(const object of [...current,...searchObjects]){if(!object.uuid)continue;let entries=identities.get(object.uuid);if(!entries){entries=new Map();identities.set(object.uuid,entries);}const key=JSON.stringify([object.path,object.id]);if(!entries.has(key))entries.set(key,object);}return identities;}
    function resolveItem(finding,item){
      // Report UUIDs are file scoped; repeated matches never select a guessed sheet.
      if(item.uuid){const entries=identityIndex().get(item.uuid);if(entries?.size===1){const object=entries.values().next().value;return {file:object.path,position:item.position||object.position,object};}}
      return {file:item.file||finding.file,position:item.position};
    }
    function visibleFindings(){const query=$('ruleSearch').value.toLowerCase(),severity=$('ruleSeverity').value;return reports.flatMap(r=>r.findings).filter(f=>(severity==='all'||f.severity===severity)&&($('showExcludedRules').checked||!f.excluded)&&`${f.description} ${f.type} ${f.sheetPath||''}`.toLowerCase().includes(query));}
    function locateFinding(finding,itemIndex=0){
      selectedFinding=finding;selectedItem=itemIndex;const item=finding.items[itemIndex],target=item&&resolveItem(finding,item);
      if(!target?.file||!target.position){$('ruleStatus').textContent='This item has no resolved drawing location. Associate the report sheet or load project drawings to resolve its saved UUID.';options.redraw();renderRules();return;}
      options.locateRule(target);$('ruleStatus').textContent=`${finding.type} · ${target.file} · ${target.position.x.toFixed(3)}, ${target.position.y.toFixed(3)} mm`;renderRules();options.redraw();
    }
    function renderRules(){
      const list=$('ruleResults');list.replaceChildren();const findings=visibleFindings();$('ruleCount').textContent=`${findings.length} saved findings${findings.length>200?' · first 200 listed':''}`;
      for(const finding of findings.slice(0,200)){const section=make('section');section.className='rule-finding'+(selectedFinding===finding?' selected':'');const row=button(`${finding.severity.toUpperCase()} · ${finding.type}`,()=>locateFinding(finding));row.className='rule-title';section.append(row,make('p',finding.description),make('small',`${finding.kind.toUpperCase()} · ${finding.file||finding.sheetPath||'unassociated sheet'}${finding.excluded?' · excluded':''}`));
        for(const [i,item]of finding.items.slice(0,20).entries()){const target=resolveItem(finding,item),action=button(`${i+1}. ${item.description||'Affected item'}${target.file&&target.position?'':' · location unresolved'}`,()=>locateFinding(finding,i));action.className='rule-item';section.append(action);}if(finding.items.length>20)section.append(make('small',`First 20 of ${finding.items.length} items listed. Next item navigates all affected locations.`));list.append(section);
      }
    }
    function renderSheetMappings(){
      $('reportSheetMappings').replaceChildren();
      for(const report of reports)for(const sheet of report.sheets||[]){const label=make('label',`Associate ERC ${sheet.path} (${report.metadata.reportPath})`),select=make('select');select.setAttribute('aria-label',`Drawing for ERC sheet ${sheet.path}`);const empty=make('option','Unassociated');empty.value='';select.append(empty);
        for(const file of options.getFiles().filter(f=>/\.kicad_sch$/i.test(f.path))){const option=make('option',file.path);option.value=file.path;select.append(option);}select.value=sheet.file||'';
        select.onchange=()=>{sheet.file=select.value||null;for(const finding of report.findings.filter(f=>f.sheetUuidPath===sheet.uuidPath)){finding.file=sheet.file;for(const item of finding.items)item.file=sheet.file;}renderRules();options.redraw();};label.append(select);$('reportSheetMappings').append(label);
      }
    }
    function updateAssociations(){const value=$('ruleDrawing').value;$('ruleDrawing').replaceChildren();for(const file of options.getFiles()){const n=make('option',file.path);n.value=file.path;$('ruleDrawing').append(n);}if(options.getFiles().some(f=>f.path===value))$('ruleDrawing').value=value;else $('ruleDrawing').value=options.currentFile();renderSheetMappings();}
    $('projectSearch').oninput=renderSearch;$('loadProjectSearch').onclick=loadProject;
    $('highlightSearchResults').onclick=()=>{options.highlightSearchObjects(queryResults.map(r=>r.object),$('multiHighlight').checked);renderSearch();};
    $('multiHighlight').onchange=()=>options.setMultiHighlight?.($('multiHighlight').checked);
    $('importNetClasses').onclick=()=>$('netClassFile').click();
    $('netClassFile').onchange=async()=>{const file=$('netClassFile').files?.[0];if(!file)return;try{if(file.size>1024*1024)throw new Error('Project settings exceed 1 MiB.');const classes=KiCadProjectSearch.parseNetClasses(await file.text());classSettings=classes;index=buildIndex(searchObjects.length?searchObjects:currentObjects(),searchNets.length?searchNets:options.getNets(),classes);options.setNetClasses?.(classes);status(`Imported net classes from ${file.name}`);renderSearch();}catch(error){status(error.message);}finally{$('netClassFile').value='';}};
    $('importRuleReport').onclick=()=>$('ruleReportFile').click();
    function addReport(text,name){
      if(reports.length>=4)throw new Error('At most four reports per review session; clear reports first.');
      const report=KiCadRuleReports.parse(text,{file:$('ruleDrawing').value,reportPath:name,revision:options.ref});reports.push(report);selectedFinding=null;
      $('ruleProvenance').textContent=reports.map(r=>`${r.metadata.source} · ${r.metadata.date||'date unknown'} · KiCad ${r.metadata.kicadVersion||'unknown'} · imported ${r.metadata.reportPath}`).join(' | ')+'. Report revision is unverified; no ERC/DRC is run in the browser.';
      $('ruleStatus').textContent=report.warnings.join(' ');renderSheetMappings();renderRules();options.redraw();
    }
    $('ruleReportFile').onchange=async()=>{const file=$('ruleReportFile').files?.[0];if(!file)return;try{if(file.size>4*1024*1024)throw new Error('Rule report exceeds 4 MiB.');addReport(await file.text(),file.name);}catch(error){$('ruleStatus').textContent=error.message;}finally{$('ruleReportFile').value='';}};
    $('loadRepoReport').onclick=async()=>{const ticket=++reportEpoch;$('loadRepoReport').disabled=true;$('ruleStatus').textContent='Loading saved repository report…';try{const result=await options.request('rule-report',{repository:options.repository,ref:options.ref,file:options.rootFile,reportPath:$('repoReportPath').value.trim()});if(!disposed&&ticket===reportEpoch)addReport(result.content,result.path);}catch(error){$('ruleStatus').textContent=error.message;}finally{$('loadRepoReport').disabled=false;}};
    for(const id of ['ruleSearch','ruleSeverity','showExcludedRules'])$(id).oninput=()=>{renderRules();options.redraw();};
    $('showRuleMarkers').onchange=()=>options.redraw();
    for(const [id,step]of [['previousRule',-1],['nextRule',1]])$(id).onclick=()=>{const list=visibleFindings();if(!list.length)return;const at=list.indexOf(selectedFinding),next=at<0?(step>0?0:list.length-1):(at+step+list.length)%list.length;locateFinding(list[next]);};
    for(const [id,step]of [['previousRuleItem',-1],['nextRuleItem',1]])$(id).onclick=()=>{if(!selectedFinding?.items.length)return;locateFinding(selectedFinding,(selectedItem+step+selectedFinding.items.length)%selectedFinding.items.length);};
    $('clearRuleReports').onclick=()=>{reports=[];selectedFinding=null;renderSheetMappings();$('ruleStatus').textContent='Reports cleared.';$('ruleProvenance').textContent='Import a saved KiCad JSON ERC or DRC report. Reports may be stale; source files remain unchanged.';renderRules();options.redraw();};
    function draw(overlay,pins,screen,svg){
      if(!$('showRuleMarkers').checked||options.is3D())return;const host=$('drawingHost').getBoundingClientRect();let count=0;
      const findings=visibleFindings();if(findings.includes(selectedFinding)){findings.splice(findings.indexOf(selectedFinding),1);findings.unshift(selectedFinding);}
      for(const finding of findings)for(const [i,item]of finding.items.slice(0,20).entries()){const target=resolveItem(finding,item);if(target.file!==options.currentFile()||!target.position||count++>=200)continue;const point=screen(target.position);if(!point)continue;
        const color=finding.severity==='error'?'#ee5959':'#d78a16',active=selectedFinding===finding&&selectedItem===i,x=Math.max(14,Math.min(host.width-14,point.x)),y=Math.max(14,Math.min(host.height-14,point.y));
        if(active){const start={x:Math.max(16,Math.min(host.width-16,x+55)),y:Math.max(16,y-45)};overlay.append(svg('line',{x1:start.x,y1:start.y,x2:x,y2:y,stroke:color,'stroke-width':3}),svg('path',{d:`M ${x-7} ${y-12} L ${x} ${y} L ${x+7} ${y-12}`,fill:'none',stroke:color,'stroke-width':3}));}
        const marker=button(active?'➤':'!',()=>{options.showRules();locateFinding(finding,i);});marker.className='pin rule-marker'+(active?' active':'');marker.style.left=x+'px';marker.style.top=y+'px';marker.style.background=color;marker.setAttribute('aria-label',`${finding.kind.toUpperCase()} ${finding.severity}: ${finding.description}; ${item.description}`);marker.title=`${finding.description}${x!==point.x||y!==point.y?' · offscreen: click to locate':''}`;pins.append(marker);
      }
    }
    updateAssociations();renderRules();
    return {renderSearch,renderRules,updateAssociations,draw,dispose(){disposed=true;epoch++;reportEpoch++;}};
  }
  root.KiCadReviewNavigation={mount};
  if(typeof module==='object'&&module.exports)module.exports=root.KiCadReviewNavigation;
})(globalThis);
