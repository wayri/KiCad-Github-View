"use strict";

// Privileged background-only GitLab credentials and mutations. No secret is persisted in plaintext.
const KiCadGitLabReviewApi = (() => {
  const VAULT = "gitlab-review-vault-v1", CLIENTS = "gitlab-oauth-public-clients-v1";
  const LIMIT = 8 * 60 * 60 * 1000;
  const externalVault = typeof KiCadCredentialVault !== "undefined" && KiCadCredentialVault.supported;
  const sessionVault = host => externalVault ? KiCadCredentialVault.forProvider(`gitlab:${host}`) : null;
  const keys = new Map(), epochs = new Map(), pending = new Map(), locks = new Map(), uploadLocks=new Map();
  let initialized = false, queue = Promise.resolve();
  const fail = (text, definitive = false) => Object.assign(new Error(text), { definitive });
  function validateHost(value = "https://gitlab.com") {
    if (typeof value !== "string" || value.length > 300) throw fail("Invalid GitLab HTTPS origin.", true);
    let url; try { url = new URL(value); } catch { throw fail("Invalid GitLab HTTPS origin.", true); }
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
        url.pathname !== "/" || !url.hostname || url.hostname.endsWith(".")) throw fail("Use an exact GitLab HTTPS origin without a path or credentials.", true);
    return url.origin;
  }
  function operation(work) {
    if (!initialized) {
      initialized = true;
      queue = queue.then(async () => {
        await chrome.storage.session.remove([...(!externalVault ? [VAULT] : []), "gitlab-review-token", "gitlab-device-pending"]);
        await chrome.storage.local.remove([VAULT, "gitlab-review-token", "gitlab-device-pending"]);
        if (externalVault) {
          const all = await records();
          for (const [host, record] of Object.entries(all)) {
            let usable = false;
            try { usable = validateHost(host) === host && record?.version === 2 && await sessionVault(host).hasKey(); } catch {}
            if (!usable) delete all[host];
          }
          if (Object.keys(all).length) await chrome.storage.session.set({ [VAULT]: all });
          else await chrome.storage.session.remove(VAULT);
        }
      });
    }
    const result = queue.then(work); queue = result.catch(() => {}); return result;
  }
  const epoch = host => epochs.get(host) || 0;
  function advance(host) { epochs.set(host, epoch(host) + 1); pending.delete(host); return epoch(host); }
  async function records() { return (await chrome.storage.session.get(VAULT))[VAULT] || {}; }
  async function purge(host) {
    keys.delete(host); const all = await records(); delete all[host];
    if (Object.keys(all).length) await chrome.storage.session.set({ [VAULT]: all });
    else await chrome.storage.session.remove(VAULT);
    if (externalVault) await sessionVault(host).clear();
  }
  async function credential(host) {
    await globalThis.KiCadManagedPolicy?.assertNetwork();
    const record = (await records())[host]; if (!record) return null;
    try {
      if (externalVault) return { token: await sessionVault(host).decrypt(record), expiresAt: record.expiresAt };
      if (!keys.has(host) || record.version !== 1 || !Number.isFinite(record.expiresAt) || record.expiresAt <= Date.now() ||
          !Array.isArray(record.iv) || record.iv.length !== 12 || !Array.isArray(record.ciphertext) || record.ciphertext.length > 2048 ||
          ![...record.iv, ...record.ciphertext].every(n => Number.isInteger(n) && n >= 0 && n <= 255)) throw fail("locked");
      const bytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(record.iv),
        additionalData: new TextEncoder().encode(`${host}:gitlab-token:v1:${record.expiresAt}`) }, keys.get(host), new Uint8Array(record.ciphertext));
      const token = new TextDecoder().decode(bytes); new Uint8Array(bytes).fill(0);
      return { token, expiresAt: record.expiresAt };
    } catch { await purge(host).catch(() => {}); return null; }
  }
  function validToken(token) {
    if (typeof token !== "string" || token.length < 20 || token.length > 1000 || /[^\x21-\x7e]/.test(token)) throw fail("Enter a valid GitLab token without spaces.", true);
  }
  async function setToken(host, token, lifetime = LIMIT, expectedEpoch) {
    await globalThis.KiCadManagedPolicy?.assertNetwork();
    host = validateHost(host); validToken(token);
    if (expectedEpoch === undefined) expectedEpoch = advance(host);
    return operation(async () => {
      if (epoch(host) !== expectedEpoch) throw fail("GitLab sign-in was cancelled.", true);
      if (chrome.storage.session.setAccessLevel) await chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
      const expiresAt = Date.now() + Math.min(LIMIT, lifetime > 0 && Number.isFinite(lifetime) ? lifetime : LIMIT);
      let record;
      if (externalVault) record = await sessionVault(host).encrypt(token, expiresAt);
      else {
        const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
        const iv = crypto.getRandomValues(new Uint8Array(12)), bytes = new TextEncoder().encode(token); let cipher;
        try { cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(`${host}:gitlab-token:v1:${expiresAt}`) }, key, bytes); }
        finally { bytes.fill(0); }
        keys.set(host, key);
        record = { version: 1, iv: Array.from(iv), ciphertext: Array.from(new Uint8Array(cipher)), expiresAt };
      }
      if (epoch(host) !== expectedEpoch) { await purge(host); throw fail("GitLab sign-in was cancelled.", true); }
      const all = await records(); all[host] = record;
      await chrome.storage.session.set({ [VAULT]: all });
      if (epoch(host) !== expectedEpoch) { await purge(host); throw fail("GitLab sign-in was cancelled.", true); }
      return { configured: true, expiresAt, host };
    });
  }
  async function clearToken(host) { host = validateHost(host); advance(host); return operation(async () => { await purge(host); return { configured: false, host }; }); }
  async function resetAuth(host) {
    host = validateHost(host); advance(host);
    return operation(async () => {
      await purge(host);
      const clients = (await chrome.storage.local.get(CLIENTS))[CLIENTS] || {}; delete clients[host];
      await chrome.storage.local.set({ [CLIENTS]: clients }); return { configured: false, host };
    });
  }
  async function authStatus(host) {
    host = validateHost(host); return operation(async () => { const value = await credential(host), clients = (await chrome.storage.local.get(CLIENTS))[CLIENTS] || {};
      return { host, configured: !!value, ...(value ? { expiresAt: value.expiresAt } : {}), clientId: clients[host] || "", oauthSupported: !!chrome.identity?.launchWebAuthFlow,
        redirectUri: chrome.identity?.getRedirectURL ? chrome.identity.getRedirectURL("gitlab") : "" }; });
  }
  async function authorizationHeaders(host) {
    host = validateHost(host); return operation(async () => { const value = await credential(host); return value ? { Authorization: `Bearer ${value.token}` } : {}; });
  }
  async function setClientId(host, clientId) {
    host = validateHost(host);
    if (typeof clientId !== "string" || !/^[A-Za-z0-9_-]{10,200}$/.test(clientId)) throw fail("Enter the registered GitLab application's public client ID.", true);
    advance(host);
    await operation(async () => { const clients = (await chrome.storage.local.get(CLIENTS))[CLIENTS] || {}; clients[host] = clientId; await chrome.storage.local.set({ [CLIENTS]: clients }); });
    return authStatus(host);
  }
  const base64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  async function responseText(response,limit){
    if(Number(response.headers.get('content-length'))>limit)throw fail('GitLab response exceeds the size limit.');
    if(!response.body?.getReader)throw fail('GitLab response cannot be read safely.');
    const reader=response.body.getReader(),chunks=[];let total=0;
    try{for(;;){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>limit){reader.cancel().catch(()=>{});throw fail('GitLab response exceeds the size limit.');}chunks.push(value);}}
    finally{reader.releaseLock();}
    const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return new TextDecoder().decode(bytes);
  }
  async function request(host, path, { method = "GET", body, token, expectedEpoch, allow404 = false, forkResponse = false } = {}) {
    host = validateHost(host);
    if (typeof path !== "string" || !/^\/(?:api\/v4\/|oauth\/token(?:$|\?))/.test(path) || path.includes("\\") || new URL(host + path).origin !== host) throw fail("Invalid GitLab API destination.", true);
    if (expectedEpoch !== undefined && epoch(host) !== expectedEpoch) throw fail("GitLab account changed or signed out.", true);
    const headers = { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    const multipart=typeof FormData==='function'&&body instanceof FormData;
    if (body&&!multipart) headers["Content-Type"] = body instanceof URLSearchParams ? "application/x-www-form-urlencoded" : "application/json";
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(host + path, { method, headers, body: body ? multipart?body:body instanceof URLSearchParams ? body.toString() : JSON.stringify(body) : undefined,
        credentials: "omit", redirect: "error", cache: "no-store", signal: controller.signal });
      if (expectedEpoch !== undefined && epoch(host) !== expectedEpoch) throw fail("GitLab account changed or signed out.");
      if ((allow404 || forkResponse) && response.status === 404) return forkResponse?{status:404,data:null}:null;
      if (!response.ok) {
        if (response.status === 401 && token && expectedEpoch === epoch(host)) await clearToken(host);
        throw fail(`GitLab returned HTTP ${response.status}. Check repository access and token scopes.`, response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status));
      }
      const text = await responseText(response,multipart?65536:1024*1024);
      if(expectedEpoch!==undefined&&epoch(host)!==expectedEpoch)throw fail('GitLab account changed or signed out.');
      try { const data=JSON.parse(text);return forkResponse?{status:response.status,data}:data; } catch { throw fail("GitLab returned an invalid API response."); }
    } finally { clearTimeout(timer);controller.abort(); }
  }
  async function startOAuth(host) {
    await globalThis.KiCadManagedPolicy?.assertNetwork();
    host = validateHost(host); const status = await authStatus(host);
    if (!status.clientId) throw fail("Register a non-confidential GitLab OAuth application with the extension redirect URI, then configure its public client ID.", true);
    if (!chrome.identity?.launchWebAuthFlow || !chrome.identity?.getRedirectURL) throw fail("OAuth login is unavailable in this browser; use a repository-limited GitLab token.", true);
    const current = advance(host), redirectUri = chrome.identity.getRedirectURL("gitlab"), verifier = base64url(crypto.getRandomValues(new Uint8Array(32))), state = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = base64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    const expected = new URL(redirectUri);
    if (expected.protocol !== "https:" || expected.username || expected.password || expected.search || expected.hash) throw fail("The browser returned an unsupported OAuth redirect URI.", true);
    const url = new URL(host + "/oauth/authorize");
    url.search = new URLSearchParams({ client_id: status.clientId, redirect_uri: redirectUri, response_type: "code", state, scope: "api", code_challenge: challenge, code_challenge_method: "S256" }).toString();
    pending.set(host, { current, expiresAt: Date.now() + 10 * 60000 });
    try {
      const returned = await chrome.identity.launchWebAuthFlow({ url: url.href, interactive: true });
      const callback = new URL(returned);
      if (epoch(host) !== current || !pending.has(host) || pending.get(host).expiresAt <= Date.now()) throw fail("GitLab sign-in was cancelled or expired.", true);
      if (callback.origin !== expected.origin || callback.username || callback.password || callback.pathname !== expected.pathname || callback.hash || callback.searchParams.getAll("state").length !== 1 || callback.searchParams.get("state") !== state || callback.searchParams.getAll("code").length !== 1 || callback.searchParams.has("error")) throw fail("GitLab returned an invalid OAuth callback.", true);
      const code = callback.searchParams.get("code"); if (!code || code.length > 1000) throw fail("GitLab did not return an authorization code.", true);
      const result = await request(host, "/oauth/token", { method: "POST", expectedEpoch: current, body: new URLSearchParams({ client_id: status.clientId, code, grant_type: "authorization_code", redirect_uri: redirectUri, code_verifier: verifier }) });
      if (!Number.isFinite(result.expires_in) || result.expires_in <= 0 || result.token_type?.toLowerCase() !== "bearer" || typeof result.scope !== "string" || !result.scope.split(/\s+/).includes("api")) throw fail("GitLab did not grant the required API access.", true);
      // Refresh tokens are deliberately discarded. Re-authorize when the short session expires.
      return await setToken(host, result.access_token, result.expires_in * 1000, current);
    } catch (error) { if (error?.definitive) throw error; throw fail("GitLab sign-in failed or was cancelled. Check the registered redirect URI and try again.", true); }
    finally { if (pending.get(host)?.current === current) pending.delete(host); }
  }
  function repositoryPath(value) {
    if (typeof value !== "string" || value.length > 500 || !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/.test(value) || value.split("/").some(p => p === "." || p === "..")) throw fail("Invalid GitLab project path.", true);
    return value;
  }
  function validatePolicy(value) {
    if (!value || typeof value !== "object" || Array.isArray(value) || value.schemaVersion !== 1 ||
        Object.keys(value).some(key => !["schemaVersion", "commenting"].includes(key)) ||
        !value.commenting || typeof value.commenting !== "object" || Array.isArray(value.commenting) ||
        Object.keys(value.commenting).some(key => !["mode", "allowlist"].includes(key)) ||
        !["all", "allowlist", "contributors", "collaborators"].includes(value.commenting.mode)) throw fail("GitLab repository policy is malformed.", true);
    const list = value.commenting.allowlist ?? [];
    if (!Array.isArray(list) || list.length > 100 || list.some(login => typeof login !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(login))) throw fail("GitLab repository policy allowlist is malformed.", true);
    return { mode: value.commenting.mode, allowlist: [...new Set(list.map(login => login.toLowerCase()))] };
  }
  async function commentPolicyStatus(host, repository, expectedProjectId=null) {
    host = validateHost(host); repository = repositoryPath(repository);
    const current = epoch(host), headers = await authorizationHeaders(host), token = headers.Authorization?.slice(7);
    if (!token) return { allowed: false, reason: "Sign in to this GitLab host before posting." };
    let path = `/api/v4/projects/${encodeURIComponent(repository)}`;const options = { token, expectedEpoch: current };
    const project = await request(host, path, options);
    if (project.path_with_namespace !== repository || !Number.isSafeInteger(project.id) || project.id <= 0 ||
        typeof project.default_branch !== "string" || !project.default_branch || project.default_branch.length > 200) throw fail("GitLab project policy identity could not be verified.", true);
    if(expectedProjectId!==null&&project.id!==expectedProjectId)throw fail('GitLab project changed during publication preflight.',true);
    path=`/api/v4/projects/${project.id}`;
    const user = await request(host, "/api/v4/user", options);
    if (!Number.isSafeInteger(user.id) || user.id <= 0 || typeof user.username !== "string" || !/^[A-Za-z0-9_.-]{1,100}$/.test(user.username)) throw fail("GitLab account identity could not be verified.", true);
    let policy = { mode: "all", allowlist: [] }, source = "default";
    const file = await request(host, `${path}/repository/files/.kicad-review-policy.json?ref=${encodeURIComponent(project.default_branch)}`, { ...options, allow404: true });
    if (file === null) {
      const listing = await request(host, `${path}/repository/tree?ref=${encodeURIComponent(project.default_branch)}&per_page=100&page=1`, options);
      if (!Array.isArray(listing) || listing.length >= 100 || listing.some(item => !item || typeof item.name !== "string" || item.path !== item.name || item.name === ".kicad-review-policy.json")) throw fail("GitLab repository policy absence could not be verified; publication is blocked.", true);
    } else {
      if (file.encoding !== "base64" || typeof file.content !== "string" || file.content.length > 48 * 1024 || file.file_path !== ".kicad-review-policy.json") throw fail("GitLab repository policy is malformed.", true);
      let value; try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(file.content.replace(/\s/g, "")), c => c.charCodeAt(0)))); }
      catch { throw fail("GitLab repository policy is malformed.", true); }
      policy = validatePolicy(value); source = "repository";
    }
    const result = { host, repository, login: user.username, ref: project.default_branch, mode: policy.mode, source, allowed: false, reason: "Repository policy denies this account." };
    if (policy.mode === "all" || policy.allowlist.includes(user.username.toLowerCase())) { result.allowed = true; result.reason = "Repository policy allows this account."; return result; }
    const member = await request(host, `${path}/members/all/${user.id}`, { ...options, allow404: true });
    if (member && (member.id !== user.id || !Number.isSafeInteger(member.access_level))) throw fail("GitLab membership could not be verified.", true);
    if (member?.access_level >= 50 || policy.mode === "collaborators" && member?.access_level >= 10) { result.allowed = true; result.reason = "GitLab confirms project membership."; return result; }
    if (policy.mode === "contributors") {
      // Contributor commit emails are spoofable and cannot establish account
      // identity. Do not use them as authorization evidence.
      result.reason = "GitLab contributor identities cannot be securely verified. Use the collaborators policy or an explicit account allowlist.";
    }
    return result;
  }
  function captureBytes(capture){
    let bytes;try{bytes=Uint8Array.from(atob(capture.dataUrl.split(',')[1]),c=>c.charCodeAt(0));}catch{throw fail('The screenshot PNG is invalid. Capture the area again.',true);}
    const signature=[137,80,78,71,13,10,26,10];
    if(bytes.length<33||bytes.length>196608||signature.some((v,i)=>bytes[i]!==v)||bytes[8]!==0||bytes[9]!==0||bytes[10]!==0||bytes[11]!==13||String.fromCharCode(...bytes.subarray(12,16))!=='IHDR')throw fail('The screenshot PNG is invalid or too large. Capture a smaller area again.',true);
    const header=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    if(header.getUint32(16)!==capture.width||header.getUint32(20)!==capture.height)throw fail('Screenshot dimensions do not match the PNG. Capture the area again.',true);
    return bytes;
  }
  function checkedAttachment(value,host,repository,projectId,capture,hash){
    const attachment=KiCadReviewComments.validateAttachment(value);
    if(attachment.provider!=='gitlab'||attachment.host!==host||attachment.repository!==repository||attachment.projectId!==projectId||capture&&(attachment.width!==capture.width||attachment.height!==capture.height)||hash&&!attachment.url.endsWith(`/kicad-review-${hash.slice(0,20)}.png`))throw fail('GitLab screenshot attachment does not match this project or capture.');
    return attachment;
  }
  async function uploadCapture(note,host,repository,projectId,token,current){
    const bytes=captureBytes(note.capture),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    const key='gitlab-attachment:'+JSON.stringify([host,repository,note.id,hash]);
    if(uploadLocks.has(key))return checkedAttachment(await uploadLocks.get(key),host,repository,projectId,note.capture,hash);
    const work=uploadCaptureLocked(note,host,repository,projectId,token,current,bytes,hash,key);uploadLocks.set(key,work);
    try{return await work;}finally{uploadLocks.delete(key);}
  }
  async function uploadCaptureLocked(note,host,repository,projectId,token,current,bytes,hash,key){
    const saved=(await chrome.storage.local.get(key))[key];
    if(saved?.status==='done')return checkedAttachment(saved.attachment,host,repository,projectId,note.capture,hash);
    if(saved?.status==='pending')throw fail('Previous screenshot upload has an unconfirmed outcome. Inspect GitLab uploads before posting again.');
    if(typeof FormData!=='function'||typeof Blob!=='function')throw fail('Screenshot upload is unavailable in this browser. Remove the image to publish text only.',true);
    const name=`kicad-review-${hash.slice(0,20)}.png`,body=new FormData();body.append('file',new Blob([bytes],{type:'image/png'}),name);
    if(epoch(host)!==current)throw fail('GitLab account changed or signed out.',true);
    await chrome.storage.local.set({[key]:{status:'pending',startedAt:new Date().toISOString()}});
    try{
      const result=await request(host,`/api/v4/projects/${projectId}/uploads`,{method:'POST',body,token,expectedEpoch:current});
      // Do not use server-supplied Markdown, external URLs or signed query strings.
      const relative=result.full_path||`/${repository}${result.url}`;
      if(typeof relative!=='string'||!relative.startsWith('/')||relative.startsWith('//'))throw fail('GitLab did not confirm a project-bound screenshot upload.');
      const attachment=checkedAttachment({provider:'gitlab',host,repository,projectId,url:host+relative,mime:'image/png',width:note.capture.width,height:note.capture.height},host,repository,projectId,note.capture,hash);
      await chrome.storage.local.set({[key]:{status:'done',attachment}});return attachment;
    }catch(error){if(error.definitive)await chrome.storage.local.remove(key);throw error;}
  }
  async function publish(message) {
    await globalThis.KiCadManagedPolicy?.assertWrites();
    const host = validateHost(message.host), note = KiCadReviewComments.validateComment(message.comment);
    if (note.anchor.provider !== "gitlab" || (note.anchor.host && validateHost(note.anchor.host) !== host)) throw fail("This note belongs to another Git provider or host.", true);
    const repository = repositoryPath(note.anchor.repository), destination = message.destination;
    if (!["new-issue", "issue", "discussion"].includes(destination)) throw fail("GitLab supports issues and discussions within existing issues.", true);
    const number = message.number;
    if (destination !== "new-issue" && (!Number.isSafeInteger(number) || number <= 0) || destination === "new-issue" && number !== undefined) throw fail("Choose a valid existing GitLab issue number.", true);
    if (note.threadType && note.threadType !== (destination === "discussion" ? "discussion" : "issue")) throw fail("Destination does not match this note's type.", true);
    const title = message.title || `KiCad review: ${note.anchor.file}`;
    if (typeof title !== "string" || !title.trim() || title.length > 200) throw fail("Invalid GitLab issue title.", true);
    const key = "gitlab-publish:" + JSON.stringify([host, repository, destination, number || 0, note.anchor.ref, note.anchor.file, note.id]);
    if (locks.has(key)) return locks.get(key);
    const work = publishLocked({ host, note, repository, destination, number, title: title.trim() }, key); locks.set(key, work);
    try { return await work; } finally { locks.delete(key); }
  }
  async function publishLocked(args, key) {
    const { host, note, repository, destination, number, title } = args, current = epoch(host);
    const saved = (await chrome.storage.local.get(key))[key];
    if (saved?.status === "done") {
      const remote = saved.remoteRef;
      if (remote?.provider !== "gitlab" || remote.host !== host || remote.repository !== repository ||
          !Number.isSafeInteger(remote.number) || remote.number <= 0 || typeof remote.url !== "string" ||
          !remote.url.startsWith(`${host}/${repository}/-/issues/${remote.number}`)) throw fail("Stored GitLab publication metadata is invalid.", true);
      const attachments=saved.attachments?.map(value=>KiCadReviewComments.validateAttachment(value));
      if(attachments?.some(a=>a.provider!=='gitlab'||a.host!==host||a.repository!==repository))throw fail('Stored GitLab screenshot metadata is invalid.',true);
      return { remoteRef: remote,...(attachments?{attachments}:{}), duplicate: true };
    }
    if (saved?.status === "pending") throw fail("Previous publication has an unconfirmed outcome. Inspect GitLab before posting again.");
    const headers = await authorizationHeaders(host), token = headers.Authorization?.slice(7);
    if (!token) throw fail("Sign in to this GitLab host before posting.", true);
    const path = `/api/v4/projects/${encodeURIComponent(repository)}`;
    const project = await request(host, path, { token, expectedEpoch: current });
    if (project.path_with_namespace !== repository || !Number.isSafeInteger(project.id) || project.id <= 0) throw fail("GitLab returned another project identity.", true);
    const policy = await commentPolicyStatus(host, repository,project.id);
    if (!policy.allowed) throw fail(`Repository comment policy blocked publication: ${policy.reason}`, true);
    await KiCadReviewComments.reservePublication(chrome.storage.local, JSON.stringify(['gitlab',host]), Date.now());
    if((note.capture||note.attachments?.length)&&project.visibility!=='public'&&project.enforce_auth_checks_on_uploads!==true)throw fail('GitLab image uploads can be public by URL. For a private/internal project, enable Require authentication to view media files in GitLab project settings, or remove the screenshot to post text only.',true);
    const attachments=note.capture?[await uploadCapture(note,host,repository,project.id,token,current)]:note.attachments?.map(value=>checkedAttachment(value,host,repository,project.id));
    const mutationPath=`/api/v4/projects/${project.id}`;
    const body = KiCadReviewComments.toMarkdown(attachments?.length?{...note,attachments}:note);
    if (epoch(host) !== current) throw fail("GitLab account changed or signed out.", true);
    await chrome.storage.local.set({ [key]: { status: "pending", startedAt: new Date().toISOString(),...(attachments?.length?{attachments}:{}) } });
    try {
      const endpoint = destination === "new-issue" ? `${mutationPath}/issues` : `${mutationPath}/issues/${number}/${destination === "discussion" ? "discussions" : "notes"}`;
      const result = await request(host, endpoint, { method: "POST", token, expectedEpoch: current, body: destination === "new-issue" ? { title, description: body } : { body } });
      const issue = destination === "new-issue" ? result.iid : number;
      const noteId = destination === "discussion" ? result.notes?.[0]?.id : result.id;
      if (!Number.isSafeInteger(issue) || issue <= 0 || destination !== "new-issue" && (!Number.isSafeInteger(noteId) || noteId <= 0)) throw fail("GitLab did not confirm publication.");
      const remoteRef = { provider: "gitlab", host, repository, kind: destination === "discussion" ? "discussion" : "issue", number: issue,
        url: `${host}/${repository}/-/issues/${issue}${destination === "new-issue" ? "" : `#note_${noteId}`}`, publishedAt: new Date().toISOString() };
      await chrome.storage.local.set({ [key]: { status: "done", remoteRef,...(attachments?.length?{attachments}:{}) } }); return { remoteRef,...(attachments?.length?{attachments}:{}) };
    } catch (error) { if (error.definitive) await chrome.storage.local.remove(key); throw error; }
  }
  // Issue discussions include ordinary notes and DiscussionNotes omitted by the Notes API.
  async function readThread({host,repository,ref,file,kind='issue',number,provider='gitlab',includeCapabilities=false}={}) {
    host=validateHost(host);repository=repositoryPath(repository);
    KiCadReviewComments.normalizeScope({provider,host,repository,ref,file});
    if(provider!=='gitlab'||!['issue','discussion'].includes(kind)||!Number.isSafeInteger(number)||number<1)throw fail('Invalid GitLab thread request.',true);
    const current=epoch(host),headers=await authorizationHeaders(host),token=headers.Authorization?.slice(7),options={token,expectedEpoch:current};
    if(epoch(host)!==current)throw fail('GitLab account changed or signed out.',true);
    const warnings=[],comments=[],seen=new Set();let bytes=0,stopped=false;
    const warn=text=>{if(!warnings.includes(text))warnings.push(text);};
    const text=value=>{
      if(value===null||value===undefined)return '';
      if(typeof value!=='string')throw fail('GitLab returned invalid thread text.',true);
      const encoded=new TextEncoder().encode(value),available=Math.min(65536,Math.max(0,1024*1024-bytes));
      if(encoded.length>available)warn('Thread text was truncated at 64 KiB per entry or 1 MiB total.');
      const result=new TextDecoder().decode(encoded.slice(0,available),{stream:true});bytes+=new TextEncoder().encode(result).length;
      if(bytes>=1024*1024-3)stopped=true;return result;
    };
    const timestamp=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(value)&&Number.isFinite(Date.parse(value));
    const project=await request(host,`/api/v4/projects/${encodeURIComponent(repository)}`,options);
    if(project?.path_with_namespace!==repository||!Number.isSafeInteger(project.id)||project.id<1)throw fail('GitLab returned another project identity.',true);
    const endpoint=`/api/v4/projects/${project.id}/issues/${number}`,url=`${host}/${repository}/-/issues/${number}`;
    const record=(value,root=false,replyTo=null,discussionId=null)=>{
      const author=value?.author;
      if(!value||!Number.isSafeInteger(value.id)||value.id<1||!timestamp(value.created_at)||!timestamp(value.updated_at)||author!==null&&!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(author?.username||'')||typeof (root?value.description:value.body)!=='string'&&(root?value.description:value.body)!==null){
        if(root)throw fail('GitLab returned invalid thread provenance.',true);
        warn('Some thread comments had invalid provenance and were omitted.');return null;
      }
      const source=root?value.description:value.body,body=text(source),bodyTruncated=body!==(source||'');
      return {id:String(value.id),author:author?.username||null,createdAt:value.created_at,updatedAt:value.updated_at,body,bodyTruncated,url:root?url:`${url}#note_${value.id}`,replyTo,canEdit:false,canReply:!!discussionId,...(discussionId?{discussionId}:{})};
    };
    const issue=await request(host,endpoint,options);
    if(issue?.iid!==number||issue.project_id!==project.id||!['opened','closed'].includes(issue.state)||typeof issue.title!=='string')throw fail('GitLab returned an invalid Issue identity.',true);
    const thread={provider:'gitlab',host,repository,projectId:project.id,kind:'issue',number,title:issue.title.slice(0,1024),state:issue.state==='opened'?'open':'closed',...record(issue,true)};
    for(let page=1;page<=8&&!stopped;page++){
      const groups=await request(host,`${endpoint}/discussions?per_page=100&page=${page}`,options);
      if(!Array.isArray(groups)||groups.length>100)throw fail('GitLab returned invalid issue discussions.',true);
      for(const group of groups){
        if(!group||typeof group.individual_note!=='boolean'||typeof group.id!=='string'||!/^[A-Za-z0-9_-]{1,200}$/.test(group.id)||!Array.isArray(group.notes)||group.notes.length>1000){warn('Some discussion groups were invalid and omitted.');continue;}
        let parent=null;
        for(const note of group.notes){
          if(note?.system===true)continue;
          if(comments.length>=200||stopped){stopped=true;break;}
          const entry=record(note,false,group.individual_note?null:parent,group.individual_note?null:group.id);
          if(entry){entry.replyDiscussionId=group.id;entry.canReply=true;if(!parent)parent=entry.id;if(!seen.has(entry.id)){seen.add(entry.id);comments.push(entry);}}
        }
        if(stopped)break;
      }
      if(groups.length<100)break;
      if(page===8)stopped=true;
    }
    if(stopped)warn('Thread readback was truncated at 200 comments, 10 requests or the text limit. Open GitLab for the complete conversation.');
    if(epoch(host)!==current)throw fail('GitLab account changed or signed out.',true);
    let allowed=false,login=null;
    if(includeCapabilities&&token){try{const policy=await commentPolicyStatus(host,repository,project.id);allowed=policy.allowed===true;login=policy.login||null;}catch{warn('Chat permissions could not be verified.');}}
    for(const comment of comments)comment.canEdit=allowed&&!!login&&comment.author?.toLowerCase()===login.toLowerCase()&&!comment.bodyTruncated&&!comment.body.includes('kicad-review:');
    if(epoch(host)!==current)throw fail('GitLab account changed or signed out.',true);
    let canClose=false,canReopen=false;
    if(allowed&&includeCapabilities){try{await globalThis.KiCadManagedPolicy?.assertWrites();const fresh=await threadStateSnapshot(host,repository,number,options);if(fresh.allowed&&fresh.issue.id===issue.id&&fresh.issue.updated_at===thread.updatedAt&&fresh.issue.state===issue.state){canClose=thread.state==='open';canReopen=thread.state==='closed';}}catch{warn('Conversation state permissions could not be verified.');}}
    if(epoch(host)!==current)throw fail('GitLab account changed or signed out.',true);
    return {...thread,comments,warnings,capabilities:{canClose,canReopen,create:allowed,reply:allowed,edit:allowed,reactions:false,replyMode:'native'}};
  }
  async function threadStateSnapshot(host,repository,number,options) {
    const project=await request(host,`/api/v4/projects/${encodeURIComponent(repository)}`,options),user=await request(host,'/api/v4/user',options);
    if(project?.path_with_namespace!==repository||!Number.isSafeInteger(project.id)||project.id<1||!Number.isSafeInteger(user?.id)||user.id<1)throw fail('GitLab project or account identity could not be verified.',true);
    const issue=await request(host,`/api/v4/projects/${project.id}/issues/${number}`,options);
    if(issue?.project_id!==project.id||issue.iid!==number||!Number.isSafeInteger(issue.id)||issue.id<1||!['opened','closed'].includes(issue.state)||typeof issue.updated_at!=='string'||!Number.isFinite(Date.parse(issue.updated_at)))throw fail('GitLab returned another Issue identity.',true);
    const levels=[project.permissions?.project_access?.access_level,project.permissions?.group_access?.access_level];
    const allowed=issue.author?.id===user.id||Array.isArray(issue.assignees)&&issue.assignees.some(a=>a?.id===user.id)||levels.some(n=>Number.isSafeInteger(n)&&n>=15);
    return {project,issue,user,allowed};
  }
  async function chatThreadState(message) {
    await globalThis.KiCadManagedPolicy?.assertWrites();
    if(message?.provider!==undefined&&message.provider!=='gitlab')throw fail('Invalid GitLab chat provider.',true);
    const host=validateHost(message?.host),repository=repositoryPath(message?.repository),scope=KiCadReviewComments.normalizeScope({...message,provider:'gitlab',host,repository});
    const {kind,number}=message.thread||{},state=message.state,expected=message.expectedUpdatedAt;
    if(message.confirmed!==true||kind!=='issue'||!Number.isSafeInteger(number)||number<1||!['open','closed'].includes(state)||typeof expected!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(expected)||!Number.isFinite(Date.parse(expected)))throw fail('Confirm a valid Issue state and fetched revision.',true);
    const lock='gitlab-thread-state:'+JSON.stringify([host,repository,number]);if(locks.has(lock))throw fail('A state change is already in progress.',true);
    const work=(async()=>{
      const current=epoch(host),headers=await authorizationHeaders(host),token=headers.Authorization?.slice(7),options={token,expectedEpoch:current};
      if(!token)throw fail('Sign in before changing a conversation state.',true);
      const fresh=await threadStateSnapshot(host,repository,number,options),policy=await commentPolicyStatus(host,repository,fresh.project.id);
      if(!policy.allowed||!fresh.allowed)throw fail('Repository policy or your GitLab role blocks this state change.',true);
      const key=lock+JSON.stringify([fresh.user.id,expected,state,scope.ref,scope.file]),saved=(await chrome.storage.local.get(key))[key];
      if(saved?.status==='done')return {...saved.result,duplicate:true};if(saved)throw fail('Previous state change has an unconfirmed outcome. Refresh and inspect GitLab before retrying.');
      if(fresh.issue.updated_at!==expected||(fresh.issue.state==='closed')===(state==='closed'))throw fail('Conversation state or revision changed. Refresh before changing it.',true);
      await KiCadReviewComments.reservePublication(chrome.storage.local,JSON.stringify(['gitlab',host]),Date.now());await globalThis.KiCadManagedPolicy?.assertWrites();
      if(epoch(host)!==current)throw fail('GitLab account changed or signed out.',true);
      await chrome.storage.local.set({[key]:{status:'pending'}});
      try{
        const result=await request(host,`/api/v4/projects/${fresh.project.id}/issues/${number}`,{...options,method:'PUT',body:{state_event:state==='closed'?'close':'reopen'}});
        if(result?.id!==fresh.issue.id||result.project_id!==fresh.project.id||result.iid!==number||result.state!==(state==='closed'?'closed':'opened')||typeof result.updated_at!=='string'||!Number.isFinite(Date.parse(result.updated_at)))throw fail('GitLab did not confirm the state change. Refresh and inspect the conversation before retrying.');
        const response={provider:'gitlab',host,repository,kind,number,state,updatedAt:result.updated_at,url:`${host}/${repository}/-/issues/${number}`};await chrome.storage.local.set({[key]:{status:'done',result:response}});return response;
      }catch(error){if(error.definitive)await chrome.storage.local.remove(key);throw error;}
    })();locks.set(lock,work);try{return await work;}finally{locks.delete(lock);}
  }
  async function chatMessageWrite(message) {
    await globalThis.KiCadManagedPolicy?.assertWrites();
    if(message?.provider!==undefined&&message.provider!=='gitlab')throw fail('Invalid GitLab chat provider.',true);
    const host=validateHost(message?.host),repository=repositoryPath(message?.repository),scope=KiCadReviewComments.normalizeScope({...message,provider:'gitlab',host,repository});
    const {kind,number}=message.thread||{},action=message.action,mutation=message.clientMutationId;
    if(!['issue','discussion'].includes(kind)||!Number.isSafeInteger(number)||number<1||!['create','reply','edit'].includes(action)||typeof message.body!=='string'||!message.body.trim()||new TextEncoder().encode(message.body).length>60000||typeof mutation!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(mutation))throw fail('Invalid chat message request.',true);
    if(action==='edit'&&(typeof message.messageId!=='string'||typeof message.expectedUpdatedAt!=='string')||action==='reply'&&typeof message.replyTo!=='string')throw fail('A verified message and revision are required.',true);
    const note=message.annotation?KiCadReviewComments.validateComment(message.annotation):null;
    if(!note&&message.body.includes('<!-- kicad-review:'))throw fail('Drawing context must use a validated chat annotation.',true);
    if(note&&(action==='edit'||note.id!==mutation||note.text!==message.body||note.anchor.repository!==repository||note.anchor.ref!==scope.ref||note.anchor.file!==scope.file||note.anchor.provider!=='gitlab'||note.anchor.host!==host||note.threadType!==kind))throw fail('Chat annotation does not match its message and drawing.',true);
    const key='gitlab-chat:'+JSON.stringify([host,repository,kind,number,mutation]);
    if(locks.has(key)){try{await locks.get(key);}catch{}return chatMessageWrite(message);}
    const work=(async()=>{
      const current=epoch(host),headers=await authorizationHeaders(host),token=headers.Authorization?.slice(7),options={token,expectedEpoch:current};
      if(!token)throw fail('Sign in to this GitLab host before posting.',true);
      const project=await request(host,`/api/v4/projects/${encodeURIComponent(repository)}`,options);
      if(project?.path_with_namespace!==repository||!Number.isSafeInteger(project.id)||project.id<1)throw fail('GitLab returned another project identity.',true);
      const policy=await commentPolicyStatus(host,repository,project.id);
      if(!policy.allowed||!policy.login)throw fail('Repository policy or account verification blocked this chat message.',true);
      const fingerprint=JSON.stringify([action,scope.ref,scope.file,message.messageId||null,message.replyTo||null,message.expectedUpdatedAt||null,message.body,note,policy.login.toLowerCase()]);
      const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(fingerprint))),b=>b.toString(16).padStart(2,'0')).join('');
      const saved=(await chrome.storage.local.get(key))[key];
      if(saved){if(saved.digest!==digest)throw fail('This chat request ID already belongs to another message.',true);if(saved.status==='done')return {...saved.result,duplicate:true};throw fail('Previous chat message has an unconfirmed outcome. Inspect GitLab before retrying.');}
      const thread=await readThread({...scope,host,kind,number});
      if(thread.projectId!==project.id)throw fail('GitLab project changed during chat preflight.',true);
      const target=thread.comments.find(row=>row.id===(action==='edit'?message.messageId:message.replyTo));
      if(action!=='create'&&!target)throw fail('Message does not belong to the fetched thread or is outside its read limit.',true);
      if(action==='edit'&&(target.author?.toLowerCase()!==policy.login.toLowerCase()||target.updatedAt!==message.expectedUpdatedAt))throw fail('Message ownership or revision changed. Refresh before editing.',true);
      if(action==='edit'&&(target.bodyTruncated||target.body.includes('kicad-review:')))throw fail('Edit complete drawing annotations on the service to preserve their anchors.',true);
      if(action==='reply'&&!target.replyDiscussionId)throw fail('This GitLab note has no verified reply discussion.',true);
      let body=message.body;
      await KiCadReviewComments.reservePublication(chrome.storage.local,JSON.stringify(['gitlab',host]),Date.now());
      if(note){
        if((note.capture||note.attachments?.length)&&project.visibility!=='public'&&project.enforce_auth_checks_on_uploads!==true)throw fail('Private GitLab image uploads require authenticated media access. Remove the screenshot or enable the project setting.',true);
        const attachments=note.capture?[await uploadCapture(note,host,repository,project.id,token,current)]:note.attachments?.map(value=>checkedAttachment(value,host,repository,project.id));
        body=KiCadReviewComments.toMarkdown(attachments?.length?{...note,attachments}:note);
      }
      if(epoch(host)!==current)throw fail('GitLab account changed or signed out.',true);
      await chrome.storage.local.set({[key]:{status:'pending',digest}});
      try{
        const endpoint=`/api/v4/projects/${project.id}/issues/${number}`;
        const path=action==='create'?`${endpoint}/discussions`:action==='reply'?`${endpoint}/discussions/${target.replyDiscussionId}/notes`:target.discussionId?`${endpoint}/discussions/${target.discussionId}/notes/${target.id}`:`${endpoint}/notes/${target.id}`;
        const value=await request(host,path,{...options,method:action==='edit'?'PUT':'POST',body:{body}}),result=action==='create'?value.notes?.[0]:value;
        if(!Number.isSafeInteger(result?.id)||result.id<1||action==='edit'&&String(result.id)!==target.id)throw fail('GitLab did not confirm the chat message. Inspect the thread before retrying.');
        if(typeof result.updated_at!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(result.updated_at)||!Number.isFinite(Date.parse(result.updated_at)))throw fail('GitLab did not confirm the message revision. Inspect the thread before retrying.');
        const response={provider:'gitlab',kind,number,messageId:String(result.id),url:`${host}/${repository}/-/issues/${number}#note_${result.id}`,updatedAt:result.updated_at,replyTo:action==='reply'?(target.replyTo||target.id):null};
        await chrome.storage.local.set({[key]:{status:'done',digest,result:response}});return response;
      }catch(error){if(error.definitive)await chrome.storage.local.remove(key);throw error;}
    })();
    locks.set(key,work);try{return await work;}finally{locks.delete(key);}
  }
  async function chatThreadList(message={}) {
    const host=validateHost(message.host),repository=repositoryPath(message.repository),{kind,page=1}=message;
    KiCadReviewComments.normalizeScope({...message,provider:'gitlab',host,repository});
    if(message.provider!==undefined&&message.provider!=='gitlab'||!['issue','discussion'].includes(kind)||!Number.isSafeInteger(page)||page<1||page>5||message.cursor!==undefined&&message.cursor!==null)throw fail('Invalid chat conversation listing.',true);
    if(kind==='discussion')return {threads:[],hasMore:false,supported:false,warnings:['GitLab conversations are listed under Issues.']};
    const current=epoch(host),headers=await authorizationHeaders(host),options={token:headers.Authorization?.slice(7),expectedEpoch:current};
    const project=await request(host,`/api/v4/projects/${encodeURIComponent(repository)}`,options);
    if(project?.path_with_namespace!==repository||!Number.isSafeInteger(project.id)||project.id<1)throw fail('GitLab returned another project identity.',true);
    const rows=await request(host,`/api/v4/projects/${project.id}/issues?state=all&scope=all&order_by=updated_at&sort=desc&per_page=20&page=${page}`,options);
    if(!Array.isArray(rows)||rows.length>20)throw fail('GitLab returned an invalid conversation listing.',true);
    const threads=[],warnings=[];
    for(const row of rows){const author=row?.author,updatedAt=row?.updated_at;
      if(!Number.isSafeInteger(row?.iid)||row.iid<1||row.project_id!==project.id||typeof row.title!=='string'||!['opened','closed'].includes(row.state)||author!==null&&!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(author?.username||'')||typeof updatedAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(updatedAt)||!Number.isFinite(Date.parse(updatedAt))){if(!warnings.length)warnings.push('Some conversations with invalid provenance were omitted.');continue;}
      threads.push({kind:'issue',number:row.iid,title:row.title.slice(0,1024),state:row.state==='opened'?'open':'closed',author:author?.username||null,updatedAt,url:`${host}/${repository}/-/issues/${row.iid}`});
    }
    if(epoch(host)!==current)throw fail('GitLab account changed or signed out.',true);
    const more=rows.length===20;return {threads,hasMore:more&&page<5,...(more&&page<5?{nextPage:page+1}:{}),warnings,...(more&&page===5?{truncated:true}:{})};
  }
  async function forkRevision(message){
    const host=validateHost(message.host||'https://gitlab.com');
    KiCadRevisionFork.validate({...message,provider:'gitlab',host});
    await globalThis.KiCadManagedPolicy?.assertWrites();
    const current=epoch(host),headers=await authorizationHeaders(host),token=headers.Authorization?.slice(7);
    if(!token)throw fail('Sign in to the selected GitLab server before creating a fork.',true);
    await KiCadReviewComments.reservePublication(chrome.storage.local,JSON.stringify(['gitlab',host]),Date.now());
    return KiCadRevisionFork.create({...message,provider:'gitlab',host},{
      authorize:async()=>{await globalThis.KiCadManagedPolicy?.assertWrites();if(epoch(host)!==current)throw fail('GitLab account changed or signed out.',true);if(globalThis.KiCadGitLabHosts&&!await KiCadGitLabHosts.allowed(host))throw fail('GitLab server permission was removed.',true);const actual=await authorizationHeaders(host);if(actual.Authorization!==headers.Authorization)throw fail('GitLab session expired or changed.',true);},
      request:(method,path,body)=>request(host,path,{method,body,token,expectedEpoch:current,forkResponse:true})
    });
  }
  return { forkRevision, validateHost, validatePolicy, authStatus, tokenStatus: authStatus, setToken, clearToken, resetAuth, authorizationHeaders, setClientId, startOAuth, commentPolicyStatus, publish, readThread, chatThreadState, chatMessageWrite, chatThreadList };
})();
if (typeof globalThis === "object") globalThis.KiCadGitLabReviewApi = KiCadGitLabReviewApi;
if (typeof module === "object" && module.exports) module.exports = KiCadGitLabReviewApi;
