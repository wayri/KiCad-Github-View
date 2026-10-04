"use strict";

(() => {
  const params = new URLSearchParams(location.search);
  const request = {
    repository: params.get("repository"), headRepository: params.get("headRepository") || params.get("repository"),
    file: params.get("file"), oldFile: params.get("oldFile") || params.get("file"),
    head: params.get("head") || params.get("ref"), base: params.get("base"), status: params.get("status") || "modified", pullNumber: Number(params.get("pullNumber")) || null, pullRepository: params.get("pullRepository") || params.get("repository")
  };
  const provider=params.get('provider')||'github',providerContext=provider==='gitlab'?{provider,host:params.get('host')||'https://gitlab.com'}:{};if(!['github','gitlab'].includes(provider))throw new Error('Unsupported Git host.');request.provider=provider;request.host=providerContext.host;
  const send=message=>chrome.runtime.sendMessage({...message,...providerContext});
  const data = globalThis.KiCadBrowserData;
  const $ = (id) => document.getElementById(id);
  const toolbar = $("toolbar"), comparison = $("comparison");
  const frames = new Map(), views = new Map();
  const pendingSelections=new Map();
  let linked = Boolean(request.base && !["added", "removed"].includes(request.status));
  let manualMode = false, changes = null, loading = null;
  let pairedFile=null,crossLinked=true,pairEpoch=0;
  function projectControl(text,handler){const button=element('button',text);button.type='button';button.addEventListener('click',handler);$('projectTools').append(button);return button;}
  function companionValid(path){return data.validPath(path)&&/\.kicad_pcb$/i.test(path)!==/\.kicad_pcb$/i.test(request.file);}
  function pairView(mode='both'){
    toolbar.hidden=Boolean(pairedFile);comparison.classList.toggle('single',!pairedFile);comparison.classList.toggle('paired',Boolean(pairedFile));comparison.classList.toggle('focus-pane',Boolean(pairedFile)&&mode!=='both');
    $('headKind').textContent=/\.kicad_pcb$/i.test(request.file)?'PCB LAYOUT':'SCHEMATIC';$('basePanel').hidden=true;$('headPanel').hidden=mode==='companion';$('pairPanel').hidden=!pairedFile||mode==='main';$('changesPanel').hidden=true;
  }
  function openPair(path){
    if(!companionValid(path)){status('Choose a schematic and a PCB from the same repository revision.',true);return;}
    pairEpoch++;pairedFile=path;linked=false;manualMode=true;showProject('pair',request.headRepository,request.head,path);$('pairRef').textContent=request.head.slice(0,12);$('pairKind').textContent=/\.kicad_pcb$/i.test(path)?'PCB LAYOUT':'SCHEMATIC';pairView();$('pairControls').hidden=false;$('pairChooser').hidden=true;status('Cross-highlight uses saved symbol identities, unique references and unambiguous saved sheet-qualified net names. Cameras remain independent.');
  }
  function pairTools(){
    const split=projectControl('Split schematic + PCB',async()=>{
      const epoch=++pairEpoch;$('pairChooser').hidden=false;split.disabled=true;
      try{const reply=await send({type:'drawing-files',repository:request.headRepository,ref:request.head,file:request.file});if(epoch!==pairEpoch)return;if(!reply?.ok)throw new Error(reply?.error||'Could not discover companion drawings.');
        const files=reply.result?.files;if(!Array.isArray(files)||files.length>1000)throw new Error('Invalid companion file listing.');const choices=files.filter(companionValid);$('companionSelect').replaceChildren(element('option','Choose companion drawing'));for(const path of choices){const option=element('option',path);option.value=path;$('companionSelect').append(option);}
        $('companionSelect').children[0].value='';if(choices.length===1){$('companionSelect').value=choices[0];openPair(choices[0]);}else status(choices.length?'Choose the paired schematic or PCB.':'No companion in this directory. Enter a repository-relative drawing path.');
      }catch(error){status(error.message+' Enter a repository-relative companion path.',true);}finally{split.disabled=false;}
    });
    const chooser=element('span');chooser.id='pairChooser';chooser.hidden=true;const select=element('select');select.id='companionSelect';select.setAttribute('aria-label','Companion drawing');select.addEventListener('change',()=>{if(select.value)openPair(select.value);});const path=element('input');path.id='companionPath';path.placeholder='Repository-relative companion path';path.setAttribute('aria-label','Companion path');const open=element('button','Open pair');open.addEventListener('click',()=>openPair(path.value.trim()||select.value));chooser.append(select,path,open);$('projectTools').append(chooser);
    const controls=element('span');controls.id='pairControls';controls.hidden=true;
    const add=(text,handler)=>{const node=element('button',text);node.type='button';node.addEventListener('click',handler);controls.append(node);return node;};
    const sync=add('Cross-highlight',()=>{crossLinked=!crossLinked;sync.setAttribute('aria-pressed',String(crossLinked));});sync.setAttribute('aria-pressed','true');
    add('Both panes',()=>pairView());add(/\.kicad_pcb$/i.test(request.file)?'PCB only':'Schematic only',()=>pairView('main'));add(/\.kicad_pcb$/i.test(request.file)?'Schematic only':'PCB only',()=>pairView('companion'));const stack=add('Stack panes',()=>{comparison.classList.toggle('vertical');});
    add('Close split',()=>{pairEpoch++;pairedFile=null;frames.delete('pair');$('pairDrawing').replaceChildren();$('pairPanel').hidden=true;controls.hidden=true;comparison.classList.toggle('paired',false);comparison.classList.toggle('focus-pane',false);comparison.classList.toggle('vertical',false);toolbar.hidden=false;$('headKind').textContent='HEAD';setMode('head');status('');});$('projectTools').append(controls);
    projectControl('Pop out',async()=>{try{const reply=await send({type:'open-viewer-window',repository:request.headRepository,ref:request.head,file:request.file,...(pairedFile?{pairedFile}:{})});if(!reply?.ok)throw new Error(reply?.error||'Could not open viewer window.');}catch(error){status(error.message,true);}});
    projectControl('Fit panes',()=>sendCommand('fit-drawing'));
    const initial=params.get('pairedFile');if(initial){if(companionValid(initial))openPair(initial);else status('Invalid companion drawing path.',true);}
  }
  function status(message, error = false) {
    $("status").textContent = message; $("status").classList.toggle("error", error);
    $("status").hidden=Boolean(pairedFile)&&!error;
    $("projectTools").title=pairedFile&&!error?message:"";
  }
  function element(tag, text) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function control(label, mode, handler) {
    const button = element("button", label);
    button.type = "button";
    if (mode) button.dataset.mode = mode;
    button.addEventListener("click", handler); toolbar.append(button); return button;
  }
  function setMode(mode) {
    if(pairedFile){pairView(mode==='base'?'companion':mode==='head'?'main':'both');return;}
    comparison.classList.toggle("single", mode !== "compare");
    $("basePanel").hidden = !request.base || mode === "head";
    $("headPanel").hidden = mode === "base";
    toolbar.querySelectorAll("[data-mode]").forEach((button) => {
      button.classList.toggle("active", button.dataset.mode === mode);
      button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
    });
  }
  function origin() {
    const own = new URL(chrome.runtime.getURL("browser-viewer.html"));
    return `${own.protocol}//${own.host}`;
  }
  function sendCommand(command, extra = {}) {
    for (const frame of frames.values()) frame.contentWindow?.postMessage({ type: "kicad-review:command", command, ...extra }, origin());
  }
  function showProject(side, repository, ref, file, position = null) {
    const holder = $(side + "Drawing");
    holder.replaceChildren(); frames.delete(side); views.delete(side);pendingSelections.delete(side);
    if (!repository || !ref || !file) {
      holder.className = "placeholder";
      holder.textContent = "This design is absent in this revision.";
      return;
    }
    holder.className = "drawing";
    const viewer = element("iframe");
    viewer.title = `${file} at ${ref.slice(0, 12)}`;
    const query = new URLSearchParams({ repository, ref, file, ...providerContext });
    if (request.pullNumber) { query.set("pullNumber", request.pullNumber); query.set("pullRepository", request.pullRepository); }
    if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
      query.set("focusX", position.x); query.set("focusY", position.y);
    }
    viewer.src = `${chrome.runtime.getURL(/\.kicad_pcb$/i.test(file) ? "pcb-viewer.html" : "schematic-viewer.html")}?${query}`;
    holder.append(viewer); frames.set(side, viewer);
  }
  function normalizedFile(side, file) {
    return side === "base" && file === request.oldFile ? request.file : file;
  }
  function relayView(from, to) {
    const source = views.get(from), target = views.get(to);
    if (!linked || !source || !target || normalizedFile(from, source.file) !== normalizedFile(to, target.file)) return;
    frames.get(to)?.contentWindow?.postMessage({ type: "kicad-review:command", command: "set-view",
      file: target.file, view: source.view }, origin());
  }
  addEventListener("message", (event) => {
    if (event.origin !== origin() || event.data?.type !== "kicad-review:view" ||
        !["ready", "change"].includes(event.data.phase) || !data.validPath(event.data.file) ||
        !globalThis.KiCadViewState.valid(event.data.view)) return;
    const side = [...frames].find(([, frame]) => frame.contentWindow === event.source)?.[0];
    if (!side) return;
    views.set(side, { file: event.data.file, view: event.data.view });
    if(event.data.phase==='ready'&&pendingSelections.has(side)){
      const selection=pendingSelections.get(side);pendingSelections.delete(side);
      if(pairedFile&&crossLinked)frames.get(side)?.contentWindow?.postMessage({type:'kicad-review:command',command:'highlight-related',selection},origin());
    }
    if (event.data.phase === "ready") relayView("head", "base");
    else relayView(side, side === "base" ? "head" : "base");
  });
  addEventListener('message',(event)=>{
    if(event.origin!==origin())return;const side=[...frames].find(([,frame])=>frame.contentWindow===event.source)?.[0];if(!side)return;
    if(event.data?.type==='kicad-review:comments-changed'){
      for(const [name,frame] of frames)if(name!==side)frame.contentWindow?.postMessage({type:'kicad-review:command',command:'refresh-comments'},origin());return;
    }
    if(!pairedFile||!crossLinked||!['head','pair'].includes(side)||event.data?.type!=='kicad-review:selection'||!globalThis.KiCadPairedReview?.validSelection(event.data.selection))return;
    const target=side==='head'?'pair':'head';
    if(!views.has(target)){pendingSelections.set(target,event.data.selection);return;}
    frames.get(target)?.contentWindow?.postMessage({type:'kicad-review:command',command:'highlight-related',selection:event.data.selection},origin());
  });
  function focusChange(change) {
    if (change.before && !change.after) { manualMode = true; setMode("base"); }
    else if (change.after && !change.before) { manualMode = true; setMode("head"); }
    for (const side of ["base", "head"]) {
      const object = side === "base" ? change.before : change.after;
      const frame = frames.get(side);
      if (!object || !frame) continue;
      const file = side === "base" && change.path === request.file ? request.oldFile : change.path;
      const position = linked && change.before && change.after ? change.after.position || object.position : object.position;
      const current = new URL(frame.src);
      if ((views.get(side)?.file || current.searchParams.get("file")) !== file) {
        showProject(side, side === "base" ? request.repository : request.headRepository,
          side === "base" ? request.base : request.head, file, position);
      } else if (position) frame.contentWindow?.postMessage({ type: "kicad-review:command", command: "focus", position }, origin());
    }
    showProperties(change);
  }
  function showProperties(change) {
    const panel = $("changeProperties"); panel.replaceChildren();
    panel.append(element("h3", change.label), element("p", `${change.kind} · ${change.path} · ${change.status}`));
    const saved = (object) => {
      const properties = { ...object?.properties };
      delete properties["Source fingerprint"];
      return { ...properties,
        ...(object?.position ? { "X (mm)": object.position.x, "Y (mm)": object.position.y } : {}) };
    };
    const before = saved(change.before), after = saved(change.after);
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    const table = element("table"); table.append(element("caption", "Saved properties: base → head"));
    const header = element("tr");
    for (const text of ["Property", "Base", "Head"]) header.append(element("th", text));
    table.append(header);
    for (const key of keys) {
      const row = element("tr");
      const left = before[key] === undefined ? "—" : String(before[key]);
      const right = after[key] === undefined ? "—" : String(after[key]);
      if (left !== right) row.className = "changed-property";
      row.append(element("th", key), element("td", left), element("td", right)); table.append(row);
    }
    panel.append(table);
    if (change.status === "modified" && keys.every((key) => before[key] === after[key])) {
      panel.append(element("p", "Other saved drawing data changed. Compare the drawings or open GitHub source for details."));
    }
  }
  function renderChanges() {
    const list = $("changeList"); list.replaceChildren();
    if (!changes) return;
    const query = $("changeSearch").value.trim().toLowerCase(), filter = $("changeFilter").value;
    const visible = changes.changes.filter((item) => (filter === "all" || item.status === filter) &&
      `${item.label} ${item.kind} ${item.path}`.toLowerCase().includes(query));
    $("changeCount").textContent = `${changes.counts.added} added · ${changes.counts.removed} removed · ${changes.counts.modified} modified`;
    for (const change of visible) {
      const button = element("button"); button.type = "button"; button.className = "change-row " + change.status;
      button.append(element("strong", `${change.status === "added" ? "+" : change.status === "removed" ? "−" : "~"} ${change.label}`),
        element("small", `${change.kind} · ${change.path}`));
      button.addEventListener("click", () => focusChange(change)); list.append(button);
    }
    if (!visible.length) list.append(element("p", changes.changes.length ? "No changes match this filter." : "No saved drawing objects changed."));
  }
  async function project(repository, ref, file, absent) {
    if (absent) return [];
    const reply = await send({ type: "project", repository, ref, file });
    if (!reply?.ok) throw new Error(reply?.error || "Could not load saved KiCad objects.");
    return reply.result;
  }
  function loadChanges() {
    if (loading) return loading;
    $("changeCount").textContent = "Comparing saved KiCad objects…";
    loading = (async () => {
      const [base, head] = await Promise.all([
        project(request.repository, request.base, request.oldFile, request.status === "added"),
        project(request.headRepository, request.head, request.file, request.status === "removed")
      ]);
      const normalized = base.map((file) => ({ ...file, path: file.path === request.oldFile ? request.file : file.path }));
      changes = globalThis.KiCadDesignDiff.compareProjects(normalized, head);
      renderChanges();
    })().catch((error) => {
      $("changeCount").textContent = error.message || String(error);
      loading = null;
    });
    return loading;
  }
  async function start() {
    if (!request.repository && !request.file) {
      status("Open a public GitHub .kicad_sch or .kicad_pcb file to view it inline, or open a pull request's Files changed tab to compare designs.");
      $("comparison").hidden = true; $("sourceLink").hidden = true;
      return;
    }
    if (!data.validRepository(request.repository,provider) || !data.validRepository(request.headRepository,provider) ||
        !data.validPath(request.file) || !data.validPath(request.oldFile) || !data.validRef(request.head) ||
        (request.base && !data.validRef(request.base)) || !["added", "removed", "modified", "renamed", "changed", "copied", "unchanged"].includes(request.status)) {
      status("The Git host file location is invalid or incomplete."); return;
    }
    if(provider==='gitlab'){
      for(const side of ['head',...(request.base?['base']:[])]){
        const reply=await send({type:'revision-resolve',repository:side==='base'?request.repository:request.headRepository,ref:request[side],file:side==='base'?request.oldFile:request.file});
        if(!reply?.ok||!/^[a-f0-9]{40}$/i.test(reply.result?.sha||''))throw new Error(reply?.error||'GitLab revision could not be resolved.');request[side]=reply.result.sha;
      }
    }
    $("filename").textContent = request.file;
    $("reviewHeader").dataset.compact=String(!request.base);comparison.dataset.blob=String(!request.base);$("reviewFooter").hidden=!request.base;
    $("baseRef").textContent = request.base?.slice(0, 12) || "—";
    $("headRef").textContent = request.head.slice(0, 12);
    $("sourceLink").textContent = provider==='gitlab'?'GitLab source':'GitHub source';
    $("sourceLink").href = `${provider==='gitlab'?providerContext.host:'https://github.com'}/${request.status === "removed" ? request.repository : request.headRepository}/${provider==='gitlab'?'-/blob':'blob'}/${encodeURIComponent(request.status === "removed" ? request.base : request.head)}/${(request.status === "removed" ? request.oldFile : request.file).split("/").map(encodeURIComponent).join("/")}`;
    if (request.base) {
      for (const [label, mode] of [["Side by side", "compare"], ["Base", "base"], ["Head", "head"]]) {
        control(label, mode, () => { manualMode = true; setMode(mode); });
      }
      if (!["added", "removed"].includes(request.status)) {
        const link = control("Link views", null, () => {
          linked = !linked;
          link.setAttribute("aria-pressed", String(linked));
          link.classList.toggle("active", linked);
          if (linked) { relayView("head", "base"); sendCommand("report-view"); }
        });
        link.setAttribute("aria-pressed", String(linked));
        link.classList.toggle("active", linked);
        link.title = "Keep matching sheets at the same world position and zoom; 2D views only";
      }
      const button = control("Changes", null, () => {
        const open = $("changesPanel").hidden;
        $("changesPanel").hidden = !open;
        button.setAttribute("aria-expanded", String(open));
        if (open) loadChanges();
      });
      button.setAttribute("aria-expanded", "false"); button.setAttribute("aria-controls", "changesPanel");
      const responsiveMode = () => {
        if (manualMode) return;
        setMode(request.status === "removed" ? "base" : request.status === "added" ? "head" :
          /\.kicad_sch$/i.test(request.file) || !matchMedia("(min-width: 1100px)").matches ? "head" : "compare");
      };
      responsiveMode(); addEventListener("resize", responsiveMode);
    } else setMode("head");
    control("Fit drawings", null, () => sendCommand("fit-drawing"));
    control("Full sheets", null, () => sendCommand("fit-page"));
    $("changeSearch").addEventListener("input", renderChanges);
    $("changeFilter").addEventListener("change", renderChanges);
    if (request.base) showProject("base", request.status === "added" ? "" : request.repository, request.base, request.oldFile);
    showProject("head", request.status === "removed" ? "" : request.headRepository, request.head, request.file);
    status("");pairTools();
    if(!request.pullNumber&&globalThis.KiCadRevisionPicker)globalThis.KiCadRevisionPicker.mount({holder:$('projectTools'),request,
      send:message=>send(message),navigate:query=>location.assign(`${chrome.runtime.getURL('browser-viewer.html')}?${query}`)});
  }
  start().catch(error=>status(error.message,true));
})();
