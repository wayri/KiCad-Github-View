/* Dedicated schematic/PCB review workspace. Source drawings are never edited. */
((root) => {
  "use strict";
  function resolveObject(objects, file, item) {
    const seen = new Set();
    for (let node = item, depth = 0; node && depth < 8 && !seen.has(node); node = node.parent, depth++) {
      seen.add(node);
      const uuid = node.uuid ?? node.tstamp ?? node.unique_id;
      if (typeof uuid === "string") {
        const matches = objects.filter((part) => part.path === file && part.uuid === uuid);
        if (matches.length === 1) return matches[0];
      }
    }
    const reference = item?.ref || item?.reference;
    const matches = reference && objects.filter((part) => part.path === file && part.reference === reference && !part.parentId);
    return matches?.length === 1 ? matches[0] : null;
  }
  function measurement(a, b) {
    if (![a?.x,a?.y,b?.x,b?.y].every(Number.isFinite)) return null;
    const dx = b.x - a.x, dy = b.y - a.y;
    return {dx, dy, distance: Math.hypot(dx, dy)};
  }
  // Literal field queries: quoted phrases, field:value and -excluded terms.
  function matchesSearch(item, query, nets=[]) {
    const fields={ref:item.reference||item.properties?.Reference||'',value:item.properties?.Value||'',type:item.kind,sheet:item.path,net:nets.join(' '),footprint:item.properties?.Footprint||item.properties?.['Library ID']||''};
    for(const [key,value] of Object.entries(item.properties||{}))fields[key.toLowerCase()]=String(value);
    const all=[item.label,...Object.values(fields)].join(' ').toLowerCase();
    const tokens=String(query).slice(0,2000).match(/-?(?:[^\s" ]+:)?"[^"]*"|\S+/g)||[];
    return tokens.every(token=>{const exclude=token[0]==='-';if(exclude)token=token.slice(1);const colon=token.indexOf(':');const key=colon>0?token.slice(0,colon).toLowerCase():null;const term=(key?token.slice(colon+1):token).replace(/^"|"$/g,'').toLowerCase();const found=String(key?fields[key]??'':all).toLowerCase().includes(term);return exclude?!found:found;});
  }
  function sheetTarget(item) {
    const name=item.properties?.Sheetfile??item.properties?.['Sheet file'];if(typeof name!=='string'||!name||/[\\:]/.test(name)||name.startsWith('/'))return null;
    const parts=item.path.split('/');parts.pop();for(const part of name.split('/')){if(part==='..'){if(!parts.length)return null;parts.pop();}else if(part!=='.'&&part)parts.push(part);}return parts.join('/');
  }
  // File hierarchy, with query ancestors retained and bounded cycle traversal.
  function sheetEntries(sheets, links, query = "", collapsed = new Set()) {
    const byPath = new Map(sheets.map(sheet => [sheet.path, sheet]));
    const outgoing = new Map(), incoming = new Map();
    for (const link of links) {
      const target = sheetTarget(link);
      if (!target) continue;
      if (!outgoing.has(link.path)) outgoing.set(link.path, []);
      outgoing.get(link.path).push({link, target});
      if (!incoming.has(target)) incoming.set(target, []);
      incoming.get(target).push(link);
    }
    const term = String(query).trim().toLowerCase(), visible = new Set();
    if (term) {
      for (const sheet of sheets) {
        if (`${sheet.path} ${sheet.label}`.toLowerCase().includes(term)) visible.add(sheet.path);
      }
      for (const link of links) {
        if (`${link.label} ${sheetTarget(link)}`.toLowerCase().includes(term)) {
          visible.add(link.path);
          if (byPath.has(sheetTarget(link))) visible.add(sheetTarget(link));
        }
      }
      const queue = [...visible];
      for (let i = 0; i < queue.length; i++) {
        for (const parent of incoming.get(queue[i]) || []) {
          if (!visible.has(parent.path)) { visible.add(parent.path); queue.push(parent.path); }
        }
      }
    }
    const entries = [], emitted = new Set();
    const visit = (sheet, depth, chain) => {
      if (emitted.has(sheet.path) || chain.has(sheet.path) || depth > 32) return;
      emitted.add(sheet.path);
      const children = outgoing.get(sheet.path) || [];
      if (!term || visible.has(sheet.path)) entries.push({sheet, depth, parents: incoming.get(sheet.path) || [], hasChildren: children.length > 0});
      const next = new Set(chain); next.add(sheet.path);
      for (const {link, target} of children) {
        const child = byPath.get(target);
        if (child) {
          // Mark hidden descendants so the orphan pass cannot re-add collapsed branches.
          const start = entries.length;
          visit(child, depth + 1, next);
          if (!term && collapsed.has(sheet.path)) entries.splice(start);
        } else if ((!term || `${link.label} ${target}`.toLowerCase().includes(term)) && (term || !collapsed.has(sheet.path))) {
          entries.push({link, target, depth: depth + 1, unavailable: true});
        }
      }
    };
    for (const sheet of sheets.filter(sheet => !incoming.has(sheet.path))) visit(sheet, 0, new Set());
    for (const sheet of sheets) if (!emitted.has(sheet.path)) visit(sheet, 0, new Set());
    return entries;
  }
  function sheetHistory(limit=256) {
    let paths=[],index=-1;
    return {visit(path){if(paths[index]===path)return;paths=paths.slice(0,index+1);paths.push(path);if(paths.length>limit)paths.shift();index=paths.length-1;},
      target(delta){return paths[index+delta]??null;},move(delta){if(index+delta<0||index+delta>=paths.length)return null;index+=delta;return paths[index];}};
  }
  function rootSheetPath(start,objects,files) {
    const loaded=new Set(files.filter(file=>/\.kicad_sch$/i.test(file.path)).map(file=>file.path)),seen=new Set();let path=start;
    while(loaded.has(path)&&!seen.has(path)){
      seen.add(path);const parents=[...new Set(objects.filter(o=>o.kind==='sheet'&&sheetTarget(o)===path&&loaded.has(o.path)).map(o=>o.path))];
      if(!parents.length)return path;if(parents.length!==1)return null;path=parents[0];
    }
    return null;
  }
  function symbolUuidFromPath(object) {
    const tree = object?.saved?.tree;
    if (!Array.isArray(tree)) return null;
    const path = tree.find((item) => Array.isArray(item) && item[0] === "path");
    const value = path?.[1]?.quoted ?? path?.[1];
    return typeof value === "string" && /^\/(?:[^/]+\/)*[0-9a-f-]{36}$/i.test(value) ? value.slice(value.lastIndexOf("/") + 1) : null;
  }
  function relatedFallback(objects, selection) {
    if (!selection || selection.kind !== "part" || typeof selection.reference !== "string" || !selection.reference ||
      selection.reference.startsWith("#")) return {error:"No unambiguous part reference is available."};
    const candidates = objects.filter((item) => ["symbol","footprint"].includes(item.kind) && item.reference === selection.reference);
    if (!candidates.length) return {error:`${selection.reference} is not loaded in this view.`};
    if (new Set(candidates.map((item) => item.path)).size > 1) return {error:`${selection.reference} occurs in multiple files; select by saved UUID.`};
    if (candidates.length === 1) return {object:candidates[0]};
    const first = candidates.filter((item) => String(item.properties?.Unit) === "1");
    return first.length === 1 ? {object:first[0]} : {error:`${selection.reference} has multiple matching units.`};
  }
  function mount(options) {
    const { files, repository, ref, rootFile, pcb, getCanvas, currentFile, focus, openSheet } = options;
    const retainedControls=new Map();
    const $ = (id) => {const node=document.getElementById(id)||retainedControls.get(id);if(node)retainedControls.set(id,node);return node;};
    const make = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = String(text); return node; };
    const button = (text, handler) => { const node = make("button", text); node.type = "button"; node.onclick = handler; return node; };
    const provider=options.provider||'github',providerName=provider==='gitlab'?'GitLab':'GitHub',host=provider==='gitlab'?KiCadReviewComments.normalizeScope({provider:'gitlab',host:options.host||'https://gitlab.com',repository,ref,file:rootFile}).host:'https://github.com',providerContext=provider==='gitlab'?{provider,host}:{}, remoteAvailable=['github','gitlab'].includes(provider)&&!root.KiCadVSCodeContext;
    const request = async (type, extra = {}) => { const reply = await chrome.runtime.sendMessage({type, ...extra,...providerContext}); if (!reply?.ok) throw new Error(reply?.error || "The extension could not complete this request."); return reply.result; };
    let config = null, model = KiCadDesignModel.buildProject(files), objects = KiCadDesignModel.applyVariant(model, "default");
    let pointerWorld=null;
    const collapsedSheets = new Set(),sheetVisits=sheetHistory();
    let variant = "default", selected = null, lastFile = null, notes = [], remoteNotes = [], remoteLoad = 0, loadId = 0, editor = null;
    let receiptUser = "local-profile", unreadCursor = -1, policyStatus = null;
    const analyticsCache=new Map(); let dnpHighlight=false;
    let programmaticPick=false;
    let navigation=null,highlightObjects=[],pinnedNets=new Map(),pinnedClasses=new Map(),connectionCursor=-1,activeConnection=null,classConfig=null;
    let sheetMatchCache=null,hierarchySignature='',netModel={nets:[],warnings:[]}, selectedNet=null, netFilterObject=null, navigatorTab="parts", netSource=null;
    const netBuilder=root.KiCadNetModel?.createBuilder?.();
    let showRatsnest=false,ratsnestSource=null,ratsnestResult=null;
    let measureMode = false, measurePoints = [], measurePreview=null, rulerSnap=null, boardMeasure=null, scene = null, attach = null, nativePick = null, rightDown = null,commentMode=null,areaStart=null,areaEnd=null,ignoreClick=false;
    const variantKey = JSON.stringify(["kicad-review-variants", ...(provider==='gitlab'?['gitlab',host]:[]),repository, rootFile]);
    function notice(message) { $("reviewNotice").textContent = message; $("reviewNotice").hidden = !message; options.updateDiagnostics?.(); }
    function commentStatus(message, error = false) { $("commentStatus").textContent = message; $("commentStatus").classList.toggle("error", error); $("githubStatus").textContent=message; $("githubStatus").classList.toggle("error",error); }
    async function refreshCommentPolicy() {if(!remoteAvailable){policyStatus={allowed:false};$('commentPolicyStatus').textContent=provider==='gitlab'?'This VS Code viewer saves notes in your workspace. GitLab account integration is available in the browser extension.':'This workspace saves review notes locally. GitHub account integration is available in the browser extension.';return;}
      $("commentPolicyStatus").textContent="Checking repository comment policy…";
      $("refreshCommentPolicy").disabled=true;
      try {
        const status=await request("comment-policy-status",{repository:options.pullRepository||repository});policyStatus=status;
        if(typeof status?.login==="string"&&(provider==='gitlab'?/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,254}$/:/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/).test(status.login))receiptUser=status.login;
        $("commentPolicyStatus").textContent=`Repository policy: ${status.mode||"unknown"} · ${status.allowed?"you may publish":"publishing restricted"}${status.reason?` · ${status.reason}`:""}. ${providerName} permissions still apply; the extension checks this policy again when publishing.`;
      }catch(error){policyStatus=null;$("commentPolicyStatus").textContent=`Repository policy could not be checked: ${error.message}. Publication will be checked by the extension before posting.`;}
      finally{$("refreshCommentPolicy").disabled=false;renderComments();draw();}
    }
    // Move the shared template's existing controls, retaining their IDs and handlers.
    // This also applies to project, paired and VS Code viewers without copied markup.
    const workspaceElement=$("reviewWorkspace"), sidebarState={properties:false,comments:false,navigator:false};
    const sidebarWidths={properties:300,comments:340,navigator:260};let activeSidebar="properties",commentTab="view",commentCategory="all";
    const sectionState=new Map(),resizeCleanups=[],sidebarHeights={properties:null,comments:null,navigator:null},tallSidebars=new Map(),expandedSidebars=new Set();
    function collapsible(title,nodes,open=true,key=title){
      const details=make("details");details.className="sidebar-section";details.open=sectionState.has(key)?sectionState.get(key):open;
      details.append(make("summary",title),...nodes.filter(Boolean));details.addEventListener("toggle",()=>sectionState.set(key,details.open));return details;
    }
    const commentsSidebar=make("aside");commentsSidebar.id="commentsSidebar";commentsSidebar.className="review-sidebar";commentsSidebar.hidden=true;commentsSidebar.setAttribute("aria-label","Drawing comments");
    const propertiesSidebar=$("designInspector");propertiesSidebar.className="review-sidebar";propertiesSidebar.setAttribute("aria-label","Selection properties");
    const heading=(title,close)=>{const header=make("div");header.className="sidebar-heading";header.append(make("h2",title),close);return header;};
    const closeComments=button("Close",()=>hideSidebar("comments"));closeComments.id="closeComments";closeComments.className="quiet-button";closeComments.setAttribute("aria-label","Collapse comments sidebar");
    $("closeInspector").setAttribute("aria-label","Collapse properties sidebar");
    $("propertiesPane").hidden=false;
    const legacyControls=make("div");legacyControls.hidden=true;legacyControls.append($("showProperties"),$("showComments"),$("showGitHub"));
    const categoryTabs=make('nav');categoryTabs.id='commentCategoryTabs';categoryTabs.className='comment-category-tabs';categoryTabs.setAttribute('role','tablist');categoryTabs.setAttribute('aria-label','Issue and discussion comment categories');
    const categoryContent=make('section');categoryContent.id='commentCategoryContent';categoryContent.setAttribute('role','tabpanel');categoryContent.setAttribute('aria-labelledby','commentCategoryAll');
    const categoryButtons=new Map();
    for(const [type,label]of [['issue','Issues'],['discussion','Discussions'],['all','All']]){const node=button(label,()=>setCommentCategory(type));node.id='commentCategory'+type[0].toUpperCase()+type.slice(1);node.setAttribute('role','tab');node.setAttribute('aria-controls',categoryContent.id);node.setAttribute('aria-selected',String(type==='all'));node.tabIndex=type==='all'?0:-1;categoryButtons.set(type,node);categoryTabs.append(node);}
    function setCommentCategory(type,syncDefault=true){if(!categoryButtons.has(type))return;commentCategory=type;unreadCursor=-1;
      for(const [name,node]of categoryButtons){node.setAttribute('aria-selected',String(name===type));node.tabIndex=name===type?0:-1;}categoryContent.setAttribute('aria-labelledby',categoryButtons.get(type).id);
      // Browsing another category must never silently change an existing draft.
      if(syncDefault&&type!=='all'&&!editor){$('githubCommentType').value=type;chooseCommentType();}
      renderComments();draw();
    }
    categoryTabs.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();event.stopPropagation();const types=[...categoryButtons.keys()],at=types.indexOf(commentCategory),type=event.key==='Home'?types[0]:event.key==='End'?types.at(-1):types[(at+(event.key==='ArrowLeft'?-1:1)+types.length)%types.length];setCommentCategory(type);categoryButtons.get(type).focus();});
    const commentTabs=make("div");commentTabs.className="comment-subtabs";commentTabs.setAttribute("role","tablist");commentTabs.setAttribute("aria-label","Comments");
    const addTab=button("Add comment",()=>showCommentTab("add")),viewTab=button("View comments",()=>showCommentTab("view"));
    const addPane=make("section"),viewPane=make("section");addPane.id="addCommentPane";viewPane.id="viewCommentsPane";
    for(const [tab,id,pane]of [[addTab,"addCommentTab",addPane],[viewTab,"viewCommentsTab",viewPane]]){tab.id=id;tab.setAttribute("role","tab");tab.setAttribute("aria-controls",pane.id);pane.setAttribute("role","tabpanel");pane.setAttribute("aria-labelledby",id);commentTabs.append(tab);}
    const commentTools=make("div");commentTools.className="comment-tools";commentTools.append($("newComment"),$("pointComment"),$("areaComment"));
    const addHelp=make("p","Choose the selected object, a point or an area to add a comment. Your draft stays here when you switch tabs or collapse this sidebar.");addHelp.className="hint";
    addPane.append(addHelp,commentTools,$("commentEditor"));
    const control=id=>$(id).closest?.("label")||$(id);
    const filterFields=make('div');filterFields.className='comment-filter-fields';filterFields.append(...['stateFilter','severityFilter','readFilter','commentSort'].map(control));
    const resetFilters=button('Reset filters',()=>{for(const id of ['stateFilter','severityFilter','readFilter'])$(id).value='all';$('commentSort').value='severity';$('commentSearch').value='';$('commentCreatedFrom').value=$('commentCreatedTo').value='';unreadCursor=-1;renderComments();draw();});resetFilters.id='resetCommentFilters';
    const filterActions=make('div');filterActions.className='comment-tools';filterActions.append($('nextUnread'),resetFilters);
    const filterHelp=make('p','Closed includes Resolved and Won’t fix review notes. GitHub/GitLab thread status is separate.');filterHelp.className='hint';
    const filterGroup=collapsible('Filter and sort comments',[filterFields,$('commentSearch'),filterActions,filterHelp],true,'comment-filters');filterGroup.id='commentFilters';
    const dates=make('div');dates.className='comment-date-fields';for(const [id,label]of [['commentCreatedFrom','Created from (UTC)'],['commentCreatedTo','Created through (UTC)']]){const field=make('label',label),input=make('input');input.id=id;input.type='date';field.append(input);dates.append(field);input.onchange=()=>{unreadCursor=-1;renderComments();draw();};}filterGroup.append(dates);
    const commentSettings=make('section');commentSettings.id='commentSettings';commentSettings.hidden=true;commentSettings.append(filterGroup);
    const commentGear=button('Settings',()=>{commentSettings.hidden=!commentSettings.hidden;commentGear.setAttribute('aria-expanded',String(!commentSettings.hidden));});commentGear.id='commentSettingsButton';commentGear.className='icon-only';commentGear.setAttribute('data-icon','gear');commentGear.setAttribute('aria-label','Comment settings and date filters');commentGear.setAttribute('aria-expanded','false');commentGear.setAttribute('aria-controls','commentSettings');categoryTabs.append(commentGear);

    const storageGroup=collapsible("Import and export",[$("exportComments"),$("importComments"),$("commentFile")],false,"comment-storage");
    const collaborationGroup=collapsible(`${providerName} collaboration`,[$("githubPane")],false,"collaboration");collaborationGroup.id="commentCollaboration";$("githubPane").hidden=false;
    const commentHelp=$("commentsPane").querySelector?.("p.hint");
    viewPane.append(...[commentHelp,$("commentList"),storageGroup,collaborationGroup].filter(Boolean));
    categoryContent.append(commentTabs,addPane,viewPane,$("commentStatus"));$("commentsPane").replaceChildren(categoryTabs,commentSettings,categoryContent);
    commentsSidebar.append(heading("Comments",closeComments),$("commentsPane"),legacyControls);workspaceElement.append(commentsSidebar);
    propertiesSidebar.replaceChildren(heading("Properties",$("closeInspector")),$("propertiesPane"));
    const ruleWindow=make('section'),ruleHeader=make('header'),ruleTitle=make('h2');
    ruleWindow.id='ruleWindow';ruleWindow.className='rule-window';ruleWindow.hidden=true;ruleWindow.setAttribute('role','dialog');ruleWindow.setAttribute('aria-modal','false');ruleWindow.setAttribute('aria-labelledby','ruleWindowTitle');
    ruleHeader.id='ruleWindowHeader';ruleHeader.className='rule-window-header';ruleHeader.tabIndex=0;ruleHeader.title='Drag to move, or use arrow keys while this header is focused';ruleHeader.setAttribute('aria-label','Move check results window with arrow keys');
    ruleTitle.id='ruleWindowTitle';ruleTitle.textContent=pcb?'Design Rules Checker · DRC':'Electrical Rules Checker · ERC';
    const ruleToggle=button('Minimize',()=>{const minimized=!$('rulesPane').hidden;$('rulesPane').hidden=minimized;ruleToggle.textContent=minimized?'Restore':'Minimize';ruleWindow.classList.toggle('minimized',minimized);});ruleToggle.id='minimizeRuleWindow';
    const ruleClose=button('Close',()=>{ruleWindow.hidden=true;ruleButton.setAttribute('aria-expanded','false');ruleButton.focus();});ruleClose.id='closeRuleWindow';ruleClose.setAttribute('aria-label','Close check results window');
    ruleHeader.append(ruleTitle,ruleToggle,ruleClose);ruleWindow.append(ruleHeader,$('rulesPane'));workspaceElement.append(ruleWindow);
    const reportSources=collapsible('Load saved KiCad report',[$('importRuleReport'),$('ruleReportFile'),$('ruleDrawing').closest?.('label')||$('ruleDrawing'),$('repoReportPath').closest?.('label')||$('repoReportPath'),$('loadRepoReport'),$('reportSheetMappings')],true,'rule-sources');reportSources.id='ruleReportSources';
    const reportHint=make('p','Saved KiCad results · the browser does not run live ERC/DRC.');reportHint.className='hint';
    const ruleFilters=make('div');ruleFilters.className='rule-window-filters';ruleFilters.append($('ruleSeverity').closest?.('label')||$('ruleSeverity'),$('ruleSearch'),$('showExcludedRules').closest?.('label')||$('showExcludedRules'),$('showRuleMarkers').closest?.('label')||$('showRuleMarkers'));
    const ruleActions=make('div');ruleActions.className='inspector-actions';ruleActions.append(...['previousRule','nextRule','previousRuleItem','nextRuleItem','clearRuleReports'].map($));
    $('rulesPane').replaceChildren(reportHint,reportSources,$('ruleProvenance'),ruleFilters,ruleActions,$('ruleCount'),$('ruleStatus'),$('ruleResults'));

    const ruleButton=button(pcb?'DRC':'ERC',()=>showRuleWindow());ruleButton.id='viewRuleChecks';ruleButton.setAttribute('data-icon','rules');ruleButton.setAttribute('aria-label',pcb?'View DRC findings':'View ERC findings');ruleButton.title='View saved KiCad check results in a floating window';ruleButton.setAttribute('aria-expanded','false');ruleButton.setAttribute('aria-controls','ruleWindow');$('settingsButton').parentElement.insertBefore(ruleButton,$('settingsButton'));
    let rulePosition={x:20,y:20},ruleDrag=null,rulePlaced=false;
    function placeRuleWindow(){
      const area=workspaceElement.getBoundingClientRect(),maxW=Math.max(1,area.width-16),maxH=Math.max(1,area.height-16);
      if(!rulePlaced){ruleWindow.style.width=Math.min(480,maxW)+'px';ruleWindow.style.height=Math.min(480,maxH)+'px';rulePlaced=true;}
      ruleWindow.style.maxWidth=maxW+'px';ruleWindow.style.maxHeight=maxH+'px';
      const width=Math.min(parseFloat(ruleWindow.style.width)||480,maxW),height=ruleWindow.classList.contains('minimized')?38:Math.min(parseFloat(ruleWindow.style.height)||480,maxH);
      rulePosition.x=Math.max(0,Math.min(area.width-width,rulePosition.x));rulePosition.y=Math.max(0,Math.min(area.height-height,rulePosition.y));
      ruleWindow.style.left=rulePosition.x+'px';ruleWindow.style.top=rulePosition.y+'px';
    }
    function showRuleWindow(){restoreFocusView();ruleWindow.hidden=false;$('rulesPane').hidden=false;ruleWindow.classList.remove('minimized');ruleToggle.textContent='Minimize';ruleButton.setAttribute('aria-expanded','true');placeRuleWindow();navigation?.renderRules();ruleHeader.focus();}
    ruleHeader.addEventListener('pointerdown',event=>{if(event.button!==0||event.target?.closest?.('button'))return;event.preventDefault();ruleDrag={id:event.pointerId,x:event.clientX,y:event.clientY,position:{...rulePosition}};ruleHeader.setPointerCapture?.(event.pointerId);});
    ruleHeader.addEventListener('pointermove',event=>{if(!ruleDrag||event.pointerId!==ruleDrag.id)return;rulePosition={x:ruleDrag.position.x+event.clientX-ruleDrag.x,y:ruleDrag.position.y+event.clientY-ruleDrag.y};placeRuleWindow();});
    const stopRuleDrag=()=>{ruleDrag=null;};for(const type of ['pointerup','pointercancel','lostpointercapture'])ruleHeader.addEventListener(type,stopRuleDrag);
    ruleHeader.addEventListener('keydown',event=>{if(event.target!==ruleHeader||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Escape'].includes(event.key))return;event.preventDefault();event.stopPropagation();if(event.key==='Escape'){ruleClose.click();return;}const delta=event.shiftKey?40:10;rulePosition.x+=(event.key==='ArrowRight'?delta:event.key==='ArrowLeft'?-delta:0);rulePosition.y+=(event.key==='ArrowDown'?delta:event.key==='ArrowUp'?-delta:0);placeRuleWindow();});
    const ruleResize=()=>{if(!ruleWindow.hidden)placeRuleWindow();};root.addEventListener?.('resize',ruleResize);const ruleWindowObserver=typeof ResizeObserver==='function'?new ResizeObserver(ruleResize):null;ruleWindowObserver?.observe(workspaceElement);
    const metadata=collapsible("Severity, state and people",['commentSeverity','commentState','commentTags'].map(id=>$(id).closest?.('label')||$(id)),false,'comment-metadata');$("commentEditor").insertBefore(metadata,$("commentText").closest?.('label')||$("commentText"));
    const mentionPanel=make('div'),mentionQuery=make('input'),mentionSource=make('select'),mentionList=make('div'),mentionStatus=make('p');
    mentionQuery.id='mentionQuery';mentionQuery.placeholder='Find a username or name';mentionQuery.maxLength=64;mentionQuery.setAttribute('aria-label','Find people to mention');
    mentionSource.id='mentionSource';mentionSource.setAttribute('aria-label','Mention account source');
    for(const [value,label]of [['repository',provider==='gitlab'?'Project members':'Contributors and assignees'],['users','Search other users']]){const option=make('option',label);option.value=value;mentionSource.append(option);}mentionSource.value='repository';
    mentionList.id='mentionSuggestions';mentionList.className='mention-suggestions';mentionStatus.id='mentionLookupStatus';mentionStatus.className='hint';mentionStatus.setAttribute('role','status');
    const mentionsInput=$('commentMentions'),mentionsLabel=mentionsInput.closest?.('label')||mentionsInput;let mentionTimer=null,mentionGeneration=0,mentionDisposed=false;
    async function lookupMentions(){const run=++mentionGeneration;mentionList.replaceChildren();if(!remoteAvailable){mentionStatus.textContent='Enter @usernames manually. Account lookup is available in the browser extension.';return;}
      if(mentionSource.value==='users'&&mentionQuery.value.trim().replace(/^@/,'').length<2){mentionStatus.textContent='Type at least two username characters.';return;}
      mentionStatus.textContent='Finding people…';
      try{const result=await request('comment-mention-users',{repository:options.pullRepository||repository,query:mentionQuery.value,source:mentionSource.value});if(mentionDisposed||run!==mentionGeneration)return;
        showInlineMentions(result.users||[]);for(const person of result.users||[]){const row=button(`@${person.login}${person.name?' · '+person.name:''} · ${(person.roles||[]).join(', ')}`,()=>{const values=mentionsInput.value.split(/[,\s]+/).map(v=>v.replace(/^@/,'')).filter(Boolean);if(!values.some(v=>v.toLowerCase()===person.login.toLowerCase())){if(values.length>=20){mentionStatus.textContent='At most 20 mentions per comment.';return;}values.push(person.login);}mentionsInput.value=values.map(v=>'@'+v).join(', ');mentionStatus.textContent=`Added @${person.login}. Notifications are sent only when posted.`;});row.className='mention-suggestion';mentionList.append(row);}
        mentionStatus.textContent=[result.users?.length?`${result.users.length} people found.`:'No matches. You can enter a username manually.',...(result.warnings||[])].join(' ');
      }catch(error){if(!mentionDisposed&&run===mentionGeneration)mentionStatus.textContent=error.message;}
    }
    const peopleGroup=collapsible('Mention people',[mentionsLabel,mentionSource,mentionQuery,mentionPanel,mentionStatus],false,'comment-people');mentionPanel.append(mentionList);peopleGroup.id='mentionPeople';
    peopleGroup.addEventListener('toggle',()=>{if(peopleGroup.open)lookupMentions();else{mentionGeneration++;clearTimeout(mentionTimer);}});
    mentionQuery.addEventListener('input',()=>{mentionGeneration++;clearTimeout(mentionTimer);mentionTimer=setTimeout(lookupMentions,300);});mentionSource.onchange=lookupMentions;
    $('commentEditor').insertBefore(peopleGroup,$('commentPublishSettings'));
    const captureControls=$("commentEditor").querySelector?.('.capture-controls');if(captureControls)$("commentEditor").insertBefore(collapsible("Drawing screenshot",[captureControls],false,'comment-capture'),$("commentPublishSettings"));
    // Keep the legacy field IDs for drafts and transport, with a compact composer.
    const composeTop=make('div');composeTop.id='commentComposeTop';composeTop.className='comment-compose-top';composeTop.append(...['editorThreadType','commentSeverity','commentState'].map(id=>$(id).closest?.('label')||$(id)));
    const composeBox=$('commentText').closest?.('label')||$('commentText');$('commentText').placeholder='First line: title\nDescribe the review, @mention people, or paste a screenshot…';
    $('commentText').setAttribute('aria-controls','inlineMentionSuggestions');$('commentText').setAttribute('aria-autocomplete','list');$('commentText').setAttribute('aria-expanded','false');
    const inlineMentions=make('div');inlineMentions.id='inlineMentionSuggestions';inlineMentions.className='inline-mention-suggestions';inlineMentions.setAttribute('role','listbox');inlineMentions.setAttribute('aria-label','Mention suggestions');inlineMentions.hidden=true;
    const legacyFields=make('div');legacyFields.hidden=true;const titleLabel=$('editorTitleLabel');const composerExtras=collapsible('Tags and advanced options',[$('commentTags').closest?.('label')||$('commentTags'),$('editorAccount'),$('editorPreview')],false,'composer-options');composerExtras.id='commentComposerOptions';legacyFields.append(metadata,peopleGroup,titleLabel);
    const screenshotTools=make('div');screenshotTools.className='composer-image';screenshotTools.append(...['captureComment','removeCapture','captureStatus','capturePreview'].map($));
    const postRow=make('div');postRow.id='commentPostRow';postRow.className='comment-post-row';postRow.append($('editorDestination').closest?.('label')||$('editorDestination'),$('postComment'));
    const destinationDetails=make('div');destinationDetails.id='commentDestinationDetails';destinationDetails.append(...['editorNumberLabel','editorCategoryLabel','editorLoadCategories'].map($));
    const publishSettings=$('commentPublishSettings'),markdownPreview=$('editorMarkdown');publishSettings.replaceChildren(destinationDetails,postRow);$('commentEditor').replaceChildren($('commentAnchor'),composeTop,composeBox,inlineMentions,screenshotTools,publishSettings,$('saveComment'),$('cancelComment'),composerExtras,markdownPreview,legacyFields);
    const threadReader=make('section');threadReader.id='commentThreadReader';threadReader.className='comment-thread-reader';threadReader.hidden=!remoteAvailable||provider!=='github';
    const threadControls=make('div');threadControls.className='thread-read-controls';
    const threadKind=make('select');threadKind.id='commentThreadKind';threadKind.setAttribute('aria-label','Read thread type');for(const [value,label]of [['issue','Issue'],['discussion','Discussion']]){const option=make('option',label);option.value=value;threadKind.append(option);}threadKind.value='issue';
    const threadNumber=make('input');threadNumber.id='commentThreadNumber';threadNumber.type='number';threadNumber.min='1';threadNumber.step='1';threadNumber.placeholder='Thread #';threadNumber.setAttribute('aria-label','Read issue or discussion number');
    const threadStatus=make('p');threadStatus.id='commentThreadStatus';threadStatus.className='hint';threadStatus.setAttribute('role','status');
    const threadMessages=make('div');threadMessages.id='commentThreadMessages';
    const threadLoad=button('Load thread',()=>readThread(threadKind.value,Number(threadNumber.value)));threadLoad.id='commentThreadLoad';
    threadControls.append(threadKind,threadNumber,threadLoad);threadReader.append(threadControls,threadStatus,threadMessages);viewPane.insertBefore(threadReader,$('commentList'));
    let threadTicket=0,loadedThread=null;
    function renderThread(){threadMessages.replaceChildren();if(!loadedThread||commentCategory!=='all'&&commentCategory!==loadedThread.kind)return;
      let range;try{range=KiCadReviewComments.createdDateRange($('commentCreatedFrom').value,$('commentCreatedTo').value);}catch(error){threadStatus.textContent=error.message;return;}
      const header=make('header');header.append(make('h3',`${loadedThread.kind==='issue'?'Issue':'Discussion'} #${loadedThread.number}: ${loadedThread.title}`));const link=make('a','Open on GitHub');link.href=loadedThread.url;link.target='_blank';link.rel='noopener noreferrer';header.append(link,button('Reply',()=>{editComment();$('editorThreadType').value=loadedThread.kind;$('editorThreadType').onchange();$('editorDestination').value='existing-'+loadedThread.kind;$('editorThreadNumber').value=String(loadedThread.number);editorDestinationChanged();}));threadMessages.append(header);
      const parents=new Map(loadedThread.comments.filter(m=>!m.replyTo).map(m=>[m.id,m])),replies=new Map();for(const message of loadedThread.comments)if(message.replyTo&&parents.has(message.replyTo)){if(!replies.has(message.replyTo))replies.set(message.replyTo,[]);replies.get(message.replyTo).push(message);}const messages=[loadedThread,...loadedThread.comments.filter(m=>!m.replyTo||!parents.has(m.replyTo)).flatMap(m=>[m,...(replies.get(m.id)||[])])];
      let count=0;for(const message of messages){const time=Date.parse(message.createdAt);if(time<range.from||time>=range.until)continue;const item=make('article');item.className='thread-message'+(message.replyTo?' thread-reply':'');item.append(make('strong',`@${message.author||'unknown'}`),make('small',`${message.createdAt} · ${message===loadedThread?loadedThread.state:message.replyTo?'Reply':'Comment'}`));const text=make('p',message.body);text.className='thread-message-body';item.append(text);if(message.replyTo)item.append(make('small',`Reply to ${parents.get(message.replyTo)?.author?'@'+parents.get(message.replyTo).author:message.replyTo}`));threadMessages.append(item);count++;}
      if(!count)threadMessages.append(make('p','No messages within the selected creation dates.'));
    }
    async function readThread(kind,number){if(provider!=='github'||!remoteAvailable)return;if(!['issue','discussion'].includes(kind)||!Number.isSafeInteger(number)||number<1){threadStatus.textContent='Enter a positive Issue or Discussion number.';return;}const ticket=++threadTicket,file=currentFile();threadKind.value=kind;threadNumber.value=String(number);threadLoad.disabled=true;loadedThread=null;threadMessages.replaceChildren();threadStatus.textContent='Loading GitHub thread…';inspector('comments','view');try{const result=await request('github-thread-read',{...scope(),repository:options.pullRepository||repository,kind,number});if(ticket!==threadTicket||file!==currentFile())return;loadedThread=result;setCommentCategory(kind,false);renderThread();threadStatus.textContent=[`${result.comments.length} comments loaded.`,...(result.warnings||[])].join(' ');}catch(error){if(ticket===threadTicket)threadStatus.textContent=error.message;}finally{if(ticket===threadTicket)threadLoad.disabled=false;}}
    let inlineToken=null,inlineIndex=-1,pasteGeneration=0,pasteBusy=false;
    function closeInlineMentions(){inlineMentions.hidden=true;inlineToken=null;inlineIndex=-1;$('commentText').setAttribute('aria-expanded','false');$('commentText').removeAttribute?.('aria-activedescendant');}
    function chooseInlineMention(login){const box=$('commentText'),edit=root.KiCadCommentCompose?.insertMention(box.value,box.selectionStart??box.value.length,login);if(!edit)return;box.value=edit.text;box.setSelectionRange?.(edit.cursor,edit.cursor);closeInlineMentions();box.focus();$('editorTitle').value=root.KiCadCommentCompose.titleFromText(box.value);}
    function showInlineMentions(users){inlineMentions.replaceChildren();inlineIndex=-1;if(!inlineToken)return;for(const [i,person]of users.slice(0,12).entries()){const row=button(`@${person.login}${person.name?' · '+person.name:''}`,()=>chooseInlineMention(person.login));row.id='inlineMentionOption'+i;row.setAttribute('role','option');row.setAttribute('aria-selected','false');inlineMentions.append(row);}inlineMentions.hidden=!inlineMentions.children.length;$('commentText').setAttribute('aria-expanded',String(!inlineMentions.hidden));}
    $('commentText').addEventListener('input',()=>{const box=$('commentText');$('editorTitle').value=root.KiCadCommentCompose?.titleFromText(box.value)||'';inlineToken=root.KiCadCommentCompose?.mentionAt(box.value,box.selectionStart??box.value.length);mentionGeneration++;clearTimeout(mentionTimer);if(!inlineToken){closeInlineMentions();return;}mentionQuery.value=inlineToken.query;mentionSource.value=inlineToken.query.length>=2?'users':'repository';mentionTimer=setTimeout(lookupMentions,200);});
    $('commentText').addEventListener('keydown',event=>{if(inlineMentions.hidden)return;if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();event.stopPropagation();const size=inlineMentions.children.length;inlineIndex=inlineIndex<0?(event.key==='ArrowDown'?0:size-1):(inlineIndex+(event.key==='ArrowDown'?1:-1)+size)%size;for(const [i,row]of [...inlineMentions.children].entries())row.setAttribute('aria-selected',String(i===inlineIndex));$('commentText').setAttribute('aria-activedescendant',inlineMentions.children[inlineIndex].id);}else if(event.key==='Enter'&&inlineIndex>=0){event.preventDefault();event.stopPropagation();inlineMentions.children[inlineIndex].click();}else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeInlineMentions();}});
    $('commentText').addEventListener('paste',async event=>{const image=[...(event.clipboardData?.items||[])].find(item=>item.kind==='file'&&item.type?.startsWith('image/'))?.getAsFile?.()||[...(event.clipboardData?.files||[])].find(file=>file.type?.startsWith('image/'));if(!image||!editor)return;event.preventDefault();const ticket=++pasteGeneration,draft=editor;pasteBusy=true;$('captureStatus').textContent='Preparing pasted screenshot…';try{const capture=await root.KiCadCommentCompose.normalizeCapture(image);if(ticket!==pasteGeneration||editor!==draft)return;editor.capture=capture;delete editor.attachments;capturePreview();}catch(error){if(ticket===pasteGeneration&&editor===draft)$('captureStatus').textContent=error.message;}finally{if(ticket===pasteGeneration)pasteBusy=false;}});
    function colorCommentControls(){for(const [id,prefix]of [['editorThreadType','type'],['commentSeverity','severity'],['commentState','state']])$(id).className='comment-choice '+prefix+'-'+$(id).value;}
    $('commentSeverity').onchange=$('commentState').onchange=colorCommentControls;
    const connectionsHeading=$("netMembers").querySelector?.('h3');connectionsHeading?.remove();$("netMembers").append(collapsible("Connections",[$("netMemberList")],true,'property:connections'));
    const panelSpaceStatus=make('span');panelSpaceStatus.id='panelSpaceStatus';panelSpaceStatus.className='hint';panelSpaceStatus.hidden=true;$("selectionStatus").parentElement?.append(panelSpaceStatus);
    for(const id of ["propertiesButton","commentsButton"]){$(id).setAttribute("aria-controls",id==="propertiesButton"?"designInspector":"commentsSidebar");}
    function showCommentTab(tab){commentTab=tab;addPane.hidden=tab!=="add";viewPane.hidden=tab!=="view";for(const [node,name]of [[addTab,"add"],[viewTab,"view"]]){node.setAttribute("aria-selected",String(tab===name));node.tabIndex=tab===name?0:-1;}}
    commentTabs.addEventListener("keydown",event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const tab=event.key==="Home"?"add":event.key==="End"?"view":commentTab==="add"?"view":"add";showCommentTab(tab);(tab==="add"?addTab:viewTab).focus();});showCommentTab("view");
    function layoutSidebars(){
      const width=workspaceElement.getBoundingClientRect().width||root.innerWidth||800;
      const required=Object.keys(sidebarState).reduce((sum,name)=>sum+(sidebarState[name]?sidebarWidths[name]:0),480);
      const workspaceHeight=workspaceElement.getBoundingClientRect().height||600,frameHeight=document.body?.getBoundingClientRect().height||root.innerHeight||workspaceHeight;
      // Target 86% of the entire viewer; retain a usable header in short panes.
      const totalArea=width*frameHeight,panelBudget=Math.max(0,Math.min(totalArea*.14,width*workspaceHeight-totalArea*.86));
      const requestedWidth=Object.keys(sidebarState).reduce((sum,name)=>sum+(sidebarState[name]?Math.min(sidebarWidths[name],Math.max(0,width-32)):0),0);
      // Switch panels rather than squeezing several into unusably short strips.
      const overlay=Object.keys(sidebarState).some(name=>sidebarState[name]&&expandedSidebars.has(name))||tallSidebars.has(activeSidebar)||width<required||(requestedWidth>0&&panelBudget/requestedWidth<180);workspaceElement.classList.toggle("sidebar-overlays",overlay);
      workspaceElement.classList.toggle("two-sidebars",!overlay&&sidebarState.properties&&sidebarState.comments);workspaceElement.style.setProperty("--comments-sidebar-width",sidebarWidths.comments+"px");
      const visiblePanels=[];
      for(const [name,id,buttonId]of [["properties","designInspector","propertiesButton"],["comments","commentsSidebar","commentsButton"],["navigator","designNavigator","partsButton"]]){
        const visible=sidebarState[name]&&(!overlay||activeSidebar===name);$(id).hidden=!visible;$(buttonId).setAttribute("aria-pressed",String(visible));$(buttonId).setAttribute("aria-expanded",String(visible));
        if(visible)visiblePanels.push({name,panel:$(id)});
      }
      const visibleWidth=visiblePanels.reduce((sum,item)=>sum+Math.min(sidebarWidths[item.name],Math.max(0,width-32)),0);
      const budgetHeight=visibleWidth?panelBudget/visibleWidth:workspaceHeight,panelHeight=Math.min(workspaceHeight,Math.max(40,budgetHeight));
      for(const {name,panel}of visiblePanels){
        const expanded=expandedSidebars.has(name),maxHeight=expanded?workspaceHeight:panelHeight;
        const height=sidebarHeights[name]===null||expanded?maxHeight:Math.min(maxHeight,Math.max(Math.min(180,maxHeight),sidebarHeights[name]));panel.style.height=height+'px';panel.classList.toggle('expanded-sidebar',expanded);panel.classList.toggle('compact-sidebar',height<180&&!expanded);
        const handle=panel.querySelector('.sidebar-height-resizer');if(handle){handle.setAttribute('aria-valuemin',String(Math.round(Math.min(180,maxHeight))));handle.setAttribute('aria-valuemax',String(Math.round(maxHeight)));handle.setAttribute('aria-valuenow',String(Math.round(height)));}
      }
      panelSpaceStatus.hidden=!visiblePanels.length||budgetHeight>=180||expandedSidebars.has(activeSidebar);panelSpaceStatus.title='Small view: use Tall for more reading height, or Expand for a full-height panel. Expand temporarily reduces drawing space.';panelSpaceStatus.textContent=panelSpaceStatus.hidden?'':'Panel access: Tall or Expand.';
      $("commentsPane").hidden=commentsSidebar.hidden;
    }
    function showNavigator(open=true){sidebarState.navigator=open;if(open)activeSidebar="navigator";layoutSidebars();}
    function hideSidebar(name){sidebarState[name]=false;if(activeSidebar===name)activeSidebar=Object.keys(sidebarState).find(key=>sidebarState[key])||"properties";layoutSidebars();}
    function hideInspector(){sidebarState.properties=sidebarState.comments=false;layoutSidebars();}
    function inspector(pane,tab){restoreFocusView();const name=pane==="properties"?"properties":"comments";sidebarState[name]=true;activeSidebar=name;if(tab)showCommentTab(tab);if(pane==="github"){showCommentTab("view");collaborationGroup.open=true;}layoutSidebars();
      // An explicit comment action must reveal content, even in a short split pane.
      if(name==='comments'&&(tab==='add'||commentsSidebar.classList.contains('compact-sidebar'))){
        expandedSidebars.add(name);const expand=$('expandComments');if(expand){expand.textContent='Restore';expand.setAttribute('aria-pressed','true');}layoutSidebars();
      }
    }
    function resizeSidebar(name,panel,edge){
      const handle=make("div");handle.className="sidebar-resizer "+edge;handle.tabIndex=0;handle.setAttribute("role","separator");handle.setAttribute("aria-orientation","vertical");handle.setAttribute("aria-label",`Resize ${name} sidebar`);handle.setAttribute("aria-valuemin","220");handle.setAttribute("aria-valuemax","560");panel.append(handle);
      const setWidth=value=>{const max=Math.min(560,Math.max(220,workspaceElement.getBoundingClientRect().width-32));sidebarWidths[name]=Math.max(220,Math.min(max,value));panel.style.width=panel.style.flexBasis=sidebarWidths[name]+"px";handle.setAttribute("aria-valuenow",String(sidebarWidths[name]));layoutSidebars();};setWidth(sidebarWidths[name]);
      let drag=null;
      handle.addEventListener("pointerdown",event=>{if(event.button!==0)return;event.preventDefault();drag={x:event.clientX,width:sidebarWidths[name],id:event.pointerId};handle.setPointerCapture?.(event.pointerId);handle.classList.toggle("resizing",true);});
      handle.addEventListener("pointermove",event=>{if(drag&&event.pointerId===drag.id)setWidth(drag.width+(event.clientX-drag.x)*(edge==="left"?-1:1));});
      const stop=()=>{drag=null;handle.classList.toggle("resizing",false);};for(const type of ["pointerup","pointercancel","lostpointercapture"])handle.addEventListener(type,stop);
      handle.addEventListener("keydown",event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();event.stopPropagation();setWidth(event.key==="Home"?220:event.key==="End"?560:sidebarWidths[name]+(event.key==="ArrowLeft"?-1:1)*(edge==="left"?-1:1)*(event.shiftKey?40:10));});resizeCleanups.push(stop);
    }
    resizeSidebar("properties",propertiesSidebar,"left");resizeSidebar("comments",commentsSidebar,"left");resizeSidebar("navigator",$("designNavigator"),"right");
    function addPanelSizing(name,panel,header){
      const expand=button('Expand',()=>{if(expandedSidebars.has(name))expandedSidebars.delete(name);else{expandedSidebars.add(name);activeSidebar=name;}expand.textContent=expandedSidebars.has(name)?'Restore':'Expand';expand.setAttribute('aria-pressed',String(expandedSidebars.has(name)));layoutSidebars();});
      expand.id='expand'+name[0].toUpperCase()+name.slice(1);expand.title='Use full panel height for reading; Restore returns to the drawing-area budget';expand.setAttribute('aria-label',`Toggle expanded ${name} sidebar`);expand.setAttribute('aria-pressed','false');header?.insertBefore(expand,header.children[header.children.length-1]);
      const tall=button('Tall',()=>{if(tallSidebars.has(name)){sidebarWidths[name]=tallSidebars.get(name);tallSidebars.delete(name);}else{tallSidebars.set(name,sidebarWidths[name]);sidebarWidths[name]=220;sidebarHeights[name]=null;activeSidebar=name;}
        panel.style.width=panel.style.flexBasis=sidebarWidths[name]+'px';const widthHandle=panel.querySelector('.sidebar-resizer');widthHandle?.setAttribute('aria-valuenow',String(sidebarWidths[name]));tall.textContent=tallSidebars.has(name)?'Wide':'Tall';tall.setAttribute('aria-pressed',String(tallSidebars.has(name)));layoutSidebars();});
      tall.id='tall'+name[0].toUpperCase()+name.slice(1);tall.title='Use a narrow, taller panel while retaining drawing area';tall.setAttribute('aria-label',`Toggle tall ${name} sidebar`);tall.setAttribute('aria-pressed','false');header?.insertBefore(tall,header.children[header.children.length-1]);
      const handle=make('div');handle.className='sidebar-height-resizer';handle.tabIndex=0;handle.setAttribute('role','separator');handle.setAttribute('aria-orientation','horizontal');handle.setAttribute('aria-label',`Resize ${name} sidebar height`);panel.append(handle);let drag=null;
      const setHeight=value=>{if(expandedSidebars.has(name)){expandedSidebars.delete(name);expand.textContent='Expand';expand.setAttribute('aria-pressed','false');}sidebarHeights[name]=value;layoutSidebars();};
      handle.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();drag={y:event.clientY,height:parseFloat(panel.style.height)||180,id:event.pointerId};handle.setPointerCapture?.(event.pointerId);handle.classList.toggle('resizing',true);});
      handle.addEventListener('pointermove',event=>{if(drag&&event.pointerId===drag.id)setHeight(drag.height+event.clientY-drag.y);});
      const stop=()=>{drag=null;handle.classList.toggle('resizing',false);};for(const type of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(type,stop);
      handle.addEventListener('keydown',event=>{if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;event.preventDefault();event.stopPropagation();setHeight(event.key==='End'?null:event.key==='Home'?180:(parseFloat(panel.style.height)||180)+(event.key==='ArrowUp'?-1:1)*(event.shiftKey?40:10));});resizeCleanups.push(stop);
    }
    addPanelSizing('properties',propertiesSidebar,propertiesSidebar.querySelector('.sidebar-heading'));addPanelSizing('comments',commentsSidebar,commentsSidebar.querySelector('.sidebar-heading'));addPanelSizing('navigator',$('designNavigator'),$('designNavigator').querySelector('.panel-heading'));
    const sidebarObserver=root.ResizeObserver?new root.ResizeObserver(layoutSidebars):null;sidebarObserver?.observe(workspaceElement);root.addEventListener?.("resize",layoutSidebars);
    function propertySection(title,entries,collapsed=false){
      const values=Object.entries(entries).filter(([,value])=>value!==undefined&&value!==null);if(!values.length)return;
      const dl=make("dl");
      for(const [key,value]of values){const dd=make("dd",String(value)===""?"(empty)":value);dd.title=String(value);dl.append(make("dt",key),dd);}
      const section=collapsible(title,[dl],!collapsed,"property:"+title);section.className="property-group sidebar-section";
      $("propertyList").append(section);
    }
    function iconFor(kind){return kind==="pad"||kind==="pin"?"pin":kind==="segment"||kind==="arc"?"track":kind==="sheet"?"sheet":"parts";}
    function setSelectionIcon(kind){if(root.KiCadUIIcons)$("selectionIcon").replaceChildren(root.KiCadUIIcons.icon(kind));}
    function netsForObject(object){if(!object)return[];return netModel.nets.filter(net=>net.path===object.path&&(net.objectIds.includes(object.id)||(["footprint","symbol"].includes(object.kind)&&net.primitives.some(p=>p.ownerUuid===object.uuid))));}
    function properties() {
      $("propertyList").replaceChildren();$("selectionSummary").replaceChildren();$("netMemberList").replaceChildren();$("netMembers").hidden=true;$("selectObjectNet").hidden=true;
      $("selectedName").textContent=selectedNet?.name||selected?.label||"Select an object";
      $("selectedKind").textContent=selectedNet?`${selectedNet.kind==="pcb"?"PCB net":"Sheet network"} · ${selectedNet.path}`:selected?`${selected.kind} · ${selected.path}`:"Click a component, copper item or net to inspect it.";
      $("focusSelected").disabled=!selectedNet&&!selected?.position;$("openSelectedSheet").hidden=selected?.kind!=="sheet"||Boolean(selectedNet);$("commentSelected").disabled=false;
      setSelectionIcon(selectedNet?"net":iconFor(selected?.kind));
      const chip=(text,className="")=>{const span=make("span",text);span.className="summary-chip "+className;$("selectionSummary").append(span);};
      if(selectedNet){
        chip(selectedNet.kind==="pcb"?"Saved net ID "+selectedNet.code:"Active-sheet connectivity");
        chip(`${selectedNet.stats.pads||selectedNet.members.filter(m=>m.kind==="pin").length} ${selectedNet.kind==="pcb"?"pads":"pins"}`);
        propertySection("Electrical",{"Net name":selectedNet.name,"Saved code":selectedNet.kind==="pcb"?selectedNet.code:undefined,"Scope":selectedNet.kind==="pcb"?"This PCB":"This sheet only"});
        const stats=selectedNet.stats;propertySection(selectedNet.kind==="pcb"?"Copper":"Wiring",selectedNet.kind==="pcb"?{"Pads":stats.pads,"Track segments":stats.tracks,"Vias":stats.vias,"Zones":stats.zones,"Routed length":stats.lengthMm.toFixed(3)+" mm"}:{"Wire length":stats.lengthMm.toFixed(3)+" mm"});
        $("netMembers").hidden=false;const members=selectedNet.members.filter(m=>m.kind==="pad"||m.kind==="pin");
        for(const member of members.slice(0,300)){const node=button("",()=>{activeConnection=member;if(member.position)focus(member.position);$("selectionStatus").textContent=`${selectedNet.name} · ${member.reference||"Component"} · ${member.pin||member.pad||""}`;});node.append(make("span",`${member.reference||"Component"} · ${member.kind==="pin"?"pin "+member.pin:"pad "+member.pad}`));$("netMemberList").append(node);}
        if(!members.length)$("netMemberList").append(make("p","No saved pads or pins on this network."));
        if(members.length>300)$("netMemberList").append(make("p",`First 300 of ${members.length} connections shown.`));
        if(selectedNet.kind!=="pcb"){const section=make('section');section.className='property-section';section.append(make('h3','Matching sheets'));for(const [path,matches]of netSheetMatches()){const row=button(model.sheets.find(s=>s.path===path)?.label||path,()=>followSheet(path));row.title=path+' · '+matches.map(n=>n.name).join(', ');row.className='net-sheet-link';section.append(row);}$("propertyList").append(section);}if(selectedNet.kind!=="pcb")propertySection("Connectivity limits",{"Analysis":"Saved global labels, explicit global power symbols and unambiguous sheet pins identify matching sheets. Reused sheet instances, cyclic hierarchy, hidden power pins and buses are not resolved; this is not a KiCad netlist."});
        return;
      }
      if(!selected)return;
      if(selected.kind==='zone'){const stats=boardAnalytics();const zone=stats?.zones?.find(z=>z.uuid&&z.uuid===selected.uuid);if(zone)propertySection('Saved zone analytics',{'Outline polygon area sum':zone.outlineAreaMm2.toFixed(3)+' mm²','Saved fill polygon area sum':zone.fillAreaMm2.toFixed(3)+' mm²','Saved fill layers':zone.layers.join(', ')||'None','Method':stats.limits});}
      const entries={...selected.properties};delete entries["Source fingerprint"];
      const linked=netsForObject(selected);if(linked.length){entries.Net=linked.map(n=>n.name).join(", ");$("selectObjectNet").hidden=false;root.KiCadUIIcons?.label($("selectObjectNet"),linked.length===1?"Highlight net":`${linked.length} nets`);}
      if(entries.Value)chip(entries.Value);if(["symbol","footprint","pad"].includes(selected.kind))chip(selected.populated?"Fitted":"Do not populate",selected.populated?"population":"dnp");
      const used=new Set();const take=keys=>Object.fromEntries(keys.filter(k=>entries[k]!==undefined&&(used.add(k),true)).map(k=>[k,entries[k]]));
      propertySection("Identity",take(["Reference","Value","Description","Library ID","lib_id","Number","Type","Shape"]));
      propertySection("Electrical",take(["Net","Sim.Device","Sim.Pins"]));
      const geometry=take(["layer","Layers","Angle","width","size","drill","unit"]);if(selected.position){geometry["X position"]=selected.position.x.toFixed(3)+" mm";geometry["Y position"]=selected.position.y.toFixed(3)+" mm";}propertySection("Geometry",geometry);
      propertySection("Assembly",{...take(["DNP","Exclude from BOM","Exclude from board"]),"Variant":model.variants.find(item=>item.id===variant)?.name||"Saved design"});
      propertySection("Properties",Object.fromEntries(Object.keys(entries).filter(key=>!used.has(key)).sort().map(key=>[key,entries[key]])));
      propertySection("Source",{"File":selected.path,"UUID":selected.uuid},true);
      if(selected.saved){
        const section=collapsible('Saved KiCad settings',[],false,'property:saved-settings');section.className='property-group sidebar-section';
        section.append(make('p','Original file settings, including empty fields. Variant overrides appear above.'));
        const search=make('input');search.type='search';search.placeholder='Filter saved settings';search.setAttribute('aria-label','Filter saved KiCad settings');const tree=make('div');section.append(search,tree);
        const atom=value=>value&&typeof value==='object'?value.quoted!==undefined?JSON.stringify(value.quoted):value.omitted!==undefined?'['+value.omitted+' settings omitted]':'':String(value);
        const render=()=>{tree.replaceChildren();let count=0;const query=search.value.toLowerCase();
          const add=(form,parent,matched=false)=>{if(!Array.isArray(form)||count++>12000)return;const children=form.filter(Array.isArray),summary=form.filter(v=>!Array.isArray(v)).map(atom).join(' ');if(query&&!matched&&!JSON.stringify(form).toLowerCase().includes(query))return;const ownMatch=matched||summary.toLowerCase().includes(query);
            const node=make(children.length?'details':'p');node.className='saved-setting';if(children.length){node.open=Boolean(query);node.append(make('summary',summary));for(const child of children)add(child,node,ownMatch);}else node.textContent=summary;parent.append(node);};
          add(selected.saved.tree,tree);if(selected.saved.library){tree.append(make('h4','Embedded symbol definition'));add(selected.saved.library.tree,tree);}
          if(selected.saved.truncated||selected.saved.library?.truncated||count>12000)tree.append(make('p','Saved settings exceed the inspection limit; consult the source file for the remaining settings.'));
        };search.oninput=render;render();$("propertyList").append(section);
      }
    }
    function renderNets(){
      const list=$("netList"),highlighted=new Set(highlightedNets().map(n=>n.id));list.replaceChildren();const query=$("netSearch").value.trim().toLowerCase(),path=currentFile()||rootFile,linked=netFilterObject?new Set(netsForObject(objects.find(o=>o.id===netFilterObject)).map(n=>n.id)):null;
      const nets=netModel.nets.filter(n=>n.path===path&&(!linked||linked.has(n.id))&&`${n.name} ${n.code} ${n.members.map(m=>m.reference).join(" ")}`.toLowerCase().includes(query));
      $("netCount").textContent=`${nets.length} net${nets.length===1?"":"s"}${nets.length>500?" · first 500":""}`;$("clearNet").disabled=!selectedNet&&!netFilterObject;
      for(const net of nets.slice(0,500)){const row=button("",()=>selectNet(net,true));row.className="object-row net-row"+(selectedNet?.id===net.id||highlighted.has(net.id)?" selected":"");row.setAttribute("aria-pressed",String(selectedNet?.id===net.id||highlighted.has(net.id)));const dot=make("span");dot.className="net-chip";const copy=make("span");copy.className="row-copy";copy.append(make("strong",net.name),make("small",net.kind==="pcb"?`${net.stats.pads} pads · ${net.stats.tracks} tracks · ${net.stats.lengthMm.toFixed(1)} mm`:`${net.members.filter(m=>m.kind==="pin").length} pins · sheet-local`));row.append(dot,copy);row.title=net.name;list.append(row);}
      if(!nets.length)list.append(make("p","No networks match this search."));
      const warnings=netModel.warnings.filter(message=>message.startsWith(path+": "));$("netWarnings").hidden=!warnings.length;$("netWarningCount").textContent=`${warnings.length} connectivity note${warnings.length===1?"":"s"}`;$("netWarningList").replaceChildren();for(const warning of warnings.slice(0,20))$("netWarningList").append(make("p",warning.slice(path.length+2)));if(warnings.length>20)$("netWarningList").append(make("p",`First 20 of ${warnings.length} notes shown.`));
    }
    function focusNet(net){const canvas=getCanvas();canvas.resize();const visible=net.primitives.filter(p=>!p.hole&&(!p.layer||canvas.visibleLayers.has(p.layer))),box=root.KiCadOwnedCanvas?.bounds(visible);if(!box){$("selectionStatus").textContent=`${net.name} · no geometry on visible layers`;return;}const margin=Math.max(3,Math.max(box.w,box.h)*.1);canvas.viewport.camera.bbox={x:box.x-margin,y:box.y-margin,w:box.w+2*margin,h:box.h+2*margin};canvas.draw();}
    function highlightedNets(){const path=currentFile(),result=new Map([...pinnedNets.values()].filter(n=>n.path===path).map(n=>[n.id,n]));if(classConfig)for(const net of netModel.nets){if(net.path!==path)continue;if([...pinnedClasses.values()].some(c=>c.path===path&&root.KiCadProjectSearch.netClasses(net.name,classConfig).includes(c.name))&&result.size<200)result.set(net.id,net);}if(selectedNet&&!result.has(selectedNet.id)&&result.size<200)result.set(selectedNet.id,selectedNet);return [...result.values()];}
    function netSheetMatches(){
      const selected=[...pinnedNets.values(),...(selectedNet?[selectedNet]:[])].filter(n=>n.kind==='schematic'),key=selected.map(n=>n.id).sort().join('\n');
      if(sheetMatchCache?.model===netModel&&sheetMatchCache.objects===objects&&sheetMatchCache.key===key)return sheetMatchCache.result;
      const result=new Map(),links=objects.filter(o=>o.kind==='sheet').map(o=>({path:o.path,target:sheetTarget(o),sheetId:o.uuid||o.id}));
      for(const net of selected)for(const match of root.KiCadNetModel?.relatedSchematicNets(netModel.nets,net.id,links)?.matches||[net]){
        if(!result.has(match.path))result.set(match.path,[]);
        if(!result.get(match.path).some(n=>n.id===match.id))result.get(match.path).push(match);
      }
      sheetMatchCache={model:netModel,objects,key,result};return result;
    }
    function publishHierarchy(){if(pcb)return;const snapshot={sheets:model.sheets.filter(s=>s.kind==='schematic').map(s=>({path:s.path,label:s.label})),links:objects.filter(o=>o.kind==='sheet').slice(0,512).map(o=>({path:o.path,label:o.label,properties:{Sheetfile:o.properties?.Sheetfile??o.properties?.['Sheet file']}})),active:currentFile(),highlighted:[...netSheetMatches().keys()]};const signature=JSON.stringify(snapshot);if(signature!==hierarchySignature){hierarchySignature=signature;options.onHierarchy?.(snapshot);}}
    function updateHighlights(){
      const canvas=getCanvas(),path=currentFile(),nets=highlightedNets();
      const dnp=dnpHighlight?objects.filter(o=>o.path===path&&['symbol','footprint'].includes(o.kind)&&o.populated===false):[];
      const parts=[...highlightObjects.filter(o=>o.path===path),...dnp],ids=new Set(parts.map(o=>o.uuid).filter(Boolean)),primitives=(canvas?.primitives||[]).filter(p=>ids.has(p.uuid)||ids.has(p.ownerUuid));
      const groups=[...nets,...(primitives.length?[{primitives}]:[])],mode=$('highlightStyle').value||'dim';
      if(canvas?.setNetHighlights)canvas.setNetHighlights(groups,{mode});else canvas?.setNetHighlight(groups[0]||null,{isolate:mode==='isolate'});
      $('highlightSummary').textContent=`${nets.length} nets · ${parts.length} components/objects highlighted${pinnedNets.size>nets.length||highlightObjects.some(o=>o.path!==path)?' · other sheets retained':''}`;
      $('fitHighlights').disabled=!groups.length;renderSheets();canvas?.draw();
    }
    function partSelection(object){
      if(!object||!['symbol','footprint','pad'].includes(object.kind)||!object.reference)return null;
      const source=object.kind==='pad'?objects.find(item=>item.id===object.parentId&&item.kind==='footprint')||object:object;
      const symbolUuid=root.KiCadPairedReview?.symbolUuid?.(source)||symbolUuidFromPath(source);
      return {kind:'part',reference:source.reference,path:source.path,...(source.uuid?{uuid:source.uuid}:{}),...(symbolUuid?{symbolUuid}:{})};
    }
    function emitHighlightGroup(){
      const items=new Map();for(const object of highlightObjects){const item=partSelection(object);if(item&&root.KiCadPairedReview?.validSelection(item))items.set(JSON.stringify(item),item);}
      for(const net of highlightedNets()){const qualifiedNetName=root.KiCadPairedReview?.qualifiedNetName?.(net,objects);const item={kind:'net',netName:net.name,path:net.path,...(qualifiedNetName?{qualifiedNetName}:{})};if(root.KiCadPairedReview?.validSelection(item))items.set(JSON.stringify(item),item);}
      options.onSelection?.({kind:'group',items:[...items.values()].slice(0,200)});
    }
    function highlightSheet(path,sheetObject=null,multi=$('multiHighlight').checked){
      const loaded=new Set(files.filter(f=>/\.kicad_sch$/i.test(f.path)).map(f=>f.path)),paths=new Set();const pending=[path];
      while(pending.length&&paths.size<200){const next=pending.shift();if(!loaded.has(next)||paths.has(next))continue;paths.add(next);for(const link of objects)if(link.kind==='sheet'&&link.path===next){const target=sheetTarget(link);if(target&&!paths.has(target))pending.push(target);}}
      if(!paths.size){notice('This sheet file is not loaded. Open the project hierarchy before highlighting it.');return;}
      const members=objects.filter(o=>paths.has(o.path)).sort((a,b)=>Number(!['symbol','footprint'].includes(a.kind))-Number(!['symbol','footprint'].includes(b.kind)));if(sheetObject)members.unshift(sheetObject);
      if(!multi){pinnedNets.clear();pinnedClasses.clear();selectedNet=null;highlightObjects=[];}
      const unique=new Map(highlightObjects.map(o=>[o.id,o]));for(const object of members)if(unique.size<200)unique.set(object.id,object);highlightObjects=[...unique.values()];
      updateHighlights();renderObjects();navigation?.renderSearch();emitHighlightGroup();notice(`Sheet group: ${paths.size} loaded sheets, ${highlightObjects.length} objects${members.length>200?' (200-object limit)':''}. Reused sheets share a saved file view.`);
    }
    function clearHighlights(){options.onSelection?.({kind:'group',items:[]});dnpHighlight=false;$("highlightDnp").checked=false;pinnedNets.clear();pinnedClasses.clear();highlightObjects=[];selectedNet=null;connectionCursor=-1;activeConnection=null;getCanvas()?.setNetHighlight(null);renderNets();properties();updateHighlights();navigation?.renderSearch();}
    function highlightSearchObjects(items,multi){
      const local=items.filter(o=>o.path===currentFile()).slice(0,200),derived=local.filter(o=>['net','netclass'].includes(o.kind)),parts=local.filter(o=>!['net','netclass'].includes(o.kind));if(!multi){highlightObjects=local[0]&&!['net','netclass'].includes(local[0].kind)?[local[0]]:[];pinnedNets.clear();pinnedClasses.clear();selectedNet=null;}else{const map=new Map(highlightObjects.map(o=>[o.id,o]));for(const o of parts)map.set(o.id,o);highlightObjects=[...map.values()].slice(0,200);}
      for(const item of multi?derived:derived.filter(o=>o===local[0])){if(item.kind==='net'){const net=netModel.nets.find(n=>n.path===currentFile()&&n.name===item.netName);if(net&&pinnedNets.size<200)pinnedNets.set(net.id,net);}else if(pinnedClasses.size<64)pinnedClasses.set(JSON.stringify([item.path,item.className]),{path:item.path,name:item.className});}
      if(!local.length)notice('No matches on the active drawing. Open a result before highlighting it.');else notice(`${highlightedNets().length} nets and ${highlightObjects.length} objects highlighted on this drawing${items.length>200?' (200-object limit)':''}.`);
      updateHighlights();emitHighlightGroup();navigation?.renderSearch();
    }
    function selectSearchObject(object,multi,event,move=true){
      multi=Boolean(multi||event?.ctrlKey||event?.metaKey||event?.shiftKey);
      if(object.kind==='sheet'){selectObject(object,true,true,false,multi,true);highlightSheet(sheetTarget(object),object,multi);return;}
      if(/\.kicad_pcb$/i.test(object.path)!==pcb){request(root.KiCadVSCodeContext?'open-project-drawing':'open-viewer-window',{repository,ref,file:object.path}).catch(error=>notice(error.message));notice(`Opening ${object.path} in another viewer; this result belongs to the other drawing type.`);return;}
      if(['net','netclass'].includes(object.kind)){
        if(object.path!==currentFile())openSheet(object.path);
        if(object.kind==='net'){const matches=netModel.nets.filter(n=>n.path===currentFile()&&n.name===object.netName);if(matches.length===1)selectNet(matches[0],true,true,multi);else notice('The saved network is missing or ambiguous on this drawing.');}
        else{const key=JSON.stringify([object.path,object.className]),existed=pinnedClasses.has(key);if(!multi){pinnedNets.clear();pinnedClasses.clear();highlightObjects=[];selectedNet=null;}if(existed)pinnedClasses.delete(key);else pinnedClasses.set(key,{path:object.path,name:object.className});updateHighlights();renderNets();renderNetClasses();emitHighlightGroup();}
        navigation?.renderSearch();return;
      }
      let removed=false;if(multi){if(!highlightObjects.length&&selected&&selected.id!==object.id)highlightObjects.push(selected);const at=highlightObjects.findIndex(o=>o.id===object.id);if(at>=0){highlightObjects.splice(at,1);removed=true;}else if(highlightObjects.length<200)highlightObjects.push(object);}
      else{highlightObjects=[object];pinnedNets.clear();pinnedClasses.clear();}
      selectObject(object,false,move,false,true,true);if(!multi)highlightObjects=[object];if(removed){selected=null;properties();}updateHighlights();renderObjects();emitHighlightGroup();navigation?.renderSearch();
    }
    function cycleConnection(step){const nets=highlightedNets();const seen=new Set(),members=nets.flatMap(n=>n.members).filter(m=>m.position&&['pin','pad'].includes(m.kind)&&!seen.has(JSON.stringify([m.uuid,m.position]))&&seen.add(JSON.stringify([m.uuid,m.position])));if(!members.length){notice('Select a net or class to navigate its connections.');return;}connectionCursor=connectionCursor<0?(step<0?members.length-1:0):(connectionCursor+step+members.length)%members.length;const member=members[connectionCursor];activeConnection=member;focus(member.position);$('selectionStatus').textContent=`Connection ${connectionCursor+1}/${members.length}: ${member.reference||''} ${member.pin||member.pad||''}`;}
    function renderNetClasses(){const value=$('netClassSelect').value;$('netClassSelect').replaceChildren();const names=new Set();if(classConfig)for(const net of netModel.nets)if(net.path===currentFile())for(const name of root.KiCadProjectSearch.netClasses(net.name,classConfig))names.add(name);for(const name of [...names].sort()){const option=make('option',name);option.value=name;$('netClassSelect').append(option);}if(names.has(value))$('netClassSelect').value=value;$('highlightNetClass').disabled=!names.size;$('highlightNetClass').setAttribute('aria-pressed',String(pinnedClasses.has(JSON.stringify([currentFile(),$('netClassSelect').value]))));$('netClassStatus').textContent=classConfig?'Highlighted classes: '+([...pinnedClasses.values()].filter(c=>c.path===currentFile()).map(c=>c.name).join(', ')||'none')+'. '+(classConfig.warnings||[]).join(' '):'Import .kicad_pro in Project search to use saved net classes.';}
    function selectNet(net,move=false,toggle=true,multi=$('multiHighlight').checked){
      if(net&&multi){if(toggle&&pinnedNets.has(net.id)){pinnedNets.delete(net.id);selectedNet=null;}else{if(pinnedNets.size>=200){notice('At most 200 networks can be highlighted.');return;}pinnedNets.set(net.id,net);selectedNet=net;}}
      else{pinnedNets.clear();pinnedClasses.clear();highlightObjects=[];selectedNet=net;}
      selected=null;nativePick=null;connectionCursor=-1;activeConnection=null;updateHighlights();$('selectionStatus').textContent=selectedNet?`${selectedNet.name} · ${selectedNet.kind==='pcb'?'PCB net '+selectedNet.code:'sheet network'}`:'Net highlight cleared';properties();renderNets();renderObjects();if(selectedNet){inspector('properties');if(move)focusNet(selectedNet);const qualifiedNetName=root.KiCadPairedReview?.qualifiedNetName?.(selectedNet,objects);if(!multi)options.onSelection?.({kind:'net',netName:selectedNet.name,path:selectedNet.path,...(qualifiedNetName?{qualifiedNetName}:{})});}if(multi)emitHighlightGroup();getCanvas()?.draw();
    }
    function refreshNets(){const source=getCanvas()?.design;if(!source||source===netSource)return;netSource=source;const designs=options.getDesigns?.()||new Map([[currentFile(),source]]);netModel=netBuilder?netBuilder.build(files,designs):root.KiCadNetModel?root.KiCadNetModel.build(files,designs):{nets:[],warnings:[]};selectedNet=null;activeConnection=null;getCanvas()?.setNetHighlight(null);renderNets();renderNetClasses();updateHighlights();}
    function navigate(tab){if(tab==='rules'){showRuleWindow();return;}navigatorTab=tab;for(const name of ["parts","sheets","nets","layers","search","bom"]){$(name+"Pane").hidden=name!==tab;$("nav"+name[0].toUpperCase()+name.slice(1)).setAttribute("aria-selected",String(name===tab));}if(tab==="bom")renderBom();if(tab==="search")navigation?.renderSearch();if(tab==="rules")navigation?.renderRules();if(tab==="sheets")renderSheets();if(tab==="nets"){renderNets();$("netHelp").textContent=pcb?"Select a net to highlight its copper and inspect connections.":"Select a net to highlight it and mark matching sheets. Saved global labels and unambiguous sheet pins link loaded sheets; reused instances, hidden power pins and buses are not resolved.";}showNavigator(true);}
    function selectObject(object, native = false, move = false, fromScene = false, retainHighlights = false, silent = false) {
      selectedNet=null;activeConnection=null;if(!retainHighlights&&!$("multiHighlight").checked){pinnedNets.clear();pinnedClasses.clear();highlightObjects=[];}getCanvas()?.setNetHighlight(null);renderNets();
      selected = object; nativePick = native ? null : nativePick;
      if (!object) { $("selectionStatus").textContent = "Select a part to inspect its properties."; properties(); renderObjects();updateHighlights();if(!silent&&!retainHighlights&&!$("multiHighlight").checked)options.onSelection?.({kind:"group",items:[]}); draw(); return; }
      const part=partSelection(object);if(part&&!silent)options.onSelection?.(part);
      $("selectionStatus").textContent = `${object.label} · ${object.kind}${object.populated === false ? " · DNP" : ""}`;
      properties(); inspector("properties"); renderObjects();
      if (object.path !== currentFile()) {
        openSheet(object.path, object.position);if(object.kind==='sheet'&&!silent)highlightSheet(sheetTarget(object),object); return;
      }
      if (scene && object.reference) { if (!fromScene) scene.selectReference(object.reference); }
      else {
        const canvas = getCanvas();
        if (native && object.position && canvas?.layers?.query_point) {
          const hit = canvas.layers.query_point(object.position).find((entry) => resolveObject(objects, object.path, entry.bbox?.context)?.id === object.id);
          if (hit?.bbox) {programmaticPick=true;try{canvas.select(hit.bbox);}finally{programmaticPick=false;}}
        }
        if (move && object.position) {
          const geometry=(canvas?.primitives||canvas?.design?.primitives||[]).filter(p=>p.uuid===object.uuid||p.ownerUuid===object.uuid),box=root.KiCadOwnedCanvas?.bounds(geometry);
          if(box&&box.w&&box.h){canvas.resize();const margin=Math.max(3,Math.max(box.w,box.h)*.15);canvas.viewport.camera.bbox={x:box.x-margin,y:box.y-margin,w:box.w+margin*2,h:box.h+margin*2};canvas.draw();}else focus(object.position);
        }
      }
      if(object.kind==='sheet'&&!silent)highlightSheet(sheetTarget(object),object);else updateHighlights();draw();
    }
    function highlightRelated(selection) {
      if(selection?.kind==='group'){
        if(!root.KiCadPairedReview?.validSelection(selection))return false;
        const result=root.KiCadPairedReview?.relatedGroup?.(objects,netModel.nets,selection,currentFile()||rootFile);
        if(!result)return false;
        const matched=[...result.objects,...result.nets],path=matched.some(o=>o.path===currentFile())?currentFile():matched[0]?.path;
        if(path&&path!==currentFile())openSheet(path);
        pinnedClasses.clear();pinnedNets.clear();selectedNet=null;highlightObjects=result.objects.slice(0,200);for(const net of result.nets)pinnedNets.set(net.id,net);
        selected=highlightObjects.find(o=>o.path===currentFile())||null;activeConnection=null;connectionCursor=-1;
        updateHighlights();renderObjects();renderNets();properties();navigation?.renderSearch();
        notice(result.errors.length?`${matched.length} related objects/networks highlighted; ${result.errors.length} mapping warnings (missing or ambiguous selections).`:'');return true;
      }
      if (selection?.kind === "net") {
        const result=root.KiCadPairedReview?.relatedNet?.(netModel.nets,objects,selection,currentFile()||rootFile);
        if(!result?.net){notice(result?.error||'The related net could not be found unambiguously.');return false;}
        const id=result.net.id;if(result.net.path!==currentFile())openSheet(result.net.path);
        const net=netModel.nets.find(item=>item.id===id);if(!net){notice('The related net changed while opening its sheet.');return false;}
        notice('');selectNet(net,true,false);return true;
      }
      const result = root.KiCadPairedReview?.relatedPart?.(objects,selection) || relatedFallback(objects,selection);
      if (!result?.object) { notice(result?.error || "The related part could not be found unambiguously."); return false; }
      notice(""); selectObject(result.object,true,true);if(!$("multiHighlight").checked)highlightObjects=[result.object];else if(!highlightObjects.some(o=>o.id===result.object.id))highlightObjects.push(result.object);updateHighlights();getCanvas()?.draw();return true;
    }
    function renderObjects() {
      const list = $("objectList"); list.replaceChildren();
      const query = $("partSearch").value.trim().toLowerCase(), type = $("objectFilter").value;
      const file = currentFile() || rootFile;
      const visible = objects.filter((item) => ($("allSheets").checked || item.path === file) &&
        (type === "all" || type === "parts" ? type === "all" || ["symbol","footprint"].includes(item.kind) : item.kind === type) &&
        matchesSearch(item,query,netsForObject(item).map(n=>n.name)));
      $("objectCount").textContent = `${visible.length} object${visible.length === 1 ? "" : "s"}${visible.length > 500 ? " · first 500 shown; narrow your search" : ""}`;
      for (const item of visible.slice(0,500)) {
        const grouped=highlightObjects.some(o=>o.id===item.id),row = button("", event => $("multiHighlight").checked||event?.ctrlKey||event?.metaKey||event?.shiftKey?selectSearchObject(item,true):selectObject(item, true, true)); row.className = `object-row${item.populated === false ? " dnp" : ""}${selected?.id === item.id||grouped ? " selected" : ""}`;
        row.setAttribute("aria-pressed", String(selected?.id === item.id||grouped));
        const symbol=make("span");symbol.className="row-icon";if(root.KiCadUIIcons)symbol.append(root.KiCadUIIcons.icon(iconFor(item.kind)));const copy=make("span");copy.className="row-copy";copy.append(make("strong",item.label),make("small",`${item.properties.Value||item.kind}${$("allSheets").checked?` · ${item.path}`:""}`));row.append(symbol,copy);list.append(row);
      }
      if (!visible.length) list.append(make("p", "No objects match this search."));
    }
    function updateSheetNavigation(){
      if(pcb)return;const active=currentFile()||rootFile,home=rootSheetPath(rootFile,objects,files);
      $('sheetBack').disabled=!sheetVisits.target(-1);$('sheetForward').disabled=!sheetVisits.target(1);
      $('sheetUp').disabled=!objects.some(o=>o.kind==='sheet'&&sheetTarget(o)===active&&files.some(f=>f.path===o.path));
      $('sheetHome').disabled=!home||home===active;$('sheetHome').title=home?'Root sheet: '+home:'Root sheet is ambiguous or cyclic';
    }
    function historySheet(delta){
      const path=sheetVisits.move(delta);if(!path)return;
      try{openSheet(path);pointerWorld=null;}catch(error){sheetVisits.move(-delta);notice(error.message);}updateSheetNavigation();
    }
    function homeSheet(){const home=rootSheetPath(rootFile,objects,files);if(home){openSheet(home);pointerWorld=null;}else{navigate('sheets');notice('The loaded hierarchy has no unambiguous root sheet. Choose a sheet in the navigator.');}}
    function followSheet(path){if(!files.some(f=>f.path===path&&/\.kicad_sch$/i.test(path)))return false;const matches=netSheetMatches().get(path);openSheet(path);const net=matches?.length?netModel.nets.find(n=>n.id===matches[0].id):null;if(net)selectNet(net,true,false);else highlightSheet(path);return true;}
    function renderSheets(){updateSheetNavigation();
      const list=$("sheetList");list.replaceChildren();
      const query=$("sheetSearch").value.trim(),sheets=model.sheets.filter(s=>s.kind==='schematic'),links=objects.filter(o=>o.kind==='sheet');
      const entries=sheetEntries(sheets,links,query,collapsedSheets),toggles=new Map(),netSheets=netSheetMatches();
      const controls=make('div');controls.className='sheet-tree-controls';
      const expand=button('Expand all',()=>{collapsedSheets.clear();renderSheets();});
      const collapse=button('Collapse all',()=>{for(const sheet of sheets)collapsedSheets.add(sheet.path);renderSheets();});
      expand.disabled=collapse.disabled=Boolean(query)||!links.length;controls.append(expand,collapse);list.append(controls);
      const rows=make('div');rows.className='sheet-tree';rows.setAttribute('role','list');rows.setAttribute('aria-label','Schematic sheet hierarchy');list.append(rows);
      for(const entry of entries){
        const row=make('div');row.className='sheet-row';row.style.paddingLeft=Math.min(entry.depth,12)*12+'px';row.setAttribute('role','listitem');
        if(entry.unavailable){
          const missing=button(entry.link.label||entry.target.split('/').pop(),()=>selectObject(entry.link,true,true));missing.className='sheet-open sheet-missing';missing.title=`${entry.target} — referenced file was not loaded. Locate its sheet symbol.`;missing.setAttribute('aria-label',`${missing.textContent}, file unavailable. Locate sheet symbol`);
          const mark=make('span','!');mark.className='sheet-status';const spacer=make('span');spacer.className='sheet-toggle';row.append(spacer,missing,mark);rows.append(row);continue;
        }
        const {sheet,parents,hasChildren}=entry;
        const toggle=button(hasChildren?(collapsedSheets.has(sheet.path)&&!query?'▸':'▾'):'',()=>{if(collapsedSheets.has(sheet.path))collapsedSheets.delete(sheet.path);else collapsedSheets.add(sheet.path);renderSheets().get(sheet.path)?.focus();});
        toggle.className='sheet-toggle';toggle.disabled=!hasChildren||Boolean(query);toggle.title=hasChildren?`${collapsedSheets.has(sheet.path)?'Expand':'Collapse'} ${sheet.label||sheet.path.split('/').pop()}`:'';
        if(hasChildren)toggle.setAttribute('aria-expanded',String(!collapsedSheets.has(sheet.path)||Boolean(query)));toggles.set(sheet.path,toggle);
        const active=sheet.path===currentFile(),open=button('',()=>followSheet(sheet.path));open.className='sheet-open'+(active?' selected':'')+(netSheets.has(sheet.path)?' net-sheet-match':'');open.setAttribute('aria-current',active?'page':'false');open.title=sheet.path;
        const icon=make('span');icon.className='sheet-icon';if(root.KiCadUIIcons)icon.append(root.KiCadUIIcons.icon('sheet'));else icon.textContent='▤';
        const name=make('span',sheet.label||sheet.path.split('/').pop());name.className='sheet-name';open.append(icon,name);if(netSheets.has(sheet.path)){const badge=make('span','●');badge.className='sheet-net-badge';badge.title='Highlighted net: '+netSheets.get(sheet.path).map(n=>n.name).join(', ');open.append(badge);open.setAttribute('aria-label',`${sheet.label} · highlighted net present`);}row.append(toggle,open);
        const source=make('a','↗');source.className='sheet-source';source.title=`Open source: ${sheet.path}`;source.setAttribute('aria-label',source.title);source.href=(provider==='gitlab'?`${host}/${repository}/-/blob/`:`https://github.com/${repository}/blob/`)+encodeURIComponent(ref)+'/'+sheet.path.split('/').map(encodeURIComponent).join('/');source.target='_blank';source.rel='noopener noreferrer';
        for(const parent of parents){const locate=button('◎',()=>selectObject(parent,true,true));locate.className='sheet-locate';locate.title=`Locate ${parent.label||'sheet symbol'} in ${parent.path}`;locate.setAttribute('aria-label',locate.title);row.append(locate);}
        row.append(source);
        rows.append(row);
      }
      if(!entries.length)rows.append(make('p','No matching sheets.'));
      $("sheetCount").textContent=query?`${entries.filter(entry=>!entry.unavailable).length} matching sheets and ancestors`:`${sheets.length} loaded sheets`;
      $("sheetHelp").textContent=netSheets.size?`● Highlighted net appears in ${netSheets.size} loaded sheets. Select a marked sheet to follow it.`:'Select to open and highlight sheet group · ◎ locate in parent';$("sheetHelp").title=sheets.length===1?'Only one schematic is loaded. Parent discovery is limited to the same repository directory.':'Reused sheets share a file view; instance-specific connectivity is not resolved.';
      publishHierarchy();return toggles;
    }
    function boardAnalytics(){
      if(!pcb||!root.KiCadBomAnalytics)return null;const file=files.find(f=>f.path===currentFile());if(!file)return null;
      const cached=analyticsCache.get(file.path);if(cached?.content===file.content)return cached.result;
      try{const result=root.KiCadBomAnalytics.board(file.content);analyticsCache.set(file.path,{content:file.content,result});return result;}catch(error){return {error:error.message};}
    }
    function renderBom(){
      if(!root.KiCadBomAnalytics||!$("bomPane"))return;
      const all=root.KiCadBomAnalytics.bom(objects,$("bomAllSheets").checked?null:currentFile());
      $("bomSummary").textContent=`${all.total} components · ${all.fitted} fitted · ${all.dnp} DNP · ${all.excluded} excluded from BOM`;
      const query=$("bomSearch").value,rows=$("bomRows");rows.replaceChildren();let shown=0;
      for(const group of all.groups){const matches=group.parts.filter(o=>(!$("bomDnpOnly").checked||!o.populated)&&matchesSearch(o,query));if(!matches.length)continue;if(++shown>300)break;
        const row=make('section');row.className='bom-group';row.append(make('strong',`${matches.length} × ${group.value||'(no value)'} · ${group.populated?'Fitted':'DNP'}`),make('small',group.footprint||'(no footprint)'));
        for(const object of matches.slice(0,50)){const link=button(object.reference||object.label,()=>selectObject(object,true,true));link.title=object.path;row.append(link);}if(matches.length>50)row.append(make('small','First 50 references shown; narrow the filter.'));rows.append(row);
      }
      $("bomCount").textContent=`${Math.min(shown,300)} groups shown${shown>300?' · first 300; narrow filter':''}. BOM-excluded components are omitted from rows.`;
      const stats=$("boardStats"),zones=$("zoneStats");stats.replaceChildren();zones.replaceChildren();const board=boardAnalytics();
      $("analyticsLimits").textContent=board?.limits||'Counts represent loaded saved file/reference identities; reused sheet instances are not expanded. Multi-unit symbols count once. Assembly variants alter this view only.';
      if(board?.error){$("analyticsLimits").textContent=board.error;return;}if(!board)return;
      for(const [label,value]of Object.entries({'Footprints':board.footprints,'Pads':board.pads,'SMD pads':board.smdPads,'Through-hole pads':board.throughHolePads,'Drilled pads':board.drilledPads,'Track segments':board.segments,'Track arcs':board.arcs,'Vias':board.vias,'Zones':board.zones.length,'Straight track length':board.straightTrackLengthMm.toFixed(3)+' mm','Saved board thickness':board.boardThicknessMm===null?'Not saved':board.boardThicknessMm+' mm'})){stats.append(make('dt',label),make('dd',value));}
      for(const layer of board.layerFill){const row=make('p',`${layer.layer}: ${layer.areaMm2.toFixed(3)} mm² saved fill sum`);zones.append(row);}
      for(const zone of board.zones.slice(0,300)){const row=button(`${zone.name} · ${zone.fillAreaMm2.toFixed(3)} mm² fill sum`,()=>{const object=objects.find(o=>o.path===currentFile()&&o.kind==='zone'&&o.uuid===zone.uuid);if(object){selectObject(object,true,true);highlightObjects=[object];updateHighlights();}else notice('Zone has no selectable saved UUID.');});row.title=`Outline sum ${zone.outlineAreaMm2.toFixed(3)} mm² · ${zone.layers.join(', ')||'no saved fill'}`;zones.append(row);}
      if(board.warnings.length)$("analyticsLimits").textContent+=' '+board.warnings.slice(0,20).join(' ');
    }
    function variants() {
      $("variantSelect").replaceChildren();
      for (const item of model.variants) { const option = make("option", item.name); option.value = item.id; $("variantSelect").append(option); }
      $("variantSelect").value = variant;
      const parts = objects.filter((item) => ["symbol","footprint"].includes(item.kind));
      $("variantSummary").textContent = `${parts.filter((item) => item.populated).length} fitted · ${parts.filter((item) => !item.populated).length} DNP${variant === "default" ? "" : " · assembly overlay"}`;
      notice([...model.warnings,...files.map(f=>f.discoveryWarning).filter(Boolean)].join(" "));
      if (scene) scene.setPopulation(parts.filter((item) => item.kind === "footprint").map((item) => ({reference:item.reference,populated:item.populated})));
      renderObjects(); properties(); renderBom(); if(attach)updateHighlights(); draw();
    }
    function installConfig(next) {
      const candidate = KiCadDesignModel.buildProject(files, next);
      config = next; model = candidate;
      if (!model.variants.some((item) => item.id === variant)) variant = "default";
      objects = KiCadDesignModel.applyVariant(model, variant);
      if (selected) selected = objects.find((item) => item.id === selected.id) || null;
      variants();
    }
    function scope(file = currentFile() || rootFile) { return {repository, ref, file,...providerContext}; }
    function anchor(position = null, object = selected) {
      const net=!object?selectedNet:null;
      const value = {...scope(object?.path||net?.path), variant, ...(net?{kind:"net",netName:net.name,...(net.id?.length<=200?{objectId:net.id}:{})}:{}), ...(object?.uuid ? {uuid:object.uuid} : {}),
        ...(object?.id && object.id.length <= 200 ? {objectId:object.id} : {}), ...(object?.reference ? {reference:object.reference} : {}),
        ...(object?.kind ? {kind:object.kind} : {}), ...(position || object?.position ? {position:position || object.position} : {})};
      return KiCadReviewComments.normalizeAnchor(value);
    }
    function anchorLabel(value) { return `${value.reference || value.netName || value.kind || "Drawing"} · ${value.file}${value.position ? ` · ${value.position.x.toFixed(2)}, ${value.position.y.toFixed(2)} mm` : ""}${value.variant && value.variant !== "default" ? ` · ${value.variant}` : ""}`; }
    function editComment(note = null, at = null) {
      try { editor = note ? {...note} : {id:crypto.randomUUID(), createdAt:new Date().toISOString(), text:"", severity:"info", threadType:commentCategory!=="all"?commentCategory:$("githubCommentType").value||"issue", anchor:at || anchor()}; }
      catch (error) { commentStatus(error.message,true); inspector("comments"); return; }
      const type=KiCadReviewComments.commentType(editor);if(type){editor.threadType=type;$("githubCommentType").value=type;chooseCommentType();setCommentCategory(type,false);} $("commentEditor").hidden = false; $("commentAnchor").textContent=remoteAvailable?`${$("githubCommentType").value==="discussion"?"Discussion":"Issue"} · ${anchorLabel(editor.anchor)}; choose its destination below.`:`Local review: ${anchorLabel(editor.anchor)}`; $("commentText").value = editor.text; $("commentSeverity").value = editor.severity || "info";$("commentState").value=editor.state||"open";$("commentTags").value=(editor.tags||[]).join(", ");$("commentMentions").value=(editor.mentions||[]).map(login=>"@"+login).join(", ");
      inspector("comments","add"); $("commentText").focus();
      $("editorThreadType").value=editor.threadType||"issue";colorCommentControls();closeInlineMentions();pasteGeneration++;pasteBusy=false;$("editorTitle").value=root.KiCadCommentCompose?.titleFromText(editor.text)||"";configureEditorDestination();$("editorMarkdown").hidden=true;
      capturePreview();draw();
    }
    function capturePreview(){const image=$("capturePreview"),source=editor?.capture?.dataUrl||editor?.attachments?.[0]?.url;image.hidden=!source;if(source){image.src=source;image.referrerPolicy='no-referrer';}else image.removeAttribute?.('src');$("removeCapture").hidden=!source;$("captureComment").disabled=!editor?.anchor.area;$("captureStatus").textContent=source?`Screenshot saved with this note.${remoteAvailable?provider==='github'?' Post includes this image in the GitHub thread; upload requires repository write access.':' Post includes this image in the GitLab thread. Private/internal projects must require authentication to view media files.':` Download it to attach in a ${providerName} composer.`}`:editor?.anchor.area?'Capture the visible drawing inside this area.':'Paste a screenshot into the comment box, or draw an area to capture it.';}
    function setCommentMode(mode){commentMode=commentMode===mode?null:mode;areaStart=areaEnd=null;measureMode=false;measurePoints=[];getCanvas()?.canvas.classList?.toggle("ruler-mode",false);measurePreview=rulerSnap=boardMeasure=null;$("rulerControls").hidden=true;$("measureButton").setAttribute('aria-pressed','false');for(const [id,value] of [['pointComment','point'],['areaComment','area']])$(id).setAttribute('aria-pressed',String(commentMode===value));getCanvas()?.canvas.classList?.toggle('area-mode',Boolean(commentMode));commentStatus(commentMode==='area'?'Drag a rectangle on the drawing to comment.':commentMode==='point'?'Click the drawing to place a comment.':'');draw();}
    async function refreshComments() {
      const run = ++loadId, target = scope();
      try { const list = await request("comment-list",target); if (run !== loadId) return; notes = list; renderComments(); draw(); }
      catch (error) { if (run === loadId) { notes = []; commentStatus(error.message,true); renderComments(); } }
    }
    const severityColors = {critical:"#e65b69",major:"#ed9b49",minor:"#d4c64f",info:"#69bbdd"};
    function receipt(note) { try { return localStorage.getItem(KiCadReviewComments.receiptKey(note,receiptUser)); } catch { return null; } }
    function markRead(note,read) {
      try { const key=KiCadReviewComments.receiptKey(note,receiptUser);if(read)localStorage.setItem(key,new Date(note.updatedAt||note.createdAt).toISOString());else localStorage.removeItem(key);renderComments();draw(); }
      catch(error){commentStatus(`Read status could not be saved locally: ${error.message}`,true);}
    }
    function filterComments(items,filters,read){try{return KiCadReviewComments.sortAndFilter(items,filters,read);}catch(error){commentStatus(error.message,true);return[];}}
    function visibleNotes() {
      return filterComments([...notes,...remoteNotes],{
        createdFrom:$('commentCreatedFrom').value,createdTo:$('commentCreatedTo').value,threadType:commentCategory,severity:$("severityFilter").value,state:$("stateFilter").value,read:$("readFilter").value,
        order:$("commentSort").value,query:$("commentSearch").value
      },receipt);
    }
    function nextUnread() {
      const unread=filterComments([...notes,...remoteNotes],{
        createdFrom:$('commentCreatedFrom').value,createdTo:$('commentCreatedTo').value,threadType:commentCategory,severity:$("severityFilter").value,state:$("stateFilter").value,read:"unread",order:$("commentSort").value,query:$("commentSearch").value
      },receipt);
      if(!unread.length){commentStatus("No unread annotations match the current filters.");return;}
      unreadCursor=(unreadCursor+1)%unread.length;const note=unread[unreadCursor];
      if(note.anchor.file!==currentFile())openSheet(note.anchor.file,note.anchor.position);
      else if(note.anchor.position)focus(note.anchor.position);
      inspector("comments","view");commentStatus(`Unread ${unreadCursor+1} of ${unread.length}: ${anchorLabel(note.anchor)}`);
    }
    async function setNoteState(note,state) {
      try {const updatedAt=new Date(Math.max(Date.now(),Date.parse(note.updatedAt||note.createdAt)+1)).toISOString();
        await request("comment-save",{comment:KiCadReviewComments.validateComment({...note,state,updatedAt}),expectedUpdatedAt:note.updatedAt||note.createdAt});
        await refreshComments();options.onCommentsChanged?.();commentStatus(`Annotation marked ${state}.`);
      }catch(error){commentStatus(error.message,true);}
    }
    function assertNoteDestination(note){const selectedType=provider==='gitlab'?$("githubCommentType").value:$("commentDestination").value.includes("discussion")?"discussion":"issue";if(note.threadType&&note.threadType!==selectedType)throw new Error(`This note is marked ${note.threadType}. Choose a matching destination in the ${providerName} tab, or edit and save the note with a different type before publishing.`);}
    function draftOptions(note) {
      assertNoteDestination(note);const destination=$("commentDestination").value, targetRepository=options.pullRepository||repository;
      if(destination.startsWith("existing-")) {
        const targetNumber=Number($("threadNumber").value);
        if(!Number.isSafeInteger(targetNumber)||targetNumber<=0)throw new Error(`Enter a positive ${providerName} thread number.`);
        return {comment:note,targetType:destination.slice(9),targetNumber,targetRepository};
      }
      if(destination==="pull-request"&&!options.pullNumber)throw new Error("Open a pull-request file to comment on its PR.");
      return {comment:note,destination,...(destination==="pull-request"?{pullNumber:options.pullNumber,pullRepository:options.pullRepository}:{}),targetRepository};
    }
    async function publishNote(note,action,publication=null,recoveryNumber=null){
      let recoveryMessage;
      action.disabled=true;try{
        if(!publication)assertNoteDestination(note);const value=publication?.value||$("commentDestination").value,destination={issue:"new-issue",discussion:"new-discussion","existing-issue":"issue","existing-discussion":"discussion","pull-request":"issue"}[value];
        if(!remoteAvailable)throw new Error(`${providerName} publication is unavailable in this viewer.`);if(provider==='gitlab'&&!["issue","existing-issue"].includes(value))throw new Error("GitLab reviews use new issues or discussions on existing issues.");
        const number=value==="pull-request"?options.pullNumber:value.startsWith("existing-")?Number(publication?.number||$("threadNumber").value):undefined;
        if(!destination||(destination==="issue"||destination==="discussion")&&(!Number.isSafeInteger(number)||number<=0))throw new Error(`Choose a valid ${providerName} issue or discussion number.`);
        recoveryMessage={comment:note,destination,repository:options.pullRepository||repository,...(publication?.title?{title:publication.title}:{}),...(provider==='gitlab'&&note.threadType==='discussion'?{discussion:true}:{}),...(number?{number}:{}),...(destination==="new-discussion"?{categoryId:publication?.category||$("discussionCategory").value}:{})};
        const result=await request(recoveryNumber!==null?'github-recover-publication':provider==='gitlab'?'comment-publish':'github-publish-comment',{...recoveryMessage,...(recoveryNumber!==null?{recoveryNumber}:{})});
        const refs=[...(note.remoteRefs||[])];if(!refs.some(ref=>ref.url===result.remoteRef.url))refs.push(result.remoteRef);
        await request("comment-save",{comment:KiCadReviewComments.validateComment({...note,remoteRefs:refs,...(result.attachments?.length?{attachments:result.attachments}:{}),updatedAt:new Date(Math.max(Date.now(),Date.parse(note.updatedAt||note.createdAt)+1)).toISOString()}),expectedUpdatedAt:note.updatedAt||note.createdAt});await refreshComments();options.onCommentsChanged?.();$("githubCommentType").value=provider==="gitlab"?(note.threadType||"issue"):result.remoteRef.kind;chooseCommentType();$("commentDestination").value=provider==="gitlab"||result.remoteRef.kind==="issue"?"existing-issue":"existing-discussion";$("threadNumber").value=String(result.remoteRef.number);destinationChanged();if(result.recovered)action.closest('.publication-recovery')?.remove();commentStatus(`${result.recovered?'Recovered link to':'Posted to'} ${providerName} ${result.remoteRef.kind} #${result.remoteRef.number}. The linked conversation is saved below.`);return true;
      }catch(error){commentStatus(error.message+` Your draft remains saved. If ${providerName} accepted the post but local saving failed, retry Publish to recover its confirmed link.`,true);
        if(provider==='github'&&recoveryMessage&&recoveryNumber===null&&action.parentElement&&!action.parentElement.querySelector('.publication-recovery')){
          const row=make('div');row.className='publication-recovery';const label=make('label','Already posted? Check thread number '),input=make('input');input.type='number';input.min='1';input.step='1';input.setAttribute('aria-label','GitHub thread number for publication recovery');if(recoveryMessage.number)input.value=String(recoveryMessage.number);label.append(input);
          const selected={value:publication?.value||$('commentDestination').value,title:recoveryMessage.title,number:recoveryMessage.number,category:recoveryMessage.categoryId};
          const check=button('Recover published comment',()=>publishNote(note,check,selected,Number(input.value)));row.append(label,check,make('small','Read-only: checks for an exact annotation from the publishing account. It never creates another post.'));action.parentElement.append(row);
        }
        return false;}finally{action.disabled=false;}
    }
    function renderComments() {
      renderThread();
      for(const [type,node]of categoryButtons){const count=[...notes,...remoteNotes].filter(note=>type==='all'||KiCadReviewComments.commentType(note)===type).length;node.textContent=`${type==='issue'?'Issues':type==='discussion'?'Discussions':'All'} (${count})`;node.title='Total annotations before state, severity and date filters';}
      $("commentList").replaceChildren();
      const shown=visibleNotes();
      for (const note of shown) {
        const card=make("article");card.className="note severity-"+(note.severity||"info");
        const unread=KiCadReviewComments.isUnread(note,receipt(note));
        card.append(make("h3",root.KiCadCommentCompose?.titleFromText(note.text)||"Review comment"),make("strong",`${(note.severity||"info").toUpperCase()} · ${KiCadReviewComments.commentType(note)==='discussion'?'Discussion':KiCadReviewComments.commentType(note)==='issue'?'Issue':'Uncategorized'} · ${unread?"Unread":"Read"}`),make("small",anchorLabel(note.anchor)),make("p",note.text.split(/\r\n|\r|\n/).slice(1).join("\n")),
          make("small",`Created ${new Date(note.createdAt).toLocaleString()} · Updated ${new Date(note.updatedAt||note.createdAt).toLocaleString()} · ${note.github?`${providerName} ${note.github.source} #${note.github.number} · ${note.github.state} · ${note.github.author||""}`:"local"}`));
        if(note.mentions?.length)card.append(make("small",`Mentions: ${note.mentions.map(login=>"@"+login).join(", ")}`));
        if(note.github?.createdAt)card.append(make('small',`GitHub posted ${new Date(note.github.createdAt).toLocaleString()}${note.github.updatedAt?` · edited ${new Date(note.github.updatedAt).toLocaleString()}`:''}`));
        const actions=make("div");actions.className="inspector-actions";
        actions.append(button("Locate",()=>{if(note.anchor.file!==currentFile())openSheet(note.anchor.file,note.anchor.position);else if(note.anchor.position)focus(note.anchor.position);inspector("comments","view");}),
          button(unread?"Mark read":"Mark unread",()=>markRead(note,unread)));
        if(note.github){const link=make("a",`Open ${providerName} thread`);link.href=note.github.url;link.target="_blank";link.rel="noopener noreferrer";actions.append(link);if(provider==='github'&&remoteAvailable)actions.append(button('View thread',()=>readThread(note.github.source.startsWith('discussion')?'discussion':'issue',note.github.number)));
          if(remoteAvailable)actions.append(button('Reply',()=>{const type=provider==='gitlab'||note.github.source.startsWith('discussion')?'discussion':'issue';editComment({id:crypto.randomUUID(),createdAt:new Date().toISOString(),text:'',severity:'info',state:'open',threadType:type,anchor:{...note.anchor}});$("editorDestination").value=provider==='gitlab'||type==='issue'?'existing-issue':'existing-discussion';$("editorThreadNumber").value=String(note.github.number);editorDestinationChanged();commentStatus(`Reply draft for ${providerName} ${type} #${note.github.number}. Enter your text, then Comment.`);}));
        }
        else {const draft=button(`Open ${providerName} composer`,async()=>{try{await request("open-comment-draft",draftOptions(note));commentStatus("GitHub composer opened with the annotation and severity. Review and submit it there.");}catch(error){commentStatus(error.message,true);}});draft.className="github-draft-action";draft.hidden=!remoteAvailable||provider==='gitlab';actions.append(button("Edit",()=>editComment(note)),draft,
          button("Delete",async()=>{try{await request("comment-delete",{...scope(note.anchor.file),id:note.id});await refreshComments();options.onCommentsChanged?.();commentStatus("Local comment deleted.");}catch(error){commentStatus(error.message,true);}}));
        }
        if(!note.github){for(const [state,label] of [["open","Open"],["skipped","Skip"],["resolved","Resolve"]])if((note.state||"open")!==state)actions.append(button(label,()=>setNoteState(note,state)));}
        if(!note.github&&remoteAvailable){actions.append(button(`Choose ${providerName} destination`,()=>inspector("github")));const publish=button(`Publish to ${providerName}`,()=>publishNote(note,publish));publish.className="github-publish-action";publish.disabled=policyStatus?.allowed===false;if(publish.disabled)publish.title=policyStatus.reason||"Repository comment policy restricts publishing.";actions.append(publish);}
        if(!note.github){card.append(make("small",`State: ${note.state||"open"}${note.tags?.length?" · "+note.tags.join(", "):""}`));for(const ref of note.remoteRefs||[]){const link=make("a",`${ref.kind} #${ref.number}`);link.href=ref.url;link.target="_blank";link.rel="noopener noreferrer";card.append(link);if(provider==='github'&&remoteAvailable)card.append(button('View thread',()=>readThread(ref.kind==='discussion'?'discussion':'issue',ref.number)));}}
        if(note.capture){const image=make('img');image.src=note.capture.dataUrl;image.alt='Captured drawing area for this annotation';card.append(image);const download=make('a','Download screenshot');download.href=note.capture.dataUrl;download.download=`kicad-review-${note.id}.png`;actions.append(download);}
        else for(const attachment of note.attachments||[]){const image=make('img');image.src=attachment.url;image.alt='Published drawing screenshot';image.loading='lazy';image.referrerPolicy='no-referrer';card.append(image);}
        card.append(actions);$("commentList").append(card);
      }
      if(!shown.length)$("commentList").append(make("p","No annotations match these filters."));
      const linked=$("githubThreadList");linked.replaceChildren();const urls=new Set();
      for(const note of [...notes,...remoteNotes].filter(note=>commentCategory==='all'||KiCadReviewComments.commentType(note)===commentCategory))for(const thread of [...(note.remoteRefs||[]),...(note.github?[{url:note.github.url,kind:note.github.source,number:note.github.number}]:[])]){
        if(!thread.url||urls.has(thread.url))continue;urls.add(thread.url);const row=make("article");row.className="note";
        const link=make("a",`${thread.kind||"thread"} #${thread.number}`);link.href=thread.url;link.target="_blank";link.rel="noopener noreferrer";row.append(link,make('p',note.text));if(provider==='github'&&remoteAvailable)row.append(button('View thread',()=>readThread(thread.kind?.startsWith('discussion')?'discussion':'issue',thread.number)));linked.append(row);
      }
      if(!urls.size)linked.append(make("p",`No linked conversations for this drawing. Publish a saved note or load ${providerName} annotations.`));
    }
    async function loadGitHub() {
      const run=++remoteLoad,target=scope();$("refreshGitHub").disabled=true;
      try{const result=await request(provider==='gitlab'?"comment-remote-list":"github-annotations",{...target,includeDiscussions:$("commentDestination").value.includes("discussion"),...(options.pullNumber?{pullNumber:options.pullNumber,pullRepository:options.pullRepository}:{}),
          ...(['existing-issue','existing-discussion'].includes($("commentDestination").value)&&Number.isSafeInteger(Number($("threadNumber").value))&&Number($("threadNumber").value)>0?{[$("commentDestination").value==='existing-discussion'?'discussionNumber':'issueNumber']:Number($("threadNumber").value)}:{})});
        if(run!==remoteLoad||target.file!==scope().file)return;remoteNotes=result.notes;renderComments();draw();commentStatus(`Loaded ${remoteNotes.length} ${providerName} annotations. ${result.warnings.join(" ")}`);
      }catch(error){if(run===remoteLoad)commentStatus(error.message,true);}finally{if(run===remoteLoad)$("refreshGitHub").disabled=false;}
    }
    function point(event) {
      const canvas = getCanvas(); if (!canvas?.viewport?.camera || !canvas.canvas) return null;
      const rect = canvas.canvas.getBoundingClientRect();
      const world = canvas.viewport.camera.screen_to_world({x:event.clientX-rect.left,y:event.clientY-rect.top});
      return Number.isFinite(world?.x) && Number.isFinite(world?.y) ? {x:world.x,y:world.y} : null;
    }
    function screen(at) {
      const canvas = getCanvas(); if (!canvas?.canvas || !canvas.viewport?.camera || !at) return null;
      const rect = canvas.canvas.getBoundingClientRect(), host = $("drawingHost").getBoundingClientRect();
      const p = canvas.viewport.camera.world_to_screen(at);
      return Number.isFinite(p?.x) && Number.isFinite(p?.y) ? {x:p.x+rect.left-host.left,y:p.y+rect.top-host.top} : null;
    }
    function svg(tag, attrs) { const node = document.createElementNS("http://www.w3.org/2000/svg",tag); for (const [key,value] of Object.entries(attrs)) node.setAttribute(key,String(value)); return node; }
    function draw() {
      const overlay = $("reviewOverlay"), pins = $("commentPins"); overlay.replaceChildren(); pins.replaceChildren();
      if (scene) return;
      const active = currentFile() || rootFile;if(!pcb)sheetVisits.visit(active);refreshNets();
      if(showRatsnest&&pcb&&root.KiCadRatsnest){if(ratsnestSource!==netSource){ratsnestSource=netSource;ratsnestResult=root.KiCadRatsnest.build(netModel.nets.filter(n=>n.path===active));}for(const line of ratsnestResult.lines){if(selectedNet&&line.netId!==selectedNet.id)continue;const a=screen(line.a),b=screen(line.b);if(a&&b)overlay.append(svg('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#53a9d1','stroke-width':1,'stroke-dasharray':'5 4',opacity:.8}));}}
      if (active !== lastFile) {
        lastFile = active;threadTicket++;loadedThread=null;threadMessages.replaceChildren();threadStatus.textContent='';threadLoad.disabled=false;pointerWorld=null;measurePoints=[];measurePreview=rulerSnap=boardMeasure=null;refreshNets(); $("selectionStatus").textContent="Select a part or net to inspect"; remoteLoad++; remoteNotes=[]; $("refreshGitHub").disabled=false; $("activeSheet").textContent = active; $("activeSheet").title = active;
        $("sheetSelect").value = active;renderSheets();
        if (selected?.path !== active) {selected = null;nativePick = null;properties();}
        renderObjects(); renderBom(); refreshComments();
      }
      if (selected?.path === active && selected.position) {
        const canvas=getCanvas(),geometry=(canvas?.primitives||canvas?.design?.primitives||[]).filter(p=>p.uuid===selected.uuid||p.ownerUuid===selected.uuid),box=root.KiCadOwnedCanvas?.bounds(geometry);
        if(box){const a=screen({x:box.x,y:box.y}),b=screen({x:box.x+box.w,y:box.y+box.h});if(a&&b)overlay.append(svg('rect',{x:Math.min(a.x,b.x)-4,y:Math.min(a.y,b.y)-4,width:Math.abs(b.x-a.x)+8,height:Math.abs(b.y-a.y)+8,fill:'none',stroke:'#29a873','stroke-width':2,'stroke-dasharray':'6 3'}));}
        const p = screen(selected.position); if (p) overlay.append(svg("circle",{cx:p.x,cy:p.y,r:10,fill:"none",stroke:"#29a873","stroke-width":2}));
      }
      const baseById = new Map(model.objects.map((item) => [item.id,item]));
      let marks = 0;
      for (const item of objects) {
        if (item.path !== active || !["symbol","footprint"].includes(item.kind) || !item.position || ++marks > 1000) continue;
        const p = screen(item.position); if (!p) continue;
        if (!item.populated) {
          overlay.append(svg("line",{x1:p.x-10,y1:p.y-10,x2:p.x+10,y2:p.y+10,stroke:"#dc675b","stroke-width":2}),svg("line",{x1:p.x-10,y1:p.y+10,x2:p.x+10,y2:p.y-10,stroke:"#dc675b","stroke-width":2}));
        }
        if (variant !== "default" && item.properties.Value !== baseById.get(item.id)?.properties.Value) {
          const label = svg("text",{x:p.x+14,y:p.y-12,fill:"#aa5c13","font-size":12,"paint-order":"stroke",stroke:"#fff","stroke-width":3}); label.textContent = `Variant: ${item.properties.Value || ""}`; overlay.append(label);
        }
      }
      const rulerPoints=measurePoints.length===1&&measurePreview?[measurePoints[0],measurePreview]:measurePoints;
      if(rulerPoints.length===2){const a=screen(rulerPoints[0]),b=screen(rulerPoints[1]);if(a&&b){
        if(boardMeasure)overlay.append(svg('rect',{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(b.x-a.x),height:Math.abs(b.y-a.y),fill:'none',stroke:'#28a3cf','stroke-width':1,'stroke-dasharray':'4 4'}));
        overlay.append(svg('path',{d:`M ${a.x} ${a.y} L ${b.x} ${a.y} L ${b.x} ${b.y}`,fill:'none',stroke:'#28a3cf','stroke-width':1,'stroke-dasharray':'3 4'}));
        overlay.append(svg('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#28a3cf','stroke-width':2,'stroke-dasharray':measurePoints.length===1?'5 3':'none'}));
        for(const p of [a,b])overlay.append(svg('path',{d:`M ${p.x-5} ${p.y} h 10 M ${p.x} ${p.y-5} v 10`,stroke:'#28a3cf','stroke-width':2}));
        const label=(x,y,value)=>{const box=$('drawingHost').getBoundingClientRect();x=Math.max(8,Math.min(x,box.width-value.length*7-8));y=Math.max(18,Math.min(y,box.height-12));const text=svg('text',{x,y,fill:'#006ca8',stroke:'#fff','stroke-width':3,'paint-order':'stroke','font-size':12});text.textContent=value;overlay.append(text);};
        const units=options.getRulerUnits?.()||'mm',result=KiCadReviewTools.ruler(...rulerPoints,units),factor=units==='mil'?1000/25.4:1;
        label((a.x+b.x)/2+8,(a.y+b.y)/2-8,boardMeasure?`${(boardMeasure.width*factor).toFixed(3)} x ${(boardMeasure.height*factor).toFixed(3)} ${units}`:`${(result.distance*factor).toFixed(3)} ${units} / ${result.angle.toFixed(1)} deg`);label((a.x+b.x)/2,a.y-12,`X: ${(Math.abs(result.dx)*factor).toFixed(3)} ${units}`);label(b.x+12,(a.y+b.y)/2,`Y: ${(Math.abs(result.dy)*factor).toFixed(3)} ${units}`);
        $('measurementStatus').textContent=(boardMeasure?'Board extents - ':measurePoints.length===1?'Live - ':'Pinned - ')+result.text;
      }}
      if(measureMode&&rulerSnap&&measurePoints.length<2){const p=screen(rulerSnap.point);if(p){overlay.append(svg('circle',{cx:p.x,cy:p.y,r:6,fill:'none',stroke:rulerSnap.kind==='free'?'#28a3cf':'#d48100','stroke-width':2}));}}
      function areaRect(value,color){const a=screen({x:value.x,y:value.y}),b=screen({x:value.x+value.width,y:value.y+value.height});if(a&&b)overlay.append(svg('rect',{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(b.x-a.x),height:Math.abs(b.y-a.y),fill:color+'18',stroke:color,'stroke-width':2,'stroke-dasharray':'6 3'}));}
      for(const note of visibleNotes())if(note.anchor.area)areaRect(note.anchor.area,severityColors[note.severity||'info']);
      if(editor?.anchor.area&&editor.anchor.file===active&&!$('commentEditor').hidden)areaRect(editor.anchor.area,'#218bd0');
      if(areaStart&&areaEnd){try{areaRect(KiCadReviewTools.area(areaStart,areaEnd),'#218bd0');}catch{}}
      for(const object of highlightObjects.filter(o=>o.path===active).slice(0,200)){const geometry=(getCanvas()?.primitives||[]).filter(p=>object.uuid&&(p.uuid===object.uuid||p.ownerUuid===object.uuid)),box=root.KiCadOwnedCanvas?.bounds(geometry);if(box){const a=screen(box),b=screen({x:box.x+box.w,y:box.y+box.h});if(a&&b)overlay.append(svg('rect',{x:Math.min(a.x,b.x)-3,y:Math.min(a.y,b.y)-3,width:Math.abs(b.x-a.x)+6,height:Math.abs(b.y-a.y)+6,fill:'none',stroke:'#e6a834','stroke-width':2}));}}
      if(activeConnection?.position){const p=screen(activeConnection.position);if(p)overlay.append(svg('circle',{cx:p.x,cy:p.y,r:12,fill:'none',stroke:'#39bce5','stroke-width':3}),svg('path',{d:`M ${p.x-18} ${p.y} h 36 M ${p.x} ${p.y-18} v 36`,stroke:'#39bce5','stroke-width':1}));}
      navigation?.draw(overlay,pins,screen,svg);
      visibleNotes().forEach((note,index) => {const p = screen(note.anchor.position);if(!p)return;const pin=button(String(index+1),()=>{inspector("comments","view");commentStatus(note.text);});pin.className="pin";pin.style.background=severityColors[note.severity||"info"];pin.setAttribute("aria-label",`Comment ${index+1}: ${note.text.slice(0,60)}`);pin.style.left=p.x+"px";pin.style.top=p.y+"px";pins.append(pin);});
    }
    function menu(event) {
      event.preventDefault(); if (scene || rightDown?.moved) return;
      const at = point(event), canvas = getCanvas(); if (!at) return;
      const hits = canvas.layers?.query_point(at) || [];
      const picked = hits.map((entry) => resolveObject(objects,currentFile(),entry.bbox?.context)).find(Boolean);
      if (picked) selectObject(picked);
      const pickedNet=netModel.nets.find(net=>net.path===currentFile()&&hits.some(hit=>net.primitives.includes(hit.bbox?.primitive)));
      const holder = $("objectMenu"); holder.replaceChildren();
      if (picked) {holder.append(button("Inspect properties",()=>{inspector("properties");holder.hidden=true;}),button("Focus object",()=>{focus(picked.position || at);holder.hidden=true;}));}
      if(pickedNet)holder.append(button("Highlight "+pickedNet.name,()=>{selectNet(pickedNet);holder.hidden=true;}));
      holder.append(button(picked ? "Comment on object" : "Comment here",()=>{editComment(null,anchor(at,picked || null));holder.hidden=true;}));
      if (picked?.kind === "sheet") holder.append(button("Open subsheet",()=>{openSubsheet(picked);holder.hidden=true;}));
      holder.style.left=Math.max(5,Math.min(event.clientX,innerWidth-190))+"px";holder.style.top=Math.max(5,Math.min(event.clientY,innerHeight-150))+"px";holder.hidden=false;
    }
    function openSubsheet(item = selected) {
      if(pcb||item?.kind!=='sheet')return;
      const path = sheetTarget(item);
      if (path && files.some(file=>file.path===path)) {openSheet(path);pointerWorld=null;}
      else notice("The referenced subsheet is missing from this revision.");
    }
    function parentSheet(){
      const parents=[...new Set(objects.filter(o=>o.kind==='sheet'&&sheetTarget(o)===currentFile()).map(o=>o.path))];
      if(parents.length===1){openSheet(parents[0]);pointerWorld=null;}
      else {navigate('sheets');notice(parents.length?'This sheet has multiple parents; choose one in the sheet browser.':'No loaded parent sheet. Choose a sheet in the sheet browser.');}
    }
    function hitsAt(at){return at?(getCanvas()?.layers?.query_point(at)||[]):[];}
    function objectAt(at){return hitsAt(at).map(hit=>resolveObject(objects,currentFile(),hit.bbox?.context)).find(Boolean);}
    function inspectPointer(){const object=objectAt(pointerWorld);if(object)selectObject(object);properties();inspector('properties');}
    function highlightPointerNet(){
      const hits=hitsAt(pointerWorld),net=netModel.nets.find(n=>n.path===currentFile()&&hits.some(hit=>n.primitives.includes(hit.bbox?.primitive)));
      if(net)selectNet(net);else {const pointed=objectAt(pointerWorld)||selected,linked=netsForObject(pointed);if(linked.length===1)selectNet(linked[0]);else if(linked.length){netFilterObject=pointed.id;navigate('nets');}else notice('Point at a saved wire, pin, pad or copper item to highlight its net.');}
    }
    function rulerPoint(event){
      const c=getCanvas(),at=point(event);if(!at)return null;
      const pitch=Number($('rulerPitch').value);if(!Number.isFinite(pitch)||pitch<.001||pitch>100){$('rulerSnapStatus').textContent='Grid spacing must be 0.001-100 mm';return null;}
      const primitives=(c.design?.primitives||[]).filter(p=>(!p.layer||c.visibleLayers.has(p.layer))&&(!c.focusedLayer||c.layerFocusMode!=='isolate'||p.layer===c.focusedLayer||p.layer==='Edge.Cuts'));
      rulerSnap=KiCadReviewTools.snap(at,primitives,{mode:$('rulerSnap').value||'geometry-grid',pitch,zoom:c.viewport.camera.zoom,origin:measurePoints.length===1?measurePoints[0]:null,constrain:event.shiftKey,bypass:event.altKey,arcThrough:KiCadOwnedCanvas.arcThrough});
      $('rulerSnapStatus').textContent=`${rulerSnap.kind} - ${rulerSnap.point.x.toFixed(4)}, ${rulerSnap.point.y.toFixed(4)} mm`+(rulerSnap.constrained?' - axis constrained':'');return rulerSnap.point;
    }
    function attachCanvas(canvas) {
      if (attach?.canvas === canvas) return;
      attach?.dispose();
      const selection = (event) => {if(programmaticPick)return;nativePick=event.detail?.item;if(navigatorTab==="nets"){const primitive=canvas.selected,net=netModel.nets.find(n=>n.path===currentFile()&&n.primitives.includes(primitive));if(net){selectNet(net);return;}}const object=resolveObject(objects,currentFile(),nativePick);if(object&&($("multiHighlight").checked||event.detail?.multi))selectSearchObject(object,true,undefined,false);else selectObject(object);};
      const pick = (event) => {
        if(ignoreClick){ignoreClick=false;event.preventDefault();event.stopImmediatePropagation();return;}
        if(commentMode==='point'){event.preventDefault();event.stopImmediatePropagation();const at=point(event);if(at){setCommentMode(null);editComment(null,anchor(at,null));}return;}
        if (!measureMode) return; event.preventDefault();event.stopImmediatePropagation();const at=rulerPoint(event);if(!at)return;
        if(measurePoints.length>=2)measurePoints=[];measurePoints.push(at);measurePreview=null;boardMeasure=null;
        const result=measurePoints.length===2&&measurement(...measurePoints);
        $("measurementStatus").textContent=result?KiCadReviewTools.ruler(...measurePoints,options.getRulerUnits?.()||'mm').text:"Choose the second measurement point.";draw();
      };
      const down=(event)=>{if(event.button===0&&commentMode==='area'){event.preventDefault();event.stopImmediatePropagation();areaStart=point(event);areaEnd=areaStart;canvas.canvas.setPointerCapture?.(event.pointerId);draw();}else if(event.button===2)rightDown={x:event.clientX,y:event.clientY,moved:false};};
      const move=(event)=>{pointerWorld=point(event);if(measureMode&&event.buttons!==2&&event.buttons!==4){const at=rulerPoint(event);if(at){measurePreview=measurePoints.length===1?at:null;draw();}}if(areaStart&&commentMode==='area'){areaEnd=point(event);draw();}if(rightDown&&event.buttons===2&&Math.hypot(event.clientX-rightDown.x,event.clientY-rightDown.y)>4)rightDown.moved=true;};
      const up=(event)=>{if(!areaStart||commentMode!=='area')return;event.preventDefault();event.stopImmediatePropagation();const a=areaStart,b=point(event);canvas.canvas.releasePointerCapture?.(event.pointerId);ignoreClick=true;try{const area=KiCadReviewTools.area(a,b);setCommentMode(null);editComment(null,{...anchor({x:area.x+area.width/2,y:area.y+area.height/2},null),area});}catch(error){areaStart=areaEnd=null;commentStatus(error.message,true);draw();}};
      const leave=()=>{pointerWorld=null;if(measureMode&&measurePoints.length<2){measurePreview=rulerSnap=null;$("rulerSnapStatus").textContent="Move over the drawing to preview";draw();}};
      const cancel=()=>{measurePreview=null;rulerSnap=null;areaStart=areaEnd=null;ignoreClick=false;draw();};
      const doubleClick=event=>{if(pcb||scene||measureMode||commentMode||event.button>0)return;const item=objectAt(point(event));if(item?.kind==='sheet'){event.preventDefault();openSubsheet(item);}};
      canvas.addEventListener("kicad:select",selection);canvas.canvas.addEventListener('dblclick',doubleClick);
      canvas.canvas.addEventListener("click",pick,true);canvas.canvas.addEventListener("contextmenu",menu);canvas.canvas.addEventListener("pointerdown",down,true);canvas.canvas.addEventListener("pointermove",move);canvas.canvas.addEventListener('pointerup',up,true);canvas.canvas.addEventListener('pointercancel',cancel);canvas.canvas.addEventListener('pointerleave',leave);
      attach={canvas,dispose(){canvas.canvas.removeEventListener('dblclick',doubleClick);canvas.removeEventListener("kicad:select",selection);canvas.canvas.removeEventListener("click",pick,true);canvas.canvas.removeEventListener("contextmenu",menu);canvas.canvas.removeEventListener("pointerdown",down,true);canvas.canvas.removeEventListener("pointermove",move);canvas.canvas.removeEventListener('pointerup',up,true);canvas.canvas.removeEventListener('pointercancel',cancel);canvas.canvas.removeEventListener('pointerleave',leave);}};
      draw();
    }
    $("projectButton").onclick=()=>request("open-project-overview",{repository,ref,file:rootFile}).catch(error=>notice(error.message));
    $("viewerKind").textContent=pcb?"PCB layout viewer":"Schematic viewer";
    $("navigatorHeading").textContent="Project explorer";

    $("navSheets").hidden=pcb;$("sheetSearch").oninput=renderSheets;$("sheetLabel").hidden=pcb;$("allSheets").parentElement.hidden=pcb;
    $("variantBar").hidden=false;
    for(const sheet of model.sheets){const option=make("option",sheet.label||sheet.path);option.value=sheet.path;$("sheetSelect").append(option);}
    $("sheetSelect").onchange=()=>openSheet($("sheetSelect").value);
    const topSheets=make("nav");topSheets.id="topSheetNavigation";topSheets.className="top-sheet-navigation";topSheets.setAttribute("aria-label","Active sheet and history");topSheets.hidden=pcb;
    topSheets.append($("sheetLabel"),...['sheetBack','sheetForward','sheetUp','sheetHome'].map(id=>{const node=$(id);node.classList.toggle("icon-only",true);return node;}));$("frameControls").append(topSheets);
    const extraControls=make("div");extraControls.id="extraReviewControls";extraControls.className="review-control-popover";extraControls.hidden=true;extraControls.append($("variantBar"),$("highlightControls"),$("shortcutHelp"),$("diagnostics"));document.body?.append(extraControls);
    const controlsButton=button("Review tools",()=>{extraControls.hidden=!extraControls.hidden;controlsButton.setAttribute("aria-expanded",String(!extraControls.hidden));});controlsButton.id="reviewToolsButton";controlsButton.title="Assembly variants and highlight controls";controlsButton.setAttribute("aria-controls",extraControls.id);controlsButton.setAttribute("aria-expanded","false");$("frameControls").append(controlsButton);
    const updateReviewToolsHint=()=>{const hasNotes=!$("diagnostics").hidden;controlsButton.textContent=hasNotes?'Review tools · notes':'Review tools';controlsButton.title='Assembly variants, highlights and keyboard guide'+(hasNotes?' · '+$("diagnosticCount").textContent:'');};
    const reviewToolsObserver=root.MutationObserver?new root.MutationObserver(updateReviewToolsHint):null;reviewToolsObserver?.observe($("diagnostics"),{attributes:true,childList:true,subtree:true,characterData:true});updateReviewToolsHint();
    const companionValid=path=>typeof path==='string'&&KiCadBrowserData.validPath(path)&&/\.kicad_pcb$/i.test(path)!==pcb;
    const companionChooser=make("div");companionChooser.id="companionChooser";companionChooser.hidden=true;const companionSelect=make("select");companionSelect.id="oppositeDrawingSelect";companionSelect.setAttribute("aria-label",pcb?"Choose schematic drawing":"Choose PCB layout");
    const companionMessage=make("p");companionMessage.className="hint";
    const openCompanion=async path=>{if(!companionValid(path))throw new Error("Choose a saved drawing of the opposite type.");await request(root.KiCadVSCodeContext?"open-project-drawing":"open-viewer-window",{repository,ref,file:path});companionChooser.hidden=true;};
    const companionButton=button(pcb?"View schematic":"View layout",async()=>{companionButton.disabled=true;try{
      if(companionValid(options.pairedFile)){await openCompanion(options.pairedFile);return;}
      const listing=await request(root.KiCadVSCodeContext?"project-inventory":"drawing-files",{repository,ref,file:rootFile});
      if(!Array.isArray(listing?.files)||listing.files.length>1000)throw new Error("Invalid companion drawing listing.");
      const choices=[...new Set(listing.files.map(item=>typeof item==='string'?item:item?.path).filter(companionValid))];
      if(choices.length===1){await openCompanion(choices[0]);return;}
      companionSelect.replaceChildren(make("option",choices.length?"Choose a drawing…":"No companion drawing found"));companionSelect.children[0].value="";
      for(const path of choices){const node=make("option",path);node.value=path;companionSelect.append(node);}companionSelect.value="";companionSelect.disabled=!choices.length;companionChooser.hidden=false;
      companionMessage.textContent=(choices.length?"Choose the saved drawing to open.":"No opposite drawing is listed in this project directory.")+(listing.warnings?.length?' '+listing.warnings.slice(0,3).join(' '):'');
    }catch(error){notice(error.message);}finally{companionButton.disabled=false;}});companionButton.id="viewOppositeDrawing";$("frameControls").append(companionButton);
    companionSelect.onchange=()=>{if(companionSelect.value)openCompanion(companionSelect.value).catch(error=>notice(error.message));};const closeChooser=button("Close",()=>{companionChooser.hidden=true;});companionChooser.append(companionSelect,companionMessage,closeChooser);document.body?.append(companionChooser);
    $("closeNavigator").onclick=()=>showNavigator(false);
    function restoreFocusView(){document.body?.classList?.remove('drawing-focused');if($('focusView'))$('focusView').textContent='Focus view';}
    const focusView=button('Focus view',()=>{const focused=document.body?.classList?.toggle('drawing-focused');showNavigator(false);hideInspector();focusView.textContent=focused?'Restore controls':'Focus view';});focusView.id='focusView';focusView.title='Maximize drawing area (Ctrl+Shift+F); Esc restores controls';$('frameControls').append(focusView);
    if(pcb&&root.KiCadRatsnest){const ratsnestButton=button('Ratsnest',()=>{showRatsnest=!showRatsnest;ratsnestButton.setAttribute('aria-pressed',String(showRatsnest));draw();if(showRatsnest)notice(`Candidate connections: ${ratsnestResult?.lines.length||0}. ${ratsnestResult?.warnings.join(' ')||''}`);});ratsnestButton.title='Read-only candidate airwires from saved copper; not native KiCad unrouted/DRC';ratsnestButton.setAttribute('aria-pressed','false');$('frameControls').append(ratsnestButton);}
    for(const name of ["parts","sheets","nets","layers","search","rules","bom"])$("nav"+name[0].toUpperCase()+name.slice(1)).onclick=()=>navigate(name);
    $("netSearch").oninput=()=>{netFilterObject=null;renderNets();};$("clearNet").onclick=()=>{netFilterObject=null;selectNet(null);};
    $("selectObjectNet").onclick=()=>{const linked=netsForObject(selected);if(linked.length===1)selectNet(linked[0]);else{netFilterObject=selected?.id;navigate("nets");}};
    $("partsButton").onclick=()=>showNavigator($("designNavigator").hidden);
    $("propertiesButton").onclick=()=>$("designInspector").hidden?inspector("properties"):hideSidebar("properties");
    $("commentsButton").onclick=()=>commentsSidebar.hidden?inspector("comments"):hideSidebar("comments");
    $("showProperties").onclick=()=>inspector("properties");$("showComments").onclick=()=>inspector("comments","view");$("showGitHub").onclick=()=>inspector("github");$("closeInspector").onclick=()=>hideSidebar("properties");
    $("partSearch").oninput=renderObjects;$("objectFilter").onchange=renderObjects;$("allSheets").onchange=renderObjects;
    $("focusSelected").onclick=()=>{if(selectedNet)focusNet(selectedNet);else if(selected)selectObject(selected,true,true);};$("openSelectedSheet").onclick=()=>openSubsheet();
    $("commentSelected").onclick=()=>editComment(null,selectedNet?anchor(selectedNet.members.find(m=>m.position)?.position,{path:selectedNet.path,id:selectedNet.id,kind:"net",reference:selectedNet.name.slice(0,100)}):null);$("newComment").onclick=()=>editComment();
    function destinationChanged(){const value=$("commentDestination").value;$("githubCommentType").value=provider==='gitlab'?$("githubCommentType").value:value.includes("discussion")?"discussion":"issue";$("threadNumberLabel").hidden=!value.startsWith("existing-");for(const id of ["discussionCategoryLabel","loadCategories"])$(id).hidden=value!=="discussion";$("threadNumber").placeholder=value.includes("discussion")?"Discussion number":"Issue number";}
    function chooseCommentType(initial=false){const discussion=$("githubCommentType").value==="discussion", choices=discussion?(provider==='gitlab'?[["existing-issue","Discussion on an existing issue"]]:[["discussion","New discussion"],["existing-discussion","Existing discussion"]]):[["issue","New issue"],["existing-issue","Existing issue"],...(provider==='github'&&options.pullNumber?[["pull-request",`This pull request #${options.pullNumber}`]]:[])];
      $("commentDestination").replaceChildren();for(const [value,label]of choices){const item=make("option",label);item.value=value;$("commentDestination").append(item);}$("commentDestination").value=initial&&provider==='github'&&options.pullNumber?"pull-request":choices[0][0];destinationChanged();if(editor){$("editorThreadType").value=$("githubCommentType").value;configureEditorDestination();}if(editor)$("commentAnchor").textContent=remoteAvailable?`${$("githubCommentType").value==="discussion"?"Discussion":"Issue"} · ${anchorLabel(editor.anchor)}; choose its destination below.`:`Local review: ${anchorLabel(editor.anchor)}`;}
    $("githubCommentType").value="issue";$("githubCommentType").onchange=()=>{chooseCommentType();setCommentCategory($("githubCommentType").value,false);};$("commentDestination").onchange=destinationChanged;chooseCommentType(true);
    const targetRepository=options.pullRepository||repository;
    $("repositoryIssues").href=provider==='gitlab'?`${host}/${targetRepository}/-/issues`:`https://github.com/${targetRepository}/issues`;$("repositoryDiscussions").href=provider==='gitlab'?$("repositoryIssues").href:`https://github.com/${targetRepository}/discussions`;
    $("githubAvailability").textContent=remoteAvailable?`Repository: ${targetRepository}. Configure your account in settings to publish directly. ${providerName} repository permissions and review policy apply.${provider==='gitlab'?' GitLab discussions are conversations on an existing issue.':''}`:provider==='gitlab'?"GitLab remote collaboration is available in the browser extension. This VS Code viewer stores review notes in your workspace.":"GitHub remote collaboration is available in the browser extension. This VS Code viewer stores review notes in your workspace.";
    $("showGitHub").textContent=providerName;$("postComment").textContent=`Post to ${providerName}`;$("editorAccount").textContent=`${providerName} account`;$("editorPreview").textContent=`Preview ${providerName} Markdown`;$("refreshGitHub").textContent=`Load ${providerName} annotations`;
    if(provider==='gitlab'){
      const labels=[["commentPublishSettings","h3","Post to GitLab"],["githubPane","h2","GitLab collaboration"],["commentsPane","p.hint","Save notes locally, create a GitLab issue, or post a discussion on an existing issue. Read status belongs to this browser user."],["githubPane",".collaboration-guide","Choose Issue for a new task or Discussion to comment on an existing GitLab issue. Set the issue number, add severity, tags and mentions, then Post to GitLab. Follow replies and notifications in the linked issue. Local review state does not close an issue. Attach downloaded screenshots manually on GitLab."]];
      for(const[id,selector,text]of labels){const node=id==='commentsPane'&&selector==='p.hint'?commentHelp:$(id).querySelector?.(selector);if(node)node.textContent=text;}
      $("repositoryDiscussions").textContent="Issue discussions";
    }
    $("githubAvailableControls").hidden=!remoteAvailable;
    $("refreshGitHub").onclick=loadGitHub;
    $("refreshCommentPolicy").onclick=refreshCommentPolicy;
    $("reviewSettings").onclick=async()=>{try{await request("open-options");}catch(error){commentStatus(error.message,true);}};
    $("loadCategories").onclick=async()=>{try{if(provider!=='github')throw new Error("GitLab discussions belong to issues and have no GitHub category.");const categories=await request("github-discussion-categories",{repository:options.pullRepository||repository});$("discussionCategory").replaceChildren();for(const category of categories){const option=make("option",category.name);option.value=category.id;$("discussionCategory").append(option);}}catch(error){commentStatus(error.message,true);}};$("severityFilter").onchange=()=>{renderComments();draw();};
    $("cancelComment").onclick=()=>{$("commentEditor").hidden=true;editor=null;pasteGeneration++;pasteBusy=false;closeInlineMentions();showCommentTab("view");draw();};
    $("pointComment").onclick=()=>setCommentMode('point');$("areaComment").onclick=()=>setCommentMode('area');
    $("stateFilter").onchange=$("readFilter").onchange=$("commentSort").onchange=$("commentSearch").oninput=()=>{unreadCursor=-1;renderComments();draw();};
    $("nextUnread").onclick=nextUnread;
    $("captureComment").onclick=()=>{try{const c=getCanvas();c.draw();editor.capture=KiCadReviewTools.capture(c.canvas,c.viewport.camera,editor.anchor.area);capturePreview();}catch(error){$("captureStatus").textContent=error.message;}};
    $("removeCapture").onclick=()=>{pasteGeneration++;pasteBusy=false;delete editor.capture;delete editor.attachments;capturePreview();};
    function configureEditorDestination(){
      const discussion=$("editorThreadType").value==="discussion";
      const choices=discussion?(provider==='gitlab'?[["existing-issue","Discussion on an existing issue"]]:[["discussion","New discussion"],["existing-discussion","Existing discussion"]]):[["issue","New issue"],["existing-issue","Existing issue"],...(provider==='github'&&options.pullNumber?[["pull-request",`This pull request #${options.pullNumber}`]]:[])];
      $("editorDestination").replaceChildren();for(const[value,label]of choices){const item=make("option",label);item.value=value;$("editorDestination").append(item);}$("editorDestination").value=choices[0][0];
      $("editorThreadNumber").value=$("threadNumber").value;editorDestinationChanged();
    }
    function editorDestinationChanged(){const value=$("editorDestination").value;$("editorNumberLabel").hidden=!value.startsWith("existing-");$("editorTitleLabel").hidden=true;$("editorCategoryLabel").hidden=$("editorLoadCategories").hidden=value!=="discussion";$("editorThreadNumber").placeholder=value.includes("discussion")?"Discussion number":"Issue number";}
    function editorNote(){if(!editor)throw new Error("Create or select a note first.");return KiCadReviewComments.validateComment({...editor,threadType:remoteAvailable?$("editorThreadType").value||"issue":editor.threadType,text:$("commentText").value,severity:$("commentSeverity").value,state:$("commentState").value,tags:$("commentTags").value.split(",").map(tag=>tag.trim()).filter(Boolean),mentions:[...new Set([...$("commentMentions").value.split(/[\s,]+/).map(login=>login.trim()).filter(Boolean),...(root.KiCadCommentCompose?.extractMentions($("commentText").value,provider)||[])])],updatedAt:new Date(Math.max(Date.now(),Date.parse(editor.updatedAt||editor.createdAt)+1)).toISOString()});}
    async function saveEditor(post=false){
      if(pasteBusy){commentStatus("Wait for the pasted screenshot to finish preparing.",true);return;}if(!editor||$("saveComment").disabled)return;$("saveComment").disabled=$("postComment").disabled=true;
      try{const saved=editorNote();let publication;
        if(post){if(!remoteAvailable)throw new Error(`${providerName} publication is unavailable in this viewer.`);const value=$("editorDestination").value,number=Number($("editorThreadNumber").value),category=$("editorCategory").value,title=root.KiCadCommentCompose?.titleFromText($("commentText").value)||$("editorTitle").value.trim();
          if(value.startsWith("existing-")&&(!Number.isSafeInteger(number)||number<=0))throw new Error(`Enter a positive ${providerName} thread number.`);if(value==="discussion"&&!category)throw new Error("Load and select a discussion category.");publication={value,number,category,title};}
        await request("comment-save",{comment:saved,...(editor.updatedAt?{expectedUpdatedAt:editor.updatedAt}:{})});editor=saved;await refreshComments();options.onCommentsChanged?.();
        if(!post||await publishNote(saved,$("postComment"),publication)){$("commentEditor").hidden=true;editor=null;showCommentTab("view");if(!post)commentStatus(remoteAvailable?`Draft saved. Edit this note and choose Comment to share it remotely.`:"Annotation saved in the configured review store.");}
      }catch(error){commentStatus(error.message,true);}finally{$("saveComment").disabled=$("postComment").disabled=false;}
    }
    $("postComment").textContent="Comment";$("commentPublishSettings").hidden=!remoteAvailable;$("saveComment").textContent=remoteAvailable?"Save draft":"Save comment";
    $("editorThreadType").onchange=()=>{if(editor)editor.threadType=$("editorThreadType").value;$("githubCommentType").value=$("editorThreadType").value;chooseCommentType();setCommentCategory($("editorThreadType").value,false);colorCommentControls();};$("editorDestination").onchange=editorDestinationChanged;
    $("editorAccount").onclick=$("reviewSettings").onclick;
    $("editorLoadCategories").onclick=async()=>{try{if(provider!=='github')throw new Error("GitLab discussions belong to issues and have no GitHub category.");const categories=await request("github-discussion-categories",{repository:targetRepository});$("editorCategory").replaceChildren();for(const category of categories){const item=make("option",category.name);item.value=category.id;$("editorCategory").append(item);}$("editorCategory").value=categories[0]?.id||"";}catch(error){commentStatus(error.message,true);}};
    $("editorPreview").onclick=()=>{try{$("editorMarkdown").textContent=KiCadReviewComments.toMarkdown(editorNote()).replace(/<!--[\s\S]*?-->/g,"").trim();$("editorMarkdown").hidden=false;}catch(error){commentStatus(error.message,true);}};
    $("saveComment").onclick=()=>saveEditor();$("postComment").onclick=()=>saveEditor(true);
    const download=(name,text)=>{const link=make("a");link.download=name;link.href=URL.createObjectURL(new Blob([text],{type:"application/json"}));link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);};
    $("exportComments").onclick=()=>{try{download("kicad-review-comments.json",KiCadReviewComments.exportComments(notes));}catch(error){commentStatus(error.message,true);}};
    $("importComments").onclick=()=>$("commentFile").click();
    $("commentFile").onchange=async()=>{
      const file=$("commentFile").files?.[0];if(!file)return;let saved=0;
      try{if(file.size>1024*1024)throw new Error("Comment import exceeds 1 MiB.");const imported=KiCadReviewComments.parseComments(await file.text());
        if(imported.some((note)=>(note.anchor.provider||'github')!==provider||(provider==='gitlab'&&(note.anchor.host||'https://gitlab.com')!==host)||note.anchor.repository!==repository||note.anchor.ref!==ref||!files.some((source)=>source.path===note.anchor.file)))throw new Error("These comments belong to another repository, revision, or drawing.");
        for(const note of imported){await request("comment-save",{comment:note});saved++;}await refreshComments();if(saved)options.onCommentsChanged?.();commentStatus(`Imported ${saved} comments.`);
      }catch(error){await refreshComments();if(saved)options.onCommentsChanged?.();commentStatus(`${error.message}${saved?` ${saved} comments were saved before the error.`:""}`,true);}finally{$("commentFile").value="";}
    };
    $("exportBom").onclick=()=>{if(!root.KiCadBomAnalytics)return;const csv=root.KiCadBomAnalytics.csv(root.KiCadBomAnalytics.bom(objects,$("bomAllSheets").checked?null:currentFile()));const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));const a=make("a");a.href=url;a.download="kicad-review-bom.csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
    for(const id of ["bomAllSheets","bomDnpOnly","bomSearch"])$(id).oninput=renderBom;
    $("highlightDnp").onchange=()=>{dnpHighlight=$("highlightDnp").checked;updateHighlights();draw();};
    $("variantSelect").onchange=()=>{variant=$("variantSelect").value;objects=KiCadDesignModel.applyVariant(model,variant);if(selected)selected=objects.find((item)=>item.id===selected.id)||null;variants();};
    $("importVariant").onclick=()=>$("variantFile").click();
    $("variantFile").onchange=async()=>{const file=$("variantFile").files?.[0];if(!file)return;
      try{if(file.size>1024*1024)throw new Error("Variant file exceeds 1 MiB.");const next=KiCadDesignModel.parseVariantConfig(await file.text(),file.name);installConfig(next);if(chrome.storage?.local)await chrome.storage.local.set({[variantKey]:next});}
      catch(error){notice(error.message);}finally{$("variantFile").value="";}
    };
    $("measureButton").onclick=()=>{if(commentMode)setCommentMode(null);measureMode=!measureMode;measurePoints=[];measurePreview=rulerSnap=boardMeasure=null;$("rulerControls").hidden=!measureMode;getCanvas()?.canvas.classList?.toggle("ruler-mode",measureMode);$("measureBoard").hidden=!pcb;if(measureMode)getCanvas().gridPitch=Number($("rulerPitch").value)||1;$("measureButton").setAttribute("aria-pressed",String(measureMode));$("measurementStatus").textContent=measureMode?"Click a start point, move to preview, then click to finish.":"";draw();};
    $('clearRuler').onclick=()=>{measurePoints=[];measurePreview=rulerSnap=boardMeasure=null;$('measurementStatus').textContent='Click a start point';$('rulerSnapStatus').textContent='Click a start point';draw();};
    $('rulerSnap').onchange=()=>{measurePreview=rulerSnap=null;draw();};$('rulerPitch').onchange=()=>{const pitch=Number($('rulerPitch').value);if(!Number.isFinite(pitch)||pitch<.001||pitch>100){$('rulerSnapStatus').textContent='Grid spacing must be 0.001-100 mm';return;}getCanvas().gridPitch=pitch;measurePreview=rulerSnap=null;getCanvas().draw();};
    $('measureBoard').onclick=()=>{const extent=KiCadReviewTools.boardExtents(getCanvas()?.design?.primitives,KiCadOwnedCanvas.arcThrough);if(!extent){$('measurementStatus').textContent='No saved Edge.Cuts geometry to measure';return;}boardMeasure=extent;measurePoints=[{x:extent.x,y:extent.y},{x:extent.x+extent.width,y:extent.y+extent.height}];measurePreview=rulerSnap=null;draw();$('rulerSnapStatus').textContent='Saved outline bounding extents (not DRC validation)';};
    const reviewKeydown=event=>{
      if(event.defaultPrevented||event.repeat||event.composedPath().some(node=>node?.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(node?.tagName||'')))return;
      if(event.key==='Escape'){$('objectMenu').hidden=true;extraControls.hidden=companionChooser.hidden=true;controlsButton.setAttribute('aria-expanded','false');document.body?.classList?.remove('drawing-focused');focusView.textContent='Focus view';if(commentMode)setCommentMode(null);if(selectedNet||pinnedNets.size||pinnedClasses.size||highlightObjects.length)clearHighlights();if(measureMode)$('measureButton').click();return;}
      if(event.ctrlKey&&event.shiftKey&&event.key.toLowerCase()==='f'&&!event.altKey&&!event.metaKey){event.preventDefault();const focused=document.body?.classList?.toggle('drawing-focused');focusView.textContent=focused?'Restore controls':'Focus view';showNavigator(false);hideInspector();return;}
      if(event.altKey&&!event.ctrlKey&&!event.metaKey&&!pcb&&!scene&&['ArrowLeft','ArrowRight','Home'].includes(event.key)){event.preventDefault();if(event.key==='Home')homeSheet();else historySheet(event.key==='ArrowLeft'?-1:1);return;}
      if(event.altKey&&event.key==='ArrowUp'&&!event.ctrlKey&&!event.metaKey&&!pcb&&!scene){event.preventDefault();parentSheet();return;}
      if(event.ctrlKey||event.altKey||event.metaKey)return;
      const key=event.key.toLowerCase();
      if(key==='e'){event.preventDefault();if(scene){properties();inspector('properties');}else inspectPointer();}
      else if(key==='/'){event.preventDefault();navigate('search');$('projectSearch').focus();}
      else if((key==='h'||key==='`'||key==='~'||event.code==='Backquote')&&!scene){event.preventDefault();highlightPointerNet();}
      else if(key==='c'){event.preventDefault();const item=objectAt(pointerWorld)||selected;editComment(null,item?anchor(item.position,item):pointerWorld?anchor(pointerWorld,null):null);}
      else if(key==='m'&&!scene){event.preventDefault();$('measureButton').click();}
      else if(event.key==='Enter'&&!pcb&&!scene&&selected?.kind==='sheet'&&!event.composedPath().some(node=>/^(BUTTON|A)$/.test(node?.tagName||''))){event.preventDefault();openSubsheet();}
      else if(event.key===' '&&!scene&&event.target===getCanvas()?.canvas&&pointerWorld){event.preventDefault();focus(pointerWorld);}
      else if(event.key==='?'){event.preventDefault();$('shortcutHelp').open=!$('shortcutHelp').open;if($('shortcutHelp').open){extraControls.hidden=false;controlsButton.setAttribute('aria-expanded','true');}}
    };
    addEventListener('keydown',reviewKeydown);
    addEventListener("pointerdown",(event)=>{if(!$("objectMenu").contains(event.target))$("objectMenu").hidden=true;if(!extraControls.hidden&&!extraControls.contains(event.target)&&!controlsButton.contains(event.target)){extraControls.hidden=true;controlsButton.setAttribute('aria-expanded','false');}});
    // A pane can become narrow after pairing, focusing or resizing the popup.
    const narrowPanels = matchMedia("(max-width:1000px)");
    const keepDrawingVisible = layoutSidebars;
    narrowPanels.addEventListener?.("change", keepDrawingVisible);
    if(root.KiCadReviewNavigation&&root.KiCadProjectSearch&&root.KiCadRuleReports)navigation=root.KiCadReviewNavigation.mount({
      repository,ref,rootFile,request,getFiles:()=>files,getObjects:()=>objects,getNets:()=>netModel.nets,currentFile,
      is3D:()=>Boolean(scene),redraw:draw,showRules:showRuleWindow,onRuleReportLoaded:()=>{reportSources.open=false;showRuleWindow();},selectSearchObject,highlightSearchObjects,
      isHighlighted:o=>o.kind==='net'?highlightedNets().some(n=>n.path===o.path&&n.name===o.netName):o.kind==='netclass'?pinnedClasses.has(JSON.stringify([o.path,o.className])):highlightObjects.some(item=>item.id===o.id),setMultiHighlight:on=>{if(!on){const keep=selectedNet||highlightedNets()[0];pinnedNets.clear();pinnedClasses.clear();selectedNet=keep||null;highlightObjects=keep?[]:highlightObjects.slice(0,1);activeConnection=null;connectionCursor=-1;updateHighlights();renderObjects();emitHighlightGroup();renderNets();renderNetClasses();navigation?.renderSearch();}},
      setNetClasses:config=>{classConfig=config;pinnedClasses.clear();renderNetClasses();updateHighlights();},
      followSheet,
      addSearchFiles:incoming=>{for(const file of incoming){const previous=files.find(f=>f.path===file.path);if(previous&&previous.content!==file.content)throw new Error("Loaded drawing differs from the search snapshot; refresh before navigating results.");}for(const file of incoming){if(/\.kicad_pcb$/i.test(file.path)!==pcb)continue;const existing=files.find(f=>f.path===file.path);if(existing&&existing.content!==file.content)throw new Error('Loaded drawing differs from the search snapshot; refresh before navigating results.');if(!existing)files.push(file);}model=KiCadDesignModel.buildProject(files,config);objects=KiCadDesignModel.applyVariant(model,variant);renderObjects();renderSheets();},
      locateRule:target=>{if(!files.some(f=>f.path===target.file)){notice('The report item drawing is not loaded. Index the project first.');return false;}if(/\.kicad_pcb$/i.test(target.file)!==pcb){notice('Open the matching drawing viewer to navigate this report item.');return false;}if(scene){notice('Rule arrows are available in 2D.');return false;}if(target.file!==currentFile())openSheet(target.file,target.position);else focus(target.position);return true;}
    });
    $('highlightControls').hidden=false;$('highlightStyle').onchange=updateHighlights;$('clearHighlights').onclick=clearHighlights;
    $('fitHighlights').onclick=()=>{const canvas=getCanvas(),box=root.KiCadOwnedCanvas?.bounds([...canvas.netPrimitives||[]]);if(box){canvas.resize();const margin=Math.max(3,Math.max(box.w,box.h)*.1);canvas.viewport.camera.bbox={x:box.x-margin,y:box.y-margin,w:box.w+margin*2,h:box.h+margin*2};canvas.draw();}};
    $('previousConnection').onclick=()=>cycleConnection(-1);$('nextConnection').onclick=()=>cycleConnection(1);
    $('netClassSelect').onchange=renderNetClasses;
    if(!remoteAvailable){if(commentHelp)commentHelp.textContent=provider==='gitlab'?'Notes are saved in your workspace review file. Export them to share with your team. Read status belongs to this browser user.':'Notes are saved in your workspace review file. GitHub account integration is available in the browser extension.';for(const id of ['reviewSettings','refreshCommentPolicy','refreshGitHub','loadCategories','discussionCategoryLabel','threadNumberLabel'])$(id).hidden=true;$('commentDestination').parentElement.hidden=true;}
    $('sheetBack').onclick=()=>historySheet(-1);$('sheetForward').onclick=()=>historySheet(1);$('sheetUp').onclick=parentSheet;$('sheetHome').onclick=homeSheet;
    $('highlightNetClass').onclick=()=>{const name=$('netClassSelect').value;if(!classConfig||!name)return;const key=JSON.stringify([currentFile(),name]),existed=pinnedClasses.has(key);if(!$('multiHighlight').checked){pinnedNets.clear();pinnedClasses.clear();highlightObjects=[];selectedNet=null;}if(existed)pinnedClasses.delete(key);else if(pinnedClasses.size<64)pinnedClasses.set(key,{path:currentFile(),name});activeConnection=null;connectionCursor=-1;updateHighlights();renderNets();renderNetClasses();emitHighlightGroup();};
    root.KiCadUIIcons?.decorate();$("schematicLayersHint").hidden=pcb;showNavigator(false);variants();
    if(chrome.storage?.local)chrome.storage.local.get(variantKey).then((saved)=>{if(saved[variantKey])installConfig(saved[variantKey]);}).catch((error)=>notice(error.message));
    refreshCommentPolicy();
    return {attachCanvas,draw,refreshNets,refreshComments,highlightRelated,followSheet,select3D(record){nativePick=record;const object=resolveObject(objects,rootFile,record);selectObject(object,false,false,true);},
      comment3D(record){const object=resolveObject(objects,rootFile,record);if(object)editComment(null,anchor(object.position,object));else notice("This 3D object has no unambiguous saved part anchor; switch to 2D to place a comment.");},
      setScene(next){scene=next;$("highlightControls").hidden=Boolean(scene);$("highlightDnp").disabled=Boolean(scene);for(const id of ["measureButton","navNets","navLayers","pointComment","areaComment"])$(id).disabled=Boolean(scene);if(scene&&navigatorTab!=="parts")navigate("parts");if(scene){setCommentMode(null);measureMode=false;measurePoints=[];getCanvas()?.canvas.classList?.toggle("ruler-mode",false);measurePreview=rulerSnap=boardMeasure=null;$("rulerControls").hidden=true;$("measureButton").setAttribute("aria-pressed","false");$("measurementStatus").textContent="";scene.setPopulation(objects.filter((item)=>item.kind==="footprint").map((item)=>({reference:item.reference,populated:item.populated})));}draw();},
      dispose(){threadTicket++;pasteGeneration++;mentionDisposed=true;mentionGeneration++;clearTimeout(mentionTimer);loadId++;remoteLoad++;netBuilder?.clear();reviewToolsObserver?.disconnect();sidebarObserver?.disconnect();root.removeEventListener?.('resize',layoutSidebars);root.removeEventListener?.('resize',ruleResize);ruleWindowObserver?.disconnect();for(const cleanup of resizeCleanups)cleanup();root.removeEventListener?.('keydown',reviewKeydown);narrowPanels.removeEventListener?.("change",keepDrawingVisible);navigation?.dispose();attach?.dispose();}}
  }
  root.KiCadReviewWorkspace={mount,resolveObject,measurement,matchesSearch,sheetTarget,sheetEntries,sheetHistory,rootSheetPath};
  if(typeof module==="object"&&module.exports)module.exports=root.KiCadReviewWorkspace;
})(globalThis);
