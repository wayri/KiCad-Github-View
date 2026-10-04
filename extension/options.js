"use strict";

const tokenInput = document.getElementById("token");
const statusElement = document.getElementById("tokenStatus");
const buttonSave = document.getElementById("saveToken");
const buttonClear = document.getElementById("clearToken");
const clientInput = document.getElementById("clientId");
const connectButton = document.getElementById("connectGitHub");
const cancelButton = document.getElementById("cancelGitHub");
const deviceInstructions = document.getElementById("deviceInstructions");
const deviceCode = document.getElementById("deviceCode");
const verificationLink = document.getElementById("verificationLink");
const deviceStatus = document.getElementById("deviceStatus");
const accessInput = document.getElementById("githubAccess");
const scopeHelp = document.getElementById("scopeHelp");
const availability = document.getElementById("signinAvailability");
let pollTimer = null;
let expiryTimer = null;
let refreshGeneration = 0;
const demoPage = typeof location !== 'undefined' && /^https?:$/.test(location.protocol);
let accountConnected = false;

async function request(type, extras = {}) {
  const response = await chrome.runtime.sendMessage({ type, ...extras });
  if (!response?.ok) throw new Error(response?.error || "Extension settings request failed.");
  return response.result;
}
async function refresh() {
  if (demoPage) {
    statusElement.textContent = 'Account state is unavailable in this local preview.';
    return;
  }
  const generation = ++refreshGeneration;
  const result = await request("github-auth-status");
  if (generation !== refreshGeneration) return;
  accountConnected = Boolean(result.configured);
  if (expiryTimer !== null) clearTimeout(expiryTimer);
  expiryTimer = null;
  statusElement.textContent = result.configured ? "GitHub connected. Encrypted credentials expire within eight hours; background restart requires sign-in again." :
    "You are signed out. Public previews and local comments work without signing in.";
  if (!result.configured && result.reason === 'background-restarted') statusElement.textContent =
    'The extension background restarted and cleared the session. Sign in again; GitHub authorization alone does not restore the discarded encryption key.';
  else if (!result.configured && result.reason === 'expired') statusElement.textContent =
    'Your GitHub session expired. Sign in again.';
  else if (!result.configured && result.reason === 'session-locked') statusElement.textContent =
    'Your GitHub session could not be unlocked and was cleared. Sign in again.';
  connectButton.textContent = result.configured ? 'Sign out of GitHub' : 'Sign in with GitHub';
  connectButton.setAttribute?.('data-connected', String(Boolean(result.configured)));
  buttonClear.hidden = true;
  buttonClear.disabled = !result.configured;
  availability.textContent = result.configured ?
    'GitHub is connected. Return to your repository and refresh its preview to use this session.' :
    'Sign in with GitHub to read authorized repositories and publish reviews.';
  if (result.configured && Number.isFinite(result.expiresAt)) {
    expiryTimer = setTimeout(() => refresh().catch(error => { statusElement.textContent = error.message; }),
      Math.max(1000, result.expiresAt - Date.now() + 50));
  }
}
function showScope() {
  scopeHelp.textContent = accessInput.value === "repo" ?
    "Private access requests GitHub's repo scope, which grants broad read and write access to public and private repositories. Approve it only if you need private repository access; organization approval or SSO may also be required." :
    "Public access requests GitHub's public_repo scope. Credentials are encrypted with a temporary background-memory key.";
}
accessInput.addEventListener("change", showScope);
function stopTimer() {
  if (pollTimer !== null) clearTimeout(pollTimer);
  pollTimer = null;
}
function showDevice(flow) {
  const active = Boolean(flow?.active || flow?.state === "pending");
  deviceInstructions.hidden = !active;
  cancelButton.hidden = !active;
  connectButton.disabled = active;
  accessInput.disabled = active;
  if (!active) {
    deviceCode.textContent = "";
    return;
  }
  deviceCode.textContent = flow.userCode;
  if (flow.scope) { accessInput.value = flow.scope; showScope(); }
  verificationLink.href = flow.verificationUrl;
  deviceStatus.textContent = "Enter the code on GitHub. Waiting for authorization…";
  availability.textContent = 'Sign-in is in progress. After approving the code on GitHub, return here to complete the connection.';
}
function schedulePoll(delay) {
  stopTimer();
  pollTimer = setTimeout(pollOnce, Math.max(1000, Number(delay) || 5000));
}
async function pollOnce() {
  pollTimer = null;
  try {
    const result = await request("github-device-poll");
    if (result.state === "pending") {
      showDevice(result);
      if (result.slowedDown) deviceStatus.textContent = "GitHub requested slower polling; waiting before the next check.";
      schedulePoll(result.retryAfterMs);
      return;
    }
    showDevice(null);
    if (result.state === "connected") {
      deviceStatus.textContent = "GitHub connected for this browser session.";
      await refresh();
    } else if (result.state === "denied") deviceStatus.textContent = "GitHub authorization was denied. Start sign-in again if needed.";
    else if (result.state === "expired") deviceStatus.textContent = "The GitHub code expired. Start sign-in again.";
    else deviceStatus.textContent = "GitHub sign-in was cancelled.";
  } catch (error) {
    deviceStatus.textContent = error.message;
    try {
      const state = await request("github-device-status");
      if (state.active) schedulePoll(Math.max(5000, state.retryAfterMs));
      else showDevice(null);
    } catch { showDevice(null); }
  }
}
connectButton.addEventListener("click", async () => {
  if (accountConnected) { await signOut(); return; }
  connectButton.disabled = true;
  try {
    const result = await request("github-device-start", { clientId: clientInput.value.trim(), scope: accessInput.value });
    showDevice(result);
    schedulePoll(result.retryAfterMs);
  } catch (error) {
    deviceStatus.textContent = error.message;
    connectButton.disabled = false;
  }
});
cancelButton.addEventListener("click", async () => {
  stopTimer();
  cancelButton.disabled = true;
  try {
    await request("github-device-cancel");
    showDevice(null);
    deviceStatus.textContent = "GitHub sign-in cancelled.";
  } catch (error) { deviceStatus.textContent = error.message; }
  finally { cancelButton.disabled = false; }
});
buttonSave.addEventListener("click", async () => {
  buttonSave.disabled = true;
  try {
    stopTimer();
    await request("github-device-cancel");
    showDevice(null);
    await request("github-auth-set", { token: tokenInput.value });
    tokenInput.value = "";
    await refresh();
  } catch (error) { statusElement.textContent = error.message; }
  finally { tokenInput.value = ""; buttonSave.disabled = false; }
});
async function signOut() {
  connectButton.disabled = true;
  buttonClear.disabled = true;
  try {
    stopTimer();
    await request("github-device-cancel");
    showDevice(null);
    await request("github-auth-clear");
    tokenInput.value = "";
    await refresh();
  } catch (error) { statusElement.textContent = error.message; }
  finally { connectButton.disabled = false; buttonClear.disabled = !accountConnected; }
}
buttonClear.addEventListener("click", signOut);
Promise.all([refresh(), demoPage ? Promise.resolve({}) : request("github-device-status")]).then(([, state]) => {
  if (demoPage) return;
  clientInput.value = state.customClientId ?? state.clientId ?? "";
  availability.textContent = accountConnected ? 'GitHub is connected. Return to your repository and refresh its preview to use this session.' :
    state.releaseConfigured || state.clientId ? "Authorize this extension on GitHub using the code shown after sign-in." :
    "GitHub sign-in needs the publisher's OAuth App registration in this build. Local review and GitHub draft links are available. Developers can configure their own App in Advanced connection settings.";
  if (!accessInput.value) accessInput.value = "public_repo";
  showScope();
  if (state.active) { showDevice(state); schedulePoll(state.retryAfterMs); }
  else if (state.expired) deviceStatus.textContent = "The previous GitHub code expired. Start sign-in again.";
}).catch((error) => { deviceStatus.textContent = error.message; });
async function resumeConnection() {
  if (demoPage || document.visibilityState === 'hidden') return;
  try {
    await refresh();
    const state = await request('github-device-status');
    showDevice(state);
    if (state.active) schedulePoll(state.retryAfterMs);
    else if (state.reason === 'background-restarted') deviceStatus.textContent =
      'The background restarted while you were away. Start sign-in again to create a new session.';
  } catch (error) { deviceStatus.textContent = error.message; }
}
window.addEventListener('focus', resumeConnection);
window.addEventListener('pageshow', resumeConnection);
document.addEventListener?.('visibilitychange', resumeConnection);
chrome.storage?.onChanged?.addListener((changes, area) => {
  if (area === 'session' && ('github-review-token' in changes || 'github-device-pending' in changes)) {
    resumeConnection();
  }
});
window.addEventListener("pagehide", () => {
  stopTimer();
  if (expiryTimer !== null) clearTimeout(expiryTimer);
  expiryTimer = null;
});
document.getElementById("resetAuth").addEventListener("click", async () => {
  stopTimer();
  tokenInput.value = "";
  try {
    await request("github-auth-reset");
    showDevice(null);
    clientInput.value = "";
    deviceStatus.textContent = "GitHub connection reset. Local review notes are preserved.";
    await refresh();
  } catch (error) { statusElement.textContent = error.message; }
});

