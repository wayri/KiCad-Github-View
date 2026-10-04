const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');
const { MessageChannel } = require('node:worker_threads');
const source = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const quietTimer = (fn, delay) => { const timer = setTimeout(fn, delay); timer.unref(); return timer; };
function workerHarness() {
  let now = Date.now(), sequence = 0;
  const replies = new Map(), output = { onmessage: null };
  const self = { postMessage: reply => { replies.get(reply.id)?.(reply); replies.delete(reply.id); output.onmessage?.({ data: reply }); } };
  vm.runInNewContext(source('credential-vault-worker.js'), { self, URL, TextEncoder, TextDecoder, Uint8Array,
    crypto: webcrypto, setTimeout: quietTimer, clearTimeout, Date: { now: () => now } });
  output.postMessage = data => self.onmessage({ data });
  return { output, advance: ms => { now += ms; }, now: () => now,
    rpc: async (op, namespace = 'github', extra = {}) => {
      const id = String(++sequence);
      const response = await new Promise(resolve => { replies.set(id, resolve); self.onmessage({ data: { id, op, namespace, ...extra } }); });
      if (!response.ok) throw new Error(response.error);
      return response.value;
    } };
}
const token = 'ghp_abcdefghijklmnopqrstuvwxyz';
test('worker authenticates namespace and expiry, rejects malformed records, then clears', async () => {
  const w = workerHarness(), expiresAt = w.now() + 60000;
  const record = await w.rpc('encrypt', 'github', { token, expiresAt });
  assert.equal(record.version, 2);
  assert.equal(JSON.stringify(record).includes(token), false);
  assert.equal(await w.rpc('decrypt', 'github', { record }), token);
  await assert.rejects(w.rpc('decrypt', 'gitlab:https://gitlab.com', { record }));
  await assert.rejects(w.rpc('decrypt', 'github', { record: { ...record, expiresAt: expiresAt + 1 } }));
  await assert.rejects(w.rpc('decrypt', 'github', { record: { ...record, iv: [1] } }));
  await w.rpc('clear');
  assert.equal(await w.rpc('hasKey'), false);
  await assert.rejects(w.rpc('decrypt', 'github', { record }));
});
test('expiry and queued clear cannot resurrect credentials; limits are bounded', async () => {
  const w = workerHarness();
  await assert.rejects(w.rpc('encrypt', 'github', { token, expiresAt: w.now() + 8 * 3600000 + 1 }));
  const writing = w.rpc('encrypt', 'github', { token, expiresAt: w.now() + 1000 });
  const clearing = w.rpc('clear');
  await writing; await clearing;
  assert.equal(await w.rpc('hasKey'), false);
  const record = await w.rpc('encrypt', 'github', { token, expiresAt: w.now() + 1000 });
  w.advance(1001);
  await assert.rejects(w.rpc('decrypt', 'github', { record }));
  for (let i = 0; i < 32; i++) await w.rpc('encrypt', `gitlab:https://h${i}.example`, { token, expiresAt: w.now() + 1000 });
  await assert.rejects(w.rpc('encrypt', 'github', { token, expiresAt: w.now() + 1000 }));
});
test('private host rejects window and foreign-worker senders', () => {
  let listener, started = 0;
  class ServiceWorker { constructor(scriptURL) { this.scriptURL = scriptURL; } }
  class Worker { postMessage() {} }
  const runtime = { getURL: p => `chrome-extension://test/${p}` };
  vm.runInNewContext(source('credential-vault-host.js'), { Worker, ServiceWorker, chrome: { runtime },
    navigator: { serviceWorker: { addEventListener: (_, fn) => { listener = fn; } } }, setTimeout: quietTimer, clearTimeout });
  const port = { start: () => started++, postMessage() {} };
  const data = { type: 'kicad-credential-channel-v1' };
  listener({ source: { scriptURL: runtime.getURL('background.js') }, data, ports: [port] });
  listener({ source: new ServiceWorker('https://evil.example/sw.js'), data, ports: [port] });
  assert.equal(started, 0);
  listener({ source: new ServiceWorker(runtime.getURL('background.js')), data, ports: [port] });
  assert.equal(started, 1);
});
test('background restart reconnects to existing host without creating it on status; host loss locks session', async t => {
  const w = workerHarness(), channels = [];
  let active = false, creates = 0, clientId = 'host-1';
  const url = 'chrome-extension://test/credential-vault-host.html';
  const client = { get id() { return clientId; }, url, postMessage(message, ports) {
    assert.equal(message.type, 'kicad-credential-channel-v1');
    const port = ports[0]; channels.push(port);
    port.onmessage = async event => {
      const { id, op, namespace, ...extra } = event.data;
      try { port.postMessage({ id, ok: true, value: await w.rpc(op, namespace, extra) }); }
      catch { port.postMessage({ id, ok: false }); }
    };
    port.start(); port.postMessage({ ready: true });
  } };
  class Channel extends MessageChannel { constructor() { super(); channels.push(this.port1); } }
  const chrome = { runtime: { getURL: () => url, getContexts: async () => active ? [{}] : [] },
    offscreen: { createDocument: async args => { assert.deepEqual(Array.from(args.reasons), ['WORKERS']); active = true; creates++; } } };
  const freshBackground = () => vm.runInNewContext(source('credential-vault.js') + '\nKiCadCredentialVault', {
    chrome, clients: { matchAll: async () => active ? [client] : [] }, MessageChannel: Channel, setTimeout: quietTimer, clearTimeout });
  t.after(() => channels.forEach(port => port.close()));
  const first = freshBackground(); assert.equal(first.supported, true);
  assert.equal(await first.forProvider('github').hasKey(), false); assert.equal(creates, 0);
  const record = await first.forProvider('github').encrypt(token, w.now() + 60000);
  const second = freshBackground();
  assert.equal(await second.forProvider('github').hasKey(), true);
  assert.equal(await second.forProvider('github').decrypt(record), token);
  assert.equal(creates, 1);
  active = false;
  assert.equal(await second.forProvider('github').hasKey(), false);
  await assert.rejects(second.forProvider('github').decrypt(record));
  assert.equal(creates, 1);
});

