const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function optionsHarness(respond, protocol = 'chrome-extension:') {
  const elements = new Map();
  for (const id of ['token', 'tokenStatus', 'saveToken', 'clearToken', 'resetAuth', 'clientId',
    'connectGitHub', 'cancelGitHub', 'deviceInstructions', 'deviceCode', 'verificationLink', 'deviceStatus', 'githubAccess', 'scopeHelp', 'signinAvailability',
    'accessRepository','testRepositoryAccess','repositoryAccessStatus']) {
    elements.set(id, { value: '', textContent: '', disabled: false, hidden: false, href: '', listeners: new Map(), attributes: new Map(),
      setAttribute(name,value) {this.attributes.set(name,value);},
      addEventListener(type, fn) { this.listeners.set(type, fn); } });
  }
  const requests = [], timers = [], windowEvents = new Map(), documentEvents = new Map();
  let storageListener;
  const context = { URL, location: { protocol }, document: { getElementById: (id) => elements.get(id),
    addEventListener: (type, fn) => documentEvents.set(type, fn) },
    window: { addEventListener: (type, fn) => windowEvents.set(type, fn) },
    setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; },
    clearTimeout: () => {},
    chrome: { storage: { onChanged: { addListener: fn => { storageListener = fn; } } }, runtime: { sendMessage: async (request) => {
      requests.push(request);
      return { ok: true, result: respond ? respond(request) : request.type === 'github-auth-status' ?
        { configured: false } : request.type === 'github-device-status' ?
          { active: false, clientId: '' } : { configured: request.type === 'github-auth-set' } };
    } } } };
  const source = fs.readFileSync(path.join(__dirname, '..', 'options.js'), 'utf8');
  vm.runInNewContext(source, context, { filename: 'options.js' });
  return { elements, requests, timers, windowEvents, documentEvents,
    storageChanged: (changes, area) => storageListener(changes, area) };
}

test('returning from GitHub resumes pending authorization and updates connected state', async () => {
  let connected = false;
  const h = optionsHarness(request => request.type === 'github-auth-status' ? { configured: connected } :
    request.type === 'github-device-status' ? { active: !connected, clientId: 'Ov23liSavedClient',
      userCode: 'TEST-CODE', retryAfterMs: 5000 } : { state: 'connected' });
  await new Promise(setImmediate);
  connected = true;
  await h.windowEvents.get('focus')();
  assert.match(h.elements.get('tokenStatus').textContent, /GitHub connected/);
  assert.equal(h.elements.get('connectGitHub').textContent, 'Sign out of GitHub');
  assert.equal(h.elements.get('connectGitHub').attributes.get('data-connected'), 'true');
  assert.equal(h.elements.get('connectGitHub').disabled, false);
  assert.equal(h.elements.get('deviceInstructions').hidden, true);
  assert.equal(h.elements.get('clearToken').disabled, false);
  assert.match(h.elements.get('signinAvailability').textContent, /GitHub is connected/);
  assert.equal(h.elements.get('cancelGitHub').hidden, true);
  assert.equal(h.elements.get('deviceCode').textContent, '');
  connected = false;
  h.storageChanged({'github-review-token':{}}, 'session');
  await new Promise(setImmediate);
  assert.match(h.elements.get('tokenStatus').textContent, /signed out/);
  assert.equal(h.elements.get('clearToken').disabled, true);
});

test('worker restart is explained and local preview cannot pretend to authenticate', async () => {
  const h = optionsHarness(request => request.type === 'github-auth-status' ?
    {configured:false,reason:'background-restarted'} : {active:false,clientId:'Ov23liSavedClient'});
  await new Promise(setImmediate);
  assert.match(h.elements.get('tokenStatus').textContent, /background restarted/);
  const local = optionsHarness(undefined, 'http:');
  await new Promise(setImmediate);
  assert.match(local.elements.get('signinAvailability').textContent, /Local preview only/);
  assert.equal(local.elements.get('connectGitHub').disabled, true);
  assert.equal(local.requests.some(request => request.type === 'github-auth-status'), false);
});

test('access check reports verified private access using the actual account', async () => {
  const h=optionsHarness(request=>request.type==='github-access-test' ?
    {login:'reviewer',repository:'owner/private',private:true,readable:true} :
    request.type==='github-auth-status'?{configured:true}:{active:false,clientId:'Ov23liSavedClient'});
  await new Promise(setImmediate);
  h.elements.get('accessRepository').value='https://github.com/owner/private';
  await h.elements.get('testRepositoryAccess').listeners.get('click')();
  assert.equal(h.requests.find(r=>r.type==='github-access-test').repository,'owner/private');
  assert.match(h.elements.get('repositoryAccessStatus').textContent, /Verified as @reviewer: private repository owner\/private is readable/);
});

