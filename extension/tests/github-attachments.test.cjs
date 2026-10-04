const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const comments = require('../review-comments.js');
const asset = 'https://github.com/user-attachments/assets/12345678-1234-1234-1234-123456789abc';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOfoAAAAASUVORK5CYII=', 'base64');
const note = type => ({id: 'capture-' + type, text: 'Inspect U1', threadType: type, createdAt: '2026-10-04T09:00:00.000Z',
  anchor: {repository: 'owner/board', ref: 'main', file: 'board.kicad_pcb', reference: 'U1'},
  capture: {mime: 'image/png', width: 1, height: 1, dataUrl: 'data:image/png;base64,' + png.toString('base64')}});
async function harness(options = {}) {
  const local = new Map(), session = new Map(), calls = [];
  const area = map => ({get: async key => ({[key]: map.get(key)}), set: async values => {for (const [key, value] of Object.entries(values)) map.set(key, value);}, remove: async keys => {for (const key of [].concat(keys)) map.delete(key);}});
  const json = value => new Response(JSON.stringify(value), {headers: {'content-type': 'application/json'}});
  let api, issueFailures = options.issueFailures || 0;
  const context = vm.createContext({crypto: require('node:crypto').webcrypto, TextEncoder, TextDecoder, URLSearchParams, AbortController, setTimeout, clearTimeout, atob, KiCadReviewComments: comments,
    chrome: {storage: {session: area(session), local: area(local)}}, fetch: async (url, init) => {
      calls.push({url, init: {...init, body: init.body instanceof Uint8Array || Object.prototype.toString.call(init.body) === '[object Uint8Array]' ? Buffer.from(init.body) : init.body}});
      assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit');
      if (url.startsWith('https://uploads.github.com/')) {
        if (options.duringUpload) await options.duringUpload(api);
        if (options.uploadError) throw new Error('network');
        if (options.uploadStatus) return new Response(null, {status: options.uploadStatus});
        if (options.uploadResponse) return options.uploadResponse();
        return json({url: options.asset || asset});
      }
      assert.ok(url.startsWith('https://api.github.com/'));
      if (url.endsWith('/repos/owner/board')) return json({id: options.repoId ?? 42, full_name: 'owner/board', private: false, default_branch: 'main', permissions: {push: options.push ?? true}});
      if (url.includes('/contents/.kicad-review-policy.json?')) return new Response(null, {status: 404});
      if (url.endsWith('/user')) return json({login: 'owner'});
      if (url.endsWith('/issues') || url.endsWith('/issues/7/comments')) {
        if (issueFailures-- > 0) return new Response(null, {status: options.issueStatus || 422});
        return json({number: 7, id: 11});
      }
      if (url.endsWith('/graphql')) {
        const body = JSON.parse(init.body);
        if (body.query.includes('CreateDiscussionInput')) return json({data: {createDiscussion: {discussion: {id: 'D_valid', number: 8}}}});
        if (body.query.includes('AddDiscussionCommentInput')) return json({data: {addDiscussionComment: {comment: {id: 'DC_valid', databaseId: 12}}}});
        if (body.query.includes('discussion(number')) return json({data: {repository: {discussion: {id: 'D_valid', number: 8}}}});
        return json({data: {repository: {id: 'R_valid', discussionCategories: {nodes: [{id: 'C_valid', name: 'Review'}]}}}});
      }
      throw new Error('Unexpected URL: ' + url);
    }});
  vm.runInContext(fs.readFileSync(require.resolve('../github-review-api.js'), 'utf8'), context);
  api = context.KiCadGitHubReviewApi;
  await api.setToken(options.token || 'gho_capture_token_1234567890');
  return {api, calls, local};
}
const uploads = h => h.calls.filter(call => call.url.startsWith('https://uploads.github.com/'));
const posts = h => h.calls.filter(call => call.url.includes('/issues') || call.url.endsWith('/graphql') && JSON.parse(call.init.body).query.includes('mutation'));
const message = destination => ({comment: note(destination.includes('discussion') ? 'discussion' : 'issue'), destination,
  ...(destination === 'new-discussion' ? {categoryId: 'C_valid'} : destination === 'discussion' ? {number: 8} : destination === 'issue' ? {number: 7} : {})});
