"use strict";

(() => {
  const parse = globalThis.KiCadGitHub;
  const CSS = `
    :host{all:initial;display:block;color-scheme:light dark;font:13px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;color:#e8edf0}
    *{box-sizing:border-box}button{font:inherit;cursor:pointer}button:focus-visible{outline:2px solid #61d9a5;outline-offset:2px}
    .shell{background:#101820;border:1px solid #32424a;border-radius:8px;margin:12px 0 18px;overflow:hidden;min-width:0}
    .top{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #32424a;flex-wrap:wrap}
    .title{font-size:15px;font-weight:700;overflow-wrap:anywhere}.badge{font-size:11px;color:#a7bac1}.controls{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
    .controls button,.controls select,.pages button,.action,.menu button{border:1px solid #3b505a;border-radius:6px;padding:5px 9px;background:#1d2b33;color:#e8edf0;font:inherit}
    .controls button:hover,.controls select:hover,.pages button:hover,.action:hover,.menu button:hover{border-color:#77d6ad}.controls button.active,.pages button.active{background:#246344;border-color:#72d9a3}
    .status{padding:9px 16px;color:#a8b9c0}.status.error{color:#ffb2b2}.status:empty{display:none}
    .body{display:grid;grid-template-columns:170px minmax(0,1fr);min-height:450px}.pages{border-right:1px solid #32424a;padding:10px;display:flex;flex-direction:column;gap:5px;max-height:70vh;overflow:auto}
    .pages button{text-align:left;overflow-wrap:anywhere}.main{min-width:0;padding:12px}.main>.controls{margin-bottom:10px}.viewport-row{display:flex;gap:8px}.viewport{position:relative;flex:1;min-width:0;height:70vh;min-height:450px;background:#fff;border:1px solid #475760;border-radius:7px;overflow:hidden;touch-action:none;cursor:grab}
    .viewport.pcb-dark{background:#121c27;border-color:#425567}.viewport:active{cursor:grabbing}.stage{position:absolute;transform-origin:0 0}.stage img,.stage canvas{position:absolute;inset:0;width:100%;height:100%;display:block}.grid-overlay{position:absolute;inset:0;pointer-events:none;z-index:2}.crosshair{position:absolute;inset:0;pointer-events:none;z-index:4}.crosshair::before,.crosshair::after{content:"";position:absolute;background:rgba(0,135,102,.7)}.crosshair::before{left:0;right:0;top:var(--cursor-y);height:1px}.crosshair::after{top:0;bottom:0;left:var(--cursor-x);width:1px}.pcb-dark .crosshair::before,.pcb-dark .crosshair::after{background:rgba(130,235,191,.7)}.marker{position:absolute;width:11px;height:11px;transform:translate(-50%,-50%);border:1.5px solid #078453;border-radius:50%;background:#d8ffbe;box-shadow:0 0 0 2px #fff8;padding:0;z-index:3;opacity:.8}.marker.selected{background:#ffda68;border-color:#aa5700;opacity:1}.marker:hover{transform:translate(-50%,-50%) scale(1.35);opacity:1}
    .zoom-value,.coordinate-value{color:#b8c8d0;font-variant-numeric:tabular-nums}.zoom-value{min-width:48px;text-align:center}.coordinate-value{white-space:nowrap;min-width:145px}.control-divider{height:21px;border-left:1px solid #3b505a;margin:0 3px}.control-label{display:flex;align-items:center;gap:5px;color:#b8c8d0}.controls button:disabled{opacity:.45;cursor:default}
    .empty{position:absolute;inset:0;display:grid;place-items:center;color:#53626d}.footer{display:flex;justify-content:space-between;gap:8px;padding:9px 12px;color:#a7bac1;font-size:11px;flex-wrap:wrap}
    .details{border-top:1px solid #32424a;padding:11px 16px}.details h3{font-size:14px;margin:0 0 7px}.details dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 12px;margin:0;max-height:210px;overflow:auto}.details dt{color:#a7bac1}.details dd{margin:0;overflow-wrap:anywhere}
    .menu{position:fixed;z-index:2147483647;background:#18242c;border:1px solid #739487;padding:5px;box-shadow:0 8px 24px #0008;display:grid;min-width:150px;gap:4px}.menu button{text-align:left}
    .list{display:flex;flex-wrap:wrap;gap:6px;padding:12px}.hint{color:#b6c4c7;padding:0 12px 12px;margin:0}.action{margin:8px}.code-toggle{padding:4px 9px}
    [hidden]{display:none!important}@media(max-width:760px){.body{grid-template-columns:1fr}.pages{flex-direction:row;border-right:0;border-bottom:1px solid #32424a;max-height:none}.pages button{white-space:nowrap}.viewport{height:55vh;min-height:280px}.viewport-row{flex-direction:column}}
  `;
  let currentUrl = "", mount = null, sequence = 0, checkTimer = null, focusPending = false;
  let draftAttemptedUrl = "", draftClaiming = false;

  function request(type, extra = {}) {
    return chrome.runtime.sendMessage({ type, ...extra }).then((reply) => {
      if (!reply?.ok) throw new Error(reply?.error || "The extension could not retrieve GitHub data.");
      return reply.result;
    });
  }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(text, className, handler) {
    const node = element("button", className, text); node.type = "button"; node.addEventListener("click", handler); return node;
  }
  function shell() {
    const host = element("div"); host.dataset.kicadVisualReview = "";
    const shadow = host.attachShadow({ mode: "open" });
    const style = new CSSStyleSheet(); style.replaceSync(CSS); shadow.adoptedStyleSheets = [style];
    const box = element("section", "shell"); shadow.append(box);
    return { host, shadow, box };
  }
  function setStatus(node, message, error = false) { node.textContent = message; node.classList.toggle("error", error); }
  function embedded() {
    if (location.origin !== "https://github.com") {
      // GitLab's server-rendered blob app exposes unambiguous ref and file data.
      const app = document.querySelector("#js-view-blob-app,#js-repository-blob-header-app");
      return app ? { repository: app.dataset.projectPath, file: app.dataset.blobPath,
        head: app.dataset.originalBranch || app.dataset.ref } : null;
    }
    return parse.embeddedBlobData([...document.querySelectorAll('script[type="application/json"]')]
      .filter((script) => script.dataset.target?.includes("embeddedData") || script.closest("react-app"))
      .map((script) => script.textContent), parse.route(location.href,{gitlabHosts:location.origin!=="https://github.com"?[location.origin]:[]}));
  }
  function findBlobTarget() {
    if (location.origin !== "https://github.com") {
      return document.querySelector("#blob-content-holder,.blob-viewer");
    }
    return document.querySelector('.react-code-file-contents,[class*="CodeBlob-module__codeBlobInner"],'
      + '[data-testid="blob-viewer"],#blob-viewer,.blob-wrapper,[data-testid="code-viewer"],.js-code-view') ||
      document.querySelector("main table.highlight");
  }
  function locateFileCard(path) {
    for (const node of document.querySelectorAll("[data-path],[data-file-path]")) {
      if ((node.getAttribute("data-path") || node.getAttribute("data-file-path")) === path) {
        const card = node.closest(".file,.js-file,[data-testid='file-diff']");
        if (card?.isConnected) return card;
      }
    }
    return null;
  }
  function findDiffBody(card) {
    return card?.querySelector('.js-file-content,.file-content,[data-testid="diff-view"],'
      + '[data-testid="file-diff-content"],[data-testid="diff-container"],table.diff-table,.react-diff-viewer') || null;
  }
  function mountBefore(target, fallbackParent) {
    const view = shell();
    if (target?.parentNode) target.parentNode.insertBefore(view.host, target);
    else if (fallbackParent) fallbackParent.append(view.host);
    else (document.querySelector("main") || document.body).prepend(view.host);
    return view;
  }
  function disposePanel(view, owner = mount) {
    if (!view) return;
    if (view.hiddenTarget) view.hiddenTarget.hidden = view.originalHidden;
    view.host.remove();
    const index = owner?.panels?.indexOf(view) ?? -1;
    if (index >= 0) owner.panels.splice(index, 1);
  }
  function clearMount() {
    sequence++;
    if (mount) {
      mount.observer?.disconnect();
      for (const item of [...mount.panels]) disposePanel(item, mount);
      mount.host?.remove();
      mount = null;
    }
  }
  function panelFor(requestBody, target, label, autoLoad = true, card = null) {
    const view = mountBefore(target, card);
    const pageUrl = location.href.split("#")[0];
    const top = element("div", "top"), title = element("div", "title", label), controls = element("div", "controls");
    const status = element("div", "status", "Ready to open in the browser viewer.");
    const content = element("div");
    const original = target && target !== document.querySelector("main") ? target : null;
    view.originalHidden = original?.hidden ?? false;
    let loaded = false, showingCode = false, runId = 0;
    const query = parse.viewerParams(requestBody);
    const viewerURL = `${chrome.runtime.getURL(/\.kicad_(sch|pcb)$/i.test(requestBody.file)?"browser-viewer.html":"project-viewer.html")}?${query}`;
    const showCode = button("Show source", "code-toggle", () => {
      showingCode = !showingCode;
      if (original) original.hidden = !showingCode && loaded;
      content.hidden = showingCode;
      showCode.textContent = showingCode ? "Show visual" : "Show source";
    });
    showCode.hidden = !original;
    controls.append(button("Refresh", "", () => load()), button("Open full viewer", "", () => window.open(viewerURL, "_blank", "noopener")), showCode);
    controls.append(button('Close preview','',()=>{runId++;loaded=false;showingCode=false;if(original)original.hidden=view.originalHidden;content.hidden=false;content.replaceChildren(button('Open visual preview','action',load));showCode.textContent='Show source';setStatus(status,'');}));
    top.append(title, controls); view.box.append(top, status, content);
    view.hiddenTarget = original;
    async function load() {
      const token = sequence, run = ++runId;
      setStatus(status, "Opening browser-side KiCad viewer…");
      content.replaceChildren(); loaded = false;
      if (original) original.hidden = view.originalHidden;
      const frame = element("iframe");
      frame.title = `KiCad visual review: ${requestBody.file}`;
      frame.style.cssText = "display:block;width:100%;height:max(790px,calc(100vh - 100px));border:0;background:#111a23";
      frame.src = viewerURL;
      frame.addEventListener("load", () => {
        if (token !== sequence || run !== runId || !view.host.isConnected ||
            location.href.split("#")[0] !== pageUrl) return;
        loaded = true;
        if (original && !showingCode) original.hidden = true;
        setStatus(status, "");
      });
      frame.addEventListener("error", () => {
        if (token === sequence && run === runId) setStatus(status, "Could not open the browser-side viewer.", true);
      });
      content.append(frame);
    }
    if (autoLoad) load();
    else content.append(button("Open visual preview", "action", load));
    return view;
  }

  async function activateBlob(route, token) {
    const info = parse.blobRequest(route, embedded());
    if (!info || token !== sequence) return;
    const target = findBlobTarget();
    if (!target) return;
    mount = { kind: "blob", info, panels: [] };
    mount.panels.push(panelFor(info, target, info.file));
    if (focusPending) {
      mount.panels[0].host.scrollIntoView({ block: "start" });
      focusPending = false;
    }
  }
  async function activatePull(route, token) {
    const pageUrl = location.href.split("#")[0];
    const target = document.querySelector("main"); if (!target) return;
    const top = mountBefore(target);
    const pullMount = { kind: "pull", host: top.host, panels: [], entries: null };
    mount = pullMount;
    const title = element("div", "top"), status = element("div", "status", "Loading KiCad files in this pull request…"), list = element("div", "list");
    title.append(element("div", "title", "KiCad visual review")); top.box.append(title, status, list);
    try {
      const pull = await request("githubPull", { repository: route.repository, number: route.number });
      if (token !== sequence || mount !== pullMount || location.href.split("#")[0] !== pageUrl) return;
      if (!pull.base || !pull.head) throw new Error("GitHub did not provide both comparison revisions.");
      const files = await request("githubFiles", { repository: route.repository, number: route.number,
        expectedFiles: pull.changedFiles, expectedHead:pull.head, expectedBase:pull.baseTip });
      if (token !== sequence || mount !== pullMount || location.href.split("#")[0] !== pageUrl) return;
      if (!files.length) { setStatus(status, "No KiCad schematic or PCB files changed."); return; }
      setStatus(status, `${files.length} KiCad file${files.length === 1 ? "" : "s"} changed. Select a file to compare the browser-rendered revisions.`);
      const launchByCard = new WeakMap();
      const autoOpen = new IntersectionObserver((entries) => {
        if (mount !== pullMount || location.href.split("#")[0] !== pageUrl) return;
        for (const observed of entries) {
          if (!observed.isIntersecting) continue;
          autoOpen.unobserve(observed.target);
          const entry = launchByCard.get(observed.target);
          if (entry?.card === observed.target) entry.launch.click();
        }
      }, { rootMargin: "200px" });
      pullMount.observer = autoOpen;
      pullMount.launchByCard = launchByCard;
      pullMount.entries = [];
      for (const item of files) {
        const path = parse.filePath(item.file), oldFile = parse.filePath(item.oldFile);
        if (!path || !oldFile) continue;
        const requestBody = { repository: route.repository, headRepository: pull.headRepository || route.repository,
          file: path, oldFile, base: pull.base, head: pull.head, status: item.status,
          pullNumber: route.number, pullRepository: route.repository };
        const entry = { path, requestBody, card: null, panel: null, requested: false };
        const launch = button(path, "", () => {
          if (token !== sequence || mount !== pullMount || location.href.split("#")[0] !== pageUrl) return;
          entry.requested = true;
          if (entry.card) autoOpen.unobserve(entry.card);
          reconcilePullCards(pullMount);
          if (entry.panel?.host.isConnected) entry.panel.host.scrollIntoView({ block: "nearest" });
          else setStatus(status, `Waiting for GitHub to load ${path}…`);
        });
        entry.launch = launch;
        list.append(launch);
        pullMount.entries.push(entry);
      }
      reconcilePullCards(pullMount);
    } catch (error) {
      if (token === sequence && mount === pullMount && location.href.split("#")[0] === pageUrl) setStatus(status, error.message, true);
    }
  }
  function reconcilePullCards(pullMount) {
    if (mount !== pullMount || !pullMount.entries) return;
    for (const entry of pullMount.entries) {
      const card = locateFileCard(entry.path);
      const body = findDiffBody(card);
      if (entry.panel && (!entry.panel.host.isConnected || entry.card !== card || entry.panel.hiddenTarget !== body)) {
        disposePanel(entry.panel, pullMount);
        entry.panel = null;
      }
      if (entry.card !== card) {
        if (entry.card) pullMount.observer.unobserve(entry.card);
        entry.card = card;
        if (card) {
          pullMount.launchByCard.set(card, entry);
          if (!entry.requested) pullMount.observer.observe(card);
        }
      }
      if (card && entry.requested && !entry.panel) {
        entry.panel = panelFor(entry.requestBody, body, entry.path, true, card);
        pullMount.panels.push(entry.panel);
      }
    }
  }
  async function maybeClaimCommentDraft() {
    let page;
    try { page = new URL(location.href); } catch { return; }
    if (page.origin !== "https://github.com" || draftClaiming) return;
    const match = /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/(pull|issues|discussions)\/([1-9][0-9]*|new)(?:\/([^?#]*))?$/.exec(page.pathname);
    if (!match) return;
    if (match[3] && !(match[1] === "discussions" && match[2] === "new")) return;
    const discussion = match[1] === "discussions", creatingDiscussion = discussion && match[2] === "new";
    const textarea = document.querySelector(discussion
      ? 'textarea[name="discussion[body]"],textarea[name="comment[body]"],textarea[name="body"],textarea#discussion_body,textarea#new_comment_field'
      : 'textarea[name="comment[body]"],textarea#new_comment_field');
    const title = creatingDiscussion ? document.querySelector('input[name="discussion[title]"],input[name="title"],input#discussion_title') : null;
    if (!textarea?.isConnected || textarea.value || creatingDiscussion && (!title?.isConnected || title.value) ||
        draftAttemptedUrl === page.href) return;
    draftAttemptedUrl = page.href;
    draftClaiming = true;
    try {
      const reply = await chrome.runtime.sendMessage({ type: "claim-comment-draft" });
      const body = reply?.ok && reply.result?.body, heading = reply?.result?.title;
      if (typeof body !== "string" || !body || location.href !== page.href ||
          !textarea.isConnected || textarea.value ||
          creatingDiscussion && (typeof heading !== "string" || !heading || !title?.isConnected || title.value)) return;
      const fill = (node, value, constructor) => {
        const setter = constructor && Object.getOwnPropertyDescriptor(constructor.prototype, "value")?.set;
        if (setter) setter.call(node, value);
        else node.value = value;
        node.dispatchEvent(new Event("input", { bubbles: true }));
      };
      if (creatingDiscussion) fill(title, heading, globalThis.HTMLInputElement);
      fill(textarea, body, globalThis.HTMLTextAreaElement);
      await chrome.runtime.sendMessage({ type: "ack-comment-draft" });
    } catch { draftAttemptedUrl = ""; }
    finally { draftClaiming = false; }
  }
  function check() {
    maybeClaimCommentDraft();
    const url = location.href.split("#")[0];
    const route = parse.route(url);
    if (url !== currentUrl) { clearMount(); currentUrl = url; if (route?.kind !== "blob") focusPending = false; }
    if (mount?.kind === "pull" && route?.kind === "pull") {
      if (!mount.host.isConnected) {
        const main = document.querySelector("main");
        if (main?.parentNode) main.parentNode.insertBefore(mount.host, main);
      }
      reconcilePullCards(mount);
      return;
    }
    if (mount?.kind === "blob" && route?.kind === "blob") {
      const target = findBlobTarget();
      const panel = mount.panels[0];
      if (target && (panel?.hiddenTarget !== target || !panel.host.isConnected)) {
        disposePanel(panel, mount);
        mount.panels[0] = panelFor(mount.info, target, mount.info.file);
      }
      return;
    }
    if (!route || mount) return;
    const token = sequence;
    if (route.kind === "blob") activateBlob(route, token);
    else activatePull(route, token);
  }
  const observer = new MutationObserver(() => {
    if (checkTimer) return;
    checkTimer = setTimeout(() => { checkTimer = null; check(); }, 300);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  addEventListener("popstate", check);
  addEventListener("turbo:load", check);
  addEventListener("pjax:end", check);
  addEventListener("page:change", check);
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || !message || typeof message !== "object") return false;
    if (message.type === "viewerContext") {
      const route = parse.route(location.href,{gitlabHosts:location.origin!=="https://github.com"?[location.origin]:[]});
      const info = route?.kind === "blob" ? parse.blobRequest(route, embedded()) : null;
      sendResponse(info ? { kind: "blob", ...info, url: location.href } : null);
      return false;
    }
    if (message.type === "focusReview") {
      check();
      const focused = Boolean(mount?.host?.isConnected);
      if (focused) mount.host.scrollIntoView({ block: "start" });
      sendResponse({ focused });
      return false;
    }
    if (message.type === "focusInline") {
      const route = parse.route(location.href,{gitlabHosts:location.origin!=="https://github.com"?[location.origin]:[]});
      if (route?.kind !== "blob") { sendResponse({ focused: false }); return false; }
      focusPending = true;
      check();
      const panel = mount?.panels?.[0]?.host;
      const focused = Boolean(panel?.isConnected);
      if (focused) {
        panel.scrollIntoView({ block: "start" });
        focusPending = false;
      }
      sendResponse({ focused });
      return false;
    }
    return false;
  });
  setInterval(check, 1500);
  check();
})();
