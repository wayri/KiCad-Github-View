const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../mention-users.js');
function harness(routes, options = {}) {
  const calls = [];
  const service = api.create({ authorizationHeaders: async (provider, host) => options.headers === null ? {} : { Authorization: 'Bearer test-only-secret' }, ...options,
    fetcher: async (url, init) => { calls.push({ url, init }); const value = await routes(url, init); return value instanceof Response ? value : new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } }); } });
  return { calls, service };
}
const github = { repository: 'owner/board' };
test('repository users merge contributor and assignable roles; omit secrets and untrusted profile URLs', async () => {
  const h = harness(url => url.includes('/contributors') ? [{ login: 'Alice', html_url: 'https://evil.test', email: 'hidden@example.com' }, { login: '../invalid' }] : [{ login: 'Alice', name: '<Alice>', token: 'bad' }, { login: 'bob' }]);
  const result = await h.service.lookup(github);
  assert.deepEqual(result.users, [{ login: 'Alice', name: '<Alice>', roles: ['Contributor', 'Assignable user'], url: 'https://github.com/Alice' }, { login: 'bob', name: '', roles: ['Assignable user'], url: 'https://github.com/bob' }]);
  assert.ok(h.calls.every(c => c.init.credentials === 'omit' && c.init.redirect === 'error' && c.init.cache === 'no-store' && c.init.signal));
  assert.doesNotMatch(JSON.stringify(result), /secret|hidden@example|evil/);
});
test('GitLab nested repository member search is bound to the selected HTTPS server', async () => {
  const h = harness(() => [{ username: 'user.name', name: 'Ada' }, { username: 'other' }]);
  const result = await h.service.lookup({ provider: 'gitlab', host: 'https://git.example.com', repository: 'a/b/c', query: '@user' });
  assert.equal(h.calls[0].url, 'https://git.example.com/api/v4/projects/a%2Fb%2Fc/members/all?query=user&per_page=100&page=1');
  assert.deepEqual(result.users, [{ login: 'user.name', name: 'Ada', roles: ['Project member'], url: 'https://git.example.com/user.name' }]);
});
test('external username search is explicit, bounded and verifies repository access first', async () => {
  const h = harness(url => url.includes('/search/users?') ? { items: [{ login: 'alice' }], incomplete_results: false } : { id: 1 });
  assert.equal((await h.service.lookup({ ...github, query: '@ali', source: 'users' })).users[0].login, 'alice');
  assert.equal(h.calls[0].url, 'https://api.github.com/repos/owner/board');
  assert.match(h.calls[1].url, /q=ali\+in%3Alogin&per_page=30&page=1/);
  await assert.rejects(h.service.lookup({ ...github, query: 'a', source: 'users' }), /at least two/);
});
test('GitLab external account search uses selected server rather than GitLab.com', async () => {
  const h = harness(url => url.includes('/users?') ? [{ username: 'anna' }] : { id: 1 });
  await h.service.lookup({ provider: 'gitlab', host: 'https://git.example.com', repository: 'a/b', query: 'ann', source: 'users' });
  assert.equal(h.calls[1].url, 'https://git.example.com/api/v4/users?search=ann&per_page=30&page=1');
});
test('malformed scope and anonymous requests do not reach the network', async () => {
  const h = harness(() => []);
  for (const bad of [{ repository: '../a' }, { ...github, provider: 'else' }, { ...github, host: 'https://evil.test' }, { provider: 'gitlab', repository: 'a/b', host: 'https://gitlab.com/path' }, { ...github, query: 'abc\n' }, { ...github, source: 'all' }]) await assert.rejects(h.service.lookup(bad));
  assert.equal(h.calls.length, 0);
  const unsigned = harness(() => [], { headers: null });
  await assert.rejects(unsigned.service.lookup(github), /Sign in/);
  assert.equal(unsigned.calls.length, 0);
});
test('missing assignable permission still offers contributors and a visible warning', async () => {
  const h = harness(url => url.includes('/assignees') ? new Response('', { status: 403 }) : [{ login: 'bob' }]);
  const result = await h.service.lookup(github);
  assert.equal(result.users[0].login, 'bob');
  assert.match(result.warnings[0], /assignees are unavailable/);
});
test('bounded listings advertise truncation and reject malformed data', async () => {
  const h = harness(url => url.includes('/assignees') ? [] : Array.from({ length: 100 }, (_, i) => ({ login: 'user' + i })));
  const result = await h.service.lookup(github);
  assert.equal(result.users.length, 30);
  assert.match(result.warnings.join(' '), /first 100/);
  const bad = harness(() => ({ error: 'invalid' }));
  await assert.rejects(bad.service.lookup(github), /Invalid mention/);
});
test('oversized declared and streamed responses fail without returning partial suggestions', async () => {
  for (const response of [() => new Response('[]', { headers: { 'content-length': '999999' } }), () => new Response(' '.repeat(262145))]) {
    const h = harness(response);
    await assert.rejects(h.service.lookup(github), /exceeds/);
  }
});
test('lookup rate limit is bounded per server and resets after one minute', async () => {
  let time = 0;
  const h = harness(() => [], { now: () => time });
  for (let i = 0; i < 30; i++) await h.service.lookup(github);
  await assert.rejects(h.service.lookup(github), /limit reached/);
  time = 60001;
  await h.service.lookup(github);
});
test('signed-out stale response is rejected before returning private membership', async () => {
  let signedIn = true;
  const h = harness(() => { signedIn = false; return [{ login: 'private-user' }]; }, { authorizationHeaders: async () => signedIn ? { Authorization: 'Bearer secret' } : {} });
  await assert.rejects(h.service.lookup(github), /connection changed/);
});