test('native screenshots upload and render in new/existing Issues and Discussions, with reusable publication receipts', async () => {
  for (const destination of ['new-issue', 'issue', 'new-discussion', 'discussion']) {
    const h = await harness(), result = await h.api.publish(message(destination));
    assert.equal(result.attachments[0].url, asset);
    assert.equal(uploads(h).length, 1); assert.equal(posts(h).length, 1);
    const upload = uploads(h)[0], url = new URL(upload.url);
    assert.equal(url.pathname, '/user-attachments/assets'); assert.equal(url.searchParams.get('repository_id'), '42');
    assert.equal(url.searchParams.get('content_type'), 'image/png'); assert.match(url.searchParams.get('name'), /^kicad-review-[a-f0-9]{20}\.png$/);
    assert.equal(upload.init.method, 'POST'); assert.equal(upload.init.headers['Content-Type'], 'application/octet-stream');
    assert.equal(upload.init.headers.Authorization, 'Bearer gho_capture_token_1234567890'); assert.deepEqual(upload.init.body, png);
    const post = JSON.parse(posts(h)[0].init.body), body = post.body || post.variables.input.body;
    assert.ok(body.includes(`](${asset})`)); assert.ok(!body.includes('attach it manually')); assert.ok(!body.includes(png.toString('base64')));
    const [parsed] = comments.fromMarkdown(body); assert.equal(parsed.attachments[0].url, asset); assert.equal(parsed.capture, undefined);
    const duplicate = await h.api.publish(message(destination)); assert.equal(duplicate.duplicate, true); assert.equal(duplicate.attachments[0].url, asset);
    assert.equal(uploads(h).length, 1); assert.equal(posts(h).length, 1);
  }
});
test('invalid PNG headers/dimensions and unsupported App credentials stop before any upload or publication', async () => {
  for (const kind of ['dimensions', 'header', 'app', 'unknown']) {
    const h = await harness({token: kind === 'app' ? 'ghs_app_token_1234567890' : kind === 'unknown' ? 'untyped_token_1234567890' : undefined});
    const input = message('new-issue');
    if (kind === 'dimensions') input.comment.capture.width = 2;
    if (kind === 'header') { const bytes = Buffer.from(png); bytes[12] = 0; input.comment.capture.dataUrl = 'data:image/png;base64,' + bytes.toString('base64'); }
    await assert.rejects(h.api.publish(input), /PNG|dimensions|OAuth|personal/);
    assert.equal(uploads(h).length, 0); assert.equal(posts(h).length, 0);
  }
});
test('repository write permission and valid numeric ID are required for upload', async () => {
  for (const options of [{push: false}, {repoId: '42'}, {repoId: 0}, {repoId: Number.MAX_SAFE_INTEGER + 1}]) {
    const h = await harness(options); await assert.rejects(h.api.publish(message('new-issue')), /write access/);
    assert.equal(uploads(h).length, 0); assert.equal(posts(h).length, 0);
  }
});
test('upload failures and untrusted attachment URLs never publish a text-only replacement', async () => {
  for (const options of [{uploadError: true}, {uploadStatus: 403}, {uploadStatus: 404}, {asset: 'https://evil.example/image.png'},
    {asset: asset + '?secret=yes'}, {asset: asset + '#fragment'}, {asset: 'https://github.com/user-attachments/assets/not-a-uuid'}]) {
    const h = await harness(options); await assert.rejects(h.api.publish(message('new-issue')), /upload|attachment/i);
    assert.equal(posts(h).length, 0);
  }
});
test('definitive post failure retains the upload receipt and retries only the Issue', async () => {
  const h = await harness({issueFailures: 1}); await assert.rejects(h.api.publish(message('new-issue')), /rejected/);
  assert.equal(uploads(h).length, 1);
  const result = await h.api.publish(message('new-issue')); assert.equal(result.attachments[0].url, asset);
  assert.equal(uploads(h).length, 1); assert.equal(posts(h).length, 2);
});
test('unconfirmed post failure retains pending receipt and never retries upload or publication automatically', async () => {
  const h = await harness({issueFailures: 1, issueStatus: 503});
  await assert.rejects(h.api.publish(message('new-issue')), /503/);
  await assert.rejects(h.api.publish(message('new-issue')), /unconfirmed outcome/);
  assert.equal(uploads(h).length, 1); assert.equal(posts(h).length, 1);
});
test('attachment responses are bounded while reading, including missing or misleading length headers', async () => {
  for (const headers of [{}, {'content-length': '2'}, {'content-length': '20000'}]) {
    const h = await harness({uploadResponse: () => new Response(' '.repeat(17000), {headers})});
    await assert.rejects(h.api.publish(message('new-issue')), /too large/);
    assert.equal(posts(h).length, 0);
  }
});
test('cached screenshot URL does not authorize publication after sign-out', async () => {
  const h = await harness({issueFailures: 1});
  await assert.rejects(h.api.publish(message('new-issue')), /rejected/);
  await h.api.clearToken();
  await assert.rejects(h.api.publish(message('new-issue')), /signed out|locked|session/i);
  assert.equal(uploads(h).length, 1); assert.equal(posts(h).length, 1);
});
test('sign-out or account replacement during upload retains only its URL and blocks publication', async () => {
  for (const change of ['reset', 'replace']) {
    const h = await harness({duringUpload: async api => change === 'reset' ? api.resetAuth() : api.setToken('gho_replacement_1234567890')});
    await assert.rejects(h.api.publish(message('new-issue')), /changed|signed out|locked/);
    assert.equal(posts(h).length, 0); assert.equal(uploads(h).length, 1);
    assert.equal([...h.local.values()].filter(record => record.attachment).length, 1);
  }
});