if (demoPage) {
  availability.textContent = 'Local preview only. Open the installed extension’s settings to sign in; this page cannot access its account or toolbar badge.';
  for (const control of [connectButton, buttonSave, buttonClear, accessInput, tokenInput, clientInput,
    document.getElementById('resetAuth'), document.getElementById('testRepositoryAccess')]) control.disabled = true;
}

document.getElementById('testRepositoryAccess').addEventListener('click', async () => {
  const button = document.getElementById('testRepositoryAccess'), status = document.getElementById('repositoryAccessStatus');
  button.disabled = true;
  try {
    let repository = document.getElementById('accessRepository').value.trim();
    if (repository.startsWith('https://github.com/')) {
      const url = new URL(repository);
      if (url.username || url.password || url.search || url.hash) throw new Error('Enter a repository URL without credentials or query parameters.');
      repository = url.pathname.split('/').filter(Boolean).slice(0, 2).join('/');
    }
    status.textContent = 'Checking GitHub account and repository access…';
    const result = await request('github-access-test', { repository });
    status.textContent = result.readable ? `Verified as @${result.login}: ${result.private ? 'private' : 'public'} repository ${result.repository} is readable. Refresh its KiCad preview.` :
      `GitHub recognizes @${result.login}, but repository read access was not granted.`;
    await refresh();
  } catch (error) { status.textContent = error.message; await refresh().catch(() => {}); }
  finally { button.disabled = demoPage; }
});
