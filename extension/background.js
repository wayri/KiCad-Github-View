"use strict";

importScripts("parsing.js", "browser-data.js", "review-comments.js", "review-file-store.js", "github-review-api.js");

const SHA = /^[0-9a-f]{40}$/i;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function validRepository(value) {
  return typeof value === "string" && REPOSITORY.test(value) &&
    value.split("/").every((part) => part !== "." && part !== "..");
}

async function githubResponse(url, headers = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, {
      headers: { "X-GitHub-Api-Version": "2022-11-28", ...headers },
      credentials: "omit", cache: "no-store", signal: controller.signal
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}.`);
    return response;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("GitHub file retrieval timed out.");
    throw error;
  } finally { clearTimeout(timeout); }
}

async function githubJson(url) {
  const response = await githubResponse(url, { Accept: "application/vnd.github+json" });
  if (!response) throw new Error("GitHub resource was not found.");
  return response.json();
}

async function githubFile(repository, ref, path) {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const url = `https://api.github.com/repos/${repository}/contents/${encoded}?ref=${encodeURIComponent(ref)}`;
  const response = await githubResponse(url, { Accept: "application/vnd.github.raw+json" });
  if (!response) return null;
  const length = Number(response.headers.get("content-length"));
  if (length > 8 * 1024 * 1024) throw new Error("KiCad file exceeds the browser preview size limit.");
  const body = await response.text();
  if (body.length > 11 * 1024 * 1024) throw new Error("KiCad file exceeds the browser preview size limit.");
  if (!response.headers.get("content-type")?.includes("json")) return body;
  let data;
  try { data = JSON.parse(body); } catch { return body; }
  if(data && typeof data==='object' && !Object.prototype.hasOwnProperty.call(data,'encoding') && !Object.prototype.hasOwnProperty.call(data,'content'))return body;
  if (typeof data.content !== "string" || data.encoding !== "base64") {
    throw new Error("GitHub did not return KiCad file contents.");
  }
  const binary = atob(data.content.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, (ch) => ch.charCodeAt(0)));
}

async function githubDirectory(repository, ref, directory, includeBoards = false) {
  if (!KiCadBrowserData.validRepository(repository) || !KiCadBrowserData.validRef(ref) ||
      typeof directory !== "string" || (directory && (directory.startsWith("/") ||
      directory.split("/").some((part) => !part || part === "." || part === ".." || /[\\\x00-\x1f\x7f]/.test(part))))) {
    throw new Error("Invalid GitHub schematic directory.");
  }
  const encoded = directory ? `/${directory.split("/").map(encodeURIComponent).join("/")}` : "";
  const listing = await githubJson(`https://api.github.com/repos/${repository}/contents${encoded}?ref=${encodeURIComponent(ref)}`);
  if (!Array.isArray(listing) || listing.length >= 1000) {
    throw new Error("GitHub returned an incomplete schematic directory listing.");
  }
  return listing.filter((item) => item?.type === "file" && typeof item.path === "string" &&
    (includeBoards ? /\.kicad_(?:sch|pcb)$/i : /\.kicad_sch$/i).test(item.path))
    .map((item) => item.path);
}

async function drawingFiles(repository, ref, file) {
  if (!KiCadBrowserData.validRepository(repository) || !KiCadBrowserData.validRef(ref) ||
      !KiCadBrowserData.validPath(file)) throw new Error("Invalid GitHub drawing location.");
  const directory = file.split("/").slice(0, -1).join("/");
  const files = (await githubDirectory(repository, ref, directory, true)).filter((path) =>
    KiCadBrowserData.validPath(path) && path.split("/").slice(0, -1).join("/") === directory).sort();
  return { files, warnings: [] };
}

// Read-only history discovery. Resolve moving refs before listing file history.
async function revisionJson(url){
  const configured=(await KiCadGitHubReviewApi.tokenStatus()).configured;
  const token=configured?(await chrome.storage.session.get('github-review-token'))['github-review-token']:null;
  const response=await githubResponse(url,{Accept:'application/vnd.github+json',...(token?{Authorization:`Bearer ${token}`}:{})});
  if(!response)throw new Error('GitHub revision was not found.');
  if(Number(response.headers.get('content-length'))>1024*1024)throw new Error('Revision response exceeds 1 MiB.');
  const text=await response.text();if(new TextEncoder().encode(text).byteLength>1024*1024)throw new Error('Revision response exceeds 1 MiB.');
  return {value:JSON.parse(text),next:/rel="next"/.test(response.headers.get('link')||'')};
}
function revisionScope(repository,ref,file){
  if(!KiCadBrowserData.validRepository(repository)||!KiCadBrowserData.validRef(ref)||!KiCadBrowserData.validPath(file)||file.length>500||/[\\:\x00-\x1f\x7f]/.test(file))throw new Error('Invalid drawing revision location.');
}
async function revisionResolve(repository,ref,file){
  revisionScope(repository,ref,file);
  const {value}=await revisionJson(`https://api.github.com/repos/${repository}/commits/${encodeURIComponent(ref)}`);
  if(!SHA.test(value?.sha))throw new Error('GitHub did not resolve a stable revision.');
  return {repository,ref,sha:value.sha};
}
async function revisionBranches(repository,ref,file){
  revisionScope(repository,ref,file);
  const {value,next}=await revisionJson(`https://api.github.com/repos/${repository}/branches?per_page=100&page=1`);
  if(!Array.isArray(value)||value.length>100)throw new Error('Invalid branch listing.');
  const warnings=[],branches=[];
  for(const item of value){if(!KiCadBrowserData.validRef(item?.name)||!SHA.test(item?.commit?.sha)){warnings.push('Invalid branch entry omitted.');continue;}branches.push({name:item.name,sha:item.commit.sha});}
  if(next||value.length===100)warnings.push('At most 100 branches shown; enter another branch name manually.');
  return {repository,branches,warnings:[...new Set(warnings)]};
}
async function revisionCommits(repository,ref,file){
  const snapshot=await revisionResolve(repository,ref,file);
  const query=new URLSearchParams({sha:snapshot.sha,path:file,per_page:'50',page:'1'});
  const {value,next}=await revisionJson(`https://api.github.com/repos/${repository}/commits?${query}`);
  if(!Array.isArray(value)||value.length>50)throw new Error('Invalid commit listing.');
  const warnings=[],commits=[];
  for(const item of value){if(!SHA.test(item?.sha)){warnings.push('Invalid commit entry omitted.');continue;}const bounded=value=>typeof value==='string'?value.replace(/[\x00-\x1f\x7f]/g,' ').slice(0,300):'';commits.push({sha:item.sha,message:bounded(item.commit?.message?.split('\n')[0]),author:bounded(item.commit?.author?.name),date:bounded(item.commit?.author?.date)});}
  if(next||value.length===50)warnings.push('At most 50 commits touching this file shown; enter an older SHA manually.');
  return {repository,file,snapshotRef:snapshot.sha,commits,warnings:[...new Set(warnings)]};
}