test('connected main button signs out and returns to green sign-in state', async () => {
  let connected=true;
  const h=optionsHarness(request=>{
    if(request.type==='github-auth-clear')connected=false;
    return request.type==='github-auth-status'?{configured:connected}:{active:false,clientId:'Ov23liSavedClient'};
  });
  await new Promise(setImmediate);
  const button=h.elements.get('connectGitHub');
  assert.equal(button.textContent,'Sign out of GitHub');
  await button.listeners.get('click')();
  assert.ok(h.requests.some(request=>request.type==='github-auth-clear'));
  assert.equal(h.requests.some(request=>request.type==='github-device-start'),false);
  assert.equal(button.textContent,'Sign in with GitHub');
  assert.equal(button.attributes.get('data-connected'),'false');
  assert.equal(button.disabled,false);
});

test('options sends a token only on explicit save and clears the password field', async () => {
  const { elements, requests } = optionsHarness();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(requests.map((r) => r.type), ['github-auth-status', 'github-device-status']);
  elements.get('token').value = 'github_pat_secret';
  await elements.get('saveToken').listeners.get('click')();
  assert.equal(requests[2].type, 'github-device-cancel');
  assert.equal(requests[3].type, 'github-auth-set');
  assert.equal(requests[3].token, 'github_pat_secret');
  assert.equal(elements.get('token').value, '');
  assert.equal(elements.get('tokenStatus').textContent.includes('github_pat_secret'), false);
  await elements.get('clearToken').listeners.get('click')();
  assert.equal(requests.at(-2).type, 'github-auth-clear');
});

test('reset clears credential fields and requests privileged cleanup', async () => {
  const { elements, requests } = optionsHarness();
  await new Promise(resolve => setImmediate(resolve));
  elements.get('token').value = 'temporary-secret';
  elements.get('clientId').value = 'custom-client';
  await elements.get('resetAuth').listeners.get('click')();
  assert.equal(elements.get('token').value, '');
  assert.equal(elements.get('clientId').value, '');
  assert.ok(requests.some(r => r.type === 'github-auth-reset'));
});

test('Connect shows only a verification code and polls after the worker interval', async () => {
  const token = 'gho_private_should_not_appear';
  const { elements, requests, timers } = optionsHarness((request) => {
    if (request.type === 'github-auth-status') return { configured: false };
    if (request.type === 'github-device-status') return { active: false, clientId: 'Ov23liSavedClient' };
    if (request.type === 'github-device-start') return { state: 'pending', userCode: 'ABCD-EFGH',
      verificationUrl: 'https://github.com/login/device', retryAfterMs: 5000 };
    if (request.type === 'github-device-poll') return { state: 'connected', secret: token };
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(elements.get('clientId').value, 'Ov23liSavedClient');
  assert.equal(requests.some((r) => r.type === 'github-device-start'), false);
  await elements.get('connectGitHub').listeners.get('click')();
  assert.equal(requests.at(-1).clientId, 'Ov23liSavedClient');
  assert.equal(requests.at(-1).scope, 'public_repo');
  assert.equal(elements.get('deviceCode').textContent, 'ABCD-EFGH');
  assert.equal(elements.get('verificationLink').href, 'https://github.com/login/device');
  assert.equal(timers[0].delay, 5000);
  assert.equal(requests.some((r) => r.type === 'github-device-poll'), false);
  await timers[0].fn();
  assert.equal(requests.some((r) => r.type === 'github-device-poll'), true);
  assert.equal(elements.get('deviceInstructions').hidden, true);
  assert.equal(JSON.stringify([...elements.values()].map((element) => element.textContent)).includes(token), false);
});

test('private access is an explicit choice with a broad-permission explanation', async () => {
  const { elements, requests } = optionsHarness(request => request.type === 'github-device-status' ?
    {active:false, clientId:'Ov23liSavedClient'} : request.type === 'github-device-start' ?
    {state:'pending',userCode:'TEST-CODE',verificationUrl:'https://github.com/login/device',scope:'repo'} : {configured:false});
  await new Promise(resolve => setImmediate(resolve));
  const access = elements.get('githubAccess');
  assert.equal(access.value, 'public_repo');
  access.value = 'repo';access.listeners.get('change')();
  assert.match(elements.get('scopeHelp').textContent, /broad read and write/);
  await elements.get('connectGitHub').listeners.get('click')();
  assert.equal(requests.at(-1).scope, 'repo');
  assert.equal(access.disabled, true);
});

test('unconfigured release explains publisher setup and advanced fields are collapsed', async () => {
  const { elements } = optionsHarness();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(elements.get('signinAvailability').textContent, /publisher's OAuth App registration/);
  const html = fs.readFileSync(path.join(__dirname,'../options.html'),'utf8');
  assert.match(html, /<button id="connectGitHub"[^>]*>Sign in with GitHub<\/button>/);
  assert.match(html, /<details id="advancedAuth">/);
  assert.equal(html.match(/id="clearToken"/g).length, 1);
  assert.ok(html.indexOf('<details id="advancedAuth">') < html.indexOf('id="clientId"'));
  assert.ok(html.indexOf('<details id="advancedAuth">') < html.indexOf('id="token"'));
});
