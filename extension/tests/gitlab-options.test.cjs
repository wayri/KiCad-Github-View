const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

const source = fs.readFileSync(require.resolve('../gitlab-options.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness({ permission = true, respond, oauthSupported = true } = {}) {
  const elements = new Map(), requests = [], permissions = [], timeline = [];
  const ids = ['gitlabStatus', 'gitlabHost', 'gitlabClientId', 'gitlabRedirectUri', 'gitlabOAuth', 'gitlabRemoveHost', 'gitlabAppLink', 'gitlabAddHost', 'gitlabNewHost', 'gitlabSaveToken', 'gitlabToken', 'gitlabSignOut', 'gitlabReset'];
  const element = () => ({ value: '', textContent: '', disabled: false, href: '', children: [], listeners: new Map(), addEventListener(type, fn) { this.listeners.set(type, fn); }, replaceChildren() { this.children = []; }, append(child) { this.children.push(child); } });
  for (const id of ids) elements.set(id, element());
  elements.get('gitlabHost').value = 'https://gitlab.com';
  const hosts = ['https://gitlab.com']; let configured = false, clientId = '';
  const context = { URL, document: { getElementById: id => elements.get(id), createElement: element }, chrome: {
    permissions: { request: async details => { permissions.push(details); timeline.push('permission'); return permission; } },
    runtime: { sendMessage: async request => {
      requests.push(request); timeline.push(request.type);
      if (respond) { const reply = await respond(request, elements); if (reply !== undefined) return reply; }
      let result;
      switch (request.type) {
        case 'gitlab-host-list': result = { hosts: [...hosts] }; break;
        case 'gitlab-host-add': hosts.push(request.host); result = { host: request.host }; break;
        case 'gitlab-host-remove': hosts.splice(hosts.indexOf(request.host), 1); result = {}; break;
        case 'gitlab-auth-set': configured = true; result = { configured: true }; break;
        case 'gitlab-auth-clear': configured = false; result = {}; break;
        case 'gitlab-auth-reset': configured = false; clientId = ''; result = {}; break;
        case 'gitlab-client-set': clientId = request.clientId; result = {}; break;
        case 'gitlab-oauth-start': configured = true; result = {}; break;
        default: result = { host: request.host, configured, clientId, oauthSupported, redirectUri: 'https://test.chromiumapp.org/gitlab' };
      }
      return { ok: true, result };
    } }
  } };
  vm.runInNewContext(source, context, { filename: 'gitlab-options.js' });
  const click = id => elements.get(id).listeners.get('click')({ currentTarget: elements.get(id) });
  return { elements, requests, permissions, timeline, click };
}

test('GitLab settings request no permissions or credentials before explicit user action', async () => {
  const h = harness(); await tick();
  assert.deepEqual(h.requests.map(request => request.type), ['gitlab-host-list', 'gitlab-auth-status']);
  assert.equal(h.permissions.length, 0); assert.equal(h.elements.get('gitlabRemoveHost').disabled, true);
  assert.equal(h.elements.get('gitlabRedirectUri').value, 'https://test.chromiumapp.org/gitlab');
});
test('self-hosted GitLab requests permission for the exact HTTPS origin before registration', async () => {
  const h = harness(); await tick();
  h.elements.get('gitlabNewHost').value = 'https://gitlab.example.org:8443'; await h.click('gitlabAddHost');
  assert.equal(h.permissions.length, 1); assert.equal(h.permissions[0].origins.length, 1); assert.equal(h.permissions[0].origins[0], 'https://gitlab.example.org:8443/*');
  const add = h.requests.find(request => request.type === 'gitlab-host-add'); assert.equal(add.host, 'https://gitlab.example.org:8443'); assert.equal(add.provider, 'gitlab');
  assert.ok(h.timeline.indexOf('permission') < h.timeline.indexOf('gitlab-host-add'));
  assert.equal(h.elements.get('gitlabHost').value, add.host); assert.equal(h.elements.get('gitlabAppLink').href, add.host + '/user_settings/applications');
});
test('invalid GitLab origins and denied permission never register a server', async () => {
  for (const origin of ['http://gitlab.example.org', 'https://user:pass@gitlab.example.org', 'https://gitlab.example.org/path', 'https://gitlab.example.org?x=1', 'https://gitlab.example.org/#x']) {
    const h = harness(); await tick(); h.elements.get('gitlabNewHost').value = origin; await h.click('gitlabAddHost');
    assert.equal(h.permissions.length, 0); assert.equal(h.requests.some(request => request.type === 'gitlab-host-add'), false); assert.match(h.elements.get('gitlabStatus').textContent, /exact HTTPS/);
  }
  const denied = harness({ permission: false }); await tick(); denied.elements.get('gitlabNewHost').value = 'https://gitlab.example.org'; await denied.click('gitlabAddHost');
  assert.equal(denied.requests.some(request => request.type === 'gitlab-host-add'), false); assert.match(denied.elements.get('gitlabStatus').textContent, /not granted/);
});
test('GitLab token input is cleared before the privileged save request', async () => {
  const token = 'glpat_ui_test_abcdefghijklmnopqrst';
  const h = harness({ respond: (request, elements) => { if (request.type === 'gitlab-auth-set') assert.equal(elements.get('gitlabToken').value, ''); } }); await tick();
  h.elements.get('gitlabToken').value = token; await h.click('gitlabSaveToken');
  const save = h.requests.find(request => request.type === 'gitlab-auth-set'); assert.equal(save.token, token); assert.equal(save.host, 'https://gitlab.com'); assert.equal(save.provider, 'gitlab');
  assert.equal(h.elements.get('gitlabStatus').textContent.includes(token), false);
});
test('failed GitLab token save keeps the input cleared and reports the failure', async () => {
  const h = harness({ respond: request => request.type === 'gitlab-auth-set' ? { ok: false, error: 'Token validation failed.' } : undefined }); await tick();
  h.elements.get('gitlabToken').value = 'glpat_invalid_abcdefghijklmnopqrst'; await h.click('gitlabSaveToken');
  assert.equal(h.elements.get('gitlabToken').value, ''); assert.equal(h.elements.get('gitlabStatus').textContent, 'Token validation failed.'); assert.equal(h.elements.get('gitlabSaveToken').disabled, false);
});
test('GitLab sign-out and reset target the selected host and clear credential fields', async () => {
  const h = harness(); await tick(); h.elements.get('gitlabNewHost').value = 'https://gitlab.example.org'; await h.click('gitlabAddHost');
  h.elements.get('gitlabToken').value = 'temporary-token'; await h.click('gitlabSignOut');
  assert.equal(h.requests.find(request => request.type === 'gitlab-auth-clear').host, 'https://gitlab.example.org'); assert.equal(h.elements.get('gitlabToken').value, '');
  h.elements.get('gitlabClientId').value = 'publicclientid123456'; await h.click('gitlabOAuth');
  h.elements.get('gitlabToken').value = 'temporary-token'; await h.click('gitlabReset');
  assert.equal(h.requests.find(request => request.type === 'gitlab-auth-reset').host, 'https://gitlab.example.org'); assert.equal(h.elements.get('gitlabToken').value, ''); assert.equal(h.elements.get('gitlabClientId').value, '');
});
test('GitLab OAuth routes public client ID and sign-in separately without a secret', async () => {
  const h = harness(); await tick(); h.elements.get('gitlabNewHost').value = 'https://gitlab.example.org'; await h.click('gitlabAddHost');
  h.elements.get('gitlabClientId').value = ' publicclientid123456 '; await h.click('gitlabOAuth');
  const messages = h.requests.filter(request => ['gitlab-client-set', 'gitlab-oauth-start'].includes(request.type));
  assert.deepEqual(messages.map(request => request.type), ['gitlab-client-set', 'gitlab-oauth-start']);
  assert.equal(messages[0].clientId, 'publicclientid123456');
  for (const request of messages) { assert.equal(request.host, 'https://gitlab.example.org'); assert.equal(request.provider, 'gitlab'); assert.equal('clientSecret' in request, false); assert.equal('token' in request, false); }
  assert.equal('clientId' in messages[1], false);
});
test('GitLab OAuth is disabled when the browser has no identity flow', async () => {
  const h = harness({ oauthSupported: false }); await tick(); assert.equal(h.elements.get('gitlabOAuth').disabled, true);
  assert.equal(h.requests.some(request => request.type === 'gitlab-oauth-start'), false);
});
