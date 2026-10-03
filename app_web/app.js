"use strict";

(() => {
  const data = globalThis.PublicKiCadData;
  const $ = (id) => document.getElementById(id);
  const state = { repository: "", headRepository: "", ref: "", base: "", head: "", pull: "", files: [], selected: null };
  let generation = 0;
  const validPull = (value) => /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value));
  const validDesign = (value) => data.validPath(value);
  const status = (message, error = false) => { $("status").textContent = message; $("status").classList.toggle("error", error); };
  function revisionUrl(repository, ref, file) {
    const url = new URL("revision.html", location.href);
    url.search = new URLSearchParams({ repository, ref, file }).toString();
    return url.href;
  }
  function setFrame(container, repository, ref, file) {
    container.replaceChildren();
    if (!repository || !ref || !file) {
      container.className = "placeholder";
      container.textContent = "This design is absent in this revision.";
      return;
    }
    container.className = "drawing";
    const frame = document.createElement("iframe");
    frame.title = `${file} at ${ref}`;
    frame.src = revisionUrl(repository, ref, file);
    frame.setAttribute("allow", "fullscreen");
    container.append(frame);
  }
  function modeButton(name, text, selected) {
    const button = document.createElement("button");
    button.type = "button"; button.textContent = text;
    button.setAttribute("aria-pressed", String(selected));
    button.onclick = () => setMode(name);
    return button;
  }
  function setMode(mode) {
    const compare = !!state.base;
    const actual = compare ? mode : "head";
    $("comparison").classList.toggle("single", actual !== "compare");
    $("basePanel").hidden = actual === "head";
    $("headPanel").hidden = actual === "base";
    const controls = $("modeControls");
    controls.replaceChildren();
    if (compare) {
      controls.append(modeButton("compare", "Side by side", actual === "compare"),
        modeButton("base", "Base", actual === "base"), modeButton("head", "Head", actual === "head"));
    }
  }
  function githubLink() {
    const anchor = $("githubLink");
    let href = "";
    if (state.pull) href = `https://github.com/${state.repository}/pull/${state.pull}/files`;
    else if (state.selected && state.ref) {
      const encodedPath = state.selected.file.split("/").map(encodeURIComponent).join("/");
      href = `https://github.com/${state.repository}/blob/${encodeURIComponent(state.ref)}/${encodedPath}`;
    }
    anchor.hidden = !href;
    if (href) anchor.href = href;
  }
  function updateUrl() {
    const query = new URLSearchParams({ repository: state.repository });
    if (state.pull) query.set("pull", state.pull);
    else if (state.ref) query.set("ref", state.ref);
    if (state.selected) {
      query.set("file", state.selected.file);
      if (state.selected.oldFile && state.selected.oldFile !== state.selected.file) query.set("oldFile", state.selected.oldFile);
    }
    if (state.base) query.set("base", state.base);
    if (state.head) query.set("head", state.head);
    if (state.headRepository && state.headRepository !== state.repository) query.set("headRepository", state.headRepository);
    history.replaceState(null, "", `${location.pathname}?${query}`);
  }
  function showFile(file, oldFile) {
    const chosen = state.files.find((item) => item.file === file) ||
      (validDesign(file) ? { file, oldFile: validDesign(oldFile) ? oldFile : file, status: "modified" } : null);
    if (!chosen) return;
    state.selected = chosen;
    $("fileSelect").value = chosen.file;
    $("designName").textContent = chosen.file;
    $("headRef").textContent = state.head || state.ref;
    $("baseRef").textContent = state.base;
    $("headLabel").textContent = state.base ? "HEAD" : "CURRENT";
    $("revisionSummary").textContent = state.base ? `${state.base.slice(0, 9)} → ${(state.head || state.ref).slice(0, 9)}` : state.ref;
    const removed = chosen.status === "removed";
    const added = chosen.status === "added";
    setFrame($("headDrawing"), removed ? "" : state.headRepository, state.head || state.ref, chosen.file);
    if (state.base) setFrame($("baseDrawing"), added ? "" : state.repository, state.base, chosen.oldFile || chosen.file);
    else $("baseDrawing").replaceChildren();
    setMode(state.base ? "compare" : "head");
    githubLink(); updateUrl();
  }
  function fillFiles(files) {
    state.files = files;
    const select = $("fileSelect");
    select.replaceChildren();
    if (!files.length) {
      select.add(new Option("No KiCad designs found", ""));
      select.disabled = true;
      return;
    }
    for (const item of files) {
      const label = item.status && item.status !== "modified" ? `${item.file} (${item.status})` : item.file;
      select.add(new Option(label, item.file));
    }
    select.disabled = false;
  }
  function clearView() {
    Object.assign(state, { repository: "", headRepository: "", ref: "", base: "", head: "", pull: "", files: [], selected: null });
    const select = $("fileSelect");
    select.replaceChildren(new Option("Loading designs…", ""));
    select.disabled = true;
    $("designName").textContent = "Choose a KiCad design";
    $("revisionSummary").textContent = "";
    $("headRef").textContent = "";
    $("baseRef").textContent = "";
    for (const id of ["headDrawing", "baseDrawing"]) {
      const container = $(id);
      container.className = "placeholder";
      container.replaceChildren("Loading design…");
    }
    $("githubLink").hidden = true;
    setMode("head");
  }
  function emptyView(message) {
    $("designName").textContent = "No KiCad design selected";
    $("headDrawing").replaceChildren(message);
    $("baseDrawing").replaceChildren();
  }
  function navigate(work) {
    const ticket = ++generation;
    clearView();
    Promise.resolve().then(() => ticket === generation ? work(ticket) : undefined).catch((error) => {
      if (ticket === generation) {
        emptyView("Choose another repository or revision.");
        status(error.message || String(error), true);
      }
    });
  }
  async function metadata(endpoint, query) {
    const url = new URL(endpoint, location.origin);
    url.search = new URLSearchParams(query).toString();
    const response = await fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Design listing returned HTTP ${response.status}.`);
    return response.json();
  }
  async function defaultBranch(repository) {
    const response = await fetch(`https://api.github.com/repos/${repository}`, {
      headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }, credentials: "omit" });
    if (!response.ok) throw new Error(`Could not find public repository (${response.status}).`);
    const branch = (await response.json()).default_branch;
    if (!data.validRef(branch)) throw new Error("GitHub did not provide a default branch.");
    return branch;
  }
  async function browse(repository, ref, preferredFile = "", ticket = generation) {
    if (!data.validRepository(repository)) throw new Error("Enter a repository as owner/name.");
    const resolvedRef = ref || await defaultBranch(repository);
    if (ticket !== generation) return;
    if (!data.validRef(resolvedRef)) throw new Error("Enter a valid branch or commit.");
    status("Finding KiCad designs…");
    const result = await metadata("/api/designs", { repository, ref: resolvedRef });
    if (ticket !== generation) return;
    if (!Array.isArray(result.files)) throw new Error("Design listing is invalid.");
    if (!data.validRef(result.ref)) throw new Error("Design listing has no resolved revision.");
    state.repository = repository; state.headRepository = repository; state.ref = result.ref;
    state.base = ""; state.head = ""; state.pull = ""; state.selected = null;
    $("repository").value = repository; $("ref").value = resolvedRef; $("pull").value = "";
    const files = [...new Set(result.files.filter(validDesign))].sort().map((file) => ({ file, oldFile: file }));
    fillFiles(files);
    if (files.length) showFile(files.find((item) => item.file === preferredFile)?.file || files[0].file);
    else { emptyView("No KiCad design files were found."); status("No KiCad schematic or PCB files were listed for this revision."); githubLink(); updateUrl(); }
    if (files.length) status(`${files.length} KiCad design${files.length === 1 ? "" : "s"} found.`);
  }
  async function review(repository, pull, preferredFile = "", ticket = generation) {
    if (!data.validRepository(repository) || !validPull(pull)) throw new Error("Enter a public owner/name and pull request number.");
    status("Loading pull request designs…");
    const result = await metadata("/api/review", { repository, pull });
    if (ticket !== generation) return;
    if (!data.validRef(result.base) || !data.validRef(result.head) ||
      !data.validRepository(result.headRepository || repository) || !Array.isArray(result.files)) {
      throw new Error("Pull request metadata is invalid.");
    }
    state.repository = repository; state.headRepository = result.headRepository || repository;
    state.base = result.base; state.head = result.head; state.ref = ""; state.pull = String(pull); state.selected = null;
    $("repository").value = repository; $("pull").value = String(pull); $("ref").value = "";
    const files = result.files.filter((item) => item && validDesign(item.file) &&
      (!item.oldFile || validDesign(item.oldFile))).map((item) => ({
        file: item.file, oldFile: item.oldFile || item.file, status: item.status || "modified" }));
    fillFiles(files);
    if (files.length) showFile(files.find((item) => item.file === preferredFile)?.file || files[0].file);
    else { emptyView("No changed KiCad design files were found."); status("No KiCad files changed in this pull request."); githubLink(); updateUrl(); }
    if (files.length) status(`${files.length} changed KiCad design${files.length === 1 ? "" : "s"}.`);
  }
  function direct(query) {
    const repository = query.get("repository"), headRepository = query.get("headRepository") || repository;
    const file = query.get("file"), oldFile = query.get("oldFile") || file;
    const base = query.get("base"), head = query.get("head") || query.get("ref");
    if (!data.validRepository(repository) || !data.validRepository(headRepository) || !validDesign(file) ||
      !data.validRef(head) || (base && !data.validRef(base)) || (oldFile && !validDesign(oldFile))) {
      throw new Error("Viewer link contains an invalid repository, revision, or file.");
    }
    state.repository = repository; state.headRepository = headRepository; state.ref = base ? "" : head;
    state.base = base || ""; state.head = base ? head : ""; state.pull = "";
    $("repository").value = repository; $("ref").value = state.ref;
    fillFiles([{ file, oldFile, status: "modified" }]);
    showFile(file, oldFile);
    status("Viewing public GitHub source.");
  }
  $("branchForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const repository = $("repository").value.trim(), ref = $("ref").value.trim();
    navigate((ticket) => browse(repository, ref, "", ticket));
  });
  $("pullForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const repository = $("repository").value.trim(), pull = $("pull").value.trim();
    navigate((ticket) => review(repository, pull, "", ticket));
  });
  $("fileSelect").addEventListener("change", () => showFile($("fileSelect").value));
  fetch("/api/config", { credentials: "same-origin", headers: { Accept: "application/json" } })
    .then((response) => response.ok ? response.json() : null)
    .then((config) => {
      if (!config?.installUrl) return;
      const url = new URL(config.installUrl);
      if (url.protocol !== "https:" || url.hostname !== "github.com") return;
      $("installLink").href = url.href;
      $("installLink").hidden = false;
    }).catch(() => {});
  (() => {
    const query = new URLSearchParams(location.search);
    const repository = query.get("repository");
    if (!repository) return;
    if (query.has("pull")) navigate((ticket) => review(repository, query.get("pull"), query.get("file") || "", ticket));
    else if (query.has("file") && (query.has("head") || query.has("base") || query.has("ref"))) navigate(() => direct(query));
    else navigate((ticket) => browse(repository, query.get("ref") || "", query.get("file") || "", ticket));
  })();
})();
