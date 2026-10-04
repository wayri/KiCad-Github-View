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
  // Publisher configuration: the OAuth App's public client ID, never its secret.
  // Public client ID for wayri's registered OAuth App; Device Flow is required.
  const RELEASE_OAUTH_CLIENT_ID = "Ov23li8RsSVZk2dHptN1";
  const DEVICE_SCOPES = new Set(["public_repo", "repo"]);
  const DESTINATIONS = new Set(["new-issue", "issue", "new-discussion", "discussion"]);
  const validRepository = (value) => typeof value === "string" && REPOSITORY.test(value) &&
    value.split("/").every((part) => part !== "." && part !== "..");
  const validId = (value) => typeof value === "string" && /^[A-Za-z0-9_+\/=.-]{1,200}$/.test(value);
  const fail = (message, definitive = false) => Object.assign(new Error(message), { definitive });

  // No persistent key: copied session records cannot unlock another worker.
  // Worker suspension/restart deliberately requires authentication again.
  let vaultKey = null, deviceSecret = null, authEpoch = 0, authQueue = Promise.resolve(), initialized = false;
  const SESSION_LIMIT = 8 * 60 * 60 * 1000;
  function authOperation(operation) {
    if (!initialized) {
      initialized = true;
      authQueue = authQueue.then(async () => {
        await chrome.storage.session.remove([TOKEN_KEY, TOKEN_EXPIRY_KEY, DEVICE_KEY]);
        await chrome.storage.local.remove([TOKEN_KEY, TOKEN_EXPIRY_KEY, DEVICE_KEY]);
      });
    }
    const result = authQueue.then(operation);
    authQueue = result.catch(() => {});
    return result;
  }
  async function readCredential() {
    const record = (await chrome.storage.session.get(TOKEN_KEY))[TOKEN_KEY];
    if (!record) return null;
    try {
      if (!vaultKey || record.version !== 1 || !Number.isFinite(record.expiresAt) ||
          record.expiresAt <= Date.now() || !Array.isArray(record.iv) || record.iv.length !== 12 ||
          !Array.isArray(record.ciphertext) || record.ciphertext.length > 1024 ||
          ![...record.iv, ...record.ciphertext].every(n => Number.isInteger(n) && n >= 0 && n <= 255)) throw new Error("locked");
      const bytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(record.iv),
        additionalData: new TextEncoder().encode(`github-token:v1:${record.expiresAt}`) }, vaultKey,
        new Uint8Array(record.ciphertext));
      const token = new TextDecoder().decode(bytes);
      new Uint8Array(bytes).fill(0);
      return { token, expiresAt: record.expiresAt };
    } catch {
      vaultKey = null;
      await chrome.storage.session.remove([TOKEN_KEY, TOKEN_EXPIRY_KEY]);
      return null;
    }
  }
  async function tokenStatus() {
    return authOperation(async () => {
      const credential = await readCredential();
      return credential ? { configured: true, expiresAt: credential.expiresAt } : { configured: false };
    });
  }
  async function setToken(value, lifetime = SESSION_LIMIT, expectedEpoch) {
    if (typeof value !== "string" || value.length < 20 || value.length > 500 || /[^\x21-\x7e]/.test(value)) {
      throw fail("Enter a valid GitHub access token (20–500 printable characters, no spaces).", true);
    }
    const manual = expectedEpoch === undefined;
    if (manual) expectedEpoch = ++authEpoch;
    return authOperation(async () => {
      if (expectedEpoch !== authEpoch) throw fail("Sign-in was cancelled. Start again.", true);
      if (manual) {
        deviceSecret = null;
        await chrome.storage.session.remove(DEVICE_KEY);
      }
      if (chrome.storage.session.setAccessLevel) {
        await chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
      }
      const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const expiresAt = Date.now() + Math.min(SESSION_LIMIT, Number.isFinite(lifetime) && lifetime > 0 ? lifetime : SESSION_LIMIT);
      const bytes = new TextEncoder().encode(value);
      let ciphertext;
      try { ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv,
        additionalData: new TextEncoder().encode(`github-token:v1:${expiresAt}`) }, key, bytes); }
      finally { bytes.fill(0); }
      if (expectedEpoch !== authEpoch) throw fail("Sign-in was cancelled. Start again.", true);
      vaultKey = key;
      await chrome.storage.session.set({ [TOKEN_KEY]: { version: 1, iv: Array.from(iv),
        ciphertext: Array.from(new Uint8Array(ciphertext)), expiresAt } });
      await chrome.storage.session.remove(TOKEN_EXPIRY_KEY);
      if (expectedEpoch !== authEpoch) {
        vaultKey = null;
        await chrome.storage.session.remove([TOKEN_KEY, TOKEN_EXPIRY_KEY]);
        throw fail("Sign-in was cancelled. Start again.", true);
      }
      return { configured: true, expiresAt };
    });
  }
  async function clearToken(reset = false) {
    authEpoch++;
    return authOperation(async () => {
      vaultKey = null;
      deviceSecret = null;
      await chrome.storage.session.remove([TOKEN_KEY, TOKEN_EXPIRY_KEY, DEVICE_KEY]);
      if (reset) await chrome.storage.local.remove(CLIENT_ID_KEY);
      return { configured: false };
    });
  }
  async function getToken() {
    return authOperation(async () => {
      const credential = await readCredential();
      if (!credential) throw fail("GitHub session is locked or expired. Sign in again in extension settings.", true);
      return credential.token;
    });
  }
  async function resetAuth() { return clearToken(true); }
  async function finishDevice(pending, epoch) {
    return authOperation(async () => {
      const current = (await chrome.storage.session.get(DEVICE_KEY))[DEVICE_KEY];
      if (epoch !== authEpoch || current?.nonce !== pending.nonce) return false;
      deviceSecret = null;
      await chrome.storage.session.remove(DEVICE_KEY);
      return true;
    });
  }
  async function assertCurrentToken(token, epoch = authEpoch) {
    const current = await getToken();
    if (epoch !== authEpoch || current !== token) throw fail("GitHub account changed or signed out. Try again after signing in.", true);
  }
  async function authorizationHeaders() {
    return authOperation(async () => {
      const credential = await readCredential();
      return credential ? { Authorization: `Bearer ${credential.token}` } : {};
    });
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
    retryAfterMs: Math.max(0, pending.nextPollAt - Date.now()), intervalSeconds: pending.intervalSeconds,
    scope: pending.scope || "public_repo" });
  async function deviceStatus() {
    await authOperation(async () => {});
    const epoch = authEpoch;
    const customClientId = (await chrome.storage.local.get(CLIENT_ID_KEY))[CLIENT_ID_KEY] || "";
    const clientId = customClientId || RELEASE_OAUTH_CLIENT_ID;
    const configuration = { clientId, customClientId, releaseConfigured: Boolean(RELEASE_OAUTH_CLIENT_ID) };
    const pending = (await chrome.storage.session.get(DEVICE_KEY))[DEVICE_KEY];
    if (pending && Date.now() >= pending.expiresAt) {
      await finishDevice(pending, epoch);
      return { ...configuration, active: false, expired: true };
    }
    return { ...configuration, active: Boolean(pending), ...(pending ? safeFlow(pending) : {}) };
  }
  async function startDevice(value = "", scope = "public_repo") {
    const epoch = authEpoch;
    if (!DEVICE_SCOPES.has(scope)) throw fail("Choose public repositories or public and private repositories.", true);
    if (typeof value !== "string") throw fail("Invalid GitHub OAuth App configuration.", true);
    value = value.trim() || RELEASE_OAUTH_CLIENT_ID;
    if (!value) throw fail("GitHub sign-in is not configured in this build. The publisher must register an OAuth App with Device Flow enabled. Local review and GitHub draft links still work; advanced setup is available below.", true);
    if (!CLIENT_ID.test(value)) throw fail("Enter the registered GitHub OAuth App client ID.", true);
    const current = await deviceStatus();
    if (current.active) throw fail("A GitHub sign-in is already in progress. Cancel it before starting another.", true);
    const data = await deviceHttp("/login/device/code", { client_id: value, scope });
    if (data.error) throw fail("GitHub rejected the OAuth App client ID or device flow is disabled.", true);
    if (typeof data.device_code !== "string" || !/^[A-Za-z0-9_-]{20,200}$/.test(data.device_code) ||
        typeof data.user_code !== "string" || !/^[A-Z0-9-]{4,30}$/.test(data.user_code) ||
        data.verification_uri !== "https://github.com/login/device" ||
        !Number.isInteger(data.expires_in) || data.expires_in < 30 || data.expires_in > 1800 ||
        !Number.isInteger(data.interval) || data.interval < 1 || data.interval > 300) {
      throw fail("GitHub returned an invalid device authorization response.", true);
    }
    const now = Date.now();
    const pending = { clientId: value, scope, userCode: data.user_code,
      expiresAt: now + data.expires_in * 1000, intervalSeconds: Math.max(5, data.interval),
      nextPollAt: now + Math.max(5, data.interval) * 1000,
      nonce: crypto.randomUUID() };
    if (chrome.storage.session.setAccessLevel) {
      await chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
    }
    if (epoch !== authEpoch) return { state: "cancelled" };
    await authOperation(async () => {
      if (epoch !== authEpoch) throw fail("Sign-in was cancelled. Start again.", true);
      if ((await chrome.storage.session.get(DEVICE_KEY))[DEVICE_KEY]) throw fail("A GitHub sign-in is already in progress.", true);
      await chrome.storage.local.set({ [CLIENT_ID_KEY]: value });
      deviceSecret = data.device_code;
      await chrome.storage.session.set({ [DEVICE_KEY]: pending });
    });
    return { state: "pending", ...safeFlow(pending) };
  }
  async function cancelDevice() {
    authEpoch++;
    await authOperation(async () => {
      deviceSecret = null;
      await chrome.storage.session.remove(DEVICE_KEY);
    });
    return { state: "cancelled" };
  }
  let pollLock = null;
  async function pollDevice() {
    if (pollLock) return pollLock;
    pollLock = pollDeviceOnce();
    try { return await pollLock; } finally { pollLock = null; }
  }
  async function pollDeviceOnce() {
    await authOperation(async () => {});
    const epoch = authEpoch;
    const pending = (await chrome.storage.session.get(DEVICE_KEY))[DEVICE_KEY];
    const secret = deviceSecret;
    if (!pending || !secret) throw fail("No GitHub sign-in is in progress.", true);
    const now = Date.now();
    if (now >= pending.expiresAt) {
      await finishDevice(pending, epoch);
      return { state: "expired" };
    }
    if (now < pending.nextPollAt) return { state: "pending", ...safeFlow(pending) };
    pending.nextPollAt = now + pending.intervalSeconds * 1000;
    await authOperation(async () => {
      if (epoch === authEpoch) await chrome.storage.session.set({ [DEVICE_KEY]: pending });
    });
    if (epoch !== authEpoch) return { state: "cancelled" };
    const data = await deviceHttp("/login/oauth/access_token", { client_id: pending.clientId,
      device_code: secret, grant_type: "urn:ietf:params:oauth:grant-type:device_code" });
    const current = (await chrome.storage.session.get(DEVICE_KEY))[DEVICE_KEY];
    if (epoch !== authEpoch || current?.nonce !== pending.nonce) return { state: "cancelled" };
    if (Date.now() >= current.expiresAt) {
      await finishDevice(pending, epoch);
      return { state: "expired" };
    }
    if (data.access_token) {
      const granted = typeof data.scope === "string" ? data.scope.split(/[\s,]+/) : [];
      const requested = pending.scope || "public_repo";
      if (data.token_type?.toLowerCase() !== "bearer" ||
          !(requested === "repo" ? granted.includes("repo") : granted.includes("public_repo") || granted.includes("repo"))) {
        await finishDevice(pending, epoch);
        throw fail(`GitHub did not grant ${requested === "repo" ? "private" : "public"} repository access. Start sign-in again and approve that scope.`, true);
      }
      await setToken(data.access_token, Number.isInteger(data.expires_in) && data.expires_in > 0 ?
        data.expires_in * 1000 : SESSION_LIMIT, epoch);
      if (!(await finishDevice(pending, epoch))) return { state: "cancelled" };
      return { state: "connected" };
    }
    if (data.error === "authorization_pending") return { state: "pending", ...safeFlow(current) };
    if (data.error === "slow_down") {
      current.intervalSeconds = Math.min(300, Math.max(current.intervalSeconds + 5,
        Number.isInteger(data.interval) ? data.interval : 0));
      current.nextPollAt = Date.now() + current.intervalSeconds * 1000;
      await authOperation(async () => {
        if (epoch === authEpoch) await chrome.storage.session.set({ [DEVICE_KEY]: current });
      });
      return { state: "pending", ...safeFlow(current), slowedDown: true };
    }
    await finishDevice(pending, epoch);
    if (data.error === "access_denied") return { state: "denied" };
    if (data.error === "expired_token") return { state: "expired" };
    throw fail(data.error === "device_flow_disabled" ? "Enable Device Flow in the registered OAuth App settings." :
      "GitHub sign-in failed. Check the OAuth App client ID and start again.", true);
  }

  async function request(path, token, body, epoch = authEpoch) {
    if (typeof path !== "string" || !path.startsWith("/repos/") && path !== "/graphql" ||
        path.includes("//") || path.includes("..")) throw fail("Invalid GitHub API path.", true);
    await assertCurrentToken(token, epoch);
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
  const graphql = (token, query, variables, epoch = authEpoch) => request("/graphql", token, { query, variables }, epoch);
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
    if (token) await assertCurrentToken(token);
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
    if (typeof repo?.private !== "boolean" || repo.full_name?.toLowerCase() !== repository.toLowerCase() ||
        typeof repo.default_branch !== "string" || !repo.default_branch || repo.default_branch.length > 200 || /[\x00-\x1f\x7f]/.test(repo.default_branch)) {
      throw fail("Target repository is unavailable or account access could not be verified.", true);
    }
    if (repo.private && !token) throw fail("Connect an account with private repository access to verify its comment policy.", true);
    const ref = repo.default_branch;
    // Public policy is read without the token so a fine-grained Issues token lacking
    // Contents permission cannot make an existing policy look like a missing file.
    const raw = await policyGet(`/repos/${repository}/contents/.kicad-review-policy.json?ref=${encodeURIComponent(ref)}`,
      repo.private ? token : null, 128 * 1024, "application/vnd.github.raw+json");
    if (!raw) {
      if (repo.private) {
        // A private Contents 404 can hide missing Contents permission. Verify an
        // accessible, complete root listing before treating policy as absent.
        const listing = await policyGet(`/repos/${repository}/contents?ref=${encodeURIComponent(ref)}`, token, 4 * 1024 * 1024);
        const entries = listing && policyJson(listing);
        if (!Array.isArray(entries) || entries.length >= 1000 || entries.some(item => !item || typeof item.name !== "string" || typeof item.path !== "string" || item.path !== item.name || item.name.includes("/") || item.name === ".kicad-review-policy.json")) {
          throw fail("Private repository comment policy could not be verified. Grant Contents read access; publication is blocked.", true);
        }
      }
      return { ref, isPrivate: repo.private, source: "default", policy: { mode: "all", allowlist: [] } };
    }
    let value = policyJson(raw);
    if (value?.encoding === "base64" && typeof value.content === "string") {
      if (value.content.length > 48 * 1024) throw fail("Repository comment policy is too large.", true);
      try {
        const binary = atob(value.content.replace(/\s/g, ""));
        value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(
          Uint8Array.from(binary, (character) => character.charCodeAt(0))));
      } catch { throw fail("Repository comment policy is malformed; publishing is blocked.", true); }
    }
    return { ref, isPrivate: repo.private, source: "repository", policy: validatePolicy(value) };
  }
  async function commentPolicyStatus(repository) {
    repoParts(repository);
    const configured = (await tokenStatus()).configured;
    const token = configured ? await getToken() : null;
    const { ref, source, policy, isPrivate } = await readPolicy(repository, token);
    const result = { repository, ref, mode: policy.mode, source, allowed: false,
      reason: "Connect GitHub to publish comments." };
    if (!configured) return result;
    let login = null;
    try {
      const profile = await policyGet("/user", token, 1024 * 1024);
      const value = profile && policyJson(profile);
      if (LOGIN.test(value?.login || "")) login = value.login;
    } catch (error) {
      if (isPrivate || policy.mode !== "all") {
        result.reason = "Could not verify the signed-in GitHub account.";
        return result;
      }
    }
    if (login) result.login = login;
    if (isPrivate && !login) { result.reason = "Could not verify the signed-in GitHub account."; return result; }
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
    const publicationEpoch = authEpoch;
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
    if (publicationEpoch !== authEpoch) throw fail("GitHub account changed or signed out. Review and publish again.", true);
    await chrome.storage.local.set({ [key]: { status: "pending", startedAt: new Date().toISOString() } });
    let remoteRef;
    try {
      const path = `/repos/${owner}/${name}/issues`;
      if (destination === "new-issue") {
        const result = await request(path, token, { title: args.title, body }, publicationEpoch);
        if (!NUMBER(result.number)) throw fail("GitHub did not confirm the new issue number.");
        remoteRef = { kind: "issue", repository, number: result.number,
          url: `https://github.com/${repository}/issues/${result.number}`,
          publishedAt: new Date().toISOString(), ...(validId(result.node_id) ? { nodeId: result.node_id } : {}) };
      } else if (destination === "issue") {
        const result = await request(`${path}/${number}/comments`, token, { body }, publicationEpoch);
        if (!NUMBER(result.id)) throw fail("GitHub did not confirm the new comment.");
        remoteRef = { kind: "issue", repository, number,
          url: `https://github.com/${repository}/issues/${number}#issuecomment-${result.id}`,
          publishedAt: new Date().toISOString(), ...(validId(result.node_id) ? { nodeId: result.node_id } : {}) };
      } else if (destination === "new-discussion") {
        const data = await graphql(token, `mutation($input:CreateDiscussionInput!){createDiscussion(input:$input){discussion{id number}}}`, {
          input: { repositoryId: preflight.repositoryId, categoryId: args.categoryId, title: args.title, body }
        }, publicationEpoch);
        const result = data.data?.createDiscussion?.discussion;
        if (!NUMBER(result?.number) || !validId(result.id)) throw fail("GitHub did not confirm the new discussion.");
        remoteRef = { kind: "discussion", repository, number: result.number, nodeId: result.id,
          url: `https://github.com/${repository}/discussions/${result.number}`, publishedAt: new Date().toISOString() };
      } else {
        const data = await graphql(token, `mutation($input:AddDiscussionCommentInput!){addDiscussionComment(input:$input){comment{id databaseId}}}`, {
          input: { discussionId: preflight.id, body }
        }, publicationEpoch);
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
  return { tokenStatus, setToken, clearToken, resetAuth, authorizationHeaders, deviceStatus, startDevice, pollDevice, cancelDevice,
    commentPolicyStatus, validatePolicy, categories, publish, publishArgs, validRepository };
})();

if (typeof globalThis === "object") globalThis.KiCadGitHubReviewApi = KiCadGitHubReviewApi;
if (typeof module === "object" && module.exports) module.exports = KiCadGitHubReviewApi;
