"use strict";

importScripts("parsing.js", "browser-data.js", "review-comments.js", "review-file-store.js", "credential-vault.js", "github-review-api.js", "gitlab-provider.js", "gitlab-review-api.js", "gitlab-hosts.js", "mention-users.js");

let mentionService=null;
function mentionUsers(message){
  mentionService ||= KiCadMentionUsers.create({authorizationHeaders:(provider,host)=>provider==='gitlab'?KiCadGitLabReviewApi.authorizationHeaders(host):KiCadGitHubReviewApi.authorizationHeaders()});
  return mentionService.lookup(message);
}
const SHA = /^[0-9a-f]{40}$/i;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

let badgeGeneration = 0;
async function updateGitHubBadge() {
  if (!chrome.action?.setBadgeText) return;
  const generation = ++badgeGeneration;
  const status = await KiCadGitHubReviewApi.tokenStatus();
  if (generation !== badgeGeneration) return;
  await chrome.action.setBadgeBackgroundColor({ color: status.configured ? '#238636' : '#6e7681' });
  await chrome.action.setBadgeText({ text: status.configured ? '●' : '' });
  await chrome.action.setTitle({ title: status.configured ?
    'KiCad Visual Review — GitHub connected' : 'KiCad Visual Review — GitHub signed out' });
}
// Clear a stale connected badge when a new worker cannot unlock the old session.
updateGitHubBadge().catch(() => {});
chrome.storage.onChanged?.addListener((changes, area) => {
  if (area === 'session' && ('github-review-token' in changes || 'github-device-pending' in changes)) {
    updateGitHubBadge().catch(() => {});
  }
});

let devicePollTimer = null;
function scheduleDeviceCheck(delay = 5000) {
  if (devicePollTimer !== null) clearTimeout(devicePollTimer);
  devicePollTimer = setTimeout(async () => {
    devicePollTimer = null;
    try {
      const flow = await KiCadGitHubReviewApi.deviceStatus();
      if (!flow.active) return;
      const result = await KiCadGitHubReviewApi.pollDevice();
      await updateGitHubBadge();
      if (result.state === 'pending') scheduleDeviceCheck(result.retryAfterMs);
    } catch {
      const flow = await KiCadGitHubReviewApi.deviceStatus().catch(() => null);
      if (flow?.active) scheduleDeviceCheck(Math.max(5000, flow.retryAfterMs));
    }
  }, Math.min(20000, Math.max(1000, Number(delay) || 5000)));
  devicePollTimer?.unref?.(); // Node test runners need not wait for an authorization timer.
}

function validRepository(value) {
  return typeof value === "string" && REPOSITORY.test(value) &&
    value.split("/").every((part) => part !== "." && part !== "..");
}

async function githubReadHeaders(headers = {}) {
  const result = { "X-GitHub-Api-Version": "2022-11-28", ...headers };
  Object.assign(result, await KiCadGitHubReviewApi.authorizationHeaders());
  return result;
}
function githubReadError(response) {
  const remaining = response.headers.get('x-ratelimit-remaining');
  const retry = response.headers.get('retry-after');
  if ((response.status === 403 || response.status === 429) && (remaining === '0' || retry || response.status === 429)) {
    const reset = Number(response.headers.get('x-ratelimit-reset'));
    const when = retry ? ` Retry after ${retry} seconds.` : Number.isFinite(reset) && reset > 0 ? ` Retry after ${new Date(reset * 1000).toISOString()}.` : ' Wait before retrying.';
    return new Error('GitHub API rate limit reached.' + when + ' Connect your GitHub account in extension settings for authenticated reads.');
  }
  if (response.status === 401) return new Error('GitHub authentication failed (HTTP 401). Reconnect your account in extension settings.');
  if (response.status === 403) return new Error('GitHub denied this request (HTTP 403). Check repository access and your account permissions in extension settings.');
  return new Error(`GitHub returned HTTP ${response.status}.`);
}

async function githubResponse(url, headers = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, {
      headers: await githubReadHeaders(headers),
      credentials: "omit", cache: "no-store", redirect: "error", signal: controller.signal
    });
    if (response.status === 404) return null;
    if (!response.ok) throw githubReadError(response);
    return response;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("GitHub file retrieval timed out.");
    throw error;
  } finally { clearTimeout(timeout); }
}

