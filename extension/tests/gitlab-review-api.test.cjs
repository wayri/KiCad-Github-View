const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const comments = require('../review-comments.js'), github = require('../github-review-api.js');
const source = fs.readFileSync(require.resolve('../gitlab-review-api.js'), 'utf8');
const HOST = 'https://gitlab.example.org', TOKEN = 'glpat_test_abcdefghijklmnopqrstuv';
const note = type => ({ id: 'gitlab-note', text: 'Inspect U1 clearance', threadType: type, createdAt: '2026-10-04T01:00:00Z', anchor: { provider: 'gitlab', host: HOST, repository: 'group/sub/project', ref: 'main', file: 'board.kicad_pcb', reference: 'U1' } });
function harness({ session = new Map(), local = new Map(), route, identity, beforeSet = async () => {} } = {}) {
  const calls = [];
  const area = map => ({ get: async key => ({ [key]: map.get(key) }), set: async value => { await beforeSet(value); for (const [k, v] of Object.entries(value)) map.set(k, v); }, remove: async keys => { for (const key of [].concat(keys)) map.delete(key); }, setAccessLevel: async () => {} });
  const ctx = vm.createContext({ URL, URLSearchParams, TextEncoder, TextDecoder, crypto: require('node:crypto').webcrypto, btoa, atob, AbortController, setTimeout, clearTimeout,
    KiCadReviewComments: comments, KiCadGitHubReviewApi: github, chrome: { storage: { session: area(session), local: area(local) }, identity }, fetch: async (url, init) => {
      calls.push({ url, init }); assert.equal(new URL(url).origin, HOST); assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'error');
      let data = route ? await route(url, init) : undefined;
      if (data === undefined) {
        if (url.endsWith('/api/v4/user')) data = { id: 42, username: 'reviewer', email: 'reviewer@example.org' };
        else if (url.includes('/repository/files/')) data = 404;
        else if (url.includes('/repository/tree?')) data = [{ name: 'board.kicad_pcb', path: 'board.kicad_pcb' }];
        else if (url.endsWith('/members/all/42')) data = 404;
        else if (url.endsWith('/discussions')) data = { id: 'thread', notes: [{ id: 88 }] };
        else if (url.endsWith('/notes')) data = { id: 89 };
        else if (url.endsWith('/issues')) data = { iid: 7 };
        else if (url.endsWith('/oauth/token')) data = { access_token: TOKEN, token_type: 'Bearer', scope: 'api', expires_in: 7200 };
        else data = { id: 9, path_with_namespace: 'group/sub/project', default_branch: 'main' };
      }
      return typeof data === 'number' ? new Response('', { status: data }) : new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
    } });
  vm.runInContext(source, ctx); return { api: ctx.KiCadGitLabReviewApi, calls, local, session };
}
test('GitLab vault encrypts isolated host tokens and purges across process restart', async () => {
  const h = harness(); await h.api.setToken(HOST, TOKEN); await h.api.setToken('https://gitlab.com', 'glpat_other_abcdefghijklmnopqrstuv');
  assert.equal(JSON.stringify([...h.session]).includes(TOKEN), false);
  assert.equal((await h.api.authorizationHeaders(HOST)).Authorization, 'Bearer ' + TOKEN);
  assert.equal((await h.api.authorizationHeaders('https://unconfigured.example')).Authorization, undefined);
  await h.api.clearToken(HOST); assert.equal((await h.api.authStatus(HOST)).configured, false); assert.equal((await h.api.authStatus('https://gitlab.com')).configured, true);
  const restarted = harness({ session: h.session, local: h.local }); assert.equal((await restarted.api.authStatus('https://gitlab.com')).configured, false); assert.equal(h.session.size, 0);
});
test('invalid origins and tokens are rejected without network traffic', async () => {
  const h = harness();
  for (const host of ['http://gitlab.com', 'https://user:pass@gitlab.com', 'https://gitlab.com/api', 'https://gitlab.com?x=1', 'https://gitlab.com/#x']) assert.throws(() => h.api.validateHost(host));
  await assert.rejects(h.api.setToken(HOST, 'bad token with spaces'), /token/); assert.equal(h.calls.length, 0);
});
test('GitLab tokens expire within eight hours and corrupted ciphertext is purged', async () => {
  const h = harness(); const status = await h.api.setToken(HOST, TOKEN, 10 * 24 * 3600000); assert.ok(status.expiresAt - Date.now() <= 8 * 3600000);
  h.session.get('gitlab-review-vault-v1')[HOST].ciphertext[0] ^= 1;
  assert.equal((await h.api.authStatus(HOST)).configured, false); assert.equal(h.session.size, 0);
});
test('Issues, notes and threaded GitLab discussions publish formatted notes once', async () => {
  for (const destination of ['new-issue', 'issue', 'discussion']) {
    const h = harness(); await h.api.setToken(HOST, TOKEN);
    const message = { host: HOST, comment: note(destination === 'discussion' ? 'discussion' : 'issue'), destination, ...(destination === 'new-issue' ? {} : { number: 7 }) };
    const first = await h.api.publish(message), second = await h.api.publish(message);
    assert.equal(first.remoteRef.provider, 'gitlab'); assert.equal(second.duplicate, true);
    const mutations = h.calls.filter(call => call.init.method === 'POST'); assert.equal(mutations.length, 1); assert.equal(mutations[0].init.headers.Authorization, 'Bearer ' + TOKEN);
    const payload = JSON.parse(mutations[0].init.body); assert.match(payload.description || payload.body, /## KiCad visual review/); assert.match(first.remoteRef.url, /\/group\/sub\/project\/-\/issues\/7/);
  }
});
test('policy denial and ambiguous missing policy prevent GitLab mutations', async () => {
  for (const mode of ['allowlist', 'ambiguous']) {
    const h = harness({ route: async url => {
      if (mode === 'allowlist' && url.includes('/repository/files/')) return { encoding: 'base64', file_path: '.kicad-review-policy.json', content: Buffer.from(JSON.stringify({ schemaVersion: 1, commenting: { mode: 'allowlist', allowlist: ['someoneelse'] } })).toString('base64') };
      if (mode === 'ambiguous' && url.includes('/repository/tree?')) return Array.from({ length: 100 }, (_, i) => ({ name: 'f' + i, path: 'f' + i }));
    } });
    await h.api.setToken(HOST, TOKEN); await assert.rejects(h.api.publish({ host: HOST, comment: note('issue'), destination: 'new-issue' }), /policy/);
    assert.equal(h.calls.filter(c => c.init.method === 'POST').length, 0);
  }
});
test('an uncertain mutation is not repeated automatically', async () => {
  const h = harness({ route: async (url, init) => { if (init.method === 'POST') throw new Error('lost connection'); } });
  await h.api.setToken(HOST, TOKEN); const message = { host: HOST, comment: note('issue'), destination: 'new-issue' };
  await assert.rejects(h.api.publish(message)); await assert.rejects(h.api.publish(message), /unconfirmed/); assert.equal(h.calls.filter(c => c.init.method === 'POST').length, 1);
});
test('OAuth PKCE uses host-matched exchange without client secret or refresh persistence', async () => {
  let authorize;
  const identity = { getRedirectURL: () => 'https://extension.chromiumapp.org/gitlab', launchWebAuthFlow: async ({ url }) => {
    authorize = new URL(url); return 'https://extension.chromiumapp.org/gitlab?code=code123&state=' + authorize.searchParams.get('state');
  } };
  const h = harness({ identity }); await h.api.setClientId(HOST, 'publicclientid123456'); await h.api.startOAuth(HOST);
  assert.equal(authorize.origin, HOST); assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256'); assert.equal(authorize.searchParams.get('scope'), 'api');
  const exchange = h.calls.find(c => c.url.endsWith('/oauth/token')); const data = new URLSearchParams(exchange.init.body);
  assert.equal(data.has('client_secret'), false); assert.equal(data.get('code_verifier').length, 43); assert.equal(exchange.init.headers.Authorization, undefined);
  assert.equal((await h.api.authStatus(HOST)).configured, true); assert.equal(JSON.stringify([...h.session, ...h.local]).includes(TOKEN), false);
});
test('OAuth mismatched state and cancelled reset cannot install credentials', async () => {
  for (const action of ['state', 'reset']) {
    let api;
    const h = harness({ identity: { getRedirectURL: () => 'https://extension.chromiumapp.org/gitlab', launchWebAuthFlow: async ({ url }) => {
      const auth = new URL(url); if (action === 'reset') await api.resetAuth(HOST);
      return 'https://extension.chromiumapp.org/gitlab?code=code123&state=' + (action === 'state' ? 'invalid' : auth.searchParams.get('state'));
    } } }); api = h.api;
    await api.setClientId(HOST, 'publicclientid123456'); await assert.rejects(api.startOAuth(HOST)); assert.equal((await api.authStatus(HOST)).configured, false); assert.equal(h.calls.length, 0);
  }
});
test('reset during policy preflight prevents a pending write', async () => {
  let release, reached;
  const paused = new Promise(resolve => { reached = resolve; });
  const h = harness({ route: async url => { if (url.endsWith('/api/v4/user')) { reached(); await new Promise(resolve => { release = resolve; }); } } });
  await h.api.setToken(HOST, TOKEN);
  const posting = h.api.publish({ host: HOST, comment: note('issue'), destination: 'new-issue' });
  const rejected = assert.rejects(posting, /changed|signed out/); await paused; await h.api.resetAuth(HOST); release(); await rejected;
  assert.equal(h.calls.filter(c => c.init.method === 'POST').length, 0);
});
test('GitLab policy supports GitLab usernames while rejecting malformed policy', () => {
  const h = harness(); assert.equal(h.api.validatePolicy({ schemaVersion: 1, commenting: { mode: 'allowlist', allowlist: ['User_name.dev'] } }).allowlist[0], 'user_name.dev');
  for (const value of [{ schemaVersion: 1, commenting: { mode: 'unknown' } }, { schemaVersion: 1, commenting: { mode: 'all', extra: true } }, { schemaVersion: 1, commenting: { mode: 'allowlist', allowlist: ['../user'] } }]) assert.throws(() => h.api.validatePolicy(value));
});
test('reset during ciphertext storage finishes with no token or client ID', async () => {
  let release, reached;
  const paused = new Promise(resolve => { reached = resolve; });
  const h = harness({ beforeSet: async values => { if (values['gitlab-review-vault-v1']) { reached(); await new Promise(resolve => { release = resolve; }); } } });
  await h.api.setClientId(HOST, 'publicclientid123456');
  const saving = h.api.setToken(HOST, TOKEN), rejected = assert.rejects(saving, /cancelled/);
  await paused; const reset = h.api.resetAuth(HOST); release(); await rejected; await reset;
  const status = await h.api.authStatus(HOST); assert.equal(status.configured, false); assert.equal(status.clientId, ''); assert.equal(h.session.size, 0);
});
test('reset while the OAuth token response is in flight cannot restore login', async () => {
  let release, reached;
  const paused = new Promise(resolve => { reached = resolve; });
  const h = harness({ identity: { getRedirectURL: () => 'https://extension.chromiumapp.org/gitlab', launchWebAuthFlow: async ({ url }) => 'https://extension.chromiumapp.org/gitlab?code=code123&state=' + new URL(url).searchParams.get('state') },
    route: async url => { if (url.endsWith('/oauth/token')) { reached(); await new Promise(resolve => { release = resolve; }); } } });
  await h.api.setClientId(HOST, 'publicclientid123456'); const signing = h.api.startOAuth(HOST), rejected = assert.rejects(signing, /cancelled|failed/);
  await paused; await h.api.resetAuth(HOST); release(); await rejected; assert.equal((await h.api.authStatus(HOST)).configured, false); assert.equal(h.session.size, 0);
});
test('GitLab rejects revoked credentials and clears the encrypted session', async () => {
  const h = harness({ route: async () => 401 }); await h.api.setToken(HOST, TOKEN);
  await assert.rejects(h.api.commentPolicyStatus(HOST, 'group/sub/project'), /401/); assert.equal((await h.api.authStatus(HOST)).configured, false);
});
test('spoofed contributor email never authorizes publication', async () => {
  const h = harness({ route: async url => {
    if (url.includes('/repository/files/')) return { encoding: 'base64', file_path: '.kicad-review-policy.json', content: Buffer.from(JSON.stringify({ schemaVersion: 1, commenting: { mode: 'contributors' } })).toString('base64') };
    if (url.includes('/repository/contributors?')) return [{ name: 'Impersonated reviewer', email: 'reviewer@example.org' }];
  } });
  await h.api.setToken(HOST, TOKEN);
  const policy = await h.api.commentPolicyStatus(HOST, 'group/sub/project');
  assert.equal(policy.allowed, false); assert.match(policy.reason, /cannot be securely verified/);
  await assert.rejects(h.api.publish({ host: HOST, comment: note('issue'), destination: 'new-issue' }), /policy blocked/);
  assert.equal(h.calls.filter(call => call.init.method === 'POST').length, 0);
  assert.equal(h.calls.some(call => call.url.includes('/repository/contributors?')), false);
});
