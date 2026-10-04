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

async function request(type, extras = {}) {
  const response = await chrome.runtime.sendMessage({ type, ...extras });
  if (!response?.ok) throw new Error(response?.error || "Extension settings request failed.");
  return response.result;
}
async function refresh() {
  const result = await request("github-auth-status");
  statusElement.textContent = result.configured ? "GitHub access is available for this browser session." :
    "You are signed out. Public previews and local comments work without signing in.";
}
function showScope() {
  scopeHelp.textContent = accessInput.value === "repo" ?
    "Private access requests GitHub's repo scope, which grants broad read and write access to public and private repositories. Approve it only if you need private repository access; organization approval or SSO may also be required." :
    "Public access requests GitHub's public_repo scope. Tokens stay in this browser session.";
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
  finally { buttonSave.disabled = false; }
});
buttonClear.addEventListener("click", async () => {
  buttonClear.disabled = true;
  try {
    stopTimer();
    await request("github-device-cancel");
    showDevice(null);
    await request("github-auth-clear");
    tokenInput.value = "";
    await refresh();
  } catch (error) { statusElement.textContent = error.message; }
  finally { buttonClear.disabled = false; }
});
Promise.all([refresh(), request("github-device-status")]).then(([, state]) => {
  clientInput.value = state.customClientId ?? state.clientId ?? "";
  availability.textContent = state.releaseConfigured || state.clientId ? "Authorize this extension on GitHub using the code shown after sign-in." :
    "GitHub sign-in needs the publisher's OAuth App registration in this build. Local review and GitHub draft links are available. Developers can configure their own App in Advanced connection settings.";
  if (!accessInput.value) accessInput.value = "public_repo";
  showScope();
  if (state.active) { showDevice(state); schedulePoll(state.retryAfterMs); }
  else if (state.expired) deviceStatus.textContent = "The previous GitHub code expired. Start sign-in again.";
}).catch((error) => { deviceStatus.textContent = error.message; });
window.addEventListener("pagehide", stopTimer);
