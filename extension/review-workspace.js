/* Dedicated schematic/PCB review workspace. Source drawings are never edited. */
((root) => {
  "use strict";
  const netDisplayName=net=>root.KiCadNetModel?.displayName?.(net)||net?.displayName||net?.name||'Unnamed network';
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
  function touchNetIndex(nets, path) {
    const index=new Map();
    for(const net of nets)if(net.path===path)for(const primitive of net.primitives||[]){
      if(!['wire','junction','pin','label','global_label','hierarchical_label','track','arc','pad','via','zone','zone-outline'].includes(primitive.kind))continue;
      const linked=index.get(primitive)||[];if(!linked.some(n=>n.id===net.id))linked.push(net);index.set(primitive,linked);
    }
    return index;
  }
  function touchNetCandidates(primitives,index) {
    const choices=new Map();for(const primitive of primitives)for(const net of index.get(primitive)||[]){
      if(!choices.has(net.id))choices.set(net.id,{net,layers:new Set()});
      if(primitive.layer)choices.get(net.id).layers.add(primitive.layer);
    }
    return [...choices.values()];
  }
  // Keep saved part identity when a pad or pin belongs to a component.
  function selectionCandidates(primitives,index,objects,path,mode='all') {
    const choices=[];
    if(mode!=='part')for(const entry of touchNetCandidates(primitives,index))choices.push({...entry,kind:'net'});
    if(mode!=='net'){
      const seen=new Set();
      for(const primitive of primitives){
        let object=resolveObject(objects,path,{uuid:primitive.uuid,reference:primitive.reference,parent:primitive.ownerUuid?{uuid:primitive.ownerUuid}:null});
        if(object?.parentId)object=objects.find(o=>o.id===object.parentId&&o.path===path);
        if(!object||!['symbol','footprint'].includes(object.kind)||seen.has(object.id))continue;
        seen.add(object.id);choices.push({kind:'part',object,layers:new Set(primitive.layer?[primitive.layer]:[])});
      }
    }
    return choices;
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
  // Gallery canvases use their own rendered primitives, never primitive identities
  // from a different file or a prior cached drawing.
  function sheetPageHighlights(nets, selection, design, path) {
    const wanted=new Set(selection?.netIds||[]), uuids=new Set(selection?.uuids||[]);
    const groups=(nets||[]).filter(net=>net.path===path&&wanted.has(net.id));
    const primitives=(design?.primitives||[]).filter(p=>uuids.has(p.uuid)||uuids.has(p.ownerUuid));
    return [...groups,...(primitives.length?[{primitives}]:[])];
  }
  // Logical intersheet airwires join only connectivity resolved by the net model.
  // One representative saved connection point per sheet avoids a dense mesh.
  function composeSheetOverview(entries,links=[],dark=false) {
    const primitives=[],pages=[],highlighted=[],columns=Math.max(1,Math.ceil(Math.sqrt(entries.length)));
    const cellWidth=Math.max(297,...entries.map(e=>e.design.page?.width||297))+35;
    const cellHeight=Math.max(210,...entries.map(e=>e.design.page?.height||210))+40;
    entries.forEach((entry,index)=>{
      const x=index%columns*cellWidth,y=Math.floor(index/columns)*cellHeight+14,w=entry.design.page?.width||297,h=entry.design.page?.height||210;
      const shift=p=>({...p,x:p.x+x,y:p.y+y});
      const instanceCount=entry.instanceCount||1;
      // A reused source is rendered once; backing pages show its placements.
      for(let depth=Math.min(3,instanceCount-1);depth>0;depth--){const offset=depth*3;primitives.push({type:'polygon',points:[{x:x+offset,y:y+offset},{x:x+w+offset,y:y+offset},{x:x+w+offset,y:y+h+offset},{x:x+offset,y:y+h+offset}],color:dark?'#344958':'#d4dfe8',fill:true,stroke:false,pick:false});}
      const background={type:'polygon',points:[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}],color:dark?'#192a34':'#fff',fill:true,stroke:false,pick:false};
      primitives.push(background,{type:'text',x,y:y-7,text:entry.label+(instanceCount>1?` · ${instanceCount} instances`:''),size:4,minPixelSize:12,bold:true,align:'left',color:dark?'#dbe7ed':'#172d3b',pick:false});
      if(entry.instanceLabel)primitives.push({type:'text',x,y:y-2,text:entry.instanceLabel+(entry.totalInstanceCount>instanceCount?` · ${instanceCount} of ${entry.totalInstanceCount} connected`:''),size:2.5,minPixelSize:10,align:'left',color:dark?'#a9bdca':'#536779',pick:false});
      const selected=new Set(entry.groups.flatMap(g=>g.primitives||[]));
      for(const source of entry.design.primitives){
        const p={...source,frame:false,sourcePath:entry.path,sourceInstanceId:entry.instanceId};
        if(Number.isFinite(source.x)&&Number.isFinite(source.y)){p.x=source.x+x;p.y=source.y+y;}
        for(const key of ['start','mid','end','connectPoint'])if(source[key]&&Number.isFinite(source[key].x))p[key]=shift(source[key]);
        if(source.points)p.points=source.points.map(shift);
        primitives.push(p);if(selected.has(source))highlighted.push(p);
      }
      pages.push({path:entry.path,x,y,w,h,label:entry.label,instanceCount,instances:entry.instances||[],placements:entry.placements||[],instanceId:entry.instanceId});
    });
    const airwires=[];
    for(const link of links){
      const endpoint=end=>{const page=pages.find(p=>p.path===end.path);if(!page)return null;const layer=end.instanceId?page.placements.findIndex(p=>p.id===end.instanceId):0;if(end.instanceId&&page.placements.length&&layer<0)return null;const offset=end.instanceId===page.instanceId?0:Math.min(3,Math.max(0,layer))*3;return {x:page.x+offset+(end.position?.x??page.w/2),y:page.y+offset+(end.position?.y??page.h/2)};};
      const from=endpoint(link.from),to=endpoint(link.to);if(from&&to)airwires.push({type:'line',points:[from,to],color:'#ddb333',width:.35,pick:false,name:link.name});
    }
    return {design:{primitives,layers:[...new Set(entries.flatMap(e=>e.design.layers||[]))],page:{width:columns*cellWidth,height:Math.ceil(entries.length/columns)*cellHeight}},pages,highlighted,airwires};
  }
  function sheetOverviewEntries(sheets,links){
    const entries=sheetEntries(sheets,links),byPath=new Map(entries.filter(e=>e.sheet).map(e=>[e.sheet.path,e]));
    const outgoing=new Map(),incoming=new Set();
    for(const [index,link]of links.entries()){const target=sheetTarget(link);if(!byPath.has(link.path)||!byPath.has(target))continue;if(!outgoing.has(link.path))outgoing.set(link.path,[]);outgoing.get(link.path).push({link,target,index});incoming.add(target);}
    for(const entry of byPath.values()){entry.instanceCount=0;entry.instances=[];entry.placements=[];}
    let placements=0,truncated=false;
    const visit=(path,names,ancestors,chain=[path],parentId=null,sheetId=null)=>{if(ancestors.has(path))return;if(placements>=4096){truncated=true;return;}placements++;const entry=byPath.get(path),id=JSON.stringify(chain);entry.instanceCount++;if(entry.instances.length<256)entry.instances.push(names.join(' / '));entry.placements.push({id,path,parentId,sheetId,label:names.join(' / ')});const next=new Set(ancestors);next.add(path);for(const {link,target,index}of outgoing.get(path)||[])visit(target,[...names,link.label||byPath.get(target).sheet.label||target],next,[...chain,`${link.uuid||link.id||index}:${target}`],id,link.uuid||link.id||null);};
    for(const [path,entry]of byPath)if(!incoming.has(path))visit(path,[entry.sheet.label||path],new Set());
    // Cyclic/unrooted sources remain visible without inventing placements.
    for(const [path,entry]of byPath)if(!entry.instanceCount){entry.instanceCount=1;entry.instances=[entry.sheet.label||path];entry.placements=[{id:JSON.stringify([path]),path,parentId:null,sheetId:null,label:entry.sheet.label||path,unresolved:true}];entry.instanceUnresolved=true;}
    if(truncated)for(const entry of byPath.values())entry.instanceTruncated=true;
    return entries;
  }
  function overviewNetLinks(nets, selectedIds, hierarchy=[]) {
    const edges=[],seen=new Set();
    for(const id of [...new Set(selectedIds)].slice(0,200)){
      const related=root.KiCadNetModel?.relatedSchematicNets(nets,id,hierarchy)?.matches||[];
      const byPath=new Map();
      for(const net of related)if(!byPath.has(net.path))byPath.set(net.path,net);
      const selected=nets.find(net=>net.id===id),source=selected&&byPath.get(selected.path);
      if(!source)continue;
      const endpoint=net=>{
        const members=(net.members||[]).filter(m=>Number.isFinite(m.position?.x)&&Number.isFinite(m.position?.y));
        const member=members.find(m=>['global_label','hierarchical_label','sheet_pin'].includes(m.kind))||members[0];
        return {path:net.path,netId:net.id,position:member?{...member.position}:null};
      };
      for(const target of byPath.values()){
        if(target.path===source.path)continue;
        const key=[source.id,target.id].sort().join('\n');if(seen.has(key))continue;seen.add(key);
        edges.push({name:source.name,from:endpoint(source),to:endpoint(target)});
        if(edges.length>=512)return edges;
      }
    }
    return edges;
  }
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
  function objectNetLookup(){
    let source=null,paths=new Map(),order=new Map();
    return (model,object)=>{
      if(!object)return[];
      if(source!==model){
        source=model;paths=new Map();order=new Map();
        for(const [rank,net]of model.nets.entries()){
          order.set(net,rank);if(!paths.has(net.path))paths.set(net.path,{ids:new Map(),owners:new Map()});
          const index=paths.get(net.path),add=(map,key)=>{if(!map.has(key))map.set(key,[]);map.get(key).push(net);};
          for(const id of new Set(net.objectIds))add(index.ids,id);
          for(const owner of new Set(net.primitives.map(p=>p.ownerUuid)))add(index.owners,owner);
        }
      }
      const index=paths.get(object.path);if(!index)return[];
      const direct=index.ids.get(object.id)||[];
      if(!['symbol','footprint'].includes(object.kind))return direct;
      return [...new Set([...direct,...(index.owners.get(object.uuid)||[])])].sort((a,b)=>order.get(a)-order.get(b));
    };
  }
  // Build population overlays only when source objects or the selected variant change.
  // Panning must not index every copper segment on a large board each frame.
  function populationOverlayCache(){
    let source=null,base=null,variantId=null,paths=new Map();
    return (objects,model,variant,path)=>{
      if(source!==objects||base!==model||variantId!==variant){
        source=objects;base=model;variantId=variant;paths=new Map();
        const originals=variant==='default'?null:new Map(model.objects.map(item=>[item.id,item]));
        for(const item of objects){
          if(!['symbol','footprint'].includes(item.kind)||!item.position)continue;
          const changed=Boolean(originals&&item.properties.Value!==originals.get(item.id)?.properties.Value);
          if(item.populated&&!changed)continue;
          if(!paths.has(item.path))paths.set(item.path,[]);
          paths.get(item.path).push({item,changed});
        }
      }
      return paths.get(path)||[];
    };
  }
  function mount(options) {
    const { files, repository, ref, rootFile, pcb, getCanvas, currentFile, focus, openSheet } = options;
    const retainedControls=new Map();
    const $ = (id) => {const node=document.getElementById(id)||retainedControls.get(id);if(node)retainedControls.set(id,node);return node;};
    const make = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = String(text); return node; };
    const button = (text, handler) => { const node = make("button", text); node.type = "button"; node.onclick = handler; return node; };
    const provider=options.provider||'github',providerName=provider==='gitlab'?'GitLab':'GitHub',host=provider==='gitlab'?KiCadReviewComments.normalizeScope({provider:'gitlab',host:options.host||'https://gitlab.com',repository,ref,file:rootFile}).host:'https://github.com',providerContext=provider==='gitlab'?{provider,host}:{}, remoteAvailable=['github','gitlab'].includes(provider)&&!root.KiCadVSCodeContext&&!root.KiCadLocalRuntime;
    const request = async (type, extra = {}) => { const reply = await chrome.runtime.sendMessage({type, ...extra,...providerContext}); if (!reply?.ok) throw new Error(reply?.error || "The extension could not complete this request."); return reply.result; };
    let config = null, model = options.initialModel||KiCadDesignModel.buildProject(files), objects = KiCadDesignModel.applyVariant(model, "default");
    let pointerWorld=null;
    const collapsedSheets = new Set(),sheetVisits=sheetHistory();
    let variant = "default", selected = null, lastFile = null, notes = [], remoteNotes = [], remoteLoad = 0, loadId = 0, editor = null;
    let receiptUser = "local-profile", unreadCursor = -1, policyStatus = null;
    const analyticsCache=new Map(),routingAnalyticsCache=new Map(); let dnpHighlight=false;
    let testpointHighlight=false,testpointSource=null,testpointClassifier=null,testpointPaths=new Map(),testpointIds=new Set();
    function testpointsForPath(path){
      const classify=root.KiCadTestpointTools?.classify;
      if(testpointSource!==objects||testpointClassifier!==classify){
        testpointSource=objects;testpointClassifier=classify;testpointPaths=new Map();testpointIds=new Set();
        if(classify)for(const object of objects)if(['symbol','footprint'].includes(object.kind)&&classify(object)){
          if(!testpointPaths.has(object.path))testpointPaths.set(object.path,[]);
          testpointPaths.get(object.path).push(object);testpointIds.add(object.id);
        }
      }
      return testpointPaths.get(path)||[];
    }
    let programmaticPick=false;
    let navigation=null,highlightObjects=[],pinnedNets=new Map(),pinnedClasses=new Map(),connectionCursor=-1,activeConnection=null,classConfig=null;
    let sheetMatchCache=null,hierarchySignature='',netModel={nets:[],warnings:[]}, selectedNet=null, netFilterObject=null, navigatorTab="parts", netSource=null,overviewSource=null,overviewCache=null;
    const netBuilder=root.KiCadNetModel?.createBuilder?.();
    let showRatsnest=false,ratsnestSource=null,ratsnestResult=null;
    let measureMode = false, measurePoints = [], measurePreview=null, rulerSnap=null, boardMeasure=null, scene = null, attach = null, nativePick = null, rightDown = null,commentMode=null,areaStart=null,areaEnd=null,ignoreClick=false;
    const variantKey = JSON.stringify(["kicad-review-variants", ...(provider==='gitlab'?['gitlab',host]:[]),repository, rootFile]);
    function notice(message) { $("reviewNotice").textContent = message; $("reviewNotice").hidden = !message; options.updateDiagnostics?.(); }
    function commentStatus(message, error = false) { $("commentStatus").textContent = message; $("commentStatus").classList.toggle("error", error); $("githubStatus").textContent=message; $("githubStatus").classList.toggle("error",error); }
    const localCollaborationMessage=root.KiCadAndroidRuntime?'This project uses local review notes. To collaborate on GitHub or GitLab, connect your account in Library and accounts, then open the repository through that provider.':root.KiCadLocalRuntime?'Notes stay in this browser. Export a portable review to retain or transfer them.':`This VS Code viewer saves review notes in your workspace. ${providerName} account integration is available in the browser extension.`;
    async function refreshCommentPolicy() {if(!remoteAvailable){policyStatus={allowed:false};$('commentPolicyStatus').textContent=localCollaborationMessage;return;}
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
    const sectionState=new Map(),resizeCleanups=[],pinnedSidebars=new Set(),dockButtons=new Map(),hideTimers=new Map(),hoveredSidebars=new Set(),draggingSidebars=new Set();let dockDisposed=false;
    function collapsible(title,nodes,open=true,key=title){
      const details=make("details");details.className="sidebar-section";details.open=sectionState.has(key)?sectionState.get(key):open;
      details.append(make("summary",title),...nodes.filter(Boolean));details.addEventListener("toggle",()=>{if(!key.startsWith("property:")||!propertySearch.value.trim())sectionState.set(key,details.open);});return details;
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
    const commentHelp=$("commentsPane").querySelector?.("p.hint");if(commentHelp)commentHelp.id="reviewStorageHint";
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

    const ruleKind=pcb?'DRC':'ERC';
    const ruleButton=button(ruleKind,()=>{$('androidToolsSheet')?.close?.();if(ruleWindow.hidden)showRuleWindow();else ruleClose.click();});ruleButton.id='viewRuleChecks';ruleButton.setAttribute('data-icon',ruleKind.toLowerCase());ruleButton.setAttribute('aria-label',`View ${ruleKind} findings`);ruleButton.title=`Show or hide saved ${ruleKind} findings`;ruleButton.setAttribute('aria-expanded','false');ruleButton.setAttribute('aria-controls','ruleWindow');$('settingsButton').parentElement.insertBefore(ruleButton,$('settingsButton'));
    const ruleMarkerButton=button('',()=>{const check=$('showRuleMarkers');check.checked=!check.checked;check.onchange?.();syncRuleMarkers();});ruleMarkerButton.id='toggleRuleMarkers';ruleMarkerButton.className='icon-caption';ruleMarkerButton.setAttribute('aria-controls','commentPins reviewOverlay');
    function syncRuleMarkers(){const shown=$('showRuleMarkers').checked,label=`${shown?'Hide':'Show'} ${ruleKind} markers`;ruleMarkerButton.setAttribute('data-icon',shown?'eye':'eye-off');ruleMarkerButton.setAttribute('aria-pressed',String(shown));ruleMarkerButton.setAttribute('aria-label',label);ruleMarkerButton.title=label+' from saved reports';if(root.KiCadUIIcons)root.KiCadUIIcons.label(ruleMarkerButton,`${ruleKind} markers`);else ruleMarkerButton.textContent=`${ruleKind} markers`;root.KiCadUIIcons?.decorate();}
    ruleButton.parentElement.insertBefore(ruleMarkerButton,$('settingsButton'));$('showRuleMarkers').addEventListener('change',syncRuleMarkers);syncRuleMarkers();
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
    async function lookupMentions(){const run=++mentionGeneration;mentionList.replaceChildren();if(!remoteAvailable){mentionStatus.textContent=root.KiCadAndroidRuntime?'Enter @usernames manually. Account lookup requires a project opened through GitHub or GitLab.':'Enter @usernames manually. Account lookup is available in the browser extension.';return;}
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
    const contentRulesVersion='2026-10-10-terms-1';
    const rulesKey='kivi:content-rules';
    const contentRules='Keep reviews relevant and respectful. Do not post harassment, hate, threats, sexual exploitation, illegal content, spam, private personal information or designs you cannot share. Report abusive content or users; provider rules also apply.';
    const safety=make('section');safety.id='commentSafety';safety.append(make('h3','Content and people'),make('p',contentRules));
    let termsDialog=null;
    function showTerms(){
      if(!termsDialog){termsDialog=make('dialog');termsDialog.id='reviewTermsDialog';termsDialog.className='review-terms-dialog';termsDialog.setAttribute('aria-label','Terms of Service and disclaimers');const heading=make('header');heading.append(make('strong','Terms & disclaimers'),button('Close',()=>termsDialog.close()));const frame=make('iframe');frame.title='Pocket KiView Terms of Service';frame.src='terms.html';frame.setAttribute('sandbox','');termsDialog.append(heading,frame);termsDialog.addEventListener('click',event=>{if(event.target===termsDialog)termsDialog.close();});document.body.append(termsDialog);}
      if(!termsDialog.open)termsDialog.showModal();
    }
    safety.append(button('Terms & disclaimers',showTerms));
    const blockedList=make('div');blockedList.id='commentBlockedUsers';safety.append(blockedList);commentSettings.append(safety);
    function blockKey(){return 'kivi:blocked:'+JSON.stringify([provider,host,receiptUser]);}
    function blockedUsers(){try{const value=JSON.parse(localStorage.getItem(blockKey())||'[]');return Array.isArray(value)?value.filter(v=>typeof v==='string').slice(0,1000):[];}catch{return [];}}
    function isBlocked(author){return Boolean(author&&blockedUsers().includes(author.toLowerCase()));}
    function updateBlocked(){blockedList.replaceChildren();for(const author of blockedUsers())blockedList.append(button('Unblock @'+author,()=>{try{localStorage.setItem(blockKey(),JSON.stringify(blockedUsers().filter(v=>v!==author)));renderComments();}catch(error){commentStatus('Could not save block settings: '+error.message,true);}}));}
    function safeContentURL(value){try{const u=new URL(value);return u.protocol==='https:'&&u.origin===host&&!u.username&&!u.password?u.href:'';}catch{return '';}}
    function safetyActions(author,url){
      const actions=make('div');actions.className='inspector-actions';
      const report=kind=>{
        const dialog=make('dialog');dialog.className='comment-post-review';dialog.setAttribute('aria-label','Report '+kind);
        const header=make('header'),body=make('section'),reason=make('textarea'),status=make('p');body.className='android-sheet-content';reason.placeholder='Describe the concern (do not include private designs or credentials)';reason.maxLength=4000;reason.setAttribute('aria-label','Report reason');status.setAttribute('role','status');
        const close=()=>{dialog.close?.();dialog.remove();};header.append(make('strong','Report '+kind),button('Close',close));
        const target=safeContentURL(url),reportText=()=>`Pocket KiView ${kind} report\nCategory: ${category.value}\nProvider: ${host}\nUser: ${author||'unknown'}\nContent: ${target||'No provider permalink'}\n\n${reason.value.trim()}`;
        const category=make('select');category.setAttribute('aria-label','Report category');for(const [value,label]of [['spam','Spam'],['harassment','Harassment'],['hate','Hate'],['threats','Threats or immediate danger'],['child-safety','Child safety'],['privacy','Private information'],['rights','Copyright or rights'],['other','Other']]){const option=make('option',label);option.value=value;category.append(option);}category.value='other';
        body.append(make('p','Reports go to the Pocket KiView team at support@sigharmonic.com. Opening an email draft does not send it. Review and send it in your email app. No screenshot or project file is included.'),category,reason,status);
        const send=button('Review report in email',()=>{if(!reason.value.trim()){status.textContent='Describe the concern first.';return;}const text=reportText();try{if(root.KiCadAndroidRuntime&&root.top?.AndroidKiCad?.composeReport){root.top.AndroidKiCad.composeReport(text);status.textContent='Email draft requested. Send it in your email app; this is not a submission receipt.';}else{const a=make('a');a.href='mailto:support@sigharmonic.com?subject='+encodeURIComponent('Pocket KiView '+kind+' report')+'&body='+encodeURIComponent(text);a.click();status.textContent='Email draft requested. Send it in your email app.';}}catch{status.textContent='No email app could be opened. Email support@sigharmonic.com with this reason and the content link.';}});
        body.append(send);if(target){const link=make('a','Open provider moderation controls');link.href=target;link.target='_blank';link.rel='noopener noreferrer';body.append(link,make('small','Use the provider’s Report abuse option to notify its moderators as well.'));}dialog.append(header,body);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove());dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.showModal?dialog.showModal():dialog.open=true;
      };
      actions.append(button('Report content',()=>report('content')));if(author&&author!=='unknown'){actions.append(button('Report user',()=>report('user')),button('Block @'+author,()=>{try{const users=blockedUsers();if(users.length>=1000)throw Error('Unblock someone before adding another user.');localStorage.setItem(blockKey(),JSON.stringify([...new Set([...users,author.toLowerCase()])]));renderComments();draw();commentStatus('Blocked @'+author+' in this app profile. This does not change your provider account or remove their posts. Unblock in Comment settings.');}catch(error){commentStatus(error.message,true);}}));}return actions;
    }

    function renderThread(){threadMessages.replaceChildren();if(!loadedThread||commentCategory!=='all'&&commentCategory!==loadedThread.kind)return;
      let range;try{range=KiCadReviewComments.createdDateRange($('commentCreatedFrom').value,$('commentCreatedTo').value);}catch(error){threadStatus.textContent=error.message;return;}
      const header=make('header');header.append(make('h3',`${loadedThread.kind==='issue'?'Issue':'Discussion'} #${loadedThread.number}: ${isBlocked(loadedThread.author)?'Blocked thread starter':loadedThread.title}`));const link=make('a','Open on GitHub');link.href=loadedThread.url;link.target='_blank';link.rel='noopener noreferrer';header.append(link,button('Reply',()=>{editComment();$('editorThreadType').value=loadedThread.kind;$('editorThreadType').onchange();$('editorDestination').value='existing-'+loadedThread.kind;$('editorThreadNumber').value=String(loadedThread.number);editorDestinationChanged();}));threadMessages.append(header);
      const parents=new Map(loadedThread.comments.filter(m=>!m.replyTo).map(m=>[m.id,m])),replies=new Map();for(const message of loadedThread.comments)if(message.replyTo&&parents.has(message.replyTo)){if(!replies.has(message.replyTo))replies.set(message.replyTo,[]);replies.get(message.replyTo).push(message);}const messages=[loadedThread,...loadedThread.comments.filter(m=>!m.replyTo||!parents.has(m.replyTo)).flatMap(m=>[m,...(replies.get(m.id)||[])])];
      let count=0;for(const message of messages){if(isBlocked(message.author))continue;const time=Date.parse(message.createdAt);if(time<range.from||time>=range.until)continue;const item=make('article');item.className='thread-message'+(message.replyTo?' thread-reply':'');item.append(make('strong',`@${message.author||'unknown'}`),make('small',`${message.createdAt} · ${message===loadedThread?loadedThread.state:message.replyTo?'Reply':'Comment'}`));const text=make('p',message.body);text.className='thread-message-body';item.append(text);if(message.replyTo)item.append(make('small',`Reply to ${parents.get(message.replyTo)?.author?'@'+parents.get(message.replyTo).author:message.replyTo}`));item.append(safetyActions(message.author,message.url||loadedThread.url));threadMessages.append(item);count++;}
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
    const paneNames={navigator:'Explorer',properties:'Properties',comments:'Comments'};
    const paneIds={navigator:'designNavigator',properties:'designInspector',comments:'commentsSidebar'};
    function cancelAutoHide(name){clearTimeout(hideTimers.get(name));hideTimers.delete(name);}
    function layoutSidebars(){
      const width=workspaceElement.getBoundingClientRect().width||root.innerWidth||800;
      const height=workspaceElement.getBoundingClientRect().height||600;
      const rightPinned=['properties','comments'].filter(name=>sidebarState[name]&&pinnedSidebars.has(name));
      const leftPinned=sidebarState.navigator&&pinnedSidebars.has('navigator');
      const requestedLeft=leftPinned?sidebarWidths.navigator:0,requestedRight=Math.max(0,...rightPinned.map(name=>sidebarWidths[name]));
      // Pinned panes share the right dock; preserve at least 35% for the drawing.
      const available=Math.max(0,width-88),requested=requestedLeft+requestedRight;
      const scale=requested?Math.min(1,available*.65/requested):1;
      const leftWidth=Math.round(requestedLeft*scale),rightWidth=Math.round(requestedRight*scale);
      workspaceElement.classList.toggle('docked-sidebars',true);
      workspaceElement.classList.toggle('sidebar-overlays',false);workspaceElement.classList.toggle('two-sidebars',false);
      workspaceElement.style.setProperty('--pinned-left-width',leftWidth+'px');workspaceElement.style.setProperty('--pinned-right-width',rightWidth+'px');
      for(const [name,id,buttonId]of [['properties','designInspector','propertiesButton'],['comments','commentsSidebar','commentsButton'],['navigator','designNavigator','partsButton']]){
        const panel=$(id),visible=sidebarState[name],pinned=pinnedSidebars.has(name);
        panel.hidden=!visible;panel.classList.toggle('pinned-sidebar',pinned);panel.classList.toggle('auto-hide-sidebar',!pinned);
        $(buttonId).setAttribute('aria-pressed',String(visible));$(buttonId).setAttribute('aria-expanded',String(visible));
        const dock=dockButtons.get(name);if(dock){dock.setAttribute('aria-expanded',String(visible));dock.setAttribute('aria-pressed',String(visible));dock.title='Open '+paneNames[name]+(pinned?' (pinned)':' (auto-hide)');}
        const pin=$('pin'+name[0].toUpperCase()+name.slice(1));if(pin){pin.setAttribute('aria-pressed',String(pinned));pin.textContent=pinned?'Unpin':'Pin';pin.title=pinned?'Unpin to auto-hide this pane':'Pin this pane open';}
        if(!visible)continue;
        let panelWidth=Math.min(sidebarWidths[name],Math.max(120,width-88)),top=0,panelHeight=height;
        if(pinned){panelWidth=name==='navigator'?leftWidth:rightWidth;if(name!=='navigator'){const index=rightPinned.indexOf(name);panelHeight=height/rightPinned.length;top=index*panelHeight;}}
        panel.style.width=panelWidth+'px';panel.style.flexBasis=panelWidth+'px';panel.style.height=panelHeight+'px';panel.style.top=top+'px';panel.style.bottom='auto';
        panel.style.left=name==='navigator'?'24px':'auto';panel.style.right=name==='navigator'?'auto':'calc(var(--tool-strip-width,40px) + 24px)';
      }
      panelSpaceStatus.hidden=true;$("commentsPane").hidden=commentsSidebar.hidden;
    }
    function activatePane(name){for(const other of Object.keys(sidebarState))if(other!==name&&!pinnedSidebars.has(other))hideSidebar(other);}
    function showNavigator(open=true){if(open)activatePane('navigator');cancelAutoHide('navigator');sidebarState.navigator=open;if(open)activeSidebar='navigator';layoutSidebars();}
    function hideSidebar(name){cancelAutoHide(name);sidebarState[name]=false;if(activeSidebar===name)activeSidebar=Object.keys(sidebarState).find(key=>sidebarState[key])||'properties';layoutSidebars();}
    function hideInspector(){hideSidebar('properties');hideSidebar('comments');}
    function inspector(pane,tab){restoreFocusView();const name=pane==='properties'?'properties':'comments';activatePane(name);cancelAutoHide(name);sidebarState[name]=true;activeSidebar=name;if(tab)showCommentTab(tab);if(pane==='github'){showCommentTab('view');collaborationGroup.open=true;}layoutSidebars();}
    function autoHide(name){
      if(dockDisposed)return;cancelAutoHide(name);if(pinnedSidebars.has(name))return;
      hideTimers.set(name,setTimeout(()=>{hideTimers.delete(name);const panel=$(paneIds[name]);if(!pinnedSidebars.has(name)&&!hoveredSidebars.has(name)&&!draggingSidebars.has(name)&&!panel.contains(document.activeElement))hideSidebar(name);},350));
    }
    function revealDock(name){
      cancelAutoHide(name);if(!pinnedSidebars.has(name))for(const other of Object.keys(sidebarState))if(other!==name&&!pinnedSidebars.has(other))hideSidebar(other);
      if(name==='navigator')showNavigator();else inspector(name);
    }
    for(const [edge,names]of [['left',['navigator']],['right',['properties','comments']]]){
      const rail=make('nav');rail.className='sidebar-dock '+edge;rail.setAttribute('aria-label',edge==='left'?'Explorer dock':'Inspection dock');workspaceElement.append(rail);
      for(const name of names){
        const tab=button(paneNames[name],()=>revealDock(name));tab.id='dock'+name[0].toUpperCase()+name.slice(1);tab.className='dock-tab';tab.setAttribute('aria-controls',paneIds[name]);tab.setAttribute('aria-expanded','false');dockButtons.set(name,tab);rail.append(tab);
        tab.addEventListener('pointerenter',event=>{if(event.pointerType&&event.pointerType!=='mouse')return;hoveredSidebars.add(name);revealDock(name);});tab.addEventListener('pointerleave',event=>{if(event.pointerType&&event.pointerType!=='mouse')return;hoveredSidebars.delete(name);autoHide(name);});tab.addEventListener('focus',()=>cancelAutoHide(name));tab.addEventListener('blur',()=>autoHide(name));
        const panel=$(paneIds[name]),header=panel.querySelector(name==='navigator'?'.panel-heading':'.sidebar-heading');
        const pin=button('Pin',()=>{if(pinnedSidebars.has(name))pinnedSidebars.delete(name);else pinnedSidebars.add(name);cancelAutoHide(name);layoutSidebars();});pin.id='pin'+name[0].toUpperCase()+name.slice(1);pin.setAttribute('aria-label','Pin '+paneNames[name]+' pane');pin.setAttribute('aria-pressed','false');header?.insertBefore(pin,header.children[header.children.length-1]);
        const close=name==='navigator'?$('closeNavigator'):name==='properties'?$('closeInspector'):closeComments;close.textContent=edge==='left'?'‹':'›';close.setAttribute('data-icon',edge==='left'?'back':'forward');close.title='Collapse '+paneNames[name]+' to the side';close.setAttribute('aria-label','Collapse '+paneNames[name]+' pane to the side');
        panel.addEventListener('pointerenter',event=>{if(event.pointerType&&event.pointerType!=='mouse')return;hoveredSidebars.add(name);cancelAutoHide(name);});panel.addEventListener('pointerleave',event=>{if(event.pointerType&&event.pointerType!=='mouse')return;hoveredSidebars.delete(name);autoHide(name);});panel.addEventListener('pointerdown',()=>cancelAutoHide(name));panel.addEventListener('wheel',()=>cancelAutoHide(name),{passive:true});panel.addEventListener('scroll',()=>cancelAutoHide(name),true);panel.addEventListener('focusin',()=>cancelAutoHide(name));panel.addEventListener('focusout',()=>autoHide(name));
      }
    }
    const hideUnpinned=event=>{if(Object.values(paneIds).some(id=>$(id).contains(event.target))||[...dockButtons.values()].some(tab=>tab.contains(event.target)))return;for(const name of Object.keys(sidebarState))if(!pinnedSidebars.has(name))hideSidebar(name);};
    $('drawingHost').addEventListener('pointerdown',hideUnpinned);resizeCleanups.push(()=>{dockDisposed=true;for(const name of hideTimers.keys())cancelAutoHide(name);$('drawingHost').removeEventListener('pointerdown',hideUnpinned);});
    function resizeSidebar(name,panel,edge){
      const handle=make("div");handle.className="sidebar-resizer "+edge;handle.tabIndex=0;handle.setAttribute("role","separator");handle.setAttribute("aria-orientation","vertical");handle.setAttribute("aria-label",`Resize ${name} sidebar`);handle.setAttribute("aria-valuemin","220");handle.setAttribute("aria-valuemax","560");panel.append(handle);
      const setWidth=value=>{const max=Math.min(560,Math.max(220,workspaceElement.getBoundingClientRect().width-32));sidebarWidths[name]=Math.max(220,Math.min(max,value));panel.style.width=panel.style.flexBasis=sidebarWidths[name]+"px";handle.setAttribute("aria-valuenow",String(sidebarWidths[name]));layoutSidebars();};setWidth(sidebarWidths[name]);
      let drag=null;
      handle.addEventListener("pointerdown",event=>{if(event.button!==0)return;event.preventDefault();cancelAutoHide(name);draggingSidebars.add(name);drag={x:event.clientX,width:sidebarWidths[name],id:event.pointerId};handle.setPointerCapture?.(event.pointerId);handle.classList.toggle("resizing",true);});
      handle.addEventListener("pointermove",event=>{if(drag&&event.pointerId===drag.id)setWidth(drag.width+(event.clientX-drag.x)*(edge==="left"?-1:1));});
      const stop=()=>{drag=null;draggingSidebars.delete(name);handle.classList.toggle("resizing",false);};for(const type of ["pointerup","pointercancel","lostpointercapture"])handle.addEventListener(type,stop);
      handle.addEventListener("keydown",event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();event.stopPropagation();setWidth(event.key==="Home"?220:event.key==="End"?560:sidebarWidths[name]+(event.key==="ArrowLeft"?-1:1)*(edge==="left"?-1:1)*(event.shiftKey?40:10));});resizeCleanups.push(stop);
    }
    resizeSidebar("properties",propertiesSidebar,"left");resizeSidebar("comments",commentsSidebar,"left");resizeSidebar("navigator",$("designNavigator"),"right");
    const sidebarObserver=root.ResizeObserver?new root.ResizeObserver(layoutSidebars):null;sidebarObserver?.observe(workspaceElement);root.addEventListener?.("resize",layoutSidebars);
    const propertySearch=make('input');propertySearch.id='propertySearch';propertySearch.type='search';propertySearch.placeholder='Search names, values, connections…';propertySearch.setAttribute('aria-label','Search selected properties');propertySearch.disabled=true;
    const propertySearchStatus=make('p');propertySearchStatus.id='propertySearchStatus';propertySearchStatus.className='hint';propertySearchStatus.setAttribute('role','status');propertySearchStatus.hidden=true;
    const propertySearchBar=make('div');propertySearchBar.className='property-searchbar';propertySearchBar.append(propertySearch,propertySearchStatus);$('propertiesPane').insertBefore(propertySearchBar,$('propertyList'));
    const propertyOpenState=new WeakMap();
    function filterProperties(){
      const query=propertySearch.value.trim().toLowerCase();propertySearch.disabled=!selected&&!selectedNet;let matches=0;
      for(const section of $('propertyList').children){const heading=section.children[0]?.textContent||'',headingMatch=Boolean(query&&heading.toLowerCase().includes(query));let found=!query||headingMatch;
        const dl=section.querySelector('dl');if(dl){const fields=[...dl.children];for(let i=0;i<fields.length;i+=2){const key=fields[i],value=fields[i+1];if(!value)continue;const visible=!query||headingMatch||(key.textContent+' '+value.textContent).toLowerCase().includes(query);key.hidden=value.hidden=!visible;if(visible){found=true;matches++;}}}else{found=!query||section.textContent.toLowerCase().includes(query);if(found)matches++;}
        section.hidden=!found;if(section.tagName==='DETAILS'){if(query){if(!propertyOpenState.has(section))propertyOpenState.set(section,section.open);if(found)section.open=true;}else if(propertyOpenState.has(section)){section.open=propertyOpenState.get(section);propertyOpenState.delete(section);}}
      }
      for(const row of $('netMemberList').children){const visible=!query||row.textContent.toLowerCase().includes(query);row.hidden=!visible;if(visible&&selectedNet)matches++;}
      $('netMembers').hidden=!selectedNet||![...$('netMemberList').children].some(row=>!row.hidden);propertySearchStatus.hidden=!query;propertySearchStatus.textContent=matches?`${matches} matching fields or connections`:'No matching properties or connections.';
    }
    propertySearch.oninput=filterProperties;
    function propertySection(title,entries,collapsed=false){
      const values=Object.entries(entries).filter(([,value])=>value!==undefined&&value!==null);if(!values.length)return;
      const dl=make("dl");
      for(const [key,value]of values){const dd=make("dd",String(value)===""?"(empty)":value);dd.title=String(value);dl.append(make("dt",key),dd);}
      const section=collapsible(title,[dl],!collapsed,"property:"+title);section.className="property-group sidebar-section";
      $("propertyList").append(section);
    }
    function iconFor(kind){return kind==="pad"||kind==="pin"?"pin":kind==="segment"||kind==="arc"?"track":kind==="sheet"?"sheet":"parts";}
    function setSelectionIcon(kind){if(root.KiCadUIIcons)$("selectionIcon").replaceChildren(root.KiCadUIIcons.icon(kind));}
    const lookupObjectNets=objectNetLookup();
    function netsForObject(object){return lookupObjectNets(netModel,object);}
    function properties() {
      try {
      $("propertyList").replaceChildren();$("selectionSummary").replaceChildren();$("netMemberList").replaceChildren();$("netMembers").hidden=true;$("selectObjectNet").hidden=true;
      $("selectedName").textContent=selectedNet?netDisplayName(selectedNet):selected?.label||"Select an object";
      $("selectedKind").textContent=selectedNet?`${selectedNet.kind==="pcb"?"PCB net":"Sheet network"} · ${selectedNet.path}`:selected?`${selected.kind} · ${selected.path}`:"Click a component, copper item or net to inspect it.";
      $("focusSelected").disabled=!selectedNet&&!selected?.position;$("openSelectedSheet").hidden=selected?.kind!=="sheet"||Boolean(selectedNet);$("commentSelected").disabled=false;
      setSelectionIcon(selectedNet?"net":iconFor(selected?.kind));
      const chip=(text,className="")=>{const span=make("span",text);span.className="summary-chip "+className;$("selectionSummary").append(span);};
      if(selectedNet){
        const matchingSheets=selectedNet.kind!=="pcb"?netSheetMatches([selectedNet]):null;
        chip(selectedNet.kind==="pcb"?"Saved net ID "+selectedNet.code:"Active-sheet connectivity");
        chip(`${selectedNet.stats.pads||selectedNet.members.filter(m=>m.kind==="pin").length} ${selectedNet.kind==="pcb"?"pads":"pins"}`);
        if(matchingSheets){const count=matchingSheets.size;chip(`${count} matching sheet${count===1?'':'s'}`);}
        propertySection("Electrical",{"Net name":netDisplayName(selectedNet),"Saved code":selectedNet.kind==="pcb"?selectedNet.code:undefined,"Scope":selectedNet.kind==="pcb"?"This PCB":"This sheet only"});
        const stats=selectedNet.stats;propertySection(selectedNet.kind==="pcb"?"Copper":"Wiring",selectedNet.kind==="pcb"?{"Pads":stats.pads,"Track segments":stats.tracks,"Vias":stats.vias,"Zones":stats.zones,"Routed length":stats.lengthMm.toFixed(3)+" mm"}:{"Wire length":stats.lengthMm.toFixed(3)+" mm"});
        $("netMembers").hidden=false;const members=selectedNet.members.filter(m=>m.kind==="pad"||m.kind==="pin");
        for(const member of members.slice(0,300)){const node=button("",()=>{activeConnection=member;if(member.position)focus(member.position);$("selectionStatus").textContent=`${netDisplayName(selectedNet)} · ${member.reference||"Component"} · ${member.pin||member.pad||""}`;});node.append(make("span",`${member.reference||"Component"} · ${member.kind==="pin"?"pin "+member.pin:"pad "+member.pad}`));$("netMemberList").append(node);}
        if(!members.length)$("netMemberList").append(make("p","No saved pads or pins on this network."));
        if(members.length>300)$("netMemberList").append(make("p",`First 300 of ${members.length} connections shown.`));
        if(matchingSheets){const section=make('section');section.className='property-section';section.append(make('h3','Matching sheets'));for(const [path,matches]of matchingSheets){const row=button(model.sheets.find(s=>s.path===path)?.label||path,()=>followSheet(path,matches[0]?.id));row.title=path+' · '+matches.map(netDisplayName).join(', ');row.className='net-sheet-link';section.append(row);}$("propertyList").append(section);}if(selectedNet.kind!=="pcb")propertySection("Connectivity limits",{"Analysis":"Saved global labels and instance-scoped sheet pins identify matching sheets. Cyclic hierarchy, implicit hidden power pins and buses are not resolved; this is not a KiCad netlist."});
        return;
      }
      if(!selected)return;
      if(selected.kind==='zone'){const stats=boardAnalytics();const zone=stats?.zones?.find(z=>z.uuid&&z.uuid===selected.uuid);if(zone)propertySection('Saved zone analytics',{'Outline polygon area sum':zone.outlineAreaMm2.toFixed(3)+' mm²','Saved fill polygon area sum':zone.fillAreaMm2.toFixed(3)+' mm²','Saved fill layers':zone.layers.join(', ')||'None','Method':stats.limits});}
      const entries={...selected.properties};delete entries["Source fingerprint"];
      const linked=netsForObject(selected);if(linked.length){entries.Net=linked.length===1?netDisplayName(linked[0]):`${linked.length} connected nets`;$("selectObjectNet").hidden=false;root.KiCadUIIcons?.label($("selectObjectNet"),linked.length===1?"Highlight net":`${linked.length} nets`);}
      if(entries.Value)chip(entries.Value);if(["symbol","footprint","pad"].includes(selected.kind))chip(selected.populated?"Fitted":"Do not populate",selected.populated?"population":"dnp");
      const used=new Set();const take=keys=>Object.fromEntries(keys.filter(k=>entries[k]!==undefined&&(used.add(k),true)).map(k=>[k,entries[k]]));
      propertySection("Identity",take(["Reference","Value","Description","Library ID","lib_id","Number","Type","Shape"]));
      propertySection("Electrical",take(["Net","Sim.Device","Sim.Pins"]));
      if(linked.length){
        const section=collapsible('Connected nets',[],true,'property:connected-nets');section.className='property-group sidebar-section';
        for(const net of linked.slice(0,100)){
          const count=net.members.filter(member=>member.kind==='pin'||member.kind==='pad').length;
          const row=button('',()=>selectNet(net,true));row.className='net-sheet-link';row.title=`Highlight ${netDisplayName(net)}`;row.setAttribute('aria-label',`Highlight net ${netDisplayName(net)}`);
          row.append(make('strong',netDisplayName(net)),make('small',` · ${count} ${net.kind==='pcb'?'pad':'pin'}${count===1?'':'s'}`));section.append(row);
        }
        if(linked.length>100)section.append(make('p',`First 100 of ${linked.length} connected nets shown. Search the Nets explorer for other connections.`));
        $('propertyList').append(section);
      }
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
      } finally {filterProperties();}
    }
    function renderNets(){
      const list=$("netList"),highlighted=new Set(highlightedNets().map(n=>n.id));list.replaceChildren();const query=$("netSearch").value.trim().toLowerCase(),path=currentFile()||rootFile,linked=netFilterObject?new Set(netsForObject(objects.find(o=>o.id===netFilterObject)).map(n=>n.id)):null;
      const nets=netModel.nets.filter(n=>n.path===path&&(!linked||linked.has(n.id))&&`${netDisplayName(n)} ${n.name} ${n.code} ${n.members.map(m=>m.reference).join(" ")}`.toLowerCase().includes(query));
      $("netCount").textContent=`${nets.length} net${nets.length===1?"":"s"}${nets.length>500?" · first 500":""}`;$("clearNet").disabled=!selectedNet&&!netFilterObject;
      for(const net of nets.slice(0,500)){const row=button("",()=>selectNet(net,true));row.className="object-row net-row"+(selectedNet?.id===net.id||highlighted.has(net.id)?" selected":"");row.setAttribute("aria-pressed",String(selectedNet?.id===net.id||highlighted.has(net.id)));const dot=make("span");dot.className="net-chip";const copy=make("span");copy.className="row-copy";copy.append(make("strong",netDisplayName(net)),make("small",net.kind==="pcb"?`${net.stats.pads} pads · ${net.stats.tracks} tracks · ${net.stats.lengthMm.toFixed(1)} mm`:`${net.members.filter(m=>m.kind==="pin").length} pins · sheet-local`));row.append(dot,copy);row.title=netDisplayName(net);list.append(row);}
      if(!nets.length)list.append(make("p","No networks match this search."));
      const warnings=netModel.warnings.filter(message=>message.startsWith(path+": "));$("netWarnings").hidden=!warnings.length;$("netWarningCount").textContent=`${warnings.length} connectivity note${warnings.length===1?"":"s"}`;$("netWarningList").replaceChildren();for(const warning of warnings.slice(0,20))$("netWarningList").append(make("p",warning.slice(path.length+2)));if(warnings.length>20)$("netWarningList").append(make("p",`First 20 of ${warnings.length} notes shown.`));
    }
    function focusNet(net){const canvas=getCanvas();canvas.resize();const visible=net.primitives.filter(p=>!p.hole&&canvas.geometryVisible?.(p)!==false&&(!p.layer||canvas.visibleLayers.has(p.layer))),box=root.KiCadOwnedCanvas?.bounds(visible);if(!box){$("selectionStatus").textContent=`${netDisplayName(net)} · no geometry on visible layers`;return;}const margin=Math.max(3,Math.max(box.w,box.h)*.1);canvas.viewport.camera.bbox={x:box.x-margin,y:box.y-margin,w:box.w+2*margin,h:box.h+2*margin};canvas.draw();}
    function highlightedNets(){const path=currentFile(),result=new Map([...pinnedNets.values()].filter(n=>n.path===path).map(n=>[n.id,n]));if(classConfig)for(const net of netModel.nets){if(net.path!==path)continue;if([...pinnedClasses.values()].some(c=>c.path===path&&root.KiCadProjectSearch.netClasses(net.name,classConfig).includes(c.name))&&result.size<200)result.set(net.id,net);}if(selectedNet&&!result.has(selectedNet.id)&&result.size<200)result.set(selectedNet.id,selectedNet);return [...result.values()];}
    function netSheetMatches(networks){
      const graph=overviewConnectivity(networks);if(graph){const result=new Map();for(const {net}of graph.matches){if(!result.has(net.path))result.set(net.path,[]);if(!result.get(net.path).some(n=>n.id===net.id))result.get(net.path).push(net);}return result;}
      const selected=(networks??[...pinnedNets.values(),...(selectedNet?[selectedNet]:[])]).filter(n=>n.kind==='schematic'),key=selected.map(n=>n.id).sort().join('\n');
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
      const testpoints=testpointHighlight?testpointsForPath(path).slice(0,200):[];
      const parts=[...new Map([...highlightObjects.filter(o=>o.path===path),...dnp,...testpoints].map(o=>[o.id,o])).values()],ids=new Set(parts.map(o=>o.uuid).filter(Boolean)),primitives=(canvas?.primitives||[]).filter(p=>ids.has(p.uuid)||ids.has(p.ownerUuid));
      const groups=[...nets,...(primitives.length?[{primitives}]:[])],mode=$('highlightStyle').value||'dim';
      if(scene?.setSelection){const picked=[...parts,...(selected?.path===path?[selected]:[])];scene.setSelection({references:[...new Set(picked.map(o=>o.reference).filter(Boolean))],uuids:[...new Set(picked.map(o=>o.uuid).filter(Boolean))],netCodes:nets.map(n=>n.code).filter(n=>n!==undefined)});}
      if(canvas?.setNetHighlights)canvas.setNetHighlights(groups,{mode});else canvas?.setNetHighlight(groups[0]||null,{isolate:mode==='isolate'});
      if($('populationHighlight')){$('populationHighlight').hidden=!pcb;$('populationHighlight').setAttribute('aria-pressed',String(dnpHighlight));$('populationHighlight').title=`${dnpHighlight?'Hide':'Highlight'} DNP / DNI · ${objects.filter(o=>o.path===path&&['symbol','footprint'].includes(o.kind)&&o.populated===false).length} in selected assembly`;}
      const testpointToggle=$('highlightTestpoints');if(testpointToggle){const count=testpointsForPath(path).length;testpointToggle.setAttribute('aria-pressed',String(testpointHighlight));testpointToggle.title=`${testpointHighlight?'Hide':'Highlight'} testpoints · ${count} on this drawing`+(count>200?' (first 200 highlighted)':'');}
      $('highlightSummary').textContent=`${nets.length} nets · ${parts.length} components/objects highlighted${dnpHighlight?` · ${dnp.length} DNP / DNI`:''}${testpointHighlight?` · ${testpoints.length} testpoints`:''}${pinnedNets.size>nets.length||highlightObjects.some(o=>o.path!==path)?' · other sheets retained':''}`;
      $('fitHighlights').disabled=!groups.length;renderSheets();canvas?.draw();options.onOverviewHighlights?.();
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
    function clearSelection(){
      if(selectedNet)pinnedNets.set(selectedNet.id,selectedNet);
      selected=null;nativePick=null;selectedNet=null;dismissTouchPicker();
      const canvas=getCanvas();if(canvas){canvas.selected=null;canvas.hover=null;}
      $("selectionStatus").textContent="Select a part to inspect its properties.";
      properties();renderObjects();renderNets();updateHighlights();navigation?.renderSearch();emitHighlightGroup();draw();
    }
    function clearHighlights(){selected=null;nativePick=null;overviewSource=null;dismissTouchPicker();const canvas=getCanvas();if(canvas){canvas.selected=null;canvas.hover=null;}options.onSelection?.({kind:'group',items:[]});dnpHighlight=testpointHighlight=false;$("highlightDnp").checked=false;$("populationHighlight")?.setAttribute("aria-pressed","false");pinnedNets.clear();pinnedClasses.clear();highlightObjects=[];selectedNet=null;connectionCursor=-1;activeConnection=null;canvas?.setNetHighlight(null);$("selectionStatus").textContent="Select a part to inspect its properties.";renderNets();renderNetClasses();renderObjects();properties();updateHighlights();navigation?.renderSearch();draw();}
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
    function selectNet(net,move=false,toggle=true,multi=$('multiHighlight').checked,inspect=!root.KiCadAndroidRuntime,instanceId=null){
      overviewSource=net&&instanceId?{netId:net.id,instanceId}:null;
      if(net&&multi){if(toggle&&pinnedNets.has(net.id)){pinnedNets.delete(net.id);selectedNet=null;}else{if(pinnedNets.size>=200){notice('At most 200 networks can be highlighted.');return;}pinnedNets.set(net.id,net);selectedNet=net;}}
      else{pinnedNets.clear();pinnedClasses.clear();highlightObjects=[];selectedNet=net;}
      selected=null;nativePick=null;connectionCursor=-1;activeConnection=null;updateHighlights();$('selectionStatus').textContent=selectedNet?`${netDisplayName(selectedNet)} · ${selectedNet.kind==='pcb'?'PCB net':'sheet network'}`:'Net highlight cleared';properties();renderNets();renderObjects();if(selectedNet){if(inspect)inspector('properties');if(move)focusNet(selectedNet);const qualifiedNetName=root.KiCadPairedReview?.qualifiedNetName?.(selectedNet,objects);if(!multi)options.onSelection?.({kind:'net',netName:selectedNet.name,path:selectedNet.path,...(qualifiedNetName?{qualifiedNetName}:{})});}if(multi)emitHighlightGroup();getCanvas()?.draw();
    }
    let netColorsEnabled=false,netColorCache=null,netColorTicket=0,netColorDisposed=false,netColorSnapshot=ref;
    const netColorKey=JSON.stringify(['net-class-colors',provider,host,repository,rootFile]);
    try{netColorsEnabled=localStorage.getItem(netColorKey)==='true';}catch{}
    function applyNetColors(){
      const canvas=getCanvas();if(!canvas)return;
      const path=currentFile();if(netColorCache?.canvas===canvas&&netColorCache.model===netModel&&netColorCache.config===classConfig&&netColorCache.path===path&&netColorCache.enabled===netColorsEnabled)return;
      const colors=new Map();if(netColorsEnabled&&classConfig&&root.KiCadProjectSearch?.netClassColor)for(const net of netModel.nets){if(net.path!==path)continue;const color=root.KiCadProjectSearch.netClassColor(net.name,classConfig,pcb);if(!color)continue;for(const primitive of net.primitives){if(primitive.hole||primitive.frame)continue;if(pcb?!['track','arc','pad','via','zone','zone-outline'].includes(primitive.kind):!['wire','junction','pin','label','global_label','hierarchical_label'].includes(primitive.kind))continue;if(pcb&&primitive.layer&&!primitive.layer.endsWith('.Cu'))continue;colors.set(primitive,color);}}
      canvas.netClassColors=colors;netColorCache={canvas,model:netModel,config:classConfig,path,enabled:netColorsEnabled};
    }
    function updateNetColorToggle(){netColorButton.setAttribute('aria-pressed',String(netColorsEnabled));netColorButton.textContent=netColorsEnabled?'Net colors: on':'Net colors';netColorButton.title=classConfig?'Use saved '+(pcb?'PCB':'schematic')+' net-class colors; selection highlights take precedence':'Load the project’s saved net-class colors';}
    async function loadNetColors(path){
      const ticket=++netColorTicket;netColorButton.disabled=true;netColorButton.textContent='Loading net colors…';
      try{let snapshot=netColorSnapshot;if(!path){const inventory=await request('project-inventory',{repository,ref,file:rootFile});if(netColorDisposed||ticket!==netColorTicket)return;snapshot=inventory.snapshotRef||ref;netColorSnapshot=snapshot;const choices=(inventory.files||[]).filter(file=>/\.kicad_pro$/i.test(file.path));const exact=rootFile.replace(/\.kicad_(?:sch|pcb)$/i,'.kicad_pro'),matches=choices.filter(file=>file.path===exact);if(matches.length===1)path=matches[0].path;else if(choices.length===1)path=choices[0].path;else if(choices.length){netColorProject.replaceChildren();for(const file of choices){const option=make('option',file.path);option.value=file.path;netColorProject.append(option);}netColorProject.hidden=false;notice('Choose the project settings file for net-class colors.');return;}else throw new Error('No .kicad_pro settings file is available at this revision.');}
        const file=await request('project-file',{repository,ref:snapshot,file:path});if(netColorDisposed||ticket!==netColorTicket)return;const config=root.KiCadProjectSearch.parseNetClasses(file.content);navigation?.setClasses(config);if(!navigation){classConfig=config;applyNetColors();}netColorProject.hidden=true;notice('Net-class colors loaded from '+path+'. '+(config.warnings||[]).join(' '));getCanvas()?.draw();
      }catch(error){if(!netColorDisposed&&ticket===netColorTicket)notice('Net-class colors unavailable: '+error.message);}finally{if(!netColorDisposed&&ticket===netColorTicket){netColorButton.disabled=false;updateNetColorToggle();}}
    }
    const netColorButton=button('Net colors',async()=>{netColorsEnabled=!netColorsEnabled;try{localStorage.setItem(netColorKey,String(netColorsEnabled));}catch{}updateNetColorToggle();applyNetColors();getCanvas()?.draw();if(netColorsEnabled&&!classConfig)await loadNetColors();});netColorButton.id='netClassColors';netColorButton.setAttribute('aria-label','Toggle saved net-class colors');
    const netColorProject=make('select');netColorProject.id='netColorProject';netColorProject.setAttribute('aria-label','Project settings for net-class colors');netColorProject.hidden=true;netColorProject.onchange=()=>loadNetColors(netColorProject.value);netColorProject.onkeydown=event=>{if(event.key==='Enter')loadNetColors(netColorProject.value);};
    updateNetColorToggle();
    function refreshNets(){const source=getCanvas()?.design;if(!source||source===netSource)return;dismissTouchPicker();netSource=source;const designs=options.getDesigns?.()||new Map([[currentFile(),source]]);if(options.initialNetModel&&source===options.initialDesign){netModel=options.initialNetModel;options.initialNetModel=null;}else netModel=netBuilder?netBuilder.build(files,designs):root.KiCadNetModel?root.KiCadNetModel.build(files,designs):{nets:[],warnings:[]};getCanvas()?.setNetNames?.(netModel.nets.filter(net=>net.path===currentFile()).map(net=>({...net,name:netDisplayName(net)})));selectedNet=null;activeConnection=null;getCanvas()?.setNetHighlight(null);renderNets();renderNetClasses();applyNetColors();updateHighlights();}
    function navigate(tab){if(tab==='rules'){showRuleWindow();return;}navigatorTab=tab;for(const name of ["parts","sheets","nets","layers","search","bom"]){$(name+"Pane").hidden=name!==tab;$("nav"+name[0].toUpperCase()+name.slice(1)).setAttribute("aria-selected",String(name===tab));}if(tab==="bom")renderBom();if(tab==="search")navigation?.renderSearch();if(tab==="rules")navigation?.renderRules();if(tab==="sheets")renderSheets();if(tab==="nets"){renderNets();$("netHelp").textContent=pcb?"Select a net to highlight its copper and inspect connections.":"Select a net to highlight it and mark matching sheets. Saved global labels and instance-scoped sheet pins link loaded sheets. Hidden power pins and buses are not resolved.";}showNavigator(true);}
    function selectObject(object, native = false, move = false, fromScene = false, retainHighlights = false, silent = false) {
      selectedNet=null;activeConnection=null;if(!retainHighlights&&!$("multiHighlight").checked){pinnedNets.clear();pinnedClasses.clear();highlightObjects=[];}getCanvas()?.setNetHighlight(null);renderNets();
      selected = object; nativePick = native ? null : nativePick;
      if (!object) { $("selectionStatus").textContent = "Select a part to inspect its properties."; properties(); renderObjects();updateHighlights();if(!silent&&!retainHighlights&&!$("multiHighlight").checked)options.onSelection?.({kind:"group",items:[]}); draw(); return; }
      const part=partSelection(object);if(part&&!silent)options.onSelection?.(part);
      $("selectionStatus").textContent = `${object.label} · ${object.kind}${object.populated === false ? " · DNP" : ""}`;
      properties(); if(!root.KiCadAndroidRuntime)inspector("properties"); renderObjects();
      if (object.path !== currentFile()) {
        openSheet(object.path, object.position);if(object.kind==='sheet'&&!silent)highlightSheet(sheetTarget(object),object); return;
      }
      if (scene && object.reference) { if (!fromScene&&!scene.setSelection) scene.selectReference?.(object.reference); }
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
      testpointsForPath(file);
      const highlightedTestpoints=new Set(testpointHighlight?testpointsForPath(file).slice(0,200):[]);
      const visible = objects.filter((item) => ($("allSheets").checked || item.path === file) &&
        (type === "testpoints" ? testpointIds.has(item.id) : type === "all" || type === "parts" ? type === "all" || ["symbol","footprint"].includes(item.kind) : item.kind === type) &&
        (!query||matchesSearch(item,query,netsForObject(item).map(n=>n.name))));
      $("objectCount").textContent = `${visible.length} object${visible.length === 1 ? "" : "s"}${visible.length > 500 ? " · first 500 shown; narrow your search" : ""}`;
      for (const item of visible.slice(0,500)) {
        const grouped=highlightObjects.some(o=>o.id===item.id)||(item.path===file&&highlightedTestpoints.has(item)),row = button("", event => $("multiHighlight").checked||event?.ctrlKey||event?.metaKey||event?.shiftKey?selectSearchObject(item,true):selectObject(item, true, true)); row.className = `object-row${item.populated === false ? " dnp" : ""}${selected?.id === item.id||grouped ? " selected" : ""}`;
        row.setAttribute("aria-pressed", String(selected?.id === item.id||grouped));
        const symbol=make("span");symbol.className="row-icon";if(root.KiCadUIIcons)symbol.append(root.KiCadUIIcons.icon(iconFor(item.kind)));const copy=make("span");copy.className="row-copy";const linked=type==='testpoints'?netsForObject(item):[];copy.append(make("strong",item.label),make("small",`${item.properties.Value||item.kind}${type==='testpoints'?' · '+(linked.length?linked.slice(0,3).map(netDisplayName).join(', '):'No resolved net'):''}${$("allSheets").checked?` · ${item.path}`:""}`));row.append(symbol,copy);list.append(row);
      }
      if (!visible.length) list.append(make("p",type==='testpoints'?(testpointsForPath(file).length?'No testpoints match this search.':'No saved testpoints found on this drawing.'):'No objects match this search.'));
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
    function followSheet(path,netId){if(!files.some(f=>f.path===path&&/\.kicad_sch$/i.test(path)))return false;const matches=netSheetMatches().get(path),id=netId??matches?.[0]?.id;openSheet(path);const net=id?netModel.nets.find(n=>n.id===id&&n.path===path):null;if(net)selectNet(net,true,false);else highlightSheet(path);return true;}
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
        const name=make('span',sheet.label||sheet.path.split('/').pop());name.className='sheet-name';open.append(icon,name);if(netSheets.has(sheet.path)){const badge=make('span','●');badge.className='sheet-net-badge';badge.title='Highlighted net: '+netSheets.get(sheet.path).map(netDisplayName).join(', ');open.append(badge);open.setAttribute('aria-label',`${sheet.label} · highlighted net present`);}row.append(toggle,open);
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
      refreshNets();const path=currentFile(),savedRoutingReports=navigation?.routingReports(path)||[];let routing=null;
      if(root.KiCadRatsnest){const cached=routingAnalyticsCache.get(path);if(cached?.source===netSource)routing=cached.result;else{routing=root.KiCadRatsnest.build(netModel.nets.filter(n=>n.path===path));routingAnalyticsCache.set(path,{source:netSource,result:routing});}}
      for(const [label,value]of Object.entries({'Footprints':board.footprints,'Pads':board.pads,'SMD pads':board.smdPads,'Through-hole pads':board.throughHolePads,'Drilled pads':board.drilledPads,'Track segments':board.segments,'Track arcs':board.arcs,'Vias':board.vias,'Zones':board.zones.length,'Straight track length':board.straightTrackLengthMm.toFixed(3)+' mm','Saved board thickness':board.boardThicknessMm===null?'Not saved':board.boardThicknessMm+' mm'})){stats.append(make('dt',label),make('dd',value));}
      for(const [label,value]of Object.entries({'Curved track length':board.arcTrackLengthMm.toFixed(3)+' mm','Total track length':board.totalTrackLengthMm.toFixed(3)+' mm','Placement review candidates':board.placementCandidates.length,'Candidate airwires':routing?`${routing.lines.length}${routing.stats.truncated?' (incomplete)':''}`:'Unavailable','Nets with candidate airwires':routing?new Set(routing.lines.map(line=>line.netId)).size:'Unavailable','Saved DRC reports':savedRoutingReports.length||'Import a KiCad DRC report in Findings'}))stats.append(make('dt',label),make('dd',value));
      if(board.edgeBounds){const b=board.edgeBounds;stats.append(make('dt','Edge.Cuts envelope'),make('dd',`${(b.maxX-b.minX).toFixed(3)} × ${(b.maxY-b.minY).toFixed(3)} mm`));}
      zones.append(button('Export board analytics JSON',()=>engineeringExport('board-analytics.json',JSON.stringify({schema:'pocket-kiview-board-analytics/v1',source:{provider,host,repository,ref,path},assemblyVariant:variant,assembly:{total:all.total,fitted:all.fitted,dnp:all.dnp,scope:$('bomAllSheets').checked?'all-loaded-drawings':path},board,savedRoutingReports,routing:routing?{status:routing.status,stats:routing.stats,warnings:routing.warnings,lines:routing.lines}:null},null,2),'application/json')));
      zones.append(make('h3','Track length by layer'));for(const item of board.layerTracks)zones.append(make('p',`${item.layer}: ${item.lengthMm.toFixed(3)} mm`));
      zones.append(make('h3','Track length by net'));
      for(const item of board.netTracks.slice(0,300)){const link=button(`${item.name}: ${item.lengthMm.toFixed(3)} mm`,()=>{const net=netModel.nets.find(n=>n.path===path&&String(n.code)===item.code);if(net)selectNet(net,true,true);else notice('No selectable saved net.');});link.title=`${item.segments} segments · ${item.arcs} arcs`;zones.append(link);}
      if(board.netTracks.length>300)zones.append(make('small','First 300 nets shown; JSON export includes all nets.'));
      zones.append(make('h3','Placement review'));
      zones.append(make('p','Origins at zero, missing coordinates or outside the straight-edge envelope are review candidates. These do not establish that a component is unplaced.'));
      for(const item of board.placementCandidates.slice(0,300))zones.append(button(`${item.reference||item.uuid||'Footprint'} · ${item.reasons.join(' · ')}`,()=>{const object=objects.find(o=>o.path===path&&o.kind==='footprint'&&item.uuid&&o.uuid===item.uuid);if(object)selectObject(object,true,true);else if(item.position)focus(item.position);else notice('No selectable saved footprint identity or position.');}));
      if(!board.placementCandidates.length)zones.append(make('p','No placement candidates under these checks.'));
      if(board.placementCandidates.length>300)zones.append(make('small','First 300 candidates shown; JSON export includes all candidates.'));
      zones.append(make('h3','Routing review'));
      zones.append(button('Open saved DRC findings',()=>showRuleWindow()));
      for(const report of savedRoutingReports)zones.append(make('p',`${report.metadata.reportPath}: ${report.unconnectedFindings} saved unconnected findings · ${report.excludedUnconnectedFindings} excluded · ${report.metadata.date||'date unknown'}. Report revision is unverified; this is not a current unrouted-net count.`));
      if(routing){zones.append(make('p',routing.warnings.join(' ')));const candidates=new Map();for(const line of routing.lines){if(!candidates.has(line.netId))candidates.set(line.netId,{line,count:0});candidates.get(line.netId).count++;}for(const {line,count} of [...candidates.values()].slice(0,300))zones.append(button(`${line.netName||'Net'} · ${count} candidate airwires`,()=>{const net=netModel.nets.find(n=>n.path===path&&n.id===line.netId);if(net)selectNet(net,true,true);showRatsnest=true;draw();}));if(candidates.size>300)zones.append(make('small','First 300 candidate nets shown; JSON export includes all computed candidates.'));}
      zones.append(make('h3','Saved zone areas'));
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
      renderObjects(); properties(); renderBom(); if(attach)updateHighlights(); draw();if(dnpHighlight)populationNotice();
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
      return filterComments([...notes,...remoteNotes].filter(note=>!isBlocked(note.github?.author)),{
        createdFrom:$('commentCreatedFrom').value,createdTo:$('commentCreatedTo').value,threadType:commentCategory,severity:$("severityFilter").value,state:$("stateFilter").value,read:$("readFilter").value,
        order:$("commentSort").value,query:$("commentSearch").value
      },receipt);
    }
    function nextUnread() {
      const unread=filterComments([...notes,...remoteNotes].filter(note=>!isBlocked(note.github?.author)),{
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
        if(localStorage.getItem(rulesKey)!==contentRulesVersion)throw Error('Accept the content rules before publishing.');if(!publication)assertNoteDestination(note);const value=publication?.value||$("commentDestination").value,destination={issue:"new-issue",discussion:"new-discussion","existing-issue":"issue","existing-discussion":"discussion","pull-request":"issue"}[value];
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
      renderThread();updateBlocked();
      for(const [type,node]of categoryButtons){const count=[...notes,...remoteNotes].filter(note=>type==='all'||KiCadReviewComments.commentType(note)===type).length;node.textContent=`${type==='issue'?'Issues':type==='discussion'?'Discussions':'All'} (${count})`;node.title='Total annotations before state, severity and date filters';}
      $("commentList").replaceChildren();
      const shown=visibleNotes();
      for (const note of shown) {
        const card=make("article");card.className="note severity-"+(note.severity||"info");
        const unread=KiCadReviewComments.isUnread(note,receipt(note));
        card.setAttribute('data-note-id',note.id);
        const reviewState=`Review: ${note.state||'open'}`,threadState=note.github?`${note.github.source?.startsWith('discussion')?'Discussion':'Issue'}: ${note.github.state||'unknown'}`:'';
        if(root.KiCadAndroidRuntime){
          const heading=make('h3',root.KiCadCommentCompose?.titleFromText(note.text)||'Review comment');heading.className='note-heading';
          const body=make('p',note.text.split(/\r\n|\r|\n/).slice(1).join('\n'));body.className='note-body';
          const meta=make('small',`${KiCadReviewComments.commentType(note)==='discussion'?'Discussion':'Issue'} · ${note.severity||'info'} · ${reviewState}${threadState?' · '+threadState:''}${unread?' · Unread':''}`);meta.className='note-meta';
          const location=make('small',anchorLabel(note.anchor));location.className='note-meta note-location';
          const date=make('small',new Date(note.updatedAt||note.createdAt).toLocaleString());date.className='note-meta';
          card.append(heading,body,meta,location,date);
        }else{
        card.append(make("h3",root.KiCadCommentCompose?.titleFromText(note.text)||"Review comment"),make("strong",`${(note.severity||"info").toUpperCase()} · ${KiCadReviewComments.commentType(note)==='discussion'?'Discussion':KiCadReviewComments.commentType(note)==='issue'?'Issue':'Uncategorized'} · ${unread?"Unread":"Read"}`),make("small",anchorLabel(note.anchor)),make("p",note.text.split(/\r\n|\r|\n/).slice(1).join("\n")),
          make("small",`Created ${new Date(note.createdAt).toLocaleString()} · Updated ${new Date(note.updatedAt||note.createdAt).toLocaleString()} · ${reviewState} · ${note.github?`${providerName} ${note.github.source} #${note.github.number} · ${threadState} · ${note.github.author||""}`:"local"}`));
        }
        if(note.mentions?.length)card.append(make("small",`Mentions: ${note.mentions.map(login=>"@"+login).join(", ")}`));
        if(note.github?.createdAt)card.append(make('small',`GitHub posted ${new Date(note.github.createdAt).toLocaleString()}${note.github.updatedAt?` · edited ${new Date(note.github.updatedAt).toLocaleString()}`:''}`));
        const actions=make("div");actions.className="inspector-actions";
        actions.append(button("Locate",()=>{if(note.anchor.file!==currentFile())openSheet(note.anchor.file,note.anchor.position);else if(note.anchor.position)focus(note.anchor.position);inspector("comments","view");}),
          button(unread?"Mark read":"Mark unread",()=>markRead(note,unread)));
        if(note.github){actions.append(safetyActions(note.github.author,note.github.url));const link=make("a",`Open ${providerName} thread`);link.href=note.github.url;link.target="_blank";link.rel="noopener noreferrer";actions.append(link);if(provider==='github'&&remoteAvailable)actions.append(button('View thread',()=>readThread(note.github.source.startsWith('discussion')?'discussion':'issue',note.github.number)));
          if(remoteAvailable)actions.append(button('Reply',()=>{const type=provider==='gitlab'||note.github.source.startsWith('discussion')?'discussion':'issue';editComment({id:crypto.randomUUID(),createdAt:new Date().toISOString(),text:'',severity:'info',state:'open',threadType:type,anchor:{...note.anchor}});$("editorDestination").value=provider==='gitlab'||type==='issue'?'existing-issue':'existing-discussion';$("editorThreadNumber").value=String(note.github.number);editorDestinationChanged();commentStatus(`Reply draft for ${providerName} ${type} #${note.github.number}. Enter your text, then Comment.`);}));
        }
        else {const draft=button(`Open ${providerName} composer`,async()=>{try{await request("open-comment-draft",draftOptions(note));commentStatus("GitHub composer opened with the annotation and severity. Review and submit it there.");}catch(error){commentStatus(error.message,true);}});draft.className="github-draft-action";draft.hidden=!remoteAvailable||provider==='gitlab';actions.append(button("Edit",()=>editComment(note)),draft,
          button("Delete",async()=>{try{await request("comment-delete",{...scope(note.anchor.file),id:note.id});await refreshComments();options.onCommentsChanged?.();commentStatus("Local comment deleted.");}catch(error){commentStatus(error.message,true);}}));
        }
        if(!note.github){for(const [state,label] of [["open","Open"],["skipped","Skip"],["resolved","Resolve"]])if((note.state||"open")!==state)actions.append(button(label,()=>setNoteState(note,state)));}
        if(!note.github&&remoteAvailable){actions.append(button(`Choose ${providerName} destination`,()=>inspector("github")));const publish=button(`Publish to ${providerName}`,()=>{try{assertNoteDestination(note);const destination=$('commentDestination').value,number=$('threadNumber').value,category=$('discussionCategory').value;editComment(note);$('editorDestination').value=destination;$('editorThreadNumber').value=number;$('editorCategory').value=category;editorDestinationChanged();reviewPost();}catch(error){commentStatus(error.message,true);}});publish.className="github-publish-action";publish.disabled=policyStatus?.allowed===false;if(publish.disabled)publish.title=policyStatus.reason||"Repository comment policy restricts publishing.";actions.append(publish);}
        if(!note.github){if(note.tags?.length)card.append(make("small",`Tags: ${note.tags.join(", ")}`));for(const ref of note.remoteRefs||[]){const link=make("a",`${ref.kind} #${ref.number}`);link.href=ref.url;link.target="_blank";link.rel="noopener noreferrer";card.append(link);if(provider==='github'&&remoteAvailable)card.append(button('View thread',()=>readThread(ref.kind==='discussion'?'discussion':'issue',ref.number)));}}
        if(note.capture){const image=make('img');image.src=note.capture.dataUrl;image.alt='Captured drawing area for this annotation';card.append(image);const download=make('a','Download screenshot');download.href=note.capture.dataUrl;download.download=`kicad-review-${note.id}.png`;actions.append(download);}
        else for(const attachment of note.attachments||[]){const image=make('img');image.src=attachment.url;image.alt='Published drawing screenshot';image.loading='lazy';image.referrerPolicy='no-referrer';card.append(image);}
        card.append(actions);$("commentList").append(card);
      }
      if(!shown.length)$("commentList").append(make("p","No annotations match these filters."));
      const linked=$("githubThreadList");linked.replaceChildren();const urls=new Set();
      for(const note of [...notes,...remoteNotes].filter(note=>!isBlocked(note.github?.author)).filter(note=>commentCategory==='all'||KiCadReviewComments.commentType(note)===commentCategory))for(const thread of [...(note.remoteRefs||[]),...(note.github?[{url:note.github.url,kind:note.github.source,number:note.github.number}]:[])]){
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
    const populationOverlays=populationOverlayCache();
    let selectionGeometry=null;
    function draw() {
      const overlay = $("reviewOverlay"), pins = $("commentPins"); overlay.replaceChildren(); pins.replaceChildren();
      if (scene) return;
      const active = currentFile() || rootFile;if(!pcb)sheetVisits.visit(active);refreshNets();applyNetColors();
      if(showRatsnest&&pcb&&root.KiCadRatsnest){if(ratsnestSource!==netSource){ratsnestSource=netSource;ratsnestResult=root.KiCadRatsnest.build(netModel.nets.filter(n=>n.path===active));}for(const line of ratsnestResult.lines){if(selectedNet&&line.netId!==selectedNet.id)continue;const a=screen(line.a),b=screen(line.b);if(a&&b)overlay.append(svg('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#53a9d1','stroke-width':1,'stroke-dasharray':'5 4',opacity:.8}));}}
      if (active !== lastFile) {
        lastFile = active;threadTicket++;loadedThread=null;threadMessages.replaceChildren();threadStatus.textContent='';threadLoad.disabled=false;pointerWorld=null;measurePoints=[];measurePreview=rulerSnap=boardMeasure=null;refreshNets(); $("selectionStatus").textContent="Select a part or net to inspect"; remoteLoad++; remoteNotes=[]; $("refreshGitHub").disabled=false; $("activeSheet").textContent = active; $("activeSheet").title = active;
        $("sheetSelect").value = active;renderSheets();
        if (selected?.path !== active) {selected = null;nativePick = null;properties();}
        renderObjects(); renderBom(); refreshComments();
      }
      if (selected?.path === active && selected.position) {
        const canvas=getCanvas(),primitives=canvas?.primitives||canvas?.design?.primitives||[];
        if(selectionGeometry?.primitives!==primitives||selectionGeometry.uuid!==selected.uuid){const geometry=primitives.filter(p=>p.uuid===selected.uuid||p.ownerUuid===selected.uuid);selectionGeometry={primitives,uuid:selected.uuid,box:root.KiCadOwnedCanvas?.bounds(geometry)};}
        const box=selectionGeometry.box;
        if(box){const a=screen({x:box.x,y:box.y}),b=screen({x:box.x+box.w,y:box.y+box.h});if(a&&b)overlay.append(svg('rect',{x:Math.min(a.x,b.x)-4,y:Math.min(a.y,b.y)-4,width:Math.abs(b.x-a.x)+8,height:Math.abs(b.y-a.y)+8,fill:'none',stroke:'#29a873','stroke-width':2,'stroke-dasharray':'6 3'}));}
        const p = screen(selected.position); if (p) overlay.append(svg("circle",{cx:p.x,cy:p.y,r:10,fill:"none",stroke:"#29a873","stroke-width":2}));
      }
      let marks = 0;
      for (const {item,changed} of populationOverlays(objects,model,variant,active)) {
        if(++marks > 1000)continue;
        const p = screen(item.position); if (!p) continue;
        if (!item.populated) {
          if(dnpHighlight){const mark=svg("g",{"data-population-id":item.id,"aria-label":`${item.reference||item.label}: ${item.populationReason||"DNP"}`});mark.append(svg("circle",{cx:p.x,cy:p.y,r:15,fill:"#c84c4026",stroke:"#e87861","stroke-width":3}));const text=svg("text",{x:p.x+20,y:p.y-12,fill:"#e87861","font-size":12,"font-weight":650,"paint-order":"stroke",stroke:getCanvas()?.dark?"#101923":"#fff","stroke-width":3});text.textContent=`${item.reference||item.label} · ${item.populationReason||"DNP"}`;mark.append(text);overlay.append(mark);}
          overlay.append(svg("line",{x1:p.x-10,y1:p.y-10,x2:p.x+10,y2:p.y+10,stroke:"#dc675b","stroke-width":2}),svg("line",{x1:p.x-10,y1:p.y+10,x2:p.x+10,y2:p.y-10,stroke:"#dc675b","stroke-width":2}));
        }
        if (changed) {
          const label = svg("text",{x:p.x+14,y:p.y-12,fill:"#aa5c13","font-size":12,"paint-order":"stroke",stroke:"#fff","stroke-width":3}); label.textContent = `Variant: ${item.properties.Value || ""}`; overlay.append(label);
        }
      }
      const angleMode=$('rulerKind').value==='angle',required=angleMode?3:2;
      const rulerPoints=measurePreview&&measurePoints.length&&measurePoints.length<required?[...measurePoints,measurePreview]:measurePoints;
      const labelBoxes=[];
      const label=(x,y,value)=>{const box=$('drawingHost').getBoundingClientRect(),width=value.length*7+12,height=24;
        x=Math.max(7,Math.min(x,box.width-width-1));y=Math.max(18,Math.min(y,box.height-9));
        for(let i=0;i<6&&labelBoxes.some(b=>x-6<b.x+b.width&&x+width-6>b.x&&y-16<b.y+height&&y+8>b.y);i++)y=Math.max(18,Math.min(y+(i<3?26:-52),box.height-9));
        labelBoxes.push({x:x-6,y:y-16,width});overlay.append(svg('rect',{x:x-6,y:y-16,width,height,rx:4,class:'ruler-label-background'}));
        const text=svg('text',{x,y,'font-size':12,'font-family':'system-ui, sans-serif',class:'ruler-label-text'});text.textContent=value;overlay.append(text);
      };
      if(angleMode&&rulerPoints.length>=2){const projected=rulerPoints.map(screen);if(projected.every(Boolean)){
        const [a,v,b]=projected;
        overlay.append(svg('path',{d:`M ${a.x} ${a.y} L ${v.x} ${v.y}`+(b?` L ${b.x} ${b.y}`:''),fill:'none',stroke:'#28a3cf','stroke-width':2,'stroke-dasharray':measurePoints.length<3?'5 3':'none'}));
        for(const p of projected)overlay.append(svg('circle',{cx:p.x,cy:p.y,r:4,fill:'none',stroke:'#28a3cf','stroke-width':2}));
        if(b){const result=KiCadReviewTools.angle(...rulerPoints);if(result){
          const start=Math.atan2(a.y-v.y,a.x-v.x),end=Math.atan2(b.y-v.y,b.x-v.x),delta=Math.atan2(Math.sin(end-start),Math.cos(end-start)),radius=Math.min(36,Math.hypot(a.x-v.x,a.y-v.y)*.35,Math.hypot(b.x-v.x,b.y-v.y)*.35);
          const at=t=>({x:v.x+radius*Math.cos(t),y:v.y+radius*Math.sin(t)}),from=at(start),to=at(start+delta);
          overlay.append(svg('path',{d:`M ${from.x} ${from.y} A ${radius} ${radius} 0 0 ${delta>=0?1:0} ${to.x} ${to.y}`,fill:'none',stroke:'#28a3cf','stroke-width':2}));
          const mid=start+delta/2;label(v.x+(radius+14)*Math.cos(mid),v.y+(radius+14)*Math.sin(mid),result.text);
          $('measurementStatus').textContent=(measurePoints.length<3?'Live angle - ':'Pinned angle - ')+result.text;
        }else $('measurementStatus').textContent='Angle needs two non-zero arms. Choose distinct points.';}
      }}
      if(!angleMode&&rulerPoints.length===2){const a=screen(rulerPoints[0]),b=screen(rulerPoints[1]);if(a&&b){
        if(boardMeasure)overlay.append(svg('rect',{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(b.x-a.x),height:Math.abs(b.y-a.y),fill:'none',stroke:'#28a3cf','stroke-width':1,'stroke-dasharray':'4 4'}));
        overlay.append(svg('path',{d:`M ${a.x} ${a.y} L ${b.x} ${a.y} L ${b.x} ${b.y}`,fill:'none',stroke:'#28a3cf','stroke-width':1,'stroke-dasharray':'3 4'}));
        overlay.append(svg('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#28a3cf','stroke-width':2,'stroke-dasharray':measurePoints.length===1?'5 3':'none'}));
        for(const p of [a,b])overlay.append(svg('path',{d:`M ${p.x-5} ${p.y} h 10 M ${p.x} ${p.y-5} v 10`,stroke:'#28a3cf','stroke-width':2}));

        const units=options.getRulerUnits?.()||'mm',result=KiCadReviewTools.ruler(...rulerPoints,units),factor=units==='mil'?1000/25.4:1;
        label((a.x+b.x)/2+8,(a.y+b.y)/2-8,boardMeasure?`${(boardMeasure.width*factor).toFixed(3)} x ${(boardMeasure.height*factor).toFixed(3)} ${units}`:`${(result.distance*factor).toFixed(3)} ${units} / ${result.angle.toFixed(1)} deg`);label((a.x+b.x)/2,a.y-12,`X: ${(Math.abs(result.dx)*factor).toFixed(3)} ${units}`);label(b.x+12,(a.y+b.y)/2,`Y: ${(Math.abs(result.dy)*factor).toFixed(3)} ${units}`);
        $('measurementStatus').textContent=(boardMeasure?'Board extents - ':measurePoints.length===1?'Live - ':'Pinned - ')+result.text;
      }}
      if(measureMode&&rulerSnap&&measurePoints.length<required){const p=screen(rulerSnap.point);if(p){overlay.append(svg('circle',{cx:p.x,cy:p.y,r:6,fill:'none',stroke:rulerSnap.kind==='free'?'#28a3cf':'#d48100','stroke-width':2}));}}
      function areaRect(value,color){const a=screen({x:value.x,y:value.y}),b=screen({x:value.x+value.width,y:value.y+value.height});if(a&&b)overlay.append(svg('rect',{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(b.x-a.x),height:Math.abs(b.y-a.y),fill:color+'18',stroke:color,'stroke-width':2,'stroke-dasharray':'6 3'}));}
      for(const note of visibleNotes())if(note.anchor.area)areaRect(note.anchor.area,severityColors[note.severity||'info']);
      if(editor?.anchor.area&&editor.anchor.file===active&&!$('commentEditor').hidden)areaRect(editor.anchor.area,'#218bd0');
      if(areaStart&&areaEnd){try{areaRect(KiCadReviewTools.area(areaStart,areaEnd),'#218bd0');}catch{}}
      for(const object of highlightObjects.filter(o=>o.path===active).slice(0,200)){const geometry=(getCanvas()?.primitives||[]).filter(p=>object.uuid&&(p.uuid===object.uuid||p.ownerUuid===object.uuid)),box=root.KiCadOwnedCanvas?.bounds(geometry);if(box){const a=screen(box),b=screen({x:box.x+box.w,y:box.y+box.h});if(a&&b)overlay.append(svg('rect',{x:Math.min(a.x,b.x)-3,y:Math.min(a.y,b.y)-3,width:Math.abs(b.x-a.x)+6,height:Math.abs(b.y-a.y)+6,fill:'none',stroke:'#e6a834','stroke-width':2}));}}
      if(activeConnection?.position){const p=screen(activeConnection.position);if(p)overlay.append(svg('circle',{cx:p.x,cy:p.y,r:12,fill:'none',stroke:'#39bce5','stroke-width':3}),svg('path',{d:`M ${p.x-18} ${p.y} h 36 M ${p.x} ${p.y-18} v 36`,stroke:'#39bce5','stroke-width':1}));}
      navigation?.draw(overlay,pins,screen,svg);
      visibleNotes().forEach((note,index) => {const p = screen(note.anchor.position);if(!p)return;const pin=button(String(index+1),()=>{inspector("comments","view");if(root.KiCadAndroidRuntime){const card=[...$('commentList').querySelectorAll('[data-note-id]')].find(n=>n.getAttribute('data-note-id')===note.id);card?.scrollIntoView({block:'start',behavior:'smooth'});if(provider==='github'&&remoteAvailable&&note.github)readThread(note.github.source.startsWith('discussion')?'discussion':'issue',note.github.number);}else commentStatus(note.text);});pin.className="pin"+(root.KiCadAndroidRuntime?' android-comment-pin '+(KiCadReviewComments.commentType(note)==='discussion'?'discussion':'issue'):'');pin.setAttribute('data-severity',note.severity||'info');pin.title=note.text.split(/\r\n|\r|\n/)[0];pin.style.background=severityColors[note.severity||"info"];pin.setAttribute("aria-label",`Comment ${index+1}: ${note.text.slice(0,60)}`);pin.style.left=p.x+"px";pin.style.top=p.y+"px";pins.append(pin);});
    }
    function menu(event) {
      event.preventDefault(); if (scene || rightDown?.moved) return;
      const at = point(event), canvas = getCanvas(); if (!at) return;
      const hits = canvas.layers?.query_point(at) || [];
      const picked = hits.map((entry) => resolveObject(objects,currentFile(),entry.bbox?.context)).find(Boolean);
      const pickedNet=netModel.nets.find(net=>net.path===currentFile()&&hits.some(hit=>net.primitives.includes(hit.bbox?.primitive)));
      const holder = $("objectMenu"); holder.replaceChildren();
      if (picked) {holder.append(button("Inspect properties",()=>{selectObject(picked);inspector("properties");holder.hidden=true;}),button("Focus object",()=>{focus(picked.position || at);holder.hidden=true;}));}
      if(pickedNet)holder.append(button("Inspect net properties",()=>{selectNet(pickedNet,false,false,false,false);inspector('properties');holder.hidden=true;}),button("Highlight "+pickedNet.name,()=>{selectNet(pickedNet,false,true,undefined,false);holder.hidden=true;}));
      holder.append(button(picked ? "Comment on object" : "Comment here",()=>{editComment(null,anchor(at,picked || null));holder.hidden=true;}));
      holder.append(button('Unselect',()=>{clearSelection();holder.hidden=true;}),button('Clear highlights',()=>{clearHighlights();holder.hidden=true;}));
      if (picked?.kind === "sheet") holder.append(button("Open subsheet",()=>{openSubsheet(picked);holder.hidden=true;}));
      holder.hidden=false;const menuBounds=holder.getBoundingClientRect();holder.style.left=Math.max(8,Math.min(event.clientX,innerWidth-menuBounds.width-8))+"px";holder.style.top=Math.max(8,Math.min(event.clientY,innerHeight-menuBounds.height-8))+"px";
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
      const primitives=(c.design?.primitives||[]).filter(p=>c.geometryVisible?.(p)!==false&&(!p.layer||c.visibleLayers.has(p.layer))&&(!c.focusedLayer||c.layerFocusMode!=='isolate'||p.layer===c.focusedLayer||p.layer==='Edge.Cuts'));
      rulerSnap=KiCadReviewTools.snap(at,primitives,{mode:$('rulerSnap').value||'geometry-grid',pitch,zoom:c.viewport.camera.zoom,origin:measurePoints.length&&measurePoints.length<($('rulerKind').value==='angle'?3:2)?measurePoints.at(-1):null,constrain:event.shiftKey,bypass:event.altKey,arcThrough:KiCadOwnedCanvas.arcThrough});
      $('rulerSnapStatus').textContent=`${rulerSnap.kind} - ${rulerSnap.point.x.toFixed(4)}, ${rulerSnap.point.y.toFixed(4)} mm`+(rulerSnap.constrained?' - axis constrained':'');return rulerSnap.point;
    }
    let touchPicker=null,touchIndex=null,touchModel=null,touchPath=null;
    function dismissTouchPicker(){touchPicker?.remove();touchPicker=null;}
    const outsideTouchPicker=event=>{if(touchPicker&&!touchPicker.contains(event.target))dismissTouchPicker();};
    root.addEventListener('pointerdown',outsideTouchPicker,true);
    function touchNetPick(canvas,event){
      dismissTouchPicker();if(scene||measureMode||commentMode||ignoreClick)return false;
      const path=currentFile(),model=netModel;if(touchModel!==netModel||touchPath!==path){touchIndex=touchNetIndex(netModel.nets,path);touchModel=netModel;touchPath=path;}
      const at=point(event);if(!at)return false;
      const touch=event.pointerType!=='mouse'&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey;
      const choices=selectionCandidates(canvas.query(at,touch?14:5),touchIndex,objects,path,selectionMode.value);
      const multi=Boolean($('multiHighlight').checked||event.ctrlKey||event.metaKey||event.shiftKey);
      const choose=choice=>{if(currentFile()!==path||model!==netModel)return;if(choice.kind==='net')selectNet(choice.net,false,true,multi,false);else if(multi)selectSearchObject(choice.object,true,undefined,false);else selectObject(choice.object);};
      if(!choices.length)return selectionMode.value!=='all';
      if(choices.length===1){choose(choices[0]);return true;}
      const picker=make('div');touchPicker=picker;picker.className='touch-net-picker';picker.setAttribute('role','dialog');picker.setAttribute('aria-label','Choose part or net');
      Object.assign(picker.style,{position:'fixed',zIndex:'2000',width:'min(260px,calc(100vw - 16px))',maxHeight:'min(340px,60vh)',overflowY:'auto',padding:'6px',border:'1px solid #718394',borderRadius:'12px',background:'light-dark(#ffffff,#182630)',color:'light-dark(#152536,#edf3f8)',boxShadow:'0 6px 24px #0005'});
      const heading=make('div','Choose '+(selectionMode.value==='part'?'part':selectionMode.value==='net'?'net':'part or net'));heading.style.padding='6px 8px';picker.append(heading);
      for(const entry of choices){const {net,object,layers}=entry,label=net?netDisplayName(net):object.reference||object.label,kind=net?'Net':'Part';const choice=make('button');choice.type='button';choice.setAttribute('aria-label',kind+': '+label);
        Object.assign(choice.style,{display:'block',width:'100%',minHeight:'48px',textAlign:'left',padding:'8px',margin:'2px 0',overflowWrap:'anywhere'});
        choice.append(make('strong',kind+': '+label));const detail=make('small',net?[...layers].join(', '):object.properties?.Value||object.label);detail.style.display='block';choice.append(detail);
        choice.onclick=()=>{dismissTouchPicker();choose(entry);};picker.append(choice);
      }
      const close=make('button','Cancel');close.type='button';close.style.minHeight='40px';close.onclick=dismissTouchPicker;picker.append(close);document.body.append(picker);
      if(root.KiCadResponsiveControls?.place)root.KiCadResponsiveControls.place(picker,{x:event.clientX,y:event.clientY});else{const box=picker.getBoundingClientRect();picker.style.left=Math.max(8,Math.min(event.clientX+12,root.innerWidth-box.width-8))+'px';picker.style.top=Math.max(8,Math.min(event.clientY+12,root.innerHeight-box.height-8))+'px';}
      picker.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();dismissTouchPicker();canvas.canvas.focus();}});picker.querySelector('button')?.focus({preventScroll:true});return true;
    }
    function attachCanvas(canvas) {
      if (attach?.canvas === canvas) return;
      attach?.dispose();
      canvas.touchNetPick=event=>touchNetPick(canvas,event);canvas.dismissTouchPicker=dismissTouchPicker;
      const selection = (event) => {if(programmaticPick)return;nativePick=event.detail?.item;if(navigatorTab==="nets"){const primitive=canvas.selected,net=netModel.nets.find(n=>n.path===currentFile()&&n.primitives.includes(primitive));if(net){selectNet(net);return;}}const object=resolveObject(objects,currentFile(),nativePick);if(object&&($("multiHighlight").checked||event.detail?.multi))selectSearchObject(object,true,undefined,false);else selectObject(object);};
      const pick = (event) => {
        if(ignoreClick){ignoreClick=false;event.preventDefault();event.stopImmediatePropagation();return;}
        if(commentMode==='point'){event.preventDefault();event.stopImmediatePropagation();const at=point(event);if(at){setCommentMode(null);editComment(null,anchor(at,null));}return;}
        if (!measureMode) {if(!commentMode&&!scene&&touchNetPick(canvas,{clientX:event.clientX,clientY:event.clientY,pointerType:'mouse',ctrlKey:event.ctrlKey,metaKey:event.metaKey,shiftKey:event.shiftKey})){event.preventDefault();event.stopImmediatePropagation();}return;} event.preventDefault();event.stopImmediatePropagation();const at=rulerPoint(event);if(!at)return;
        const angleMode=$('rulerKind').value==='angle',required=angleMode?3:2;
        if(measurePoints.length>=required)measurePoints=[];measurePoints.push(at);measurePreview=null;boardMeasure=null;
        $('measurementStatus').textContent=angleMode?(measurePoints.length===1?'Choose the angle vertex.':measurePoints.length===2?'Choose the second arm endpoint.':''):'Choose the second measurement point.';draw();
      };
      const down=(event)=>{if(event.button===0&&commentMode==='area'){event.preventDefault();event.stopImmediatePropagation();areaStart=point(event);areaEnd=areaStart;canvas.canvas.setPointerCapture?.(event.pointerId);draw();}else if(event.button===2)rightDown={x:event.clientX,y:event.clientY,moved:false};};
      const move=(event)=>{pointerWorld=point(event);if(measureMode&&event.buttons!==2&&event.buttons!==4){const at=rulerPoint(event);if(at){measurePreview=measurePoints.length&&measurePoints.length<($('rulerKind').value==='angle'?3:2)?at:null;draw();}}if(areaStart&&commentMode==='area'){areaEnd=point(event);draw();}if(rightDown&&event.buttons===2&&Math.hypot(event.clientX-rightDown.x,event.clientY-rightDown.y)>4)rightDown.moved=true;};
      const up=(event)=>{if(!areaStart||commentMode!=='area')return;event.preventDefault();event.stopImmediatePropagation();const a=areaStart,b=point(event);canvas.canvas.releasePointerCapture?.(event.pointerId);ignoreClick=true;try{const area=KiCadReviewTools.area(a,b);setCommentMode(null);editComment(null,{...anchor({x:area.x+area.width/2,y:area.y+area.height/2},null),area});}catch(error){areaStart=areaEnd=null;commentStatus(error.message,true);draw();}};
      const leave=()=>{pointerWorld=null;if(measureMode&&measurePoints.length<($('rulerKind').value==='angle'?3:2)){measurePreview=rulerSnap=null;$("rulerSnapStatus").textContent="Move over the drawing to preview";draw();}};
      const cancel=()=>{measurePreview=null;rulerSnap=null;areaStart=areaEnd=null;ignoreClick=false;draw();};
      const doubleClick=event=>{if(pcb||scene||measureMode||commentMode||event.button>0)return;const item=objectAt(point(event));if(item?.kind==='sheet'){event.preventDefault();openSubsheet(item);}};
      canvas.addEventListener("kicad:select",selection);canvas.canvas.addEventListener('dblclick',doubleClick);
      canvas.canvas.addEventListener("click",pick,true);canvas.canvas.addEventListener("contextmenu",menu);canvas.canvas.addEventListener("pointerdown",down,true);canvas.canvas.addEventListener("pointermove",move);canvas.canvas.addEventListener('pointerup',up,true);canvas.canvas.addEventListener('pointercancel',cancel);canvas.canvas.addEventListener('pointerleave',leave);
      attach={canvas,dispose(){dismissTouchPicker();delete canvas.touchNetPick;delete canvas.dismissTouchPicker;canvas.canvas.removeEventListener('dblclick',doubleClick);canvas.removeEventListener("kicad:select",selection);canvas.canvas.removeEventListener("click",pick,true);canvas.canvas.removeEventListener("contextmenu",menu);canvas.canvas.removeEventListener("pointerdown",down,true);canvas.canvas.removeEventListener("pointermove",move);canvas.canvas.removeEventListener('pointerup',up,true);canvas.canvas.removeEventListener('pointercancel',cancel);canvas.canvas.removeEventListener('pointerleave',leave);}};
      draw();
    }
    $("projectButton").onclick=()=>request("open-project-overview",{repository,ref,file:rootFile}).catch(error=>notice(error.message));
    $("viewerKind").textContent=pcb?"PCB layout viewer":"Schematic viewer";
    $("navigatorHeading").textContent="Project explorer";

    $("navSheets").hidden=pcb;$("sheetSearch").oninput=renderSheets;$("sheetLabel").hidden=pcb;$("allSheets").parentElement.hidden=pcb;
    $("variantBar").hidden=false;
    for(const sheet of model.sheets){const option=make("option",sheet.label||sheet.path);option.value=sheet.path;$("sheetSelect").append(option);}
    $("sheetSelect").onchange=()=>openSheet($("sheetSelect").value);
    const selectionMode=make('select');selectionMode.id='selectionMode';selectionMode.setAttribute('aria-label','Selection mode');selectionMode.title='Select parts, nets, or smart selection of both';
    for(const [value,label]of [['all','All (smart)'],['part','Part'],['net','Net']]){const option=make('option',label);option.value=value;selectionMode.append(option);}
    selectionMode.value='all';selectionMode.onchange=()=>dismissTouchPicker();$('frameControls').append(selectionMode);
    const topSheets=make("nav");topSheets.id="topSheetNavigation";topSheets.className="top-sheet-navigation";topSheets.setAttribute("aria-label","Active sheet and history");topSheets.hidden=pcb;
    topSheets.append($("sheetLabel"),...['sheetBack','sheetForward','sheetUp','sheetHome'].map(id=>{const node=$(id);node.classList.toggle("icon-only",true);return node;}));$("frameControls").append(topSheets);
    const extraControls=make("div");extraControls.id="extraReviewControls";extraControls.className="review-control-popover";extraControls.hidden=true;extraControls.append($("variantBar"),$("highlightControls"),$("shortcutHelp"),$("diagnostics"));document.body?.append(extraControls);
    const searchBox=make('div');searchBox.className='universal-search';
    const searchInput=make('input');searchInput.id='universalSearch';searchInput.type='search';searchInput.placeholder='Search parts, nets, sheets…';searchInput.setAttribute('aria-label','Search parts, nets and sheets');searchInput.setAttribute('role','combobox');searchInput.setAttribute('aria-autocomplete','list');searchInput.setAttribute('aria-expanded','false');searchInput.setAttribute('aria-controls','universalSearchResults');
    const searchPopup=make('div');searchPopup.id='universalSearchResults';searchPopup.className='universal-search-popup';searchPopup.hidden=true;
    const searchList=make('div');searchList.setAttribute('role','listbox');searchList.setAttribute('aria-label','Drawing search results');
    const searchStatus=make('p');searchStatus.className='hint';searchStatus.setAttribute('role','status');
    let searchTimer=null,searchRows=[],searchActive=-1;
    function closeSearch(){searchPopup.hidden=true;searchInput.setAttribute('aria-expanded','false');searchInput.removeAttribute?.('aria-activedescendant');}
    function positionSearch(){const box=searchInput.getBoundingClientRect();searchPopup.style.left=`${Math.max(4,Math.min(box.left,root.innerWidth-330))}px`;searchPopup.style.top=`${(box.bottom??box.top+30)+4}px`;}
    function activeSearch(index){searchActive=index;searchRows.forEach((row,i)=>row.setAttribute('aria-selected',String(i===index)));if(index>=0){searchInput.setAttribute('aria-activedescendant',searchRows[index].id);searchRows[index].scrollIntoView?.({block:'nearest'});}}
    function renderUniversalSearch(result,query){
      searchInput.value=query;if(searchPopup.hidden&&document.activeElement!==searchInput)return;searchList.replaceChildren();searchRows=[];searchActive=-1;searchInput.removeAttribute?.('aria-activedescendant');
      const add=(label,detail,action)=>{const row=button('',event=>{action(event);closeSearch();});row.id=`universalResult${searchRows.length}`;row.setAttribute('role','option');row.setAttribute('aria-selected','false');row.append(make('strong',label),make('small',detail));row.onpointerdown=event=>event.preventDefault();searchRows.push(row);searchList.append(row);};
      const term=query.trim().toLowerCase();
      if(term){for(const file of files.filter(file=>file.path.toLowerCase().includes(term)).slice(0,4))add(file.path.split('/').pop(),file.path,event=>openSheet(file.path));
        for(const match of result.results.slice(0,20-searchRows.length)){const object=match.object;add(object.label||object.reference||object.kind,`${object.kind} · ${object.path}`,event=>selectSearchObject(object,Boolean($('multiHighlight').checked),event));}}
      searchStatus.textContent=result.error||(!term?'Search references, values, nets or sheet names.':`${result.total} object matches · ${searchRows.length} results shown`);
      positionSearch();searchPopup.hidden=false;searchInput.setAttribute('aria-expanded','true');
    }
    function runSearch(){clearTimeout(searchTimer);searchTimer=null;searchPopup.hidden=false;if(navigation)navigation.query(searchInput.value);else{searchStatus.textContent='Project search is unavailable in this viewer.';positionSearch();searchPopup.hidden=false;searchInput.setAttribute('aria-expanded','true');}}
    const searchAll=button('Search entire project',async()=>{searchAll.disabled=true;searchStatus.textContent='Loading project drawings…';try{await navigation?.loadProject();searchStatus.textContent=$('projectSearchStatus').textContent;}finally{searchAll.disabled=false;}});searchAll.id='universalSearchAll';
    searchInput.oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(runSearch,120);};searchInput.onfocus=runSearch;
    searchInput.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();clearTimeout(searchTimer);closeSearch();}else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if(searchPopup.hidden||searchTimer)runSearch();if(searchRows.length)activeSearch((searchActive+(event.key==='ArrowDown'?1:-1)+searchRows.length)%searchRows.length);}else if(event.key==='Enter'){event.preventDefault();if(searchTimer){clearTimeout(searchTimer);searchTimer=null;runSearch();}searchRows[Math.max(0,searchActive)]?.onclick(event);}};
    searchPopup.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeSearch();searchInput.focus();closeSearch();}};
    const searchOutside=event=>{if(!searchBox.contains(event.target)&&!searchPopup.contains(event.target))closeSearch();};document.body.addEventListener('pointerdown',searchOutside);
    const searchBlur=()=>setTimeout(()=>{if(!searchBox.contains(document.activeElement)&&!searchPopup.contains(document.activeElement))closeSearch();},0);searchBox.addEventListener('focusout',searchBlur);searchPopup.addEventListener('focusout',searchBlur);
    searchBox.append(searchInput);searchPopup.append(searchStatus,searchList,searchAll);document.body.append(searchPopup);$('frameControls').insertBefore(searchBox,$('frameControls').firstChild||$('frameControls').children[0]);
    $('frameControls').addEventListener('scroll',closeSearch);root.addEventListener?.('resize',closeSearch);
    resizeCleanups.push(()=>{clearTimeout(searchTimer);document.body.removeEventListener('pointerdown',searchOutside);root.removeEventListener?.('resize',closeSearch);$('frameControls').removeEventListener('scroll',closeSearch);searchPopup.remove();searchBox.remove();});
    const controlsButton=button("Review tools",()=>{extraControls.hidden=!extraControls.hidden;controlsButton.setAttribute("aria-expanded",String(!extraControls.hidden));});controlsButton.id="reviewToolsButton";controlsButton.title="Assembly variants and highlight controls";controlsButton.setAttribute("aria-controls",extraControls.id);controlsButton.setAttribute("aria-expanded","false");$("frameControls").append(controlsButton,netColorButton,netColorProject);
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
    function focusCaption(text){const node=$('focusView');if(!node)return;if(root.KiCadUIIcons)root.KiCadUIIcons.label(node,text);else node.textContent=text;node.setAttribute('aria-label',text==='Focus view'?'Maximize drawing area':'Restore drawing controls');node.setAttribute('aria-pressed',String(text!=='Focus view'));}
    function restoreFocusView(){document.body?.classList?.remove('drawing-focused');focusCaption('Focus view');}
    const focusView=button('Focus view',()=>{const focused=document.body?.classList?.toggle('drawing-focused');showNavigator(false);hideInspector();focusCaption(focused?'Restore controls':'Focus view');try{root.parent?.postMessage({type:'kicad-review:focus',focused:Boolean(focused)},location.origin);}catch{}});focusView.id='focusView';focusView.setAttribute('data-icon','fit');focusView.className='icon-only';focusView.setAttribute('aria-label','Maximize drawing area');focusView.title='Maximize drawing area (Ctrl+Shift+F); Esc restores controls';$('frameControls').insertBefore(focusView,$('frameControls').firstChild);root.KiCadUIIcons?.decorate?.(focusView);
    if(pcb&&root.KiCadRatsnest){const ratsnestButton=button('Ratsnest',()=>{showRatsnest=!showRatsnest;ratsnestButton.setAttribute('aria-pressed',String(showRatsnest));draw();if(showRatsnest)notice(`Candidate connections: ${ratsnestResult?.lines.length||0}. ${ratsnestResult?.warnings.join(' ')||''}`);});ratsnestButton.title='Read-only candidate airwires from saved copper; not native KiCad unrouted/DRC';ratsnestButton.setAttribute('aria-pressed','false');$('frameControls').append(ratsnestButton);}
    if(pcb){const analyticsButton=button('Board analytics',()=>{$('androidToolsSheet')?.close?.();navigate('bom');$('boardStats').scrollIntoView?.({block:'start'});});analyticsButton.id='openBoardAnalytics';analyticsButton.title='Board analytics: saved geometry, placement and routing review';analyticsButton.setAttribute('data-icon','analytics');analyticsButton.className='icon-only';$('drawingTools').append(analyticsButton);}
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
    $("githubAvailability").textContent=remoteAvailable?`Repository: ${targetRepository}. Configure your account in settings to publish directly. ${providerName} repository permissions and review policy apply.${provider==='gitlab'?' GitLab discussions are conversations on an existing issue.':''}`:localCollaborationMessage;
    $("showGitHub").textContent=providerName;$("postComment").textContent=`Post to ${providerName}`;$("editorAccount").textContent=`${providerName} account`;$("editorPreview").textContent=`Preview ${providerName} Markdown`;$("refreshGitHub").textContent=`Load ${providerName} annotations`;
    if(provider==='gitlab'){
      const labels=[["commentPublishSettings","h3","Post to GitLab"],["githubPane","h2","GitLab collaboration"],["commentsPane","p.hint","Save notes locally, create a GitLab issue, or post a discussion on an existing issue. Read status belongs to this browser user."],["githubPane",".collaboration-guide","Choose Issue for a new task or Discussion to comment on an existing GitLab issue. Set the issue number, add severity, tags and mentions, preview the note and captured screenshots, then Post to GitLab using your connected account. Private-media policy applies to uploads. Follow replies and notifications in the linked issue. Local review state does not close an issue."]];
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
    function configureEditorDestination(preserve=false){
      const discussion=$("editorThreadType").value==="discussion";
      const choices=discussion?(provider==='gitlab'?[["existing-issue","Discussion on an existing issue"]]:[["discussion","New discussion"],["existing-discussion","Existing discussion"]]):[["issue","New issue"],["existing-issue","Existing issue"],...(provider==='github'&&options.pullNumber?[["pull-request",`This pull request #${options.pullNumber}`]]:[])];
      const selected=preserve?$('editorDestination').value:null;
      $("editorDestination").replaceChildren();for(const[value,label]of choices){const item=make("option",label);item.value=value;$("editorDestination").append(item);}$("editorDestination").value=choices.some(item=>item[0]===selected)?selected:choices[0][0];
      if(!preserve)$("editorThreadNumber").value=$("threadNumber").value;editorDestinationChanged();
    }
    function editorDestinationChanged(){const value=$("editorDestination").value;$("editorNumberLabel").hidden=!value.startsWith("existing-");$("editorTitleLabel").hidden=true;$("editorCategoryLabel").hidden=$("editorLoadCategories").hidden=value!=="discussion";$("editorThreadNumber").placeholder=value.includes("discussion")?"Discussion number":"Issue number";}
    let postReview=null;
    function reviewPost(){
      try{
        if(pasteBusy)throw Error('Wait for the pasted screenshot to finish preparing.');
        const note=editorNote();if(!remoteAvailable)throw Error(`${providerName} publication is unavailable in this viewer.`);
        if(!postReview){
          const dialog=make('dialog');dialog.id='commentPostReview';dialog.className='comment-post-review';dialog.setAttribute('aria-label','Review comment destination');
          const header=make('header'),body=make('section'),summary=make('p'),preview=make('p'),error=make('p'),actions=make('div');body.className='android-sheet-content';summary.className='hint';preview.className='comment-post-preview';error.setAttribute('role','status');error.className='error';actions.className='inspector-actions';
          const close=()=>{dialog.close?.();dialog.open=false;restore();};
          const restore=()=>{const destination=$('editorDestination').closest?.('label')||$('editorDestination');destination.hidden=false;configureEditorDestination(true);$('commentPostRow').insertBefore(destination,$('postComment'));$('commentPublishSettings').insertBefore($('commentDestinationDetails'),$('commentPostRow').parentElement===$('commentPublishSettings')?$('commentPostRow'):null);};
          header.append(make('strong','Choose where to post'),button('Close',close));
          const destinationLabel=make('label','Post to '),destinationSelect=make('select');destinationSelect.id='commentPostDestination';destinationSelect.setAttribute('aria-label','Comment destination');
          const destinations=provider==='gitlab'?[
            ['issue','New issue','issue','issue'],['existing-issue','Comment on an existing issue','issue','existing-issue'],['issue-discussion','Discussion on an existing issue','discussion','existing-issue']
          ]:[['issue','New issue','issue','issue'],['existing-issue','Comment on an existing issue','issue','existing-issue'],['discussion','New discussion','discussion','discussion'],['existing-discussion','Comment on an existing discussion','discussion','existing-discussion'],...(options.pullNumber?[['pull-request',`This pull request #${options.pullNumber}`,'issue','pull-request']]:[])];
          for(const [value,label]of destinations){const item=make('option',label);item.value=value;destinationSelect.append(item);}
          destinationSelect.onchange=()=>{const selected=destinations.find(item=>item[0]===destinationSelect.value);if(!selected)return;const [, ,type,value]=selected;
            $('editorThreadType').value=type;if(editor)editor.threadType=type;$('githubCommentType').value=type;
            // Keep the transport's provider-specific destinations, using one visible selector.
            const item=make('option',selected[1]);item.value=value;$('editorDestination').replaceChildren(item);$('editorDestination').value=value;editorDestinationChanged();colorCommentControls();
            summary.textContent=`${providerName} · ${targetRepository} · ${selected[1]} · ${$('commentSeverity').value||'info'}`;
          };
          destinationLabel.append(destinationSelect);body.append(destinationLabel);
          const rulesLabel=make('label'),acceptRules=make('input');rulesLabel.className='content-rules-acceptance';acceptRules.type='checkbox';acceptRules.id='acceptContentRules';acceptRules.checked=localStorage.getItem(rulesKey)===contentRulesVersion;rulesLabel.append(acceptRules,make('span',' I agree to the Terms of Service and content rules: '+contentRules));body.append(button('Read Terms & disclaimers',showTerms),rulesLabel);
          const confirm=button(`Post to ${providerName}`,async()=>{if(confirm.disabled)return;if(!acceptRules.checked){error.textContent='Accept the content rules and Terms of Service before publishing.';return;}try{localStorage.setItem(rulesKey,contentRulesVersion);}catch{error.textContent='Unable to save terms acceptance. Nothing posted.';return;}confirm.disabled=true;error.textContent='';try{await saveEditor(true);if(!editor)close();else error.textContent=$('commentStatus').textContent;}finally{confirm.disabled=false;}});confirm.id='confirmCommentPost';
          actions.append(button('Back to comment',close),confirm);body.append(summary,preview,error,actions);dialog.append(header,body);document.body.append(dialog);dialog.addEventListener('close',restore);dialog.addEventListener('cancel',event=>{event.preventDefault();close();});postReview={dialog,body,summary,preview,error,actions,destinationSelect};
        }
        const {dialog,body,summary,preview,error,actions,destinationSelect}=postReview;
        destinationSelect.value=provider==='gitlab'&&note.threadType==='discussion'?'issue-discussion':$('editorDestination').value;
        summary.textContent=`${providerName} · ${options.pullRepository||repository} · ${note.threadType||'issue'} · ${note.severity||'info'} · ${note.state||'open'}`;
        preview.textContent=note.text;error.textContent='';
        const oldDestination=$('editorDestination').closest?.('label')||$('editorDestination');oldDestination.hidden=true;body.insertBefore(oldDestination,actions);body.insertBefore($('commentDestinationDetails'),actions);editorDestinationChanged();
        $('commentText').blur?.();if(!dialog.open){if(dialog.showModal)dialog.showModal();else dialog.open=true;}
        destinationSelect.focus?.();
      }catch(error){commentStatus(error.message,true);}
    }
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
    $("saveComment").onclick=()=>saveEditor();$("postComment").onclick=reviewPost;
    const download=(name,text)=>{const link=make("a");link.download=name;link.href=URL.createObjectURL(new Blob([text],{type:"application/json"}));link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);};
    $("exportComments").onclick=()=>{try{engineeringExport("kicad-review-comments.json",KiCadReviewComments.exportComments(notes),'application/json');}catch(error){commentStatus(error.message,true);}};
    $("importComments").onclick=()=>$("commentFile").click();
    $("commentFile").onchange=async()=>{
      const file=$("commentFile").files?.[0];if(!file)return;let saved=0;
      try{if(file.size>1024*1024)throw new Error("Comment import exceeds 1 MiB.");const imported=KiCadReviewComments.parseComments(await file.text());
        if(imported.some((note)=>(note.anchor.provider||'github')!==provider||(provider==='gitlab'&&(note.anchor.host||'https://gitlab.com')!==host)||note.anchor.repository!==repository||note.anchor.ref!==ref||!files.some((source)=>source.path===note.anchor.file)))throw new Error("These comments belong to another repository, revision, or drawing.");
        for(const note of imported){await request("comment-save",{comment:note});saved++;}await refreshComments();if(saved)options.onCommentsChanged?.();commentStatus(`Imported ${saved} comments.`);
      }catch(error){await refreshComments();if(saved)options.onCommentsChanged?.();commentStatus(`${error.message}${saved?` ${saved} comments were saved before the error.`:""}`,true);}finally{$("commentFile").value="";}
    };
    function openBomManager(){
      if(!root.KiCadBomManager){notice('BoM manager could not load.');return;}
      $('androidToolsSheet')?.close?.();
      let manager;const onLocate=object=>{manager?.close();selectObject(object,true,true);};
      let onEdit,onExport;try{if(root.top.KiCadAndroidPartEditor?.canEdit(root.top.KiCadAndroidProject))onEdit=object=>root.top.KiCadAndroidPartEditor.open(object);if((root.top.AndroidKiCad||root.top.KiViewIOS)?.exportText)onExport=(name,text,mime)=>{if(new TextEncoder().encode(text).length>4*1024*1024)throw Error('BoM export exceeds 4 MiB; narrow the filters.');(root.top.AndroidKiCad||root.top.KiViewIOS).exportText(name,text,mime.split(';')[0]);};}catch{}
      manager=root.KiCadBomManager.open({objects,selectedId:selected?.id,scope:JSON.stringify([provider,host,repository,ref,rootFile,...(variant==='default'?[]:[variant])]),variants:model.variants,variant,onVariant:id=>{$('variantSelect').value=id;$('variantSelect').onchange();openBomManager();},storage:root.localStorage,onLocate,...(onEdit?{onEdit}:{}),...(onExport?{onExport}:{})});
    }
    function openReviewHandoff(){
      if(!root.KiCadReviewHandoff){notice('Review transfer could not load.');return;}
      $('androidToolsSheet')?.close?.();const api=root.KiCadReviewHandoff;
      const metadataScope=id=>api.bomScope(scope(rootFile),id),storageKey=id=>'kicad-bom-manager:v1:'+metadataScope(id);
      const getTarget=id=>{if(scene)throw Error('Switch to the 2D drawing before importing a view.');return {scope:scope(rootFile),bomScope:metadataScope(id),activeFile:currentFile(),config};};
      api.open({getFiles:()=>files,getTarget,onExport:engineeringExport,getState:async()=>{
        const savedNotes=await request('comment-list',scope()),parts=root.KiCadBomManager.validateMetadata(root.localStorage.getItem(storageKey(variant))||JSON.stringify({version:1,scope:metadataScope(variant),parts:{}}),metadataScope(variant));
        const kind=$('rulerKind').value==='angle'?'angle':'distance',ruler=measureMode&&measurePoints.length===(kind==='angle'?3:2)?{kind,points:measurePoints.map(p=>({x:p.x,y:p.y}))}:null;
        return {scope:scope(rootFile),variant,config,bom:{scope:metadataScope(variant),parts},comments:savedNotes,view:{file:currentFile(),camera:root.KiCadViewState.read(getCanvas()?.viewport?.camera),selection:selectedNet?{kind:'net',netCode:String(selectedNet.code)}:selected?.uuid?{kind:selected.kind,uuid:selected.uuid}:null,ruler}};
      },onApply:async prepared=>{
        const {data}=prepared,key=storageKey(data.variant),previous=root.localStorage.getItem(key),previousConfig=chrome.storage?.local?(await chrome.storage.local.get(variantKey))[variantKey]:undefined,old=root.KiCadBomManager.validateMetadata(previous||JSON.stringify({version:1,scope:metadataScope(data.variant),parts:{}}),metadataScope(data.variant));
        const merged=Object.create(null);for(const [id,part]of Object.entries(prepared.parts))merged[id]={...part};for(const [id,part]of Object.entries(old)){merged[id]??={};for(const [field,value]of Object.entries(part))if(value!=='')merged[id][field]=value;}
        const incoming=[];let skipped=0;
        for(const file of new Set(prepared.comments.map(n=>n.anchor.file))){const existing=await request('comment-list',scope(file)),ids=new Set(existing.map(n=>n.id));const additions=prepared.comments.filter(n=>n.anchor.file===file&&!ids.has(n.id));skipped+=prepared.comments.filter(n=>n.anchor.file===file&&ids.has(n.id)).length;if(existing.length+additions.length>100)throw Error('Import would exceed 100 notes on '+file+'. Existing review was retained.');incoming.push(...additions);}
        try{root.localStorage.setItem(key,root.KiCadBomManager.metadataJSON(metadataScope(data.variant),merged));if(chrome.storage?.local)await chrome.storage.local.set({[variantKey]:prepared.config});}catch(error){try{if(previous===null)root.localStorage.removeItem(key);else root.localStorage.setItem(key,previous);if(chrome.storage?.local){if(previousConfig===undefined&&chrome.storage.local.remove)await chrome.storage.local.remove(variantKey);else await chrome.storage.local.set({[variantKey]:previousConfig??null});}}catch{}throw Error('Review storage failed: '+error.message);}
        installConfig(prepared.config);variant=data.variant;objects=KiCadDesignModel.applyVariant(model,variant);variants();
        let saved=0;try{for(const note of incoming){await request('comment-save',{comment:note});saved++;}}catch(error){await refreshComments();if(saved)options.onCommentsChanged?.();throw Error(`${saved} notes and assembly metadata imported before the save failed: ${error.message}. Retry retains existing IDs.`);}
        root.KiCadViewState.apply(getCanvas()?.viewport?.camera,data.view.camera);getCanvas()?.draw();refreshNets();
        const pick=data.view.selection;if(pick?.netCode){const net=netModel.nets.find(n=>n.path===currentFile()&&String(n.code)===pick.netCode);if(net)selectNet(net,false,false);}else if(pick?.uuid){const matches=objects.filter(o=>o.path===currentFile()&&o.uuid===pick.uuid&&o.kind===pick.kind);if(matches.length===1)selectObject(matches[0],false,false);}
        if(data.view.ruler){measureMode=true;measurePoints=data.view.ruler.points;$('rulerKind').value=data.view.ruler.kind;measurePreview=rulerSnap=boardMeasure=null;$('rulerControls').hidden=false;$('measureButton').setAttribute('aria-pressed','true');getCanvas()?.canvas.classList?.toggle('ruler-mode',true);}else {measureMode=false;measurePoints=[];measurePreview=rulerSnap=boardMeasure=null;$('rulerControls').hidden=true;$('measureButton').setAttribute('aria-pressed','false');getCanvas()?.canvas.classList?.toggle('ruler-mode',false);}
        await refreshComments();if(saved)options.onCommentsChanged?.();draw();return `Imported ${saved} notes · ${skipped} existing note IDs retained · assembly fields merged · view restored. No issue or discussion was posted.`;
      }});
    }
    let schematicSourcePromise=null;
    async function schematicMatches(object,hostNode){
      if(!hostNode){hostNode=make('dialog');hostNode.className='bom-manager';hostNode.append(button('Close',()=>hostNode.close()));hostNode.addEventListener('close',()=>hostNode.remove());document.body.append(hostNode);hostNode.showModal();}
      const message=make('p','Loading saved schematic matches…');hostNode.append(message);
      try{
        if(!schematicSourcePromise)schematicSourcePromise=(async()=>{const inventory=await request('drawing-files',{repository,ref,file:rootFile});const paths=[...new Set((inventory.files||[]).map(f=>typeof f==='string'?f:f.path).filter(p=>/\.kicad_sch$/i.test(p)))];if(paths.length>64)throw Error('Schematic matching is limited to 64 source files; open a smaller project.');let bytes=0;const sources=[];for(const path of paths){const loaded=files.find(f=>f.path===path),content=loaded?.content??(await request('project-file',{repository,ref,file:path})).content;if(typeof content!=='string')throw Error('Schematic source unavailable: '+path);const size=new TextEncoder().encode(content).length;if(size>8*1024*1024||(bytes+=size)>32*1024*1024)throw Error('Schematic matching exceeds its 8 MiB/file or 32 MiB/project budget.');sources.push({path,content});}return KiCadDesignModel.buildProject(sources).objects;})().catch(e=>{schematicSourcePromise=null;throw e;});
        const linked=root.KiCadComponentLinks.matches(object,await schematicSourcePromise);message.textContent=linked.matches.length?`${linked.matches.length} schematic matches (${linked.method}${linked.ambiguous?' · choose the correct sheet/unit':''}).`:'No saved schematic match. Import the corresponding schematic sources.';
        for(const target of linked.matches){const b=button(`${target.reference} · ${target.path} · unit ${target.properties?.Unit||'1'}`,()=>{for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();const focus={x:target.position?.x,y:target.position?.y,uuid:target.uuid};try{if(root.top.KiCadAndroid){root.top.KiCadAndroid.openDrawing(target.path,focus);return;}}catch{}if(root.KiCadVSCodeContext){request('open-project-drawing',{repository,ref,file:target.path});return;}const q=new URLSearchParams({repository,ref,file:target.path,...providerContext,...(Number.isFinite(focus.x)&&Number.isFinite(focus.y)?{focusX:focus.x,focusY:focus.y}:{}),...(focus.uuid?{focusUuid:focus.uuid}:{})});root.open(chrome.runtime.getURL('schematic-viewer.html')+'?'+q,'_blank','noopener');});hostNode.append(b);}
      }catch(error){message.textContent=error.message;}
    }
    function engineeringExport(name,text,mime){let native;try{native=root.top.AndroidKiCad||root.top.KiViewIOS;}catch{}if(native?.exportText){if(new TextEncoder().encode(text).length>4*1024*1024)throw Error('Export exceeds 4 MiB.');native.exportText(name,text,mime.split(';')[0]);return true;}const a=make('a');a.href=URL.createObjectURL(new Blob([text],{type:mime}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
    const repositoryButton=button('Repository',()=>{if(!root.KiCadRepositoryExplorer)return;root.KiCadRepositoryExplorer.open({repository,ref,file:currentFile(),provider,host,local:Boolean(!root.KiCadAndroidOnline&&(root.KiCadVSCodeContext||root.KiCadLocalRuntime)),request,canOpenFile:path=>root.KiCadVSCodeContext&&!root.KiCadAndroidRuntime?true:root.KiCadAndroidRuntime||root.KiCadLocalRuntime?files.some(f=>f.path===path):/\.kicad_(sch|pcb|pro)$/i.test(path),onOpenFile:async(path)=>{await request(root.KiCadVSCodeContext&&!root.KiCadAndroidRuntime?(/\.kicad_(sch|pcb)$/i.test(path)?'open-project-drawing':'open-project-file'):'open-viewer-window',{repository,ref,file:path});}});});repositoryButton.id='openRepositoryExplorer';repositoryButton.setAttribute('data-icon','folder');repositoryButton.className='icon-only';repositoryButton.setAttribute('aria-label','Repository files and commit history');repositoryButton.title='Repository tree, branches and commit graph';repositoryButton.disabled=!root.KiCadRepositoryExplorer;$('drawingTools').append(repositoryButton);
    const testpointButton=button('Testpoints & nets',()=>{$('androidToolsSheet')?.close?.();refreshNets();let table;table=root.KiCadTestpointTools.open({sourceKind:pcb?'footprint':'symbol',model:{objects,nets:netModel.nets,designs:options.getDesigns?.()},onExport:content=>engineeringExport('testpoint-summary.csv',content,'text/csv;charset=utf-8'),onLocate:row=>{table.close();const object=objects.find(o=>o.id===row.objectId&&o.path===row.path);if(object)selectObject(object,true,true);if(row.position)focus(row.position);},onSchematic:row=>{const object=objects.find(o=>o.id===row.objectId&&o.path===row.path);if(object)schematicMatches(object);}});});testpointButton.id='openTestpoints';
    const highlightTestpoints=button('Highlight testpoints',()=>{
      refreshNets();const found=testpointsForPath(currentFile());
      if(!testpointHighlight&&!found.length){notice('No saved testpoints found on this drawing.');return;}
      testpointHighlight=!testpointHighlight;updateHighlights();renderObjects();
      if(testpointHighlight){const count=Math.min(200,found.length),nets=new Set(found.slice(0,200).flatMap(object=>netsForObject(object).map(net=>net.id)));notice(`${count} testpoint${count===1?'':'s'} highlighted on this drawing · linked to ${nets.size} saved net${nets.size===1?'':'s'}${found.length>200?' · first 200 of '+found.length:''}.`);}
      else notice('Testpoint highlighting off. Existing selections retained.');
    });highlightTestpoints.id='highlightTestpoints';highlightTestpoints.className='icon-only';highlightTestpoints.setAttribute('data-icon','pin');highlightTestpoints.setAttribute('aria-label','Highlight testpoints');highlightTestpoints.setAttribute('aria-pressed','false');highlightTestpoints.title='Highlight testpoints on this drawing';highlightTestpoints.disabled=!root.KiCadTestpointTools?.classify;
    const filterTestpoints=button('Testpoints',()=>{$('androidToolsSheet')?.close?.();$('objectFilter').value='testpoints';$('allSheets').checked=false;$('partSearch').value='';renderObjects();navigate('parts');$('partSearch').focus();});filterTestpoints.id='filterTestpoints';filterTestpoints.setAttribute('data-icon','search');filterTestpoints.setAttribute('aria-label','Filter to testpoints');filterTestpoints.title='Show testpoints on this drawing, then search by reference, value or net';filterTestpoints.disabled=!root.KiCadTestpointTools?.classify;$('partsPane').insertBefore(filterTestpoints,$('objectFilter'));
    const photoButton=button('Photo & AR review',()=>{refreshNets();root.KiCadPhotoReview.open({objects,files,variants:model.variants.map(v=>({...v,objects:KiCadDesignModel.applyVariant(model,v.id)})),selectedVariant:variant,onDiscussion:({report,capture,path})=>editComment({id:crypto.randomUUID(),createdAt:new Date().toISOString(),threadType:'discussion',text:report.markdown+'\n\nAttached: compressed top/bottom contact sheet. Export the JSON log separately for complete evidence.',severity:'info',tags:['assembly-inspection'],capture,anchor:{...anchor(null,null),file:path,uuid:null,reference:null,position:null,area:null,kind:'drawing'}}),scope:JSON.stringify([provider,host,repository,ref]),testpoints:root.KiCadTestpointTools.summarize({objects,nets:netModel.nets,designs:options.getDesigns?.()}).rows,onLocate:object=>selectObject(object,true,true),onSchematic:schematicMatches,onExport:engineeringExport});});photoButton.id='openPhotoReview';photoButton.disabled=!pcb;
    const engineeringButton=button('Engineering tools',()=>{$('androidToolsSheet')?.close?.();root.KiCadEngineeringLauncher?.openMenu({repository,ref,file:currentFile(),provider,host});});engineeringButton.id='openEngineeringTools';engineeringButton.setAttribute('data-icon','gear');engineeringButton.className='icon-only';engineeringButton.title='PDF, Gerber analyzer, BoM import and calculators';engineeringButton.disabled=!root.KiCadEngineeringLauncher;
    const calculatorButton=button('Calculators',()=>{$('androidToolsSheet')?.close?.();root.KiCadEngineeringLauncher?.open('calculator-viewer.html',{repository,ref,provider,host});});calculatorButton.id='openCalculators';calculatorButton.setAttribute('data-icon','calculator');calculatorButton.className='icon-only';calculatorButton.setAttribute('aria-label','Open engineering calculators');calculatorButton.title='Offline engineering calculators';calculatorButton.disabled=!root.KiCadEngineeringLauncher;$('drawingTools').append(calculatorButton);
    const handoffButton=button('Transfer review',openReviewHandoff);handoffButton.id='openReviewHandoff';handoffButton.setAttribute('data-icon','send');handoffButton.className='icon-only';handoffButton.title='Transfer verified review state between app and extension';handoffButton.disabled=!root.KiCadReviewHandoff;$('drawingTools').append(engineeringButton,handoffButton);
    testpointButton.title='Testpoints: filter saved nets and locate connected parts';testpointButton.setAttribute('aria-label','Testpoints and connected nets');testpointButton.setAttribute('data-icon','inspect');testpointButton.className='icon-only';testpointButton.disabled=!root.KiCadTestpointTools;
    const bomManagerButton=button('Assembly',openBomManager);bomManagerButton.id='openBomManager';bomManagerButton.title='BoM and assembly: quantities, variants and unfinished parts';bomManagerButton.setAttribute('aria-label','Open BoM and assembly');bomManagerButton.setAttribute('data-icon','assembly');bomManagerButton.className='icon-only';bomManagerButton.disabled=!root.KiCadBomManager;
    // Core bench actions stay one click away. Camera inspection is secondary.
    $('drawingTools').insertBefore(bomManagerButton,$('drawingTools').firstChild);$('drawingTools').insertBefore(testpointButton,bomManagerButton.nextSibling);$('drawingTools').insertBefore(highlightTestpoints,testpointButton.nextSibling);
    const inspectionTools=make('details');inspectionTools.id='assemblyInspectionTools';inspectionTools.append(make('summary','Photo inspection'),photoButton);$('bomPane').insertBefore(inspectionTools,$('bomSummary'));
    const variantManagerButton=button('Manage variants',()=>{if(!root.KiCadVariantManager)return;root.KiCadVariantManager.open({objects:model.objects,config,onSave:async next=>{KiCadDesignModel.buildProject(files,next);if(chrome.storage?.local)await chrome.storage.local.set({[variantKey]:next});installConfig(next);},onExport:(name,text,mime)=>{try{if((root.top.AndroidKiCad||root.top.KiViewIOS)?.exportText){engineeringExport(name,text,mime);return;}}catch{}const url=URL.createObjectURL(new Blob([text],{type:mime})),a=make('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}});});variantManagerButton.id='manageVariants';$('variantBar').append(variantManagerButton);
    $("exportBom").onclick=()=>{if(!root.KiCadBomAnalytics)return;const csv=root.KiCadBomAnalytics.csv(root.KiCadBomAnalytics.bom(objects,$("bomAllSheets").checked?null:currentFile()));const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));const a=make("a");a.href=url;a.download="kicad-review-bom.csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
    for(const id of ["bomAllSheets","bomDnpOnly","bomSearch"])$(id).oninput=renderBom;
    function populationNotice(){const count=objects.filter(o=>o.path===currentFile()&&["symbol","footprint"].includes(o.kind)&&o.populated===false).length;$("selectionStatus").textContent=dnpHighlight?`${count} DNP / DNI components in the selected assembly${count>1000?" · first 1,000 markers shown":""}. Saved design remains unchanged.`:"DNP / DNI highlighting off.";}
    function populationHighlight(on){dnpHighlight=Boolean(on);$("highlightDnp").checked=dnpHighlight;updateHighlights();draw();populationNotice();}
    $("highlightDnp").onchange=()=>populationHighlight($("highlightDnp").checked);
    if($("populationHighlight")){$("populationHighlight").hidden=!pcb;$("populationHighlight").onclick=()=>populationHighlight(!dnpHighlight);}
    $("variantSelect").onchange=()=>{variant=$("variantSelect").value;objects=KiCadDesignModel.applyVariant(model,variant);if(selected)selected=objects.find((item)=>item.id===selected.id)||null;variants();};
    $("importVariant").onclick=()=>$("variantFile").click();
    $("variantFile").onchange=async()=>{const file=$("variantFile").files?.[0];if(!file)return;
      try{if(file.size>1024*1024)throw new Error("Variant file exceeds 1 MiB.");const next=KiCadDesignModel.parseVariantConfig(await file.text(),file.name);installConfig(next);if(chrome.storage?.local)await chrome.storage.local.set({[variantKey]:next});}
      catch(error){notice(error.message);}finally{$("variantFile").value="";}
    };
    $("measureButton").onclick=()=>{if(commentMode)setCommentMode(null);measureMode=!measureMode;measurePoints=[];measurePreview=rulerSnap=boardMeasure=null;$("rulerControls").hidden=!measureMode;getCanvas()?.canvas.classList?.toggle("ruler-mode",measureMode);$("measureBoard").hidden=!pcb;if(measureMode)getCanvas().gridPitch=Number($("rulerPitch").value)||1;$("measureButton").setAttribute("aria-pressed",String(measureMode));$("measurementStatus").textContent=measureMode?($('rulerKind').value==='angle'?'Click first arm endpoint, vertex, then second arm endpoint.':'Click a start point, move to preview, then click to finish.'):"";draw();};
    $('rulerKind').onchange=()=>{measurePoints=[];measurePreview=rulerSnap=boardMeasure=null;$('measurementStatus').textContent=$('rulerKind').value==='angle'?'Click first arm endpoint, vertex, then second arm endpoint.':'Click a start point';draw();};
    $('clearRuler').onclick=()=>{measurePoints=[];measurePreview=rulerSnap=boardMeasure=null;$('measurementStatus').textContent='Click a start point';$('rulerSnapStatus').textContent='Click a start point';draw();};
    $('rulerSnap').onchange=()=>{measurePreview=rulerSnap=null;draw();};$('rulerPitch').onchange=()=>{const pitch=Number($('rulerPitch').value);if(!Number.isFinite(pitch)||pitch<.001||pitch>100){$('rulerSnapStatus').textContent='Grid spacing must be 0.001-100 mm';return;}getCanvas().gridPitch=pitch;measurePreview=rulerSnap=null;getCanvas().draw();};
    $('measureBoard').onclick=()=>{$('rulerKind').value='distance';const extent=KiCadReviewTools.boardExtents(getCanvas()?.design?.primitives,KiCadOwnedCanvas.arcThrough);if(!extent){$('measurementStatus').textContent='No saved Edge.Cuts geometry to measure';return;}boardMeasure=extent;measurePoints=[{x:extent.x,y:extent.y},{x:extent.x+extent.width,y:extent.y+extent.height}];measurePreview=rulerSnap=null;draw();$('rulerSnapStatus').textContent='Saved outline bounding extents (not DRC validation)';};
    const reviewKeydown=event=>{
      if(event.defaultPrevented||event.repeat||event.composedPath().some(node=>node?.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(node?.tagName||'')))return;
      if(event.key==='Escape'){$('objectMenu').hidden=true;extraControls.hidden=companionChooser.hidden=true;controlsButton.setAttribute('aria-expanded','false');document.body?.classList?.remove('drawing-focused');try{root.parent?.postMessage({type:'kicad-review:focus',focused:false},location.origin);}catch{}focusCaption('Focus view');if(commentMode)setCommentMode(null);if(selectedNet||pinnedNets.size||pinnedClasses.size||highlightObjects.length||testpointHighlight)clearHighlights();if(measureMode)$('measureButton').click();return;}
      if(event.ctrlKey&&event.shiftKey&&event.key.toLowerCase()==='f'&&!event.altKey&&!event.metaKey){event.preventDefault();const focused=document.body?.classList?.toggle('drawing-focused');focusCaption(focused?'Restore controls':'Focus view');try{root.parent?.postMessage({type:'kicad-review:focus',focused:Boolean(focused)},location.origin);}catch{}showNavigator(false);hideInspector();return;}
      if(event.altKey&&!event.ctrlKey&&!event.metaKey&&!pcb&&!scene&&['ArrowLeft','ArrowRight','Home'].includes(event.key)){event.preventDefault();if(event.key==='Home')homeSheet();else historySheet(event.key==='ArrowLeft'?-1:1);return;}
      if(event.altKey&&event.key==='ArrowUp'&&!event.ctrlKey&&!event.metaKey&&!pcb&&!scene){event.preventDefault();parentSheet();return;}
      if(event.ctrlKey||event.altKey||event.metaKey)return;
      const key=event.key.toLowerCase();
      if(key==='e'){event.preventDefault();if(scene){properties();inspector('properties');}else inspectPointer();}
      else if(key==='/'){event.preventDefault();searchInput.focus();}
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
      onSearchResults:renderUniversalSearch,is3D:()=>Boolean(scene),redraw:draw,showRules:showRuleWindow,onRuleReportLoaded:()=>{reportSources.open=false;showRuleWindow();},selectSearchObject,highlightSearchObjects,
      isHighlighted:o=>o.kind==='net'?highlightedNets().some(n=>n.path===o.path&&n.name===o.netName):o.kind==='netclass'?pinnedClasses.has(JSON.stringify([o.path,o.className])):highlightObjects.some(item=>item.id===o.id)||(testpointHighlight&&o.path===currentFile()&&testpointsForPath(o.path).slice(0,200).some(item=>item.id===o.id)),setMultiHighlight:on=>{if(!on){const keep=selectedNet||highlightedNets()[0];pinnedNets.clear();pinnedClasses.clear();selectedNet=keep||null;highlightObjects=keep?[]:highlightObjects.slice(0,1);activeConnection=null;connectionCursor=-1;updateHighlights();renderObjects();emitHighlightGroup();renderNets();renderNetClasses();navigation?.renderSearch();}},
      setNetClasses:config=>{classConfig=config;pinnedClasses.clear();renderNetClasses();applyNetColors();updateNetColorToggle();updateHighlights();},
      followSheet,
      addSearchFiles:incoming=>{for(const file of incoming){const previous=files.find(f=>f.path===file.path);if(previous&&previous.content!==file.content)throw new Error("Loaded drawing differs from the search snapshot; refresh before navigating results.");}for(const file of incoming){if(/\.kicad_pcb$/i.test(file.path)!==pcb)continue;const existing=files.find(f=>f.path===file.path);if(existing&&existing.content!==file.content)throw new Error('Loaded drawing differs from the search snapshot; refresh before navigating results.');if(!existing)files.push(file);}model=KiCadDesignModel.buildProject(files,config);objects=KiCadDesignModel.applyVariant(model,variant);renderObjects();renderSheets();},
      locateRule:target=>{if(!files.some(f=>f.path===target.file)){notice('The report item drawing is not loaded. Index the project first.');return false;}if(/\.kicad_pcb$/i.test(target.file)!==pcb){notice('Open the matching drawing viewer to navigate this report item.');return false;}if(scene){notice('Rule arrows are available in 2D.');return false;}if(target.file!==currentFile())openSheet(target.file,target.position);else focus(target.position);return true;}
    });
    const copyDrawingText=()=>{const canvas=getCanvas(),lines=(canvas?.primitives||[]).filter(p=>p.type==='text'&&!p.hidden&&(!p.layer||!canvas.visibleLayers||canvas.visibleLayers.has(p.layer))).slice(0,5000).map(p=>String(p.text||'')).filter(Boolean);root.dispatchEvent?.(new CustomEvent('kicad:drawing-text-result',{detail:{text:lines.join('\n').slice(0,262144)}}));};
    root.addEventListener?.('kicad:request-drawing-text',copyDrawingText);resizeCleanups.push(()=>root.removeEventListener?.('kicad:request-drawing-text',copyDrawingText));
    $('highlightControls').hidden=false;$('highlightStyle').onchange=updateHighlights;$('clearHighlights').onclick=clearHighlights;
    const unselect=button('Unselect',clearSelection);unselect.id='unselect';unselect.setAttribute('aria-label','Unselect');unselect.title='Unselect objects; keep highlights';$('highlightControls').insertBefore(unselect,$('clearHighlights'));
    $('fitHighlights').onclick=()=>{const canvas=getCanvas(),box=root.KiCadOwnedCanvas?.bounds([...canvas.netPrimitives||[]]);if(box){canvas.resize();const margin=Math.max(3,Math.max(box.w,box.h)*.1);canvas.viewport.camera.bbox={x:box.x-margin,y:box.y-margin,w:box.w+margin*2,h:box.h+margin*2};canvas.draw();}};
    $('previousConnection').onclick=()=>cycleConnection(-1);$('nextConnection').onclick=()=>cycleConnection(1);
    $('netClassSelect').onchange=renderNetClasses;
    if(!remoteAvailable){if(commentHelp)commentHelp.textContent=localCollaborationMessage;for(const id of ['reviewSettings','refreshCommentPolicy','refreshGitHub','loadCategories','discussionCategoryLabel','threadNumberLabel'])$(id).hidden=true;$('commentDestination').parentElement.hidden=true;}
    if(root.KiCadLocalRuntime){collaborationGroup.hidden=true;for(const id of ['githubPane','postComment','showGitHub'])$(id).hidden=true;}
    $('sheetBack').onclick=()=>historySheet(-1);$('sheetForward').onclick=()=>historySheet(1);$('sheetUp').onclick=parentSheet;$('sheetHome').onclick=homeSheet;
    $('highlightNetClass').onclick=()=>{const name=$('netClassSelect').value;if(!classConfig||!name)return;const key=JSON.stringify([currentFile(),name]),existed=pinnedClasses.has(key);if(!$('multiHighlight').checked){pinnedNets.clear();pinnedClasses.clear();highlightObjects=[];selectedNet=null;}if(existed)pinnedClasses.delete(key);else if(pinnedClasses.size<64)pinnedClasses.set(key,{path:currentFile(),name});activeConnection=null;connectionCursor=-1;updateHighlights();renderNets();renderNetClasses();emitHighlightGroup();};
    root.KiCadUIIcons?.decorate();$("schematicLayersHint").hidden=pcb;showNavigator(false);variants();
    if(chrome.storage?.local)chrome.storage.local.get(variantKey).then((saved)=>{if(saved[variantKey])installConfig(saved[variantKey]);}).catch((error)=>notice(error.message));
    refreshCommentPolicy();if(netColorsEnabled)loadNetColors();
    function overviewConnectivity(networks){
      if(!root.KiCadOverviewConnectivity)return null;
      const sources=(networks||[...pinnedNets.values(),...(selectedNet?[selectedNet]:[])]).filter(n=>n.kind==='schematic').map(n=>overviewSource?.netId===n.id?overviewSource:n.id),key=JSON.stringify(sources);
      if(overviewCache?.model===netModel&&overviewCache.objects===objects&&overviewCache.key===key)return overviewCache.result;
      const entries=sources.length?sheetOverviewEntries(model.sheets.filter(s=>s.kind==='schematic'),objects.filter(o=>o.kind==='sheet')):[];
      const result=sources.length?root.KiCadOverviewConnectivity.resolve(netModel.nets,sources,entries.flatMap(e=>e.placements||[])):{matches:[],links:[],limits:[]};result.active=sources.length>0;
      overviewCache={model:netModel,objects,key,result};return result;
    }
    return {focusSaved(path,uuid){const matches=objects.filter(o=>o.path===path&&o.uuid===uuid&&!o.parentId);if(matches.length===1)selectObject(matches[0],true,true);},restoreFocusView,attachCanvas,draw,refreshNets,refreshComments,highlightRelated,followSheet,clearSelection,clearHighlights,
      overviewSheets(){return sheetOverviewEntries(model.sheets.filter(s=>s.kind==='schematic'),objects.filter(o=>o.kind==='sheet'));},
      overviewSelection(path,instanceId){const graph=overviewConnectivity();return {netIds:graph?[...new Set(graph.matches.filter(m=>m.net.path===path&&(!instanceId||m.instanceId===instanceId)).map(m=>m.net.id))]:(netSheetMatches().get(path)||[]).map(n=>n.id),instanceIds:graph?[...new Set(graph.matches.filter(m=>m.net.path===path).map(m=>m.instanceId))]:[],limits:graph?.limits||[],uuids:highlightObjects.filter(o=>o.path===path).map(o=>o.uuid).filter(Boolean),mode:$('highlightStyle').value||'dim',netActive:graph?graph.active:netSheetMatches().size>0};},
      selectOverviewNet(path,uuid,instanceId){const matches=netModel.nets.filter(n=>n.path===path&&n.uuids.includes(uuid));if(matches.length===1){selectNet(matches[0],false,false,false,false,instanceId);return true;}return false;},
      overviewNetLinks(){return overviewConnectivity()?.links||overviewNetLinks(netModel.nets,[...pinnedNets.values(),...(selectedNet?[selectedNet]:[])].filter(n=>n.kind==='schematic').map(n=>n.id),objects.filter(o=>o.kind==='sheet').map(o=>({path:o.path,target:sheetTarget(o),sheetId:o.uuid||o.id})));},
      inspect3D(record){nativePick=record;const object=resolveObject(objects,rootFile,record);if(object)selectObject(object,false,false,true);else if(record?.net!=null){const net=netModel.nets.find(n=>n.path===currentFile()&&(String(n.code)===String(record.net)||n.name===record.net));if(net)selectNet(net,false,false,false,false);}properties();inspector("properties");},
      select3D(record){nativePick=record;const object=resolveObject(objects,rootFile,record),mode=$('selectionMode').value||'all';if(mode==='part'&&record&&!object?.reference)return;const net=record&&netModel.nets.find(n=>n.path===currentFile()&&(String(n.code)===String(record.net)||n.name===record.net));if(net&&(mode==='net'||!object?.reference)){selectNet(net,true,false);return;}if(mode==='net'&&record)return;if(object&&$('multiHighlight').checked){const index=highlightObjects.findIndex(o=>o.id===object.id);if(index<0)highlightObjects.push(object);else highlightObjects.splice(index,1);}selectObject(object,false,false,true);},
      comment3D(record){const object=resolveObject(objects,rootFile,record);if(object)editComment(null,anchor(object.position,object));else notice("This 3D object has no unambiguous saved part anchor; switch to 2D to place a comment.");},
      setScene(next){scene=next;$("highlightControls").hidden=Boolean(scene&&!scene.setSelection);$("highlightDnp").disabled=Boolean(scene);for(const id of ["measureButton","navLayers","pointComment","areaComment"])$(id).disabled=Boolean(scene);$("navNets").disabled=Boolean(scene&&!scene.setSelection);if(scene&&navigatorTab!=="parts")navigate("parts");if(scene){setCommentMode(null);measureMode=false;measurePoints=[];getCanvas()?.canvas.classList?.toggle("ruler-mode",false);measurePreview=rulerSnap=boardMeasure=null;$("rulerControls").hidden=true;$("measureButton").setAttribute("aria-pressed","false");$("measurementStatus").textContent="";scene.setPopulation(objects.filter((item)=>item.kind==="footprint").map((item)=>({reference:item.reference,populated:item.populated})));}updateHighlights();draw();},
      dispose(){root.removeEventListener?.('pointerdown',outsideTouchPicker,true);dismissTouchPicker();netColorDisposed=true;netColorTicket++;threadTicket++;pasteGeneration++;mentionDisposed=true;mentionGeneration++;clearTimeout(mentionTimer);loadId++;remoteLoad++;netBuilder?.clear();reviewToolsObserver?.disconnect();sidebarObserver?.disconnect();root.removeEventListener?.('resize',layoutSidebars);root.removeEventListener?.('resize',ruleResize);ruleWindowObserver?.disconnect();for(const cleanup of resizeCleanups)cleanup();root.removeEventListener?.('keydown',reviewKeydown);narrowPanels.removeEventListener?.("change",keepDrawingVisible);navigation?.dispose();attach?.dispose();}}
  }
  root.KiCadReviewWorkspace={mount,objectNetLookup,populationOverlayCache,resolveObject,touchNetIndex,touchNetCandidates,selectionCandidates,measurement,matchesSearch,sheetTarget,sheetEntries,sheetOverviewEntries,sheetHistory,rootSheetPath,sheetPageHighlights,overviewNetLinks,composeSheetOverview};
  if(typeof module==="object"&&module.exports)module.exports=root.KiCadReviewWorkspace;
})(globalThis);