function providerHarness(worker, session = new Map(), local = new Map(), beforeEncrypt = async () => {}) {
  const area = map => ({ get: async key => ({ [key]: map.get(key) }),
    set: async values => { for (const [key, value] of Object.entries(values)) map.set(key, structuredClone(value)); },
    remove: async keys => { for (const key of [].concat(keys)) map.delete(key); }, setAccessLevel: async () => {} });
  const vault = { supported: true, forProvider: namespace => ({
    hasKey: () => worker.rpc('hasKey', namespace), clear: () => worker.rpc('clear', namespace),
    decrypt: record => worker.rpc('decrypt', namespace, { record }),
    encrypt: async (token, expiresAt) => { await beforeEncrypt(); return worker.rpc('encrypt', namespace, { token, expiresAt }); }
  }) };
  class Clock extends Date { static now() { return worker.now(); } }
  const context = vm.createContext({ crypto: webcrypto, URL, URLSearchParams, TextEncoder, TextDecoder, AbortController, Date: Clock,
    setTimeout, clearTimeout, KiCadCredentialVault: vault, chrome: { storage: { session: area(session), local: area(local) } } });
  const github = vm.runInContext(source('github-review-api.js') + '\nKiCadGitHubReviewApi', context);
  const gitlab = vm.runInContext(source('gitlab-review-api.js') + '\nKiCadGitLabReviewApi', context);
  return { github, gitlab, session, local };
}
test('both provider APIs retain encrypted sessions across background restarts and reset only their namespace', async () => {
  const w = workerHarness(), first = providerHarness(w), host = 'https://gitlab.com', other = 'https://gitlab.example';
  await first.github.setToken(token);
  await first.gitlab.setToken(host, token);
  await first.gitlab.setToken(other, token);
  assert.equal(first.session.get('github-review-token').version, 2);
  assert.equal(first.session.get('gitlab-review-vault-v1')[host].version, 2);
  assert.equal(JSON.stringify([...first.session]).includes(token), false);
  const restarted = providerHarness(w, first.session, first.local);
  assert.equal((await restarted.github.tokenStatus()).configured, true);
  assert.equal((await restarted.gitlab.authStatus(host)).configured, true);
  assert.equal((await restarted.github.authorizationHeaders()).Authorization, `Bearer ${token}`);
  await restarted.gitlab.resetAuth(host);
  assert.equal(await w.rpc('hasKey', `gitlab:${host}`), false);
  assert.equal((await restarted.gitlab.authStatus(other)).configured, true);
  assert.equal((await restarted.github.tokenStatus()).configured, true);
  await restarted.github.resetAuth();
  assert.equal(await w.rpc('hasKey'), false);
  assert.equal(first.session.has('github-review-token'), false);
  const lostHost = providerHarness(workerHarness(), first.session, first.local);
  assert.equal((await lostHost.gitlab.authStatus(other)).configured, false);
  assert.equal(first.session.has('gitlab-review-vault-v1'), false);
});
test('reset during offscreen encryption clears both key and ciphertext for both providers', async () => {
  for (const provider of ['github', 'gitlab']) {
    let entered, release;
    const ready = new Promise(resolve => { entered = resolve; });
    const w = workerHarness(), h = providerHarness(w, undefined, undefined, async () => { entered(); await new Promise(resolve => { release = resolve; }); });
    const host = 'https://gitlab.com';
    const saving = provider === 'github' ? h.github.setToken(token) : h.gitlab.setToken(host, token);
    const rejected = assert.rejects(saving, /cancelled/);
    await ready;
    const resetting = provider === 'github' ? h.github.resetAuth() : h.gitlab.resetAuth(host);
    release(); await rejected; await resetting;
    assert.equal(await w.rpc('hasKey', provider === 'github' ? 'github' : `gitlab:${host}`), false);
    assert.equal(h.session.size, 0);
  }
});