async function projectSearchFiles(repository, ref, file) {
  if (!KiCadBrowserData.validRepository(repository) || !KiCadBrowserData.validRef(ref) || !KiCadBrowserData.validPath(file)) throw new Error("Invalid project search location.");
  const commit = await githubJson(`https://api.github.com/repos/${repository}/commits/${encodeURIComponent(ref)}`);
  if (!SHA.test(commit?.sha) || !SHA.test(commit?.commit?.tree?.sha)) throw new Error("GitHub did not resolve a stable project revision.");
  const listing = await githubJson(`https://api.github.com/repos/${repository}/git/trees/${commit.commit.tree.sha}?recursive=1`);
  if (!Array.isArray(listing.tree) || listing.tree.length > 100000) throw new Error("Project tree exceeds the search discovery limit.");
  const warnings = listing.truncated ? ["GitHub truncated the repository tree; project search is incomplete."] : [];
  const candidates = listing.tree.filter(item => item?.type === "blob" && item.mode !== "120000" && KiCadBrowserData.validPath(item.path)).sort((a,b)=>a.path.localeCompare(b.path));
  // Prioritize the opened drawing; never fetch source at a moving branch after discovery.
  candidates.sort((a,b)=>(b.path===file?1:0)-(a.path===file?1:0));
  const files=[];let total=0;
  for(const item of candidates.slice(0,32)) {
    if(Number(item.size)>8*1024*1024){warnings.push(`${item.path}: exceeds the 8 MiB drawing limit.`);continue;}
    if(total+Number(item.size||0)>24*1024*1024){warnings.push("Project search reached its 24 MiB source limit.");break;}
    try {const content=await githubFile(repository,commit.sha,item.path);if(content===null){warnings.push(`${item.path}: source unavailable.`);continue;}
      const bytes=new TextEncoder().encode(content).byteLength;if(bytes>8*1024*1024||total+bytes>24*1024*1024){warnings.push(`${item.path}: source size limit reached.`);continue;}
      total+=bytes;files.push({path:item.path,content});
    }catch(error){warnings.push(`${item.path}: ${error.message}`);}
  }
  if(candidates.length>32)warnings.push(`Project has ${candidates.length} drawings; search loads at most 32. Narrow the repository or open another project.`);
  const settings=[];
  const projectFiles=listing.tree.filter(item=>item?.type==='blob'&&item.mode!=='120000'&&typeof item.path==='string'&&item.path.length<=500&&/\.kicad_pro$/i.test(item.path)&&!item.path.startsWith('/')&&item.path.split('/').every(p=>p&&p!=='.'&&p!=='..'&&!/[\\:\x00-\x1f\x7f]/.test(p))).sort((a,b)=>a.path.localeCompare(b.path));
  for(const item of projectFiles.slice(0,8)){if(Number(item.size)>1024*1024){warnings.push(`${item.path}: project settings exceed 1 MiB.`);continue;}try{const content=await githubFile(repository,commit.sha,item.path);if(content!==null&&new TextEncoder().encode(content).byteLength<=1024*1024)settings.push({path:item.path,content});else warnings.push(`${item.path}: settings unavailable or too large.`);}catch(error){warnings.push(`${item.path}: ${error.message}`);}}
  if(projectFiles.length>8)warnings.push('Only the first eight project settings files were retrieved. Import the desired .kicad_pro if it is absent.');
  return {files,settings,warnings,snapshotRef:commit.sha,totalDrawings:candidates.length};
}

