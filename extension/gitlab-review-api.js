"use strict";

// Privileged background-only GitLab credentials and mutations. No secret is persisted in plaintext.
const KiCadGitLabReviewApi = (() => {
  const VAULT = "gitlab-review-vault-v1", CLIENTS = "gitlab-oauth-public-clients-v1";
  const LIMIT = 8 * 60 * 60 * 1000;
  const keys = new Map(), epochs = new Map(), pending = new Map(), locks = new Map();
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
        await chrome.storage.session.remove([VAULT, "gitlab-review-token", "gitlab-device-pending"]);
        await chrome.storage.local.remove([VAULT, "gitlab-review-token", "gitlab-device-pending"]);
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
  }
  async function credential(host) {
    const record = (await records())[host]; if (!record) return null;
    try {
      if (!keys.has(host) || record.version !== 1 || !Number.isFinite(record.expiresAt) || record.expiresAt <= Date.now() ||
          !Array.isArray(record.iv) || record.iv.length !== 12 || !Array.isArray(record.ciphertext) || record.ciphertext.length > 2048 ||
          ![...record.iv, ...record.ciphertext].every(n => Number.isInteger(n) && n >= 0 && n <= 255)) throw fail("locked");
      const bytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(record.iv),
        additionalData: new TextEncoder().encode(`${host}:gitlab-token:v1:${record.expiresAt}`) }, keys.get(host), new Uint8Array(record.ciphertext));
      const token = new TextDecoder().decode(bytes); new Uint8Array(bytes).fill(0);
      return { token, expiresAt: record.expiresAt };
    } catch { await purge(host); return null; }
  }
  function validToken(token) {
    if (typeof token !== "string" || token.length < 20 || token.length > 1000 || /[^\x21-\x7e]/.test(token)) throw fail("Enter a valid GitLab token without spaces.", true);
  }
  async function setToken(host, token, lifetime = LIMIT, expectedEpoch) {
    host = validateHost(host); validToken(token);
    if (expectedEpoch === undefined) expectedEpoch = advance(host);
    return operation(async () => {
      if (epoch(host) !== expectedEpoch) throw fail("GitLab sign-in was cancelled.", true);
      if (chrome.storage.session.setAccessLevel) await chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
      const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      const iv = crypto.getRandomValues(new Uint8Array(12)), expiresAt = Date.now() + Math.min(LIMIT, lifetime > 0 && Number.isFinite(lifetime) ? lifetime : LIMIT);
      const bytes = new TextEncoder().encode(token); let cipher;
      try { cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(`${host}:gitlab-token:v1:${expiresAt}`) }, key, bytes); }
      finally { bytes.fill(0); }
      if (epoch(host) !== expectedEpoch) throw fail("GitLab sign-in was cancelled.", true);
      keys.set(host, key); const all = await records();
      all[host] = { version: 1, iv: Array.from(iv), ciphertext: Array.from(new Uint8Array(cipher)), expiresAt };
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
  async function request(host, path, { method = "GET", body, token, expectedEpoch, allow404 = false } = {}) {
    host = validateHost(host);
    if (typeof path !== "string" || !/^\/(?:api\/v4\/|oauth\/token(?:$|\?))/.test(path) || path.includes("\\") || new URL(host + path).origin !== host) throw fail("Invalid GitLab API destination.", true);
    if (expectedEpoch !== undefined && epoch(host) !== expectedEpoch) throw fail("GitLab account changed or signed out.", true);
    const headers = { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    if (body) headers["Content-Type"] = body instanceof URLSearchParams ? "application/x-www-form-urlencoded" : "application/json";
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(host + path, { method, headers, body: body ? body instanceof URLSearchParams ? body.toString() : JSON.stringify(body) : undefined,
        credentials: "omit", redirect: "error", cache: "no-store", signal: controller.signal });
      if (expectedEpoch !== undefined && epoch(host) !== expectedEpoch) throw fail("GitLab account changed or signed out.");
      if (allow404 && response.status === 404) return null;
      if (!response.ok) {
        if (response.status === 401 && token && expectedEpoch === epoch(host)) await clearToken(host);
        throw fail(`GitLab returned HTTP ${response.status}. Check repository access and token scopes.`, response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status));
      }
      const text = await response.text(); if (text.length > 1024 * 1024) throw fail("GitLab response exceeds the size limit.");
      try { return JSON.parse(text); } catch { throw fail("GitLab returned an invalid API response."); }
    } finally { clearTimeout(timer); }
  }
  async function startOAuth(host) {
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
  async function commentPolicyStatus(host, repository) {
    host = validateHost(host); repository = repositoryPath(repository);
    const current = epoch(host), headers = await authorizationHeaders(host), token = headers.Authorization?.slice(7);
    if (!token) return { allowed: false, reason: "Sign in to this GitLab host before posting." };
    const path = `/api/v4/projects/${encodeURIComponent(repository)}`, options = { token, expectedEpoch: current };
    const project = await request(host, path, options);
    if (project.path_with_namespace !== repository || !Number.isSafeInteger(project.id) || project.id <= 0 ||
        typeof project.default_branch !== "string" || !project.default_branch || project.default_branch.length > 200) throw fail("GitLab project policy identity could not be verified.", true);
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
  async function publish(message) {
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
      return { remoteRef: remote, duplicate: true };
    }
    if (saved?.status === "pending") throw fail("Previous publication has an unconfirmed outcome. Inspect GitLab before posting again.");
    const headers = await authorizationHeaders(host), token = headers.Authorization?.slice(7);
    if (!token) throw fail("Sign in to this GitLab host before posting.", true);
    const path = `/api/v4/projects/${encodeURIComponent(repository)}`;
    const project = await request(host, path, { token, expectedEpoch: current });
    if (project.path_with_namespace !== repository || !Number.isSafeInteger(project.id) || project.id <= 0) throw fail("GitLab returned another project identity.", true);
    const policy = await commentPolicyStatus(host, repository);
    if (!policy.allowed) throw fail(`Repository comment policy blocked publication: ${policy.reason}`, true);
    const body = KiCadReviewComments.toMarkdown(note);
    if (epoch(host) !== current) throw fail("GitLab account changed or signed out.", true);
    await chrome.storage.local.set({ [key]: { status: "pending", startedAt: new Date().toISOString() } });
    try {
      const endpoint = destination === "new-issue" ? `${path}/issues` : `${path}/issues/${number}/${destination === "discussion" ? "discussions" : "notes"}`;
      const result = await request(host, endpoint, { method: "POST", token, expectedEpoch: current, body: destination === "new-issue" ? { title, description: body } : { body } });
      const issue = destination === "new-issue" ? result.iid : number;
      const noteId = destination === "discussion" ? result.notes?.[0]?.id : result.id;
      if (!Number.isSafeInteger(issue) || issue <= 0 || destination !== "new-issue" && (!Number.isSafeInteger(noteId) || noteId <= 0)) throw fail("GitLab did not confirm publication.");
      const remoteRef = { provider: "gitlab", host, repository, kind: destination === "discussion" ? "discussion" : "issue", number: issue,
        url: `${host}/${repository}/-/issues/${issue}${destination === "new-issue" ? "" : `#note_${noteId}`}`, publishedAt: new Date().toISOString() };
      await chrome.storage.local.set({ [key]: { status: "done", remoteRef } }); return { remoteRef };
    } catch (error) { if (error.definitive) await chrome.storage.local.remove(key); throw error; }
  }
  return { validateHost, validatePolicy, authStatus, tokenStatus: authStatus, setToken, clearToken, resetAuth, authorizationHeaders, setClientId, startOAuth, commentPolicyStatus, publish };
})();
if (typeof globalThis === "object") globalThis.KiCadGitLabReviewApi = KiCadGitLabReviewApi;
if (typeof module === "object" && module.exports) module.exports = KiCadGitLabReviewApi;