async function githubJson(url) {
  const response = await githubResponse(url, { Accept: "application/vnd.github+json" });
  if (!response) throw new Error("GitHub returned HTTP 404: this resource may be missing or your extension account may lack private repository access. GitHub website sign-in does not sign the extension in. Check the path/revision and connect a token with access to this repository in extension settings.");
  return response.json();
}

async function githubFile(repository, ref, path) {
  if (!KiCadBrowserData.validRepository(repository) || !KiCadBrowserData.validRef(ref) ||
      typeof path !== "string" || !path || path.startsWith("/") || path.split("/").some(part => !part || part === "." || part === ".." || /[\\:\x00-\x1f\x7f]/.test(part))) throw new Error("Invalid GitHub file location.");
  const limit = KiCadBrowserData.fileByteLimit(path);
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const url = `https://api.github.com/repos/${repository}/contents/${encoded}?ref=${encodeURIComponent(ref)}`;
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 60000);
  try {
    let response = await fetch(url, { headers: await githubReadHeaders({ Accept: "application/vnd.github.raw+json" }), credentials: "omit", cache: "no-store", redirect: "error", signal: controller.signal });
    // Public raw content is a separate, anonymous transport. Never send a token
    // to the asset host or follow a redirect with authorization attached.
    if ((response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') || response.status === 429) {
      const apiError = githubReadError(response);
      response = await fetch(`https://raw.githubusercontent.com/${repository}/${encodeURIComponent(ref)}/${encoded}`, { credentials: "omit", cache: "no-store", redirect: "error", signal: controller.signal });
      if (!response.ok) throw apiError;
    }
    if (response.status === 404) return null;
    if (!response.ok) throw githubReadError(response);
    // Raw media avoids the Contents JSON endpoint's empty content above 1 MiB.
    // Still accept bounded base64 envelopes from compatible mocks/proxies.
    const json = response.headers.get("content-type")?.includes("json");
    const responseLimit = json ? Math.ceil(limit * 4 / 3) + 65536 : limit;
    if (Number(response.headers.get("content-length")) > responseLimit) throw new Error("KiCad file exceeds the browser preview size limit.");
    const reader = response.body.getReader(), chunks = []; let count = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      count += value.byteLength;
      if (count > responseLimit) { await reader.cancel(); throw new Error("KiCad file exceeds the browser preview size limit."); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(count); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const body = new TextDecoder().decode(bytes);
    let data;
    if (json) { try { data = JSON.parse(body); } catch {} }
    if (data && typeof data === "object" && (Object.hasOwn(data, "encoding") || Object.hasOwn(data, "content"))) {
      if (typeof data.content !== "string" || data.encoding !== "base64" || !/^[A-Za-z0-9+/=\r\n]*$/.test(data.content)) throw new Error("GitHub did not return KiCad file contents.");
      const binary = atob(data.content.replace(/\s/g, ""));
      if (binary.length > limit) throw new Error("KiCad file exceeds the browser preview size limit.");
      return new TextDecoder().decode(Uint8Array.from(binary, ch => ch.charCodeAt(0)));
    }
    if (count > limit) throw new Error("KiCad file exceeds the browser preview size limit.");
    return body;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("GitHub file retrieval timed out.");
    throw error;
  } finally { clearTimeout(timeout); }
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
  const response=await githubResponse(url,await githubReadHeaders({Accept:'application/vnd.github+json'}));
  if(!response)throw new Error('GitHub revision was not found (HTTP 404), or your extension account lacks private repository access. Check the exact revision and sign in with private repository access in extension settings.');
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
    if(Number(item.size)>KiCadBrowserData.fileByteLimit(item.path)){warnings.push(`${item.path}: exceeds the ${KiCadBrowserData.fileByteLimit(item.path)/1024/1024} MiB drawing limit.`);continue;}
    if(total+Number(item.size||0)>KiCadBrowserData.PROJECT_MAX_BYTES){warnings.push("Project search reached its 96 MiB source limit.");break;}
    try {const content=await githubFile(repository,commit.sha,item.path);if(content===null){warnings.push(`${item.path}: source unavailable.`);continue;}
      const bytes=new TextEncoder().encode(content).byteLength;if(bytes>KiCadBrowserData.fileByteLimit(item.path)||total+bytes>KiCadBrowserData.PROJECT_MAX_BYTES){warnings.push(`${item.path}: source size limit reached.`);continue;}
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
  const content=await githubFile(repository,ref,file);if(content===null)throw new Error('Project file unavailable.');if(new TextEncoder().encode(content).byteLength>KiCadBrowserData.fileByteLimit(file))throw new Error('Project file exceeds its size limit.');return {path:file,content};
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
const ASSET_SUFFIX = /\.(wrl|vrml|glb|step|stp)$/i;
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
    response = await fetch(url, { headers: await githubReadHeaders({ Accept: "application/vnd.github.raw+json" }), credentials: "omit", cache: "no-store",
    redirect: "error", signal: controller.signal });
    if (response.status === 404) throw new Error("GitHub 3D model retrieval returned HTTP 404: the model may be absent or your extension account lacks access to this private repository. Check the saved model path and token repository permissions.");
    if (!response.ok) throw githubReadError(response);
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
    const mediaType = /\.(step|stp)$/i.test(file)?"model/step":file.toLowerCase().endsWith(".glb") ? "model/gltf-binary" : "model/vrml";
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
  const reader=await KiCadGitHubReviewApi.createPullReader(repository,number);
  const pull = await reader.read("pull");
  const baseRepo = pull.base?.repo, headRepo = pull.head?.repo;
  if (!baseRepo || typeof baseRepo.private!=='boolean' ||
      baseRepo.full_name?.toLowerCase() !== repository.toLowerCase()) {
    throw new Error("GitHub did not confirm the pull request base repository.");
  }
  if (!headRepo || typeof headRepo.private!=='boolean' || !validRepository(headRepo.full_name)) {
    throw new Error("GitHub did not provide an accessible pull request source repository.");
  }
  if((baseRepo.private||headRepo.private)&&!reader.authenticated)throw new Error("Sign in with private repository access to compare this pull request.");
  const baseSha = pull.base?.sha, headSha = pull.head?.sha;
  if (!SHA.test(baseSha || "") || !SHA.test(headSha || "")) {
    throw new Error("GitHub did not provide valid pull request revisions.");
  }
  const changedFiles = pull.changed_files;
  if (!Number.isSafeInteger(changedFiles) || changedFiles < 0) {
    throw new Error("GitHub did not provide the changed file count.");
  }
  const comparison = await reader.read("compare",{base:baseSha,head:headSha});
  const mergeBase = comparison.merge_base_commit?.sha;
  if (!SHA.test(mergeBase || "")) throw new Error("GitHub did not provide the pull request merge base.");
  if(comparison.base_commit?.sha!==baseSha||comparison.head_commit?.sha!==headSha)throw new Error("GitHub comparison did not confirm the pinned pull request revisions.");
  return { base: mergeBase, baseTip:baseSha, head: headSha, headRepository: headRepo.full_name,
    changedFiles, private: baseRepo.private||headRepo.private };
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

async function githubFiles(repository, number, expectedFiles, expectedHead, expectedBase) {
  const endpoint = pullEndpoint(repository, number);
  if (!Number.isSafeInteger(expectedFiles) || expectedFiles < 0) {
    throw new Error("GitHub did not provide the changed file count.");
  }
  if (expectedFiles > 3000) {
    throw new Error("GitHub limits pull request file listings to 3,000 files; this review cannot show a complete comparison.");
  }
  if(!SHA.test(expectedHead||'')||!SHA.test(expectedBase||''))throw new Error("Pinned pull request revisions are required; reload the review.");
  const reader=await KiCadGitHubReviewApi.createPullReader(repository,number);
  const verify=async()=>{const pull=await reader.read('pull');if(pull.base?.repo?.full_name?.toLowerCase()!==repository.toLowerCase()||pull.base?.sha!==expectedBase||pull.head?.sha!==expectedHead||pull.changed_files!==expectedFiles)throw new Error("GitHub changed the pull request while loading files; reload the review.");};
  await verify();
  const files = [];
  let seen = 0;
  for (let page = 1; page <= 30; page++) {
    const batch = await reader.read("files",{page});
    if (!Array.isArray(batch) || batch.length > 100) throw new Error("Unexpected GitHub file list.");
    seen += batch.length;
    files.push(...designChanges(batch));
    if (seen >= expectedFiles || batch.length < 100) break;
  }
  if (seen !== expectedFiles) {
    throw new Error("GitHub changed or truncated the pull request file list; reload the review.");
  }
  await verify();
  return files;
}

function senderAllowed(sender) {
  if (sender?.id !== chrome.runtime.id) return false;
  try {
    if (["https://github.com", "https://gitlab.com"].includes(new URL(sender.url).origin)) return true;
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
  const { repository, ref, file, provider, host } = KiCadReviewComments.normalizeScope(scope);
  return `${provider === 'gitlab' ? 'review-comments:gitlab:' : 'review-comments:'}${JSON.stringify([...(provider==='gitlab'&&host!=='https://gitlab.com'?[host]:[]),repository.toLowerCase(), ref, file])}`;
}
function withCommentLock(key, task) {
  const previous = commentLocks.get(key) || Promise.resolve();
  const work = previous.catch(() => {}).then(task);
  commentLocks.set(key, work);
  work.finally(() => { if (commentLocks.get(key) === work) commentLocks.delete(key); }).catch(() => {});
  return work;
}
async function commentList(scope) {
  if (scope.provider !== 'gitlab' && (await KiCadReviewFileStore.status()).connected) {
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
  if (note.anchor.provider !== 'gitlab' && (await KiCadReviewFileStore.status()).connected) {
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
  if (scope.provider !== 'gitlab' && (await KiCadReviewFileStore.status()).connected) {
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

async function githubAnnotations(request) {
  const scope = KiCadReviewComments.normalizeScope(request);
  if(scope.provider==='gitlab')throw new Error('GitHub annotation lookup requires a GitHub drawing.');
  const { pullRepository, pullNumber, issueNumber, discussionNumber } = request;
  if (pullRepository !== undefined && !validRepository(pullRepository)) throw new Error("Invalid annotation repository.");
  if (pullNumber !== undefined && !validNumber(pullNumber)) throw new Error("Invalid pull request number.");
  if (issueNumber !== undefined && !validNumber(issueNumber)) throw new Error("Invalid issue number.");
  if (discussionNumber !== undefined && !validNumber(discussionNumber)) throw new Error("Invalid discussion number.");
  if(discussionNumber!==undefined&&issueNumber!==undefined)throw new Error('Choose one Issue or Discussion for annotation lookup.');
  if (pullNumber && !pullRepository) throw new Error("Pull request repository is required for annotation lookup.");
  const repository = pullRepository || scope.repository;
  if(discussionNumber!==undefined)return KiCadGitHubReviewApi.readDiscussionAnnotations({repository,number:discussionNumber,scope});
  const endpoint = `/repos/${repository}/issues`;
  const annotationJson=await KiCadGitHubReviewApi.createAnnotationReader();
  const notes = [], warnings = [], seen = new Set();
  const selectedNumber = issueNumber || pullNumber;
  const matching = (note) => note.anchor.provider!=='gitlab'&&note.anchor.repository.toLowerCase() === scope.repository.toLowerCase() &&
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
  const times=item=>{const values={};for(const [source,key]of [['created_at','createdAt'],['updated_at','updatedAt']])if(typeof item?.[source]==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(item[source])&&Number.isFinite(Date.parse(item[source])))values[key]=item[source];return values;};
  const issueMeta = new Map();
  const readIssue = (item) => {
    const number = item?.number;
    if (!validNumber(number)) return;
    const source = item.pull_request ? "pull-request" : "issue";
    const state = item.state === "open" || item.state === "closed" ? item.state : "unknown";
    issueMeta.set(number, { source, state });
    add(item.body, { url: `https://github.com/${repository}/${source === "pull-request" ? "pull" : "issues"}/${number}`,
      number, state, source, author: author(item),...times(item) });
  };
  for (let page = 1; !selectedNumber&&page <= 2; page++) {
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
    for(let page=1;page<=5;page++){
    const comments = await annotationJson(`${endpoint}/${selectedNumber}/comments?per_page=100&page=${page}`);
    if (!Array.isArray(comments) || comments.length > 100) throw new Error("Unexpected GitHub comment listing.");
    for (const comment of comments) {
      const id = comment?.id;
      const suffix = validNumber(id) ? `#issuecomment-${id}` : "";
      add(comment?.body, { url: `https://github.com/${repository}/${meta.source === "pull-request" ? "pull" : "issues"}/${selectedNumber}${suffix}`,
        number: selectedNumber, state: meta.state, source: meta.source, author: author(comment),...times(comment) });
    }
    if(comments.length<100)break;
    if(page===5)warnings.push("Comment scan stopped at 500 comments for the selected thread.");
    }
  }
  if (request.includeDiscussions) warnings.push("Discussion readback requires selecting an existing Discussion and entering its number.");
  return { notes, warnings };
}

async function openFromAction(tab) {
  if (!Number.isInteger(tab?.id) || typeof tab.url !== "string") return;
  let page;
  try { page = new URL(tab.url); } catch { return; }
  if (page.origin !== "https://github.com" && await globalThis.KiCadGitLabHosts?.allowed(page.origin)) {
    if (page.pathname.includes('/-/blob/')) await chrome.tabs.sendMessage(tab.id, { type: 'focusInline' }).catch(() => {});
    return;
  }
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

const gitlabAssetBudgets = new Map();
async function gitlabAnnotations(api,scope){
  const normalized=KiCadReviewComments.normalizeScope({...scope,provider:'gitlab'}),notes=[],warnings=[];let projectId=null;
  const number=Number(scope.number||scope.issueNumber||scope.threadNumber);
  if(!Number.isSafeInteger(number)||number<1)return {notes,warnings:['Enter an existing GitLab issue number to read its review notes.']};
  const endpoint=normalized.host+'/api/v4/projects/'+encodeURIComponent(normalized.repository)+'/issues/'+number;
  const issueUrl=normalized.host+'/'+normalized.repository+'/-/issues/'+number;
  const add=(text,record,isNote=false)=>{for(const note of KiCadReviewComments.fromMarkdown(text||''))if(note.anchor.provider==='gitlab'&&note.anchor.host===normalized.host&&note.anchor.repository===normalized.repository&&note.anchor.ref===normalized.ref&&note.anchor.file===normalized.file&&notes.length<100){
    const sourceId=isNote?Number(record.id):0;
    if(isNote&&(!Number.isSafeInteger(sourceId)||sourceId<1))continue;
    if(note.attachments?.length){const attachments=note.attachments.filter(a=>a.projectId===projectId);if(attachments.length!==note.attachments.length&&!warnings.includes('Some screenshot attachments could not be bound to this GitLab issue project and were omitted.'))warnings.push('Some screenshot attachments could not be bound to this GitLab issue project and were omitted.');if(attachments.length)note.attachments=attachments;else delete note.attachments;}
    note.github={provider:'gitlab',url:issueUrl+(isNote?'#note_'+sourceId:''),source:note.threadType==='discussion'?'discussion':'issue',number,state:record.state||'posted',author:record.author?.username||''};
    notes.push(note);
  }};
  const issue=await api.response(endpoint,1024*1024);if(!issue)throw new Error('GitLab issue is unavailable or access was denied.');
  const issueRecord=JSON.parse(new TextDecoder().decode(issue.bytes));if(issueRecord.iid===number&&Number.isSafeInteger(issueRecord.project_id)&&issueRecord.project_id>0)projectId=issueRecord.project_id;add(issueRecord.description,issueRecord);
  for(let page=1;page<=5;page++){
    const response=await api.response(endpoint+'/notes?'+new URLSearchParams({per_page:'100',page:String(page)}),1024*1024);
    if(!response)throw new Error('GitLab issue notes are unavailable.');
    const records=JSON.parse(new TextDecoder().decode(response.bytes));if(!Array.isArray(records)||records.length>100)throw new Error('Invalid GitLab issue notes.');
    for(const record of records)add(record.body,record,true);
    if(!response.next&&records.length<100)break;
    if(page===5)warnings.push('Readback stopped at 500 issue notes; open GitLab for the complete thread.');
  }
  return {notes:[...new Map(notes.map(note=>[note.id,note])).values()],warnings};
}
async function gitlabDispatch(message, sender) {
  const auth=globalThis.KiCadGitLabReviewApi,hosts=globalThis.KiCadGitLabHosts;
  if(['gitlab-host-list','gitlab-host-add','gitlab-host-remove'].includes(message.type)){
    if(!optionsSender(sender))throw new Error('Only extension settings can configure GitLab servers.');
    if(message.type==='gitlab-host-list')return {hosts:await hosts.list()};
    return message.type==='gitlab-host-add'?hosts.add(message.host):hosts.remove(message.host);
  }
  const host=message.host||'https://gitlab.com';
  if (globalThis.KiCadGitLabHosts ? !await KiCadGitLabHosts.allowed(host) : host!=='https://gitlab.com')throw new Error('Configure and grant access to this GitLab host first.');
  const api=globalThis.KiCadGitLabProvider.forHost(host);
  const {repository,ref,file}=message;
  if(['gitlab-auth-status','gitlab-auth-set','gitlab-auth-clear','gitlab-auth-reset','gitlab-client-set','gitlab-oauth-start'].includes(message.type)){
    if(!optionsSender(sender)&&!(message.type==='gitlab-auth-status'&&viewerSender(sender)))throw new Error('Only extension settings can change GitLab authentication.');
    if(message.type==='gitlab-auth-status')return auth.authStatus(host);
    if(message.type==='gitlab-auth-set')return auth.setToken(host,message.token);
    if(message.type==='gitlab-auth-clear')return auth.clearToken(host);
    if(message.type==='gitlab-auth-reset')return auth.resetAuth(host);
    if(message.type==='gitlab-client-set')return auth.setClientId(host,message.clientId);
    return auth.startOAuth(host);
  }
  if (!viewerSender(sender) && !['project','gitlab-merge-request'].includes(message.type)) throw new Error('Only extension viewers can use GitLab repository tools.');
  if (optionsSender(sender)) throw new Error('Options cannot load GitLab projects.');
  switch(message.type) {
    case 'gitlab-merge-request': {
      if(!viewerSender(sender)){
        const route=KiCadGitHub.route(sender.url,{gitlabHosts:[host]});
        if(route?.kind!=='merge'||route.repository!==repository||route.number!==message.number)throw new Error('Merge-request context does not match the host page.');
      }
      return api.mergeRequest(repository,message.number);
    }
    case 'project': {
      const snapshot=await api.resolve(repository,ref,file);
      return KiCadBrowserData.loadProject(repository,snapshot.sha,file,api.file,api.directory,'gitlab');
    }
    case 'project-inventory': return api.inventory(repository,ref,file);
    case 'project-file': return api.projectFile(repository,ref,file);
    case 'project-search-files': return api.search(repository,ref,file);
    case 'revision-resolve': return api.resolve(repository,ref,file);
    case 'revision-branches': return api.branches(repository,ref,file);
    case 'revision-commits': return api.commits(repository,ref,file);
    case 'design-changes': return api.compare(repository,message.base,message.head,file);
    case 'drawing-files': {
      const snapshot=await api.resolve(repository,ref,file);
      return {files:await api.directory(repository,snapshot.sha,file.split('/').slice(0,-1).join('/'),true),warnings:[]};
    }
    case 'rule-report': {
      const snapshot=await api.resolve(repository,ref,file);
      if (!api.validPath(message.reportPath)||!message.reportPath.endsWith('.json')||!KiCadBrowserData.validPath(file)) throw new Error('Invalid GitLab report path.');
      const result=await api.response(`${api.endpoint(repository)}/files/${encodeURIComponent(message.reportPath)}/raw?ref=${encodeURIComponent(snapshot.sha)}`,4*1024*1024);
      if (!result) throw new Error('Report was not found at this revision.');
      return {content:new TextDecoder().decode(result.bytes),path:message.reportPath};
    }
    case 'repo-asset': {
      if(!api.validRepository(repository)||!validAssetRef(ref)||!validAssetPath(file))throw new Error('Invalid GitLab model location.');
      const key=host+':'+repository.toLowerCase()+':'+ref,now=Date.now();let budget=gitlabAssetBudgets.get(key);
      if(!budget||budget.resetAt<=now)budget={requests:0,bytes:0,resetAt:now+300000};
      if(budget.requests>=32||budget.bytes>=32*1024*1024)throw new Error('The 3D model retrieval budget was reached; retry after five minutes.');
      budget.requests++;gitlabAssetBudgets.set(key,budget);if(gitlabAssetBudgets.size>128)gitlabAssetBudgets.delete(gitlabAssetBudgets.keys().next().value);
      const result=await api.response(`${api.endpoint(repository)}/files/${encodeURIComponent(file)}/raw?ref=${encodeURIComponent(ref)}`,8*1024*1024);
      if(!result)throw new Error('GitLab model was not found at this revision.');
      if(budget.bytes+result.bytes.length>32*1024*1024)throw new Error('Revision model retrieval budget exceeded.');budget.bytes+=result.bytes.length;
      let binary='';for(let i=0;i<result.bytes.length;i+=8192)binary+=String.fromCharCode(...result.bytes.subarray(i,i+8192));
      return {base64:btoa(binary),mediaType:file.toLowerCase().endsWith('.glb')?'model/gltf-binary':'model/vrml'};
    }
    case 'open-project-overview':
    case 'open-viewer-window': {
      if(!api.validRepository(repository)||!KiCadBrowserData.validRef(ref)||!KiCadGitHub.filePath(file))throw new Error('Invalid GitLab viewer location.');
      const project=message.type==='open-project-overview';
      if(!project&&!KiCadBrowserData.validPath(file))throw new Error('Invalid drawing file.');
      if(message.pairedFile!==undefined&&(!KiCadBrowserData.validPath(message.pairedFile)||/\.kicad_pcb$/i.test(message.pairedFile)===/\.kicad_pcb$/i.test(file)))throw new Error('Paired drawing must be the opposite file type.');
      const query=new URLSearchParams({provider:'gitlab',host,repository,...(project?{ref}:{head:ref}),file,...(message.pairedFile?{pairedFile:message.pairedFile}:{})});
      const window=await chrome.windows.create({url:chrome.runtime.getURL(project?'project-viewer.html':'browser-viewer.html')+'?'+query,type:'popup',state:'maximized'});
      return {windowId:window?.id??null};
    }
    case 'comment-list': return commentList({...message,provider:'gitlab',host});
    case 'comment-save': {
      const anchor=KiCadReviewComments.normalizeScope({...message.comment?.anchor,provider:'gitlab'});
      if(anchor.host!==host)throw new Error('Review note belongs to another GitLab host.');
      return commentSave({...message.comment,anchor:{...message.comment.anchor,provider:'gitlab',host}},message.expectedUpdatedAt);
    }
    case 'comment-delete': return commentDelete({...message,provider:'gitlab',host},message.id);
    case 'comment-store-status': return {connected:false,provider:'gitlab',localOnly:true};
    case 'github-auth-status': return auth.authStatus(host);
    case 'comment-mention-users': return mentionUsers({...message,provider:'gitlab',host});
    case 'comment-policy-status': return auth.commentPolicyStatus(host,repository);
    case 'comment-publish':
    case 'github-publish-comment': return auth.publish({...message,host,destination:message.discussion?'discussion':message.destination});
    case 'comment-remote-list':
    case 'github-annotations': return gitlabAnnotations(api,{...message,host});
    case 'open-options': await chrome.runtime.openOptionsPage();return {opened:true};
    default: throw new Error('Unsupported GitLab operation.');
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const customHostSender=sender?.id===chrome.runtime.id&&typeof sender.url==='string'&&sender.url.startsWith('https://')&&message?.provider==='gitlab';
  if (!(senderAllowed(sender) || optionsSender(sender)||customHostSender) || !message || typeof message !== "object") return false;
  (async () => {
    if (message.provider !== undefined && !['github','gitlab'].includes(message.provider)) throw new Error('Unsupported repository provider.');
    let senderOrigin;try{senderOrigin=new URL(sender.url).origin;}catch{}
    if(senderOrigin?.startsWith('https://')&&senderOrigin!=='https://github.com'&&message.provider!=='gitlab')throw new Error('GitLab pages must specify the GitLab provider.');
    if(senderOrigin==='https://github.com'&&message.provider==='gitlab')throw new Error('Repository provider does not match the host page.');
    if(message.provider==='gitlab'){const host=message.host||'https://gitlab.com';if(senderOrigin?.startsWith('https://')&&senderOrigin!==host)throw new Error('GitLab host does not match the sender.');return gitlabDispatch(message,sender);}
    if(message.comment?.anchor?.provider==='gitlab')throw new Error('GitLab annotations must use the GitLab provider.');
    switch (message.type) {
      case "github-auth-status":
        if (!viewerSender(sender) && !optionsSender(sender)) throw new Error("Only extension pages can inspect GitHub settings.");
        return KiCadGitHubReviewApi.tokenStatus();
      case 'github-access-test': {
        if (!optionsSender(sender)) throw new Error('Only extension options can test account access.');
        if (!validRepository(message.repository)) throw new Error('Enter owner/repository or its GitHub URL.');
        if (!(await KiCadGitHubReviewApi.tokenStatus()).configured) throw new Error('The extension session is signed out or expired. Sign in again before testing access.');
        const user = await githubJson('https://api.github.com/user');
        const repository = await githubJson(`https://api.github.com/repos/${message.repository}`);
        if (typeof user.login !== 'string' || !validRepository(repository.full_name)) throw new Error('GitHub returned an unexpected account or repository response.');
        return { login: user.login, repository: repository.full_name, private: Boolean(repository.private),
          defaultBranch: repository.default_branch, readable: repository.permissions?.pull !== false };
      }
      case "github-auth-set":
        if (!optionsSender(sender)) throw new Error("Only extension options can set a GitHub token.");
        return KiCadGitHubReviewApi.setToken(message.token);
      case "github-auth-clear":
        if (!optionsSender(sender)) throw new Error("Only extension options can clear a GitHub token.");
        return KiCadGitHubReviewApi.clearToken();
      case "github-auth-reset":
        if (!optionsSender(sender)) throw new Error("Only extension options can reset GitHub authentication.");
        return KiCadGitHubReviewApi.resetAuth();
      case "github-device-status":
        if (!optionsSender(sender)) throw new Error("Only extension options can inspect GitHub sign-in.");
        return KiCadGitHubReviewApi.deviceStatus();
      case "github-device-start":
        if (!optionsSender(sender)) throw new Error("Only extension options can start GitHub sign-in.");
        return KiCadGitHubReviewApi.startDevice(message.clientId, message.scope);
      case "github-device-poll":
        if (!optionsSender(sender)) throw new Error("Only extension options can poll GitHub sign-in.");
        return KiCadGitHubReviewApi.pollDevice();
      case "github-device-cancel":
        if (!optionsSender(sender)) throw new Error("Only extension options can cancel GitHub sign-in.");
        return KiCadGitHubReviewApi.cancelDevice();
      case "github-thread-read":
        if (!viewerSender(sender)) throw new Error("Only extension viewers can read GitHub threads.");
        return KiCadGitHubReviewApi.readThread(message);
      case "github-discussion-categories":
        if (!viewerSender(sender)) throw new Error("Only extension viewers can retrieve discussion categories.");
        return KiCadGitHubReviewApi.categories(message.repository);
      case "github-recover-publication":
        if (!viewerSender(sender)) throw new Error("Only extension viewers can recover review publication links.");
        return KiCadGitHubReviewApi.recoverPublication(message, githubAnnotations);
      case "github-publish-comment":
        if (!viewerSender(sender)) throw new Error("Only extension viewers can publish review comments.");
        return KiCadGitHubReviewApi.publish(message);
      case "comment-mention-users":
        if (!viewerSender(sender)) throw new Error("Only extension viewers can search mention accounts.");
        return mentionUsers(message);
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
        return githubFiles(message.repository, message.number, message.expectedFiles, message.expectedHead, message.expectedBase);
      default: throw new Error("Unsupported extension request.");
    }
  })().then(async (result) => {
               if (message.provider !== 'gitlab' && /^github-(auth|device)-/.test(message.type)) {
                 await updateGitHubBadge().catch(() => {});
                 if (result?.state === 'pending') scheduleDeviceCheck(result.retryAfterMs);
                 if (['github-auth-clear', 'github-auth-reset', 'github-device-cancel'].includes(message.type)) {
                   if (devicePollTimer !== null) clearTimeout(devicePollTimer);
                   devicePollTimer = null;
                 }
               }
               sendResponse({ ok: true, result });
             },
             (error) => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
});

if (typeof module === "object" && module.exports) {
  module.exports = { githubFile, githubPull, githubFiles, githubDirectory, drawingFiles, openViewerWindow,
    githubAsset, designChanges, senderAllowed, viewerSender, optionsSender, openFromAction,
    commentList, commentSave, commentDelete, openCommentDraft, claimCommentDraft,
    acknowledgeCommentDraft, githubAnnotations, revisionBranches,revisionCommits,revisionResolve };
}