async function projectInventory(repository,ref,file){
  if(!KiCadBrowserData.validRepository(repository)||!KiCadBrowserData.validRef(ref)||!KiCadGitHub.filePath(file))throw new Error('Invalid project location.');
  const commit=await githubJson(`https://api.github.com/repos/${repository}/commits/${encodeURIComponent(ref)}`);
  if(!SHA.test(commit?.sha)||!SHA.test(commit?.commit?.tree?.sha))throw new Error('No stable project revision.');
  const tree=await githubJson(`https://api.github.com/repos/${repository}/git/trees/${commit.commit.tree.sha}?recursive=1`);
  if(!Array.isArray(tree.tree)||tree.tree.length>100000)throw new Error('Repository tree exceeds project discovery limit.');
  const entries=tree.tree.filter(item=>item?.type==='blob'&&item.mode!=='120000'&&KiCadGitHub.filePath(item.path)).sort((a,b)=>a.path.localeCompare(b.path));
  const warnings=[];if(tree.truncated)warnings.push('GitHub truncated the repository tree; project structure is incomplete.');if(entries.length>1000)warnings.push('First 1000 supported project files shown.');
  return {files:entries.slice(0,1000).map(item=>({path:item.path,size:Number(item.size)||0})),snapshotRef:commit.sha,warnings};
}
async function projectFile(repository,ref,file){
  if(!KiCadBrowserData.validRepository(repository)||!KiCadBrowserData.validRef(ref)||!KiCadGitHub.filePath(file))throw new Error('Invalid project file.');
  const content=await githubFile(repository,ref,file);if(content===null)throw new Error('Project file unavailable.');if(new TextEncoder().encode(content).byteLength>8*1024*1024)throw new Error('Project file exceeds 8 MiB.');return {path:file,content};
}
async function openProjectWindow(repository,ref,file){
  if(!KiCadBrowserData.validRepository(repository)||!KiCadBrowserData.validRef(ref)||!KiCadGitHub.filePath(file))throw new Error('Invalid project location.');
  const query=new URLSearchParams({repository,ref,file});const window=await chrome.windows.create({url:chrome.runtime.getURL('project-viewer.html')+'?'+query,type:'popup',state:'maximized'});return {windowId:window?.id??null};
}

async function openViewerWindow(repository, ref, file, pairedFile) {
  if (!KiCadBrowserData.validRepository(repository) || !KiCadBrowserData.validRef(ref) ||
      !KiCadBrowserData.validPath(file)) throw new Error("Invalid GitHub drawing location.");
  if (pairedFile !== undefined && (!KiCadBrowserData.validPath(pairedFile) ||
      /\.kicad_pcb$/i.test(pairedFile) === /\.kicad_pcb$/i.test(file))) {
    throw new Error("Paired drawing must be the opposite KiCad file type in this repository.");
  }
  const query = new URLSearchParams({ repository, head: ref, file, ...(pairedFile ? { pairedFile } : {}) });
  const url = `${chrome.runtime.getURL("browser-viewer.html")}?${query}`;
  const window = await chrome.windows.create({ url, type: "popup", state: "maximized" });
  return { windowId: window?.id ?? null };
}

const ASSET_REF = /^[A-Za-z0-9._/-]{1,200}$/;
const ASSET_SUFFIX = /\.(wrl|vrml|glb)$/i;
const ASSET_MAX_BYTES = 8 * 1024 * 1024;
const assetBudgets = new Map();
function validAssetRef(ref) {
  return typeof ref === "string" && ASSET_REF.test(ref) && !ref.startsWith("/") &&
    !ref.endsWith("/") && ref.split("/").every((part) => part && part !== "." && part !== "..") &&
    !ref.includes("..");
}
function validAssetPath(path) {
  return typeof path === "string" && path.length <= 500 && ASSET_SUFFIX.test(path) &&
    !path.startsWith("/") && !/[\\\x00-\x1f\x7f]/.test(path) &&
    path.split("/").every((part) => part && part !== "." && part !== "..");
}
async function githubAsset(repository, ref, file) {
  if (!validRepository(repository) || !validAssetRef(ref) || !validAssetPath(file)) {
    throw new Error("Invalid repository, revision, or 3D model path.");
  }
  const key = `${repository.toLowerCase()}:${ref}`;
  const now = Date.now();
  let budget = assetBudgets.get(key);
  if (!budget || budget.resetAt <= now) budget = { requests: 0, bytes: 0, resetAt: now + 5 * 60 * 1000 };
  if (budget.requests >= 32 || budget.bytes >= 32 * 1024 * 1024) {
    throw new Error("The 3D model retrieval budget was reached; retry after five minutes.");
  }
  budget.requests++;
  assetBudgets.set(key, budget);
  if (assetBudgets.size > 128) assetBudgets.delete(assetBudgets.keys().next().value);
  const encoded = file.split("/").map(encodeURIComponent).join("/");
  const url = `https://api.github.com/repos/${repository}/contents/${encoded}?ref=${encodeURIComponent(ref)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  let response;
  try {
    response = await fetch(url, { headers: { Accept: "application/vnd.github.raw+json",
      "X-GitHub-Api-Version": "2022-11-28" }, credentials: "omit", cache: "no-store",
    redirect: "error", signal: controller.signal });
    if (!response.ok) throw new Error(`GitHub 3D model retrieval returned HTTP ${response.status}.`);
    const jsonBody = response.headers.get("content-type")?.includes("json");
    const responseLimit = jsonBody ? 12 * 1024 * 1024 : ASSET_MAX_BYTES;
    if (Number(response.headers.get("content-length")) > responseLimit) {
      throw new Error("3D model response exceeds the preview size limit.");
    }
    const chunks = [], reader = response.body?.getReader();
    let length = 0;
    if (!reader) throw new Error("GitHub 3D model response was unavailable.");
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > responseLimit) {
        await reader.cancel().catch(() => {});
        throw new Error("3D model response exceeds the preview size limit.");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let base64, decodedLength;
    if (jsonBody) {
      let data;
      try { data = JSON.parse(new TextDecoder().decode(bytes)); }
      catch { throw new Error("GitHub did not return an encoded 3D model."); }
      if (data?.encoding !== "base64" || typeof data.content !== "string" ||
          data.content.length > 11.5 * 1024 * 1024 || !/^[A-Za-z0-9+/=\r\n]+$/.test(data.content)) {
        throw new Error("GitHub did not return a supported 3D model payload.");
      }
      base64 = data.content.replace(/\s/g, "");
      try { decodedLength = atob(base64).length; }
      catch { throw new Error("GitHub returned invalid 3D model data."); }
    } else {
      decodedLength = bytes.length;
      let binary = "";
      for (let index = 0; index < bytes.length; index += 8192) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
      }
      base64 = btoa(binary);
    }
    if (decodedLength > ASSET_MAX_BYTES || budget.bytes + decodedLength > 32 * 1024 * 1024) {
      throw new Error("3D model exceeds the per-asset or revision retrieval budget.");
    }
    budget.bytes += decodedLength;
    const mediaType = file.toLowerCase().endsWith(".glb") ? "model/gltf-binary" : "model/vrml";
    return { base64, mediaType };
  } finally { clearTimeout(timeout); }
}

function pullEndpoint(repository, number) {
  if (!validRepository(repository) || !Number.isSafeInteger(number) || number <= 0) {
    throw new Error("Invalid GitHub pull request.");
  }
  return `https://api.github.com/repos/${repository}/pulls/${number}`;
}

