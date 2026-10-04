const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function optionsHarness(respond) {
  const elements = new Map();
  for (const id of ['token', 'tokenStatus', 'saveToken', 'clearToken', 'clientId',
    'connectGitHub', 'cancelGitHub', 'deviceInstructions', 'deviceCode', 'verificationLink', 'deviceStatus', 'githubAccess', 'scopeHelp', 'signinAvailability']) {
    elements.set(id, { value: '', textContent: '', disabled: false, hidden: false, href: '', listeners: new Map(),
      addEventListener(type, fn) { this.listeners.set(type, fn); } });
  }
  const requests = [], timers = [];
  const context = { document: { getElementById: (id) => elements.get(id) },
    window: { addEventListener: () => {} },
    setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; },
    clearTimeout: () => {},
    chrome: { runtime: { sendMessage: async (request) => {
      requests.push(request);
      return { ok: true, result: respond ? respond(request) : request.type === 'github-auth-status' ?
        { configured: false } : request.type === 'github-device-status' ?
          { active: false, clientId: '' } : { configured: request.type === 'github-auth-set' } };
    } } } };
  const source = fs.readFileSync(path.join(__dirname, '..', 'options.js'), 'utf8');
  vm.runInNewContext(source, context, { filename: 'options.js' });
  return { elements, requests, timers };
}

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
