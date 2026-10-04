const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const webcrypto = require('node:crypto').webcrypto;
const TOKEN = 'github_pat_' + 's'.repeat(60);
function harness(session = new Map(), local = new Map(), crypto = webcrypto, beforeSet = async () => {}) {
  const area = map => ({ get: async key => ({ [key]: map.get(key) }),
    set: async values => { await beforeSet(values); for (const [key, value] of Object.entries(values)) map.set(key, value); },
    remove: async keys => { for (const key of [].concat(keys)) map.delete(key); },
    setAccessLevel: async value => { assert.equal(value.accessLevel, 'TRUSTED_CONTEXTS'); } });
  const context = vm.createContext({ crypto, TextEncoder, TextDecoder, URLSearchParams, AbortController,
    setTimeout, clearTimeout, chrome: { storage: { session: area(session), local: area(local) } } });
  vm.runInContext(fs.readFileSync(require.resolve('../github-review-api.js'), 'utf8'), context);
  return { api: context.KiCadGitHubReviewApi, session, local, context };
}
test('session storage contains authenticated ciphertext, unique IVs and no extractable key', async () => {
  let generated;
  const crypto = { getRandomValues: a => webcrypto.getRandomValues(a), subtle: {
    generateKey: async (...args) => { generated = await webcrypto.subtle.generateKey(...args); return generated; },
    encrypt: (...args) => webcrypto.subtle.encrypt(...args), decrypt: (...args) => webcrypto.subtle.decrypt(...args)
  } };
  const h = harness(undefined, undefined, crypto);
  await h.api.setToken(TOKEN);
  const first = h.session.get('github-review-token');
  assert.equal(JSON.stringify([...h.session]).includes(TOKEN), false);
  assert.equal(h.local.size, 0);
  assert.equal(generated.extractable, false);
  await assert.rejects(webcrypto.subtle.exportKey('raw', generated));
  assert.equal((await h.api.authorizationHeaders()).Authorization, 'Bearer ' + TOKEN);
  assert.equal(JSON.stringify(await h.api.tokenStatus()).includes(TOKEN), false);
  await h.api.setToken(TOKEN);
  assert.notDeepEqual(h.session.get('github-review-token').iv, first.iv);
  assert.ok(h.session.get('github-review-token').expiresAt <= Date.now() + 8 * 60 * 60 * 1000);
});
test('copied ciphertext, legacy plaintext and pending login are purged in a fresh worker', async () => {
  const first = harness(); await first.api.setToken(TOKEN);
  const copied = new Map(first.session); copied.set('github-device-pending', { deviceCode: 'secret' });
  const second = harness(copied);
  assert.equal((await second.api.tokenStatus()).configured, false);
  assert.equal(copied.size, 0);
  const local = new Map([['github-review-token', TOKEN]]);
  const legacy = harness(new Map([['github-review-token', TOKEN]]), local);
  assert.equal((await legacy.api.tokenStatus()).configured, false);
  assert.equal(legacy.session.size, 0); assert.equal(local.size, 0);
});
test('tampering with ciphertext, expiry, IV or schema fails closed and purges credentials', async () => {
  for (const mutate of [r => r.ciphertext[0] ^= 1, r => r.expiresAt += 100000,
    r => r.iv.pop(), r => r.version = 2, r => r.iv[0] = 256]) {
    const h = harness(); await h.api.setToken(TOKEN);
    mutate(h.session.get('github-review-token'));
    assert.equal((await h.api.tokenStatus()).configured, false);
    assert.equal(h.session.has('github-review-token'), false);
    assert.equal(Object.keys(await h.api.authorizationHeaders()).length, 0);
  }
});
test('expired credentials, sign-out and reset remove all authentication secrets', async () => {
  const h = harness(); await h.api.setToken(TOKEN, 1);
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal((await h.api.tokenStatus()).configured, false);
  await h.api.setToken(TOKEN);
  h.session.set('github-device-pending', { deviceCode: 'secret' });
  await h.api.clearToken();
  assert.equal(h.session.size, 0);
  assert.equal(Object.keys(await h.api.authorizationHeaders()).length, 0);
  h.local.set('github-oauth-client-id', 'public-id');
  await h.api.setToken(TOKEN); await h.api.resetAuth();
  assert.equal(h.local.size, 0); assert.equal(h.session.size, 0);
});
test('sign-out during encryption cannot resurrect a credential', async () => {
  let release, started;
  const ready = new Promise(resolve => { started = resolve; });
  const crypto = { getRandomValues: a => webcrypto.getRandomValues(a), subtle: {
    generateKey: (...args) => webcrypto.subtle.generateKey(...args),
    encrypt: async (...args) => { started(); await new Promise(resolve => { release = resolve; }); return webcrypto.subtle.encrypt(...args); },
    decrypt: (...args) => webcrypto.subtle.decrypt(...args)
  } };
  const h = harness(undefined, undefined, crypto);
  const save = h.api.setToken(TOKEN);
  const rejected = assert.rejects(save, /cancelled/);
  await ready; const clear = h.api.clearToken(); release();
  await rejected; await clear;
  assert.equal(h.session.size, 0);
  assert.equal((await h.api.tokenStatus()).configured, false);
});
test('cancelling login during ciphertext storage cannot leave a usable credential', async () => {
  let release, reached;
  const ready = new Promise(resolve => { reached = resolve; });
  const h = harness(undefined, undefined, undefined, async values => {
    if (values['github-review-token']) { reached(); await new Promise(resolve => { release = resolve; }); }
  });
  const save = h.api.setToken(TOKEN);
  const rejected = assert.rejects(save, /cancelled/);
  await ready; const cancel = h.api.cancelDevice(); release();
  await rejected; await cancel;
  assert.equal(h.session.size, 0);
  assert.equal((await h.api.tokenStatus()).configured, false);
});