async function githubPull(repository, number) {
  const endpoint = pullEndpoint(repository, number);
  const pull = await githubJson(endpoint);
  const baseRepo = pull.base?.repo, headRepo = pull.head?.repo;
  if (!baseRepo || baseRepo.private !== false ||
      baseRepo.full_name?.toLowerCase() !== repository.toLowerCase()) {
    throw new Error("This browser preview supports public base repositories only.");
  }
  if (!headRepo || headRepo.private !== false || !validRepository(headRepo.full_name)) {
    throw new Error("This browser preview supports public source repositories only.");
  }
  const baseSha = pull.base?.sha, headSha = pull.head?.sha;
  if (!SHA.test(baseSha || "") || !SHA.test(headSha || "")) {
    throw new Error("GitHub did not provide valid pull request revisions.");
  }
  const changedFiles = pull.changed_files;
  if (!Number.isSafeInteger(changedFiles) || changedFiles < 0) {
    throw new Error("GitHub did not provide the changed file count.");
  }
  const compareRef = encodeURIComponent(`refs/pull/${number}/head`);
  const comparison = await githubJson(`https://api.github.com/repos/${repository}/compare/${baseSha}...${compareRef}`);
  const mergeBase = comparison.merge_base_commit?.sha;
  if (!SHA.test(mergeBase || "")) throw new Error("GitHub did not provide the pull request merge base.");
  return { base: mergeBase, head: headSha, headRepository: headRepo.full_name,
    changedFiles, private: false };
}

function designChanges(batch) {
  const result = [];
  for (const item of batch) {
    const path = item?.filename, old = item?.previous_filename || path;
    const newDesign = KiCadBrowserData.validPath(path);
    const oldDesign = KiCadBrowserData.validPath(old);
    if (newDesign && oldDesign && path.split(".").at(-1).toLowerCase() === old.split(".").at(-1).toLowerCase()) {
      result.push({ file: path, oldFile: old, status: item.status || "modified" });
    } else {
      if (oldDesign) result.push({ file: old, oldFile: old, status: "removed" });
      if (newDesign) result.push({ file: path, oldFile: path, status: "added" });
    }
  }
  return result;
}

async function githubFiles(repository, number, expectedFiles) {
  const endpoint = pullEndpoint(repository, number);
  if (!Number.isSafeInteger(expectedFiles) || expectedFiles < 0) {
    throw new Error("GitHub did not provide the changed file count.");
  }
  if (expectedFiles > 3000) {
    throw new Error("GitHub limits pull request file listings to 3,000 files; this review cannot show a complete comparison.");
  }
  const files = [];
  let seen = 0;
  for (let page = 1; page <= 30; page++) {
    const batch = await githubJson(`${endpoint}/files?per_page=100&page=${page}`);
    if (!Array.isArray(batch) || batch.length > 100) throw new Error("Unexpected GitHub file list.");
    seen += batch.length;
    files.push(...designChanges(batch));
    if (seen >= expectedFiles || batch.length < 100) break;
  }
  if (seen !== expectedFiles) {
    throw new Error("GitHub changed or truncated the pull request file list; reload the review.");
  }
  return files;
}

