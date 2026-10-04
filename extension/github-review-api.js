"use strict";

// Privileged GitHub write API. This file is loaded only by the extension worker.
const KiCadGitHubReviewApi = (() => {
  const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
  const NUMBER = (value) => Number.isSafeInteger(value) && value > 0;
  const API = "https://api.github.com";
  const TOKEN_KEY = "github-review-token";
  const TOKEN_EXPIRY_KEY = "github-review-token-expiry";
  const CLIENT_ID_KEY = "github-oauth-client-id";
  const DEVICE_KEY = "github-device-pending";
  const CLIENT_ID = /^[A-Za-z0-9_]{10,100}$/;
  const DESTINATIONS = new Set(["new-issue", "issue", "new-discussion", "discussion"]);
  const validRepository = (value) => typeof value === "string" && REPOSITORY.test(value) &&
    value.split("/").every((part) => part !== "." && part !== "..");
  const validId = (value) => typeof value === "string" && /^[A-Za-z0-9_+\/=.-]{1,200}$/.test(value);
  const fail = (message, definitive = false) => Object.assign(new Error(message), { definitive });

  async function tokenStatus() {
    const token = (await chrome.storage.session.get(TOKEN_KEY))[TOKEN_KEY];
    const expiry = (await chrome.storage.session.get(TOKEN_EXPIRY_KEY))[TOKEN_EXPIRY_KEY];
    if (Number.isFinite(expiry) && Date.now() >= expiry) {
      await chrome.storage.session.remove([TOKEN_KEY, TOKEN_EXPIRY_KEY]);
      return { configured: false, expired: true };
    }
    return { configured: typeof token === "string" && token.length > 0,
      ...(Number.isFinite(expiry) ? { expiresAt: expiry } : {}) };
  }
  async function setToken(value) {
    if (typeof value !== "string" || value.length < 20 || value.length > 500 || /[^\x21-\x7e]/.test(value)) {
      throw fail("Enter a valid GitHub access token (20–500 printable characters, no spaces).", true);
    }
    if (chrome.storage.session.setAccessLevel) {
      await chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
    }
    await chrome.storage.session.set({ [TOKEN_KEY]: value });
    await chrome.storage.session.remove(TOKEN_EXPIRY_KEY);
    return { configured: true };
  }
  async function clearToken() {
    await chrome.storage.session.remove([TOKEN_KEY, TOKEN_EXPIRY_KEY]);
    return { configured: false };
  }
  async function getToken() {
    if (!(await tokenStatus()).configured) throw fail("Set a GitHub token in extension options first.", true);
    const token = (await chrome.storage.session.get(TOKEN_KEY))[TOKEN_KEY];
    return token;
  }

  async function deviceHttp(path, fields) {
    if (path !== "/login/device/code" && path !== "/login/oauth/access_token") throw fail("Invalid GitHub authorization path.", true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let response;
    try {
      response = await fetch(`https://github.com${path}`, {
        method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(fields).toString(), credentials: "omit", cache: "no-store",
        redirect: "error", signal: controller.signal
      });
    } catch { throw fail("GitHub sign-in could not be reached. Try again later.", true); }
    finally { clearTimeout(timeout); }
    if (!response.ok) throw fail(`GitHub sign-in returned HTTP ${response.status}.`, true);
    try {
      const text = await response.text();
      if (text.length > 16384) throw new Error("oversize");
      return JSON.parse(text);
    } catch { throw fail("GitHub returned an unreadable sign-in response.", true); }
  }
  const safeFlow = (pending) => ({ userCode: pending.userCode,
    verificationUrl: "https://github.com/login/device", expiresAt: pending.expiresAt,
    retryAfterMs: Math.max(0, pending.nextPollAt - Date.now()), intervalSeconds: pending.intervalSeconds });
  async function deviceStatus() {
    const clientId = (await chrome.storage.local.get(CLIENT_ID_KEY))[CLIENT_ID_KEY] || "";
    const pending = (await chrome.storage.session.get(DEVICE_KEY))[DEVICE_KEY];
    if (pending && Date.now() >= pending.expiresAt) {
      await chrome.storage.session.remove(DEVICE_KEY);
      return { clientId, active: false, expired: true };
    }
    return { clientId, active: Boolean(pending), ...(pending ? safeFlow(pending) : {}) };
  }
  async function startDevice(value) {
    if (typeof value !== "string" || !CLIENT_ID.test(value)) throw fail("Enter the registered GitHub OAuth App client ID.", true);
    const current = await deviceStatus();
    if (current.active) throw fail("A GitHub sign-in is already in progress. Cancel it before starting another.", true);
    const data = await deviceHttp("/login/device/code", { client_id: value, scope: "public_repo" });
    if (data.error) throw fail("GitHub rejected the OAuth App client ID or device flow is disabled.", true);
    if (typeof data.device_code !== "string" || !/^[A-Za-z0-9_-]{20,200}$/.test(data.device_code) ||
        typeof data.user_code !== "string" || !/^[A-Z0-9-]{4,30}$/.test(data.user_code) ||
        data.verification_uri !== "https://github.com/login/device" ||
        !Number.isInteger(data.expires_in) || data.expires_in < 30 || data.expires_in > 1800 ||
        !Number.isInteger(data.interval) || data.interval < 1 || data.interval > 300) {
      throw fail("GitHub returned an invalid device authorization response.", true);
    }
    const now = Date.now();
    const pending = { clientId: value, deviceCode: data.device_code, userCode: data.user_code,
      expiresAt: now + data.expires_in * 1000, intervalSeconds: Math.max(5, data.interval),
      nextPollAt: now + Math.max(5, data.interval) * 1000,
      nonce: crypto.randomUUID() };
    if (chrome.storage.session.setAccessLevel) {
      await chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
    }
    await chrome.storage.local.set({ [CLIENT_ID_KEY]: value });
    await chrome.storage.session.set({ [DEVICE_KEY]: pending });
    return { state: "pending", ...safeFlow(pending) };
  }
  async function cancelDevice() {
    await chrome.storage.session.remove(DEVICE_KEY);
    return { state: "cancelled" };
  }
  let pollLock = null;
  async function pollDevice() {
    if (pollLock) return pollLock;
    pollLock = pollDeviceOnce();
    try { return await pollLock; } finally { pollLock = null; }
  }
  async function pollDeviceOnce() {
    const pending = (await chrome.storage.session.get(DEVICE_KEY))[DEVICE_KEY];
    if (!pending) throw fail("No GitHub sign-in is in progress.", true);
    const now = Date.now();
    if (now >= pending.expiresAt) {
      await chrome.storage.session.remove(DEVICE_KEY);
      return { state: "expired" };
    }
    if (now < pending.nextPollAt) return { state: "pending", ...safeFlow(pending) };
    pending.nextPollAt = now + pending.intervalSeconds * 1000;
    await chrome.storage.session.set({ [DEVICE_KEY]: pending });
    const data = await deviceHttp("/login/oauth/access_token", { client_id: pending.clientId,
      device_code: pending.deviceCode, grant_type: "urn:ietf:params:oauth:grant-type:device_code" });
    const current = (await chrome.storage.session.get(DEVICE_KEY))[DEVICE_KEY];
    if (current?.nonce !== pending.nonce) return { state: "cancelled" };
    if (Date.now() >= current.expiresAt) {
      await chrome.storage.session.remove(DEVICE_KEY);
      return { state: "expired" };
    }
    if (data.access_token) {
      if (data.token_type?.toLowerCase() !== "bearer" || typeof data.scope !== "string" ||
          !data.scope.split(/[\s,]+/).includes("public_repo")) {
        await chrome.storage.session.remove(DEVICE_KEY);
        throw fail("GitHub did not grant public repository access. Start sign-in again and approve that scope.", true);
      }
      await setToken(data.access_token);
      if (Number.isInteger(data.expires_in) && data.expires_in > 0) {
        await chrome.storage.session.set({ [TOKEN_EXPIRY_KEY]: Date.now() + data.expires_in * 1000 });
      }
      await chrome.storage.session.remove(DEVICE_KEY);
      return { state: "connected" };
    }
    if (data.error === "authorization_pending") return { state: "pending", ...safeFlow(current) };
    if (data.error === "slow_down") {
      current.intervalSeconds = Math.min(300, Math.max(current.intervalSeconds + 5,
        Number.isInteger(data.interval) ? data.interval : 0));
      current.nextPollAt = Date.now() + current.intervalSeconds * 1000;
      await chrome.storage.session.set({ [DEVICE_KEY]: current });
      return { state: "pending", ...safeFlow(current), slowedDown: true };
    }
    await chrome.storage.session.remove(DEVICE_KEY);
    if (data.error === "access_denied") return { state: "denied" };
    if (data.error === "expired_token") return { state: "expired" };
    throw fail(data.error === "device_flow_disabled" ? "Enable Device Flow in the registered OAuth App settings." :
      "GitHub sign-in failed. Check the OAuth App client ID and start again.", true);
  }

  async function request(path, token, body) {
    if (typeof path !== "string" || !path.startsWith("/repos/") && path !== "/graphql" ||
        path.includes("//") || path.includes("..")) throw fail("Invalid GitHub API path.", true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let response;
    try {
      response = await fetch(API + path, {
        method: body === undefined ? "GET" : "POST",
        headers: { Accept: "application/vnd.github+json", "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28", Authorization: `Bearer ${token}` },
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: "omit", cache: "no-store", redirect: "error", signal: controller.signal
      });
    } catch {
      throw fail("GitHub did not confirm the request. Publishing may have succeeded; inspect the thread before retrying.");
    } finally { clearTimeout(timeout); }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw fail("GitHub denied access. Check the token and repository permissions.", true);
      if (response.status === 404) throw fail("GitHub repository or thread was not found, or token access is missing.", true);
      if (response.status === 422 || response.status === 410 || response.status === 400) throw fail("GitHub rejected this issue or discussion request.", true);
      if (response.status === 429) throw fail("GitHub rate limited this request; inspect the thread before retrying.");
      throw fail(`GitHub returned HTTP ${response.status}; inspect the thread before retrying.`);
    }
    try {
      const data = await response.json();
      if (path === "/graphql" && Array.isArray(data.errors) && data.errors.length) {
        throw fail("GitHub rejected or did not confirm the discussion request. Check token permissions and inspect the thread.",
          !body?.query?.includes("mutation"));
      }
      return data;
    } catch (error) {
      if (error.definitive) throw error;
      throw fail("GitHub returned an unreadable response; inspect the thread before retrying.");
    }
  }
  const graphql = (token, query, variables) => request("/graphql", token, { query, variables });
  function repoParts(repository) {
    if (!validRepository(repository)) throw fail("Invalid target GitHub repository.", true);
    return repository.split("/");
  }
  async function categoryBundle(repository) {
    const [owner, name] = repoParts(repository), token = await getToken();
    const data = await graphql(token, `query($owner:String!,$name:String!){repository(owner:$owner,name:$name){id discussionCategories(first:25){nodes{id name slug description}}}}`, { owner, name });
    const repo = data.data?.repository;
    if (!validId(repo?.id) || !Array.isArray(repo.discussionCategories?.nodes)) {
      throw fail("GitHub Discussions are unavailable for this repository.", true);
    }
    return { repositoryId: repo.id, categories: repo.discussionCategories.nodes.filter((item) => validId(item?.id))
      .map(({ id, name, slug, description }) => ({ id, name, slug, description })) };
  }
  async function categories(repository) { return (await categoryBundle(repository)).categories; }

  const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
  const POLICY_MODES = new Set(["all", "contributors", "collaborators", "allowlist"]);
  function validatePolicy(value) {
    if (!value || typeof value !== "object" || Array.isArray(value) || value.schemaVersion !== 1 ||
        !value.commenting || typeof value.commenting !== "object" || Array.isArray(value.commenting) ||
        !POLICY_MODES.has(value.commenting.mode) ||
        Object.keys(value).some((key) => !["schemaVersion", "commenting"].includes(key)) ||
        Object.keys(value.commenting).some((key) => !["mode", "allowlist"].includes(key))) {
      throw fail("Repository comment policy is malformed; publishing is blocked.", true);
    }
    const list = value.commenting.allowlist ?? [];
    if (!Array.isArray(list) || list.length > 100 || list.some((login) => typeof login !== "string" || !LOGIN.test(login))) {
      throw fail("Repository comment policy allowlist is invalid; publishing is blocked.", true);
    }
    return { mode: value.commenting.mode, allowlist: [...new Set(list.map((login) => login.toLowerCase()))] };
  }
  async function policyGet(path, token, maxBytes = 1024 * 1024, accept = "application/vnd.github+json") {
    if (typeof path !== "string" || !(path === "/user" || path.startsWith("/repos/")) ||
        path.includes("//") || path.includes("..")) throw fail("Invalid GitHub policy request.", true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let response;
    try {
      response = await fetch(API + path, { headers: { Accept: accept,
        "X-GitHub-Api-Version": "2022-11-28", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      credentials: "omit", cache: "no-store", redirect: "error", signal: controller.signal });
      if (response.status === 404) return null;
      if (response.status !== 200) throw fail("GitHub could not verify the repository comment policy.", true);
      if (Number(response.headers.get("content-length")) > maxBytes) throw fail("GitHub policy response is too large.", true);
      const text = await response.text();
      if (new TextEncoder().encode(text).length > maxBytes) throw fail("GitHub policy response is too large.", true);
      return { text, contentType: response.headers.get("content-type") || "" };
    } catch (error) {
      if (error.definitive) throw error;
      throw fail("GitHub could not verify the repository comment policy.", true);
    } finally { clearTimeout(timeout); }
  }
  function policyJson(response) {
    try { return JSON.parse(response.text); }
    catch { throw fail("GitHub returned invalid policy verification data.", true); }
  }
  async function readPolicy(repository, token) {
    const metadata = await policyGet(`/repos/${repository}`, token);
    const repo = metadata && policyJson(metadata);
    if (repo?.private !== false || repo.full_name?.toLowerCase() !== repository.toLowerCase() ||
        typeof repo.default_branch !== "string" || !repo.default_branch || repo.default_branch.length > 200) {
      throw fail("Target repository is unavailable or is not public.", true);
    }
    const ref = repo.default_branch;
    // Public policy is read without the token so a fine-grained Issues token lacking
    // Contents permission cannot make an existing policy look like a missing file.
    const raw = await policyGet(`/repos/${repository}/contents/.kicad-review-policy.json?ref=${encodeURIComponent(ref)}`,
      null, 128 * 1024, "application/vnd.github.raw+json");
    if (!raw) return { ref, source: "default", policy: { mode: "all", allowlist: [] } };
    let value = policyJson(raw);
    if (value?.encoding === "base64" && typeof value.content === "string") {
      if (value.content.length > 48 * 1024) throw fail("Repository comment policy is too large.", true);
      try {
        const binary = atob(value.content.replace(/\s/g, ""));
        value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(
          Uint8Array.from(binary, (character) => character.charCodeAt(0))));
      } catch { throw fail("Repository comment policy is malformed; publishing is blocked.", true); }
    }
    return { ref, source: "repository", policy: validatePolicy(value) };
  }
  async function commentPolicyStatus(repository) {
    repoParts(repository);
    const configured = (await tokenStatus()).configured;
    const token = configured ? await getToken() : null;
    const { ref, source, policy } = await readPolicy(repository, token);
    const result = { repository, ref, mode: policy.mode, source, allowed: false,
      reason: "Connect GitHub to publish comments." };
    if (!configured) return result;
    let login = null;
    try {
      const profile = await policyGet("/user", token, 1024 * 1024);
      const value = profile && policyJson(profile);
      if (LOGIN.test(value?.login || "")) login = value.login;
    } catch (error) {
      if (policy.mode !== "all") {
        result.reason = "Could not verify the signed-in GitHub account.";
        return result;
      }
    }
    if (login) result.login = login;
    if (policy.mode === "all") {
      result.allowed = true;
      result.reason = source === "default" ? "No repository comment policy; signed-in users may publish." :
        "Repository policy allows signed-in users to publish.";
      return result;
    }
    if (!login) { result.reason = "Could not verify the signed-in GitHub account."; return result; }
    const normalized = login.toLowerCase();
    if (normalized === repository.split("/")[0].toLowerCase()) {
      result.allowed = true;
      result.reason = "Repository owner may publish.";
      return result;
    }
    if (policy.allowlist.includes(normalized)) {
      result.allowed=true;result.reason="Account is on the repository allowlist.";return result;
    }
    if (policy.mode === "allowlist") {
      result.allowed = policy.allowlist.includes(normalized);
      result.reason = result.allowed ? "Account is on the repository allowlist." :
        "Account is not on the repository allowlist.";
      return result;
    }
    if (policy.mode === "collaborators") {
      try {
        const response = await policyGet(`/repos/${repository}/collaborators/${encodeURIComponent(login)}/permission`, token);
        if (!response) { result.reason = "Account is not a repository collaborator."; return result; }
        const permission = policyJson(response).permission;
        result.allowed = ["read", "write", "admin"].includes(permission);
        result.reason = result.allowed ? "GitHub confirms collaborator access." :
          "GitHub did not confirm collaborator access.";
      } catch { result.reason = "Could not verify collaborator permission with GitHub."; }
      return result;
    }
    try {
      for (let page = 1; page <= 10; page++) {
        const response = await policyGet(`/repos/${repository}/contributors?per_page=100&page=${page}`, token, 2 * 1024 * 1024);
        const users = response && policyJson(response);
        if (!Array.isArray(users) || users.length > 100) throw fail("GitHub contributor list is incomplete.", true);
        if (users.some((user) => typeof user?.login === "string" && user.login.toLowerCase() === normalized)) {
          result.allowed = true;
          result.reason = "GitHub confirms repository contribution.";
          return result;
        }
        if (users.length < 100) {
          result.reason = "Account is not a listed repository contributor.";
          return result;
        }
      }
      result.reason = "Contributor verification exceeds the 1,000-account scan limit.";
    } catch { result.reason = "Could not verify repository contribution with GitHub."; }
    return result;
  }
  function publishArgs(message) {
    const note = KiCadReviewComments.validateComment(message?.comment);
    const destination = message.destination;
    if (!DESTINATIONS.has(destination)) throw fail("Invalid GitHub publication destination.", true);
    const repository = message.repository || note.anchor.repository;
    repoParts(repository);
    const number = message.number;
    if ((destination === "issue" || destination === "discussion") !== (number !== undefined)) {
      throw fail("An existing thread number is required only for an existing thread.", true);
    }
    if (number !== undefined && !NUMBER(number)) throw fail("Invalid GitHub thread number.", true);
    if (destination === "new-discussion" && !validId(message.categoryId)) {
      throw fail("Choose a GitHub discussion category.", true);
    }
    if (message.title !== undefined && (typeof message.title !== "string" || !message.title.trim() || message.title.length > 200)) {
      throw fail("Invalid GitHub thread title.", true);
    }
    if(note.threadType&&note.threadType!==(destination.includes("discussion")?"discussion":"issue"))throw fail("The destination does not match this note's Issue or Discussion type.",true);
    return { note, destination, repository, number, categoryId: message.categoryId,
      title: message.title?.trim() || `[${note.severity[0].toUpperCase()}${note.severity.slice(1)}] KiCad review: ${note.anchor.file}` };
  }
  function operationKey(args) {
    // Stable across note text edits: one remote publication per local note and target.
    return `github-publish:${JSON.stringify([args.repository.toLowerCase(), args.destination, args.number || 0,
      args.note.anchor.repository.toLowerCase(), args.note.anchor.ref, args.note.anchor.file, args.note.id])}`;
  }
  const locks = new Map();
  async function publish(message) {
    const args = publishArgs(message), key = operationKey(args);
    if (locks.has(key)) return locks.get(key);
    const work = publishLocked(args, key);
    locks.set(key, work);
    try { return await work; } finally { if (locks.get(key) === work) locks.delete(key); }
  }
  async function publishLocked(args, key) {
    const saved = (await chrome.storage.local.get(key))[key];
    if (saved?.status === "done" && saved.remoteRef) return { remoteRef: saved.remoteRef, duplicate: true };
    if (saved?.status === "pending") {
      throw fail("A previous publication has an unconfirmed outcome. Inspect GitHub before creating another note; this extension will not retry it automatically.");
    }
    const { note, destination, repository, number } = args;
    const token = await getToken();
    const body = KiCadReviewComments.toMarkdown(note);
    const [owner, name] = repoParts(repository);
    let preflight;
    if (destination === "new-discussion") {
      preflight = await categoryBundle(repository);
      if (!preflight.categories.some((item) => item.id === args.categoryId)) throw fail("Discussion category does not belong to this repository.", true);
    } else if (destination === "discussion") {
      const data = await graphql(token, `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){discussion(number:$number){id number}}}`, { owner, name, number });
      preflight = data.data?.repository?.discussion;
      if (!validId(preflight?.id) || preflight.number !== number) throw fail("GitHub discussion was not found.", true);
    }
    const policy = await commentPolicyStatus(repository);
    if (!policy.allowed) throw fail(`Repository comment policy blocked publication: ${policy.reason}`, true);
    await chrome.storage.local.set({ [key]: { status: "pending", startedAt: new Date().toISOString() } });
    let remoteRef;
    try {
      const path = `/repos/${owner}/${name}/issues`;
      if (destination === "new-issue") {
        const result = await request(path, token, { title: args.title, body });
        if (!NUMBER(result.number)) throw fail("GitHub did not confirm the new issue number.");
        remoteRef = { kind: "issue", repository, number: result.number,
          url: `https://github.com/${repository}/issues/${result.number}`,
          publishedAt: new Date().toISOString(), ...(validId(result.node_id) ? { nodeId: result.node_id } : {}) };
      } else if (destination === "issue") {
        const result = await request(`${path}/${number}/comments`, token, { body });
        if (!NUMBER(result.id)) throw fail("GitHub did not confirm the new comment.");
        remoteRef = { kind: "issue", repository, number,
          url: `https://github.com/${repository}/issues/${number}#issuecomment-${result.id}`,
          publishedAt: new Date().toISOString(), ...(validId(result.node_id) ? { nodeId: result.node_id } : {}) };
      } else if (destination === "new-discussion") {
        const data = await graphql(token, `mutation($input:CreateDiscussionInput!){createDiscussion(input:$input){discussion{id number}}}`, {
          input: { repositoryId: preflight.repositoryId, categoryId: args.categoryId, title: args.title, body }
        });
        const result = data.data?.createDiscussion?.discussion;
        if (!NUMBER(result?.number) || !validId(result.id)) throw fail("GitHub did not confirm the new discussion.");
        remoteRef = { kind: "discussion", repository, number: result.number, nodeId: result.id,
          url: `https://github.com/${repository}/discussions/${result.number}`, publishedAt: new Date().toISOString() };
      } else {
        const data = await graphql(token, `mutation($input:AddDiscussionCommentInput!){addDiscussionComment(input:$input){comment{id databaseId}}}`, {
          input: { discussionId: preflight.id, body }
        });
        const result = data.data?.addDiscussionComment?.comment;
        if (!validId(result?.id)) throw fail("GitHub did not confirm the new discussion comment.");
        remoteRef = { kind: "discussion", repository, number, nodeId: result.id,
          url: `https://github.com/${repository}/discussions/${number}${NUMBER(result.databaseId) ? `#discussioncomment-${result.databaseId}` : ""}`,
          publishedAt: new Date().toISOString() };
      }
      await chrome.storage.local.set({ [key]: { status: "done", remoteRef } });
      return { remoteRef };
    } catch (error) {
      if (error.definitive) await chrome.storage.local.remove(key);
      throw error;
    }
  }
  return { tokenStatus, setToken, clearToken, deviceStatus, startDevice, pollDevice, cancelDevice,
    commentPolicyStatus, validatePolicy, categories, publish, publishArgs, validRepository };
})();

if (typeof globalThis === "object") globalThis.KiCadGitHubReviewApi = KiCadGitHubReviewApi;
if (typeof module === "object" && module.exports) module.exports = KiCadGitHubReviewApi;