function senderAllowed(sender) {
  if (sender?.id !== chrome.runtime.id) return false;
  try {
    if (new URL(sender.url).origin === "https://github.com") return true;
  } catch { return false; }
  const page = sender.url?.split(/[?#]/, 1)[0];
  return page === chrome.runtime.getURL("revision-viewer.html") ||
    page === chrome.runtime.getURL("browser-viewer.html") ||
    page === chrome.runtime.getURL("schematic-viewer.html") ||
    page === chrome.runtime.getURL("pcb-viewer.html") || page === chrome.runtime.getURL("project-viewer.html");
}

function viewerSender(sender) {
  if (sender?.id !== chrome.runtime.id) return false;
  const page = sender.url?.split(/[?#]/, 1)[0];
  return page === chrome.runtime.getURL("revision-viewer.html") ||
    page === chrome.runtime.getURL("browser-viewer.html") ||
    page === chrome.runtime.getURL("schematic-viewer.html") ||
    page === chrome.runtime.getURL("pcb-viewer.html") || page === chrome.runtime.getURL("project-viewer.html");
}

function optionsSender(sender) {
  return sender?.id === chrome.runtime.id &&
    sender.url?.split(/[?#]/, 1)[0] === chrome.runtime.getURL("options.html");
}

const commentLocks = new Map();
function commentKey(scope) {
  const { repository, ref, file } = KiCadReviewComments.normalizeScope(scope);
  return `review-comments:${JSON.stringify([repository.toLowerCase(), ref, file])}`;
}
function withCommentLock(key, task) {
  const previous = commentLocks.get(key) || Promise.resolve();
  const work = previous.catch(() => {}).then(task);
  commentLocks.set(key, work);
  work.finally(() => { if (commentLocks.get(key) === work) commentLocks.delete(key); }).catch(() => {});
  return work;
}
async function commentList(scope) {
  if ((await KiCadReviewFileStore.status()).connected) {
    const key = commentKey(scope);
    return withCommentLock(key, async () => (await KiCadReviewFileStore.read()).filter((note) =>
      commentKey(note.anchor) === key));
  }
  const key = commentKey(scope);
  return withCommentLock(key, async () => {
    const stored = (await chrome.storage.local.get(key))[key];
    return Array.isArray(stored) ? stored.map(KiCadReviewComments.validateComment) : [];
  });
}
async function commentSave(value, expectedUpdatedAt) {
  const note = KiCadReviewComments.validateComment(value), key = commentKey(note.anchor);
  if ((await KiCadReviewFileStore.status()).connected) {
    return withCommentLock(key, () => KiCadReviewFileStore.save(note, expectedUpdatedAt));
  }
  return withCommentLock(key, async () => {
    const existing = (await chrome.storage.local.get(key))[key] || [];
    if (!Array.isArray(existing) || existing.length > 100) throw new Error("Invalid saved comment data.");
    const notes = existing.map(KiCadReviewComments.validateComment);
    const index = notes.findIndex((item) => item.id === note.id);
    if (index >= 0 && expectedUpdatedAt !== undefined && notes[index].updatedAt !== expectedUpdatedAt)
      throw new Error("This annotation changed; reload before saving.");
    if (index >= 0) notes[index] = note;
    else {
      if (notes.length >= 100) throw new Error("A KiCad file can have at most 100 saved comments.");
      notes.push(note);
    }
    await chrome.storage.local.set({ [key]: notes });
    return note;
  });
}
async function commentDelete(scope, id) {
  const key = commentKey(scope);
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new Error("Invalid comment id.");
  if ((await KiCadReviewFileStore.status()).connected) {
    return withCommentLock(key, () => KiCadReviewFileStore.remove(scope, id));
  }
  return withCommentLock(key, async () => {
    const existing = (await chrome.storage.local.get(key))[key] || [];
    if (!Array.isArray(existing)) throw new Error("Invalid saved comment data.");
    const notes = existing.map(KiCadReviewComments.validateComment).filter((item) => item.id !== id);
    await chrome.storage.local.set({ [key]: notes });
    return { deleted: notes.length !== existing.length };
  });
}

const pendingKey = (tabId) => `review-comment-draft:${tabId}`;
const DESTINATIONS = new Set(["issue", "discussion", "pull-request"]);
const validNumber = (value) => Number.isSafeInteger(value) && value > 0;
async function stagedDraft(repository, destination, number, title, body) {
  // Open blank first so the draft is stored before GitHub's content script can claim it.
  const tab = await chrome.tabs.create({ url: "about:blank" });
  if (!Number.isInteger(tab?.id)) throw new Error("Could not open a GitHub draft tab.");
  const key = pendingKey(tab.id);
  const suffix = destination === "discussion" ? (number ? `discussions/${number}` : "discussions/new") :
    destination === "issue" ? `issues/${number}` : `pull/${number}`;
  try {
    await chrome.storage.session.set({ [key]: { repository, destination, number, title, body } });
    await chrome.tabs.update(tab.id, { url: `https://github.com/${repository}/${suffix}${number && destination !== "discussion" ? "#issuecomment-new" : ""}` });
  } catch (error) {
    await chrome.storage.session.remove(key).catch(() => {});
    if (chrome.tabs.remove) await chrome.tabs.remove(tab.id).catch(() => {});
    throw error;
  }
  return { tabId: tab.id, destination, ...(number ? { targetNumber: number } : {}) };
}
async function openCommentDraft(value, options = {}) {
  const note = KiCadReviewComments.validateComment(value);
  const body = KiCadReviewComments.toMarkdown(note);
  const title = `[${note.severity[0].toUpperCase()}${note.severity.slice(1)}] KiCad review: ${note.anchor.file}`;
  const { pullNumber, pullRepository, targetType, targetNumber, targetRepository } = options;
  const destination = options.destination || targetType || (pullNumber ? "pull-request" : "issue");
  if (!DESTINATIONS.has(destination) || (targetType && targetType !== destination)) {
    throw new Error("Invalid GitHub draft destination.");
  }
  if (pullNumber !== undefined && !validNumber(pullNumber)) throw new Error("Invalid pull request number.");
  if (pullRepository !== undefined && !validRepository(pullRepository)) throw new Error("Invalid pull request repository.");
  if (targetNumber !== undefined && !validNumber(targetNumber)) throw new Error("Invalid target thread number.");
  if (targetRepository !== undefined && !validRepository(targetRepository)) throw new Error("Invalid target repository.");
  if (targetType && targetNumber === undefined) throw new Error("Existing thread number is required.");
  if (targetNumber !== undefined && !targetType) throw new Error("Existing thread type is required.");
  if (destination === "pull-request" && !targetRepository && !pullRepository) {
    throw new Error("Pull request repository is required for a draft.");
  }
  const repository = targetRepository || pullRepository || note.anchor.repository;
  if (!validRepository(repository)) throw new Error("Invalid pull request repository.");
  const number = targetNumber || (destination === "pull-request" ? pullNumber : undefined);
  if (destination === "pull-request" && !validNumber(number)) throw new Error("Invalid pull request number.");
  if (number) return stagedDraft(repository, destination, number, null, body);
  if (destination === "discussion") return stagedDraft(repository, destination, null, title, body);
  const url = `https://github.com/${repository}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
  const tab = await chrome.tabs.create({ url });
  return { tabId: tab?.id ?? null, destination: "issue" };
}
async function claimCommentDraft(sender) {
  if (!Number.isInteger(sender?.tab?.id)) return null;
  let url;
  try { url = new URL(sender.url); } catch { return null; }
  if (url.origin !== "https://github.com") return null;
  const match = /^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/(pull|issues|discussions)\/([1-9][0-9]*|new)(?:\/([^?#]*))?$/.exec(url.pathname);
  if (!match) return null;
  if (match[5] && !(match[3] === "discussions" && match[4] === "new")) return null;
  const key = pendingKey(sender.tab.id);
  const pending = (await chrome.storage.session.get(key))[key];
  const destination = match[3] === "pull" ? "pull-request" : match[3] === "issues" ? "issue" : "discussion";
  const number = match[4] === "new" ? null : Number(match[4]);
  if (!pending || pending.repository.toLowerCase() !== `${match[1]}/${match[2]}`.toLowerCase() ||
      pending.destination !== destination || pending.number !== number) return null;
  return { body: pending.body, ...(pending.title ? { title: pending.title } : {}) };
}
async function acknowledgeCommentDraft(sender) {
  const draft = await claimCommentDraft(sender);
  if (!draft) return { acknowledged: false };
  await chrome.storage.session.remove(pendingKey(sender.tab.id));
  return { acknowledged: true };
}

async function annotationJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      credentials: "omit", cache: "no-store", signal: controller.signal
    });
    if (response.status === 403 || response.status === 429) {
      const limited = response.headers.get("x-ratelimit-remaining") === "0" || response.status === 429;
      throw new Error(limited ? "GitHub's public API rate limit was reached; retry after it resets." :
        "GitHub denied public annotation access (HTTP 403)." );
    }
    if (response.status === 404) throw new Error("Public GitHub issue or repository was not found.");
    if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status} while reading annotations.`);
    if (Number(response.headers.get("content-length")) > 4 * 1024 * 1024) {
      throw new Error("GitHub annotation response exceeds 4 MiB.");
    }
    const text = await response.text();
    if (new TextEncoder().encode(text).length > 4 * 1024 * 1024) {
      throw new Error("GitHub annotation response exceeds 4 MiB.");
    }
    return JSON.parse(text);
  } catch (error) {
    if (error.name === "AbortError") throw new Error("GitHub annotation request timed out.");
    throw error;
  } finally { clearTimeout(timeout); }
}

async function githubAnnotations(request) {
  const scope = KiCadReviewComments.normalizeScope(request);
  const { pullRepository, pullNumber, issueNumber } = request;
  if (pullRepository !== undefined && !validRepository(pullRepository)) throw new Error("Invalid annotation repository.");
  if (pullNumber !== undefined && !validNumber(pullNumber)) throw new Error("Invalid pull request number.");
  if (issueNumber !== undefined && !validNumber(issueNumber)) throw new Error("Invalid issue number.");
  if (pullNumber && !pullRepository) throw new Error("Pull request repository is required for annotation lookup.");
  const repository = pullRepository || scope.repository;
  const endpoint = `https://api.github.com/repos/${repository}/issues`;
  const notes = [], warnings = [], seen = new Set();
  const selectedNumber = issueNumber || pullNumber;
  const matching = (note) => note.anchor.repository.toLowerCase() === scope.repository.toLowerCase() &&
    note.anchor.ref === scope.ref && note.anchor.file === scope.file;
  const add = (body, meta) => {
    if (typeof body !== "string") return;
    let parsed;
    try { parsed = KiCadReviewComments.fromMarkdown(body); }
    catch { warnings.push("A GitHub body exceeded the annotation size limit and was skipped."); return; }
    for (const note of parsed) {
      if (!matching(note)) continue;
      if (notes.length >= 500) {
        if (!warnings.includes("Annotation results were limited to 500 notes.")) warnings.push("Annotation results were limited to 500 notes.");
        return;
      }
      const key = `${meta.url}:${note.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      notes.push({ ...note, github: meta });
    }
  };
  const author = (item) => /^[A-Za-z0-9-]{1,39}$/.test(item?.user?.login || "") ? item.user.login : "unknown";
  const issueMeta = new Map();
  const readIssue = (item) => {
    const number = item?.number;
    if (!validNumber(number)) return;
    const source = item.pull_request ? "pull-request" : "issue";
    const state = item.state === "open" || item.state === "closed" ? item.state : "unknown";
    issueMeta.set(number, { source, state });
    add(item.body, { url: `https://github.com/${repository}/${source === "pull-request" ? "pull" : "issues"}/${number}`,
      number, state, source, author: author(item) });
  };
  for (let page = 1; page <= 2; page++) {
    const batch = await annotationJson(`${endpoint}?state=all&per_page=100&page=${page}`);
    if (!Array.isArray(batch) || batch.length > 100) throw new Error("Unexpected GitHub issue listing.");
    batch.forEach(readIssue);
    if (batch.length < 100) break;
    if (page === 2) warnings.push("Issue scan stopped after 200 recent issues or pull requests; older annotations may be omitted.");
  }
  if (selectedNumber) {
    if (!issueMeta.has(selectedNumber)) readIssue(await annotationJson(`${endpoint}/${selectedNumber}`));
    const meta = issueMeta.get(selectedNumber);
    if (!meta) throw new Error("GitHub did not return the selected issue or pull request.");
    const comments = await annotationJson(`${endpoint}/${selectedNumber}/comments?per_page=100&page=1`);
    if (!Array.isArray(comments) || comments.length > 100) throw new Error("Unexpected GitHub comment listing.");
    for (const comment of comments) {
      const id = comment?.id;
      const suffix = validNumber(id) ? `#issuecomment-${id}` : "";
      add(comment?.body, { url: `https://github.com/${repository}/${meta.source === "pull-request" ? "pull" : "issues"}/${selectedNumber}${suffix}`,
        number: selectedNumber, state: meta.state, source: meta.source, author: author(comment) });
    }
    if (comments.length === 100) warnings.push("Comment scan stopped at 100 comments for the selected thread.");
  }
  if (request.includeDiscussions) warnings.push("Discussion readback is unavailable through this unauthenticated REST flow; use the GitHub discussion page to review drafts.");
  return { notes, warnings };
}

async function openFromAction(tab) {
  if (!Number.isInteger(tab?.id) || typeof tab.url !== "string") return;
  let page;
  try { page = new URL(tab.url); } catch { return; }
  if (page.origin !== "https://github.com") return;
  const path = page.pathname.split("/").filter(Boolean);
  if (path.length >= 4 && /^[A-Za-z0-9_.-]+$/.test(path[0]) && /^[A-Za-z0-9_.-]+$/.test(path[1]) &&
      path[2] === "pull" && /^[1-9][0-9]*$/.test(path[3])) {
    const filesUrl = `https://github.com/${path[0]}/${path[1]}/pull/${path[3]}/files`;
    if (page.pathname !== new URL(filesUrl).pathname) await chrome.tabs.update(tab.id, { url: filesUrl });
    else await chrome.tabs.sendMessage(tab.id, { type: "focusReview" }).catch(() => {});
    return;
  }
  if (path[2] === "blob") {
    await chrome.tabs.sendMessage(tab.id, { type: "focusInline" }).catch(() => {});
  }
}

chrome.action.onClicked.addListener((tab) => { openFromAction(tab).catch(() => {}); });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!(senderAllowed(sender) || optionsSender(sender)) || !message || typeof message !== "object") return false;
  (async () => {
    switch (message.type) {
      case "github-auth-status":
        if (!viewerSender(sender) && !optionsSender(sender)) throw new Error("Only extension pages can inspect GitHub settings.");
        return KiCadGitHubReviewApi.tokenStatus();
      case "github-auth-set":
        if (!optionsSender(sender)) throw new Error("Only extension options can set a GitHub token.");
        return KiCadGitHubReviewApi.setToken(message.token);
      case "github-auth-clear":
        if (!optionsSender(sender)) throw new Error("Only extension options can clear a GitHub token.");
        return KiCadGitHubReviewApi.clearToken();
      case "github-device-status":
        if (!optionsSender(sender)) throw new Error("Only extension options can inspect GitHub sign-in.");
        return KiCadGitHubReviewApi.deviceStatus();
      case "github-device-start":
        if (!optionsSender(sender)) throw new Error("Only extension options can start GitHub sign-in.");
        return KiCadGitHubReviewApi.startDevice(message.clientId);
      case "github-device-poll":
        if (!optionsSender(sender)) throw new Error("Only extension options can poll GitHub sign-in.");
        return KiCadGitHubReviewApi.pollDevice();
      case "github-device-cancel":
        if (!optionsSender(sender)) throw new Error("Only extension options can cancel GitHub sign-in.");
        return KiCadGitHubReviewApi.cancelDevice();
      case "github-discussion-categories":
        if (!viewerSender(sender)) throw new Error("Only extension viewers can retrieve discussion categories.");
        return KiCadGitHubReviewApi.categories(message.repository);
      case "github-publish-comment":
        if (!viewerSender(sender)) throw new Error("Only extension viewers can publish review comments.");
        return KiCadGitHubReviewApi.publish(message);
      case "comment-policy-status":
        if (!viewerSender(sender)) throw new Error("Only extension viewers can inspect repository comment policy.");
        return KiCadGitHubReviewApi.commentPolicyStatus(message.repository);
      case "open-options":
        if (!viewerSender(sender)) throw new Error("Only extension viewers can open settings.");
        await chrome.runtime.openOptionsPage();
        return { opened: true };
      case "comment-store-status":
        if (!viewerSender(sender) && !optionsSender(sender)) throw new Error("Only extension pages can inspect comment storage.");
        return KiCadReviewFileStore.status();
      case "repo-asset":
        if (!viewerSender(sender)) throw new Error("Only extension viewers can retrieve 3D models.");
        return githubAsset(message.repository, message.ref, message.file);
      case "rule-report": {
        if(!viewerSender(sender))throw new Error("Only extension viewers can load rule reports.");
        const path=message.reportPath;
        if(!KiCadBrowserData.validRepository(message.repository)||!KiCadBrowserData.validRef(message.ref)||!KiCadBrowserData.validPath(message.file)||typeof path!=='string'||path.length>500||!path.endsWith('.json')||path.startsWith('/')||path.split('/').some(p=>!p||p==='.'||p==='..'||/[\\:\x00-\x1f\x7f]/.test(p)))throw new Error("Invalid repository report path.");
        const content=await githubFile(message.repository,message.ref,path);if(content===null)throw new Error("Report was not found at this revision.");if(new TextEncoder().encode(content).byteLength>4*1024*1024)throw new Error("Rule report exceeds 4 MiB.");return {content,path};
      }
      case "project-inventory":
        if(!viewerSender(sender))throw new Error('Only extension viewers can inspect project files.');return projectInventory(message.repository,message.ref,message.file);
      case 'revision-branches':
        if(!viewerSender(sender))throw new Error('Only extension viewers can list branches.');return revisionBranches(message.repository,message.ref,message.file);
      case 'revision-commits':
        if(!viewerSender(sender))throw new Error('Only extension viewers can list commits.');return revisionCommits(message.repository,message.ref,message.file);
      case 'revision-resolve':
        if(!viewerSender(sender))throw new Error('Only extension viewers can resolve revisions.');return revisionResolve(message.repository,message.ref,message.file);
      case "project-file":
        if(!viewerSender(sender))throw new Error('Only extension viewers can read project settings.');return projectFile(message.repository,message.ref,message.file);
      case "open-project-overview":
        if(!viewerSender(sender))throw new Error('Only extension viewers can open projects.');return openProjectWindow(message.repository,message.ref,message.file);
      case "project-search-files":
        if (!viewerSender(sender)) throw new Error("Only extension viewers can search projects.");
        return projectSearchFiles(message.repository,message.ref,message.file);
      case "drawing-files":
        if (!viewerSender(sender)) throw new Error("Only extension viewers can list companion drawings.");
        return drawingFiles(message.repository, message.ref, message.file);
      case "open-viewer-window":
        if (!viewerSender(sender)) throw new Error("Only extension viewers can open drawing windows.");
        return openViewerWindow(message.repository, message.ref, message.file, message.pairedFile);
      case "comment-list":
        if (!viewerSender(sender)) throw new Error("Only extension viewers can access saved comments.");
        return commentList(message);
      case "comment-save":
        if (!viewerSender(sender)) throw new Error("Only extension viewers can save comments.");
        return commentSave(message.comment, message.expectedUpdatedAt);
      case "comment-delete":
        if (!viewerSender(sender)) throw new Error("Only extension viewers can delete comments.");
        return commentDelete(message, message.id);
      case "open-comment-draft":
        if (!viewerSender(sender)) throw new Error("Only extension viewers can open comment drafts.");
        return openCommentDraft(message.comment, message);
      case "github-annotations":
        if (!viewerSender(sender)) throw new Error("Only extension viewers can read GitHub annotations.");
        return githubAnnotations(message);
      case "claim-comment-draft":
        if (viewerSender(sender)) throw new Error("Only GitHub tabs can claim comment drafts.");
        return claimCommentDraft(sender);
      case "ack-comment-draft":
        if (viewerSender(sender)) throw new Error("Only GitHub tabs can acknowledge comment drafts.");
        return acknowledgeCommentDraft(sender);
      case "project": {
        if (optionsSender(sender)) throw new Error("Options cannot load KiCad projects.");
        const { repository, ref, file } = message;
        return KiCadBrowserData.loadProject(repository, ref, file, githubFile, githubDirectory);
      }
      case "githubPull":
        if (optionsSender(sender)) throw new Error("Options cannot load pull requests.");
        return githubPull(message.repository, message.number);
      case "githubFiles":
        if (optionsSender(sender)) throw new Error("Options cannot load pull request files.");
        return githubFiles(message.repository, message.number, message.expectedFiles);
      default: throw new Error("Unsupported extension request.");
    }
  })().then((result) => sendResponse({ ok: true, result }),
             (error) => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
});

if (typeof module === "object" && module.exports) {
  module.exports = { githubPull, githubFiles, githubDirectory, drawingFiles, openViewerWindow,
    githubAsset, designChanges, senderAllowed, viewerSender, optionsSender, openFromAction,
    commentList, commentSave, commentDelete, openCommentDraft, claimCommentDraft,
    acknowledgeCommentDraft, githubAnnotations, revisionBranches,revisionCommits,revisionResolve };
}
