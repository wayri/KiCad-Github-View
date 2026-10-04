const test = require('node:test');
const assert = require('node:assert/strict');

const extensionOrigin = 'chrome-extension://test-id/';
const calls = { created: [], updated: [], messages: [], removed: [], windows: [] };
let messageListener, actionListener;
const localStore = new Map(), sessionStore = new Map();
const storageArea = (store) => ({
  get: async (key) => ({ [key]: store.get(key) }),
  set: async (items) => { for (const [key, value] of Object.entries(items)) store.set(key, value); },
  remove: async (key) => { for (const item of Array.isArray(key) ? key : [key]) store.delete(item); }
});
global.KiCadGitHub=require('../parsing.js');
global.KiCadBrowserData = require('../browser-data.js');
global.KiCadReviewComments = require('../review-comments.js');
global.KiCadGitHubReviewApi = require('../github-review-api.js');
global.KiCadReviewFileStore = { status: async () => ({ connected: false }) };
global.importScripts = () => {};
global.chrome = {
  runtime: {
    id: 'test-id',
    getURL: (path) => extensionOrigin + path,
    openOptionsPage: async () => { calls.optionsOpened = (calls.optionsOpened || 0) + 1; },
    onMessage: { addListener: (listener) => { messageListener = listener; } }
  },
  action: { onClicked: { addListener: (listener) => { actionListener = listener; } },
    setBadgeText: async value => { calls.badge = value.text; },
    setBadgeBackgroundColor: async value => { calls.badgeColor = value.color; },
    setTitle: async value => { calls.actionTitle = value.title; } },
  storage: { local: storageArea(localStore), session: storageArea(sessionStore) },
  tabs: {
    create: async (options) => { calls.created.push(options); return { id: 100 + calls.created.length }; },
    update: async (id, options) => { calls.updated.push({ id, ...options }); },
    sendMessage: async (id, message) => { calls.messages.push({ id, message }); return calls.response; },
    remove: async (id) => { calls.removed.push(id); }
  },
  windows: { create: async (options) => { calls.windows.push(options); return { id: 41 }; } }
};
const background = require('../background.js');
const sha = (char) => char.repeat(40);
const json = (value) => new Response(JSON.stringify(value), {
  status: 200, headers: { 'content-type': 'application/json' }
});
const viewer = { id: 'test-id', url: `${extensionOrigin}browser-viewer.html?file=x` };
const options = { id: 'test-id', url: `${extensionOrigin}options.html` };
const githubTab = (id, pathname) => ({ id: 'test-id', tab: { id }, url: `https://github.com${pathname}` });
function message(request, sender = viewer) {
  return new Promise((resolve) => {
    const handled = messageListener(request, sender, resolve);
    if (!handled) resolve({ ignored: true });
  });
}

function withFetch(t, handler) {
  const before = global.fetch;
  global.fetch = handler;
  t.after(() => { global.fetch = before; });
}
function withPublishingFetch(t, handler) {
  withFetch(t, (url, init) => {
    const match = /^https:\/\/api\.github\.com\/repos\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(url);
    if (match) return json({ private: false, full_name: `${match[1]}/${match[2]}`, default_branch: 'main' });
    if (url.includes('/contents/.kicad-review-policy.json?')) return new Response(null, { status: 404 });
    if (url === 'https://api.github.com/user') return json({ login: 'reviewer' });
    return handler(url, init);
  });
}

test('account badge reflects connection, sign-out and reset without exposing credentials', async () => {
  const token = 'github_pat_' + 'b'.repeat(40);
  assert.equal((await message({type:'github-auth-set',token},options)).ok, true);
  assert.equal(calls.badge, '●');
  assert.match(calls.actionTitle, /GitHub connected/);
  assert.equal(calls.actionTitle.includes(token), false);
  await message({type:'github-auth-clear'},options);
  assert.equal(calls.badge, '');
  assert.match(calls.actionTitle, /signed out/);
  await message({type:'github-auth-set',token},options);
  await message({type:'github-auth-reset'},options);
  assert.equal(calls.badge, '');
});

test('settings verify authenticated identity and private repository access without posting', async t => {
  const token='github_pat_'+'v'.repeat(40);
  await message({type:'github-auth-set',token},options);
  const requests=[];
  withFetch(t,async(url,init)=>{
    requests.push(url);
    assert.equal(init.headers.Authorization,'Bearer '+token);
    assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');
    if(url==='https://api.github.com/user')return json({login:'reviewer'});
    if(url==='https://api.github.com/repos/owner/private')return json({full_name:'owner/private',private:true,default_branch:'main',permissions:{pull:true}});
    throw new Error('Unexpected URL');
  });
  const result=await message({type:'github-access-test',repository:'owner/private'},options);
  assert.equal(result.ok,true);assert.equal(result.result.private,true);assert.equal(result.result.login,'reviewer');
  assert.equal(JSON.stringify(result).includes(token),false);
  const count=requests.length;
  assert.equal((await message({type:'github-access-test',repository:'owner/private'},githubTab(1,'/owner/private'))).ok,false);
  assert.equal(requests.length,count);
  await message({type:'github-auth-clear'},options);
  assert.match((await message({type:'github-access-test',repository:'owner/private'},options)).error,/signed out or expired/);
});

test('background finishes device authorization without an options-page poll', async t => {
  await message({type:'github-auth-clear'},options);
  const savedTimer=global.setTimeout, savedClear=global.clearTimeout;
  let tick;
  global.setTimeout=(fn,delay)=>{if(delay<30000)tick=fn;return {unref(){}};};
  global.clearTimeout=()=>{};
  t.after(()=>{global.setTimeout=savedTimer;global.clearTimeout=savedClear;});
  withFetch(t,async url=>url.endsWith('/login/device/code') ?
    json({device_code:'d'.repeat(40),user_code:'TEST-CODE',verification_uri:'https://github.com/login/device',expires_in:900,interval:5}) :
    json({access_token:'gho_'+'s'.repeat(40),token_type:'bearer',scope:'repo'}));
  const start=await message({type:'github-device-start',scope:'repo'},options);
  assert.equal(start.result.state,'pending');assert.equal(typeof tick,'function');
  sessionStore.get('github-device-pending').nextPollAt=Date.now()-1;
  await tick();
  assert.equal((await message({type:'github-auth-status'},options)).result.configured,true);
  assert.equal(sessionStore.has('github-device-pending'),false);
  assert.equal(calls.badge,'●');
  await message({type:'github-auth-clear'},options);
});

test('global project search resolves one immutable revision and excludes symlinks and unsafe paths',async t=>{
  const requested=[];
  withFetch(t,async url=>{requested.push(url);
    if(url.includes('/commits/'))return json({sha:sha('a'),commit:{tree:{sha:sha('b')}}});
    if(url.includes('/git/trees/'))return json({truncated:false,tree:[
      {path:'power/child.kicad_sch',type:'blob',mode:'100644',size:12},
      {path:'main.kicad_pcb',type:'blob',mode:'100644',size:12},
      {path:'linked.kicad_sch',type:'blob',mode:'120000',size:12},
      {path:'../escape.kicad_sch',type:'blob',mode:'100644',size:12},
      {path:'main.kicad_pro',type:'blob',mode:'100644',size:2}]});
    if(url.includes('/contents/')){assert.ok(url.endsWith('?ref='+sha('a')));return new Response(url.includes('.kicad_pro')?'{}':'(kicad_pcb)');}
    throw new Error('Unexpected request '+url);
  });
  const result=await message({type:'project-search-files',repository:'wayri/board',ref:'main',file:'main.kicad_pcb'});
  assert.equal(result.ok,true);assert.deepEqual(result.result.files.map(f=>f.path),['main.kicad_pcb','power/child.kicad_sch']);assert.equal(result.result.snapshotRef,sha('a'));assert.equal(result.result.settings[0].path,'main.kicad_pro');
  const before=requested.length;assert.equal((await message({type:'project-search-files',repository:'wayri/board',ref:'main',file:'main.kicad_pcb'},githubTab(1,'/wayri/board'))).ok,false);assert.equal(requested.length,before);
});

test('global search discloses truncated discovery and enforces source-count and per-file limits',async t=>{
  let reads=0;
  withFetch(t,async url=>{
    if(url.includes('/commits/'))return json({sha:sha('a'),commit:{tree:{sha:sha('b')}}});
    if(url.includes('/git/trees/'))return json({truncated:true,tree:Array.from({length:40},(_,i)=>({path:`p${String(i).padStart(2,'0')}.kicad_pcb`,type:'blob',mode:'100644',size:i===0?65*1024*1024:12}))});
    reads++;return new Response('(kicad_pcb)');
  });
  const reply=await message({type:'project-search-files',repository:'wayri/board',ref:'main',file:'p00.kicad_pcb'});assert.equal(reply.ok,true);assert.equal(reads,31);assert.equal(reply.result.files.length,31);assert.match(reply.result.warnings.join(' '),/truncated.*64 MiB.*at most 32/s);
});

test('saved report reads stay on repository revision and reject traversal and non-viewer callers',async t=>{
 let reads=0;withFetch(t,async url=>{reads++;assert.equal(url,`https://api.github.com/repos/wayri/board/contents/reports/board-drc.json?ref=${sha('a')}`);return new Response('{"coordinate_units":"mm"}');});
 const request={type:'rule-report',repository:'wayri/board',ref:sha('a'),file:'board.kicad_pcb',reportPath:'reports/board-drc.json'};
 assert.equal((await message(request)).ok,true);assert.equal((await message({...request,reportPath:'../token.json'})).ok,false);assert.equal((await message(request,githubTab(1,'/wayri/board'))).ok,false);assert.equal(reads,1);
});

test('pull metadata uses GitHub merge base and permits a public fork', async (t) => {
  const urls = [];
  withFetch(t, async (url) => {
    urls.push(url);
    if (url.endsWith('/pulls/7')) return json({
      base: { sha: sha('a'), repo: { full_name: 'owner/board', private: false } },
      head: { sha: sha('b'), repo: { full_name: 'fork/board', private: false } }, changed_files: 2
    });
    if (url.includes('/compare/')) return json({ merge_base_commit: { sha: sha('c') },base_commit:{sha:sha('a')},head_commit:{sha:sha('b')} });
    throw new Error('Unexpected API request');
  });
  const result = await background.githubPull('owner/board', 7);
  assert.deepEqual(result, { base: sha('c'), baseTip:sha('a'), head: sha('b'), headRepository: 'fork/board',
    changedFiles: 2, private: false });
  assert.match(urls[1], /\/compare\/a{40}\.\.\.b{40}\?per_page=1$/);
});

test('private PR comparison uses one authenticated account and pinned fork revisions',async t=>{
 const urls=[];let signed=false;
 withFetch(t,async(url,init)=>{urls.push({url,init});if(url.includes('/compare/'))return json({merge_base_commit:{sha:sha('c')},base_commit:{sha:sha('a')},head_commit:{sha:sha('b')}});return json({base:{sha:sha('a'),repo:{full_name:'owner/board',private:true}},head:{sha:sha('b'),repo:{full_name:'private/board',private:true}},changed_files:1});});
 await assert.rejects(background.githubPull('owner/board',7),/Sign in with private/);assert.equal(urls.length,1);
 const token='github_pat_private_comparison_123456';await KiCadGitHubReviewApi.setToken(token);t.after(()=>KiCadGitHubReviewApi.clearToken());urls.length=0;
 const pull=await background.githubPull('owner/board',7);assert.equal(pull.private,true);assert.equal(pull.headRepository,'private/board');assert.equal(pull.base,sha('c'));assert.equal(pull.baseTip,sha('a'));
 assert.equal(urls.length,2);for(const call of urls){assert.equal(call.init.headers.Authorization,'Bearer '+token);assert.equal(new URL(call.url).origin,'https://api.github.com');assert.equal(call.init.credentials,'omit');assert.equal(call.init.redirect,'error');}
 assert.ok(urls[1].url.includes(sha('a')+'...'+sha('b')));
});
test('account changes cancel PR metadata before comparison and mismatched comparison SHAs fail',async t=>{
 await KiCadGitHubReviewApi.setToken('github_pat_compare_race_123456');t.after(()=>KiCadGitHubReviewApi.clearToken());let requests=0;
 withFetch(t,async()=>{requests++;await KiCadGitHubReviewApi.clearToken();return json({base:{sha:sha('a'),repo:{full_name:'owner/board',private:true}},head:{sha:sha('b'),repo:{full_name:'owner/board',private:true}},changed_files:1});});
 await assert.rejects(background.githubPull('owner/board',7),/changed or signed out/);assert.equal(requests,1);
 global.fetch=async url=>url.includes('/compare/')?json({merge_base_commit:{sha:sha('c')},base_commit:{sha:sha('a')},head_commit:{sha:sha('d')}}):json({base:{sha:sha('a'),repo:{full_name:'owner/board',private:false}},head:{sha:sha('b'),repo:{full_name:'owner/board',private:false}},changed_files:1});
 await assert.rejects(background.githubPull('owner/board',7),/pinned pull request revisions/);
});

test('file listing paginates and reports incomplete or over-limit results', async (t) => {
  const urls = [];
  withFetch(t, async (url) => {
    urls.push(url);
    if(url.endsWith('/pulls/7'))return json({base:{sha:sha('a'),repo:{full_name:'owner/board'}},head:{sha:sha('b')},changed_files:101});
    const page = Number(new URL(url).searchParams.get('page'));
    return json(Array.from({ length: page === 1 ? 100 : 1 }, (_, index) => ({
      filename: `folder/file${page}-${index}.kicad_pcb`, status: 'modified'
    })));
  });
  const files = await background.githubFiles('owner/board', 7, 101, sha('b'), sha('a'));
  assert.equal(files.length, 101);
  assert.match(urls[2], /page=2$/);
  await assert.rejects(background.githubFiles('owner/board', 7, 101, sha('b'), sha('d')), /changed the pull request/);
  const before = urls.length;
  await assert.rejects(background.githubFiles('owner/board', 7, 3001), /3,000 files/);
  assert.equal(urls.length, before);
});

test('incomplete PR pagination is rejected even when its metadata remains stable',async t=>{
 withFetch(t,async url=>url.endsWith('/pulls/7')?json({base:{sha:sha('a'),repo:{full_name:'owner/board'}},head:{sha:sha('b')},changed_files:101}):json(new URL(url).searchParams.get('page')==='1'?Array.from({length:100},(_,i)=>({filename:`board${i}.kicad_pcb`,status:'modified'})):[]));
 await assert.rejects(background.githubFiles('owner/board',7,101,sha('b'),sha('a')),/changed or truncated/);
});

test('private PR file pagination discards changed snapshots and sign-out results',async t=>{
 await KiCadGitHubReviewApi.setToken('github_pat_paginated_private_123456');t.after(()=>KiCadGitHubReviewApi.clearToken());
 let metadataReads=0;const calls=[];
 withFetch(t,async(url,init)=>{calls.push({url,init});if(url.endsWith('/pulls/7')){metadataReads++;return json({base:{sha:sha('a'),repo:{full_name:'owner/board'}},head:{sha:sha(metadataReads===1?'b':'d')},changed_files:1});}return json([{filename:'design/old.kicad_pcb',previous_filename:'nested/board.kicad_pcb',status:'renamed'}]);});
 await assert.rejects(background.githubFiles('owner/board',7,1,sha('b'),sha('a')),/changed the pull request/);
 assert.equal(calls.length,3);for(const call of calls)assert.ok(call.init.headers.Authorization);
 metadataReads=0;global.fetch=async url=>{if(url.endsWith('/pulls/7'))return json({base:{sha:sha('a'),repo:{full_name:'owner/board'}},head:{sha:sha('b')},changed_files:1});await KiCadGitHubReviewApi.clearToken();return json([{filename:'board.kicad_pcb',status:'modified'}]);};
 await assert.rejects(background.githubFiles('owner/board',7,1,sha('b'),sha('a')),/changed or signed out/);
});

test('suffix-changing renames become added and removed design entries', () => {
  assert.deepEqual(background.designChanges([
    { filename: 'board.kicad_pcb', previous_filename: 'notes.txt', status: 'renamed' },
    { filename: 'notes.txt', previous_filename: 'old.kicad_sch', status: 'renamed' },
    { filename: 'new.kicad_sch', previous_filename: 'old.kicad_pcb', status: 'renamed' },
    { filename: 'new/name.kicad_pcb', previous_filename: 'old/name.kicad_pcb', status: 'renamed' }
  ]), [
    { file: 'board.kicad_pcb', oldFile: 'board.kicad_pcb', status: 'added' },
    { file: 'old.kicad_sch', oldFile: 'old.kicad_sch', status: 'removed' },
    { file: 'old.kicad_pcb', oldFile: 'old.kicad_pcb', status: 'removed' },
    { file: 'new.kicad_sch', oldFile: 'new.kicad_sch', status: 'added' },
    { file: 'new/name.kicad_pcb', oldFile: 'old/name.kicad_pcb', status: 'renamed' }
  ]);
});

test('only exact extension viewers and GitHub can message the worker', () => {
  assert.equal(background.senderAllowed({ url: `${extensionOrigin}browser-viewer.html?file=x`, id: 'test-id' }), true);
  assert.equal(background.senderAllowed({ url: `${extensionOrigin}revision-viewer.html?file=x`, id: 'test-id' }), true);
  assert.equal(background.senderAllowed({ url: `${extensionOrigin}schematic-viewer.html?file=x`, id: 'test-id' }), true);
  assert.equal(background.senderAllowed({ url: `${extensionOrigin}pcb-viewer.html?file=x`, id: 'test-id' }), true);
  assert.equal(background.senderAllowed({ url: `${extensionOrigin}browser-viewer.html.evil`, id: 'test-id' }), false);
  assert.equal(background.senderAllowed({ url: `${extensionOrigin}browser-viewer.html`, id: 'other' }), false);
  assert.equal(background.senderAllowed({ url: 'https://github.com.evil.test/x', id: 'other' }), false);
  assert.equal(background.senderAllowed({ url: 'https://github.com/owner/repo', id: 'test-id' }), true);
  assert.equal(background.senderAllowed({ url: 'https://github.com/owner/repo', id: 'other' }), false);
  assert.equal(messageListener({ type: 'project' }, { url: 'https://evil.test/' }, () => {}), false);
});

const sampleComment = () => ({ id: 'note-1', text: 'Check this symbol',
  createdAt: '2026-10-03T09:20:00.000Z',
  anchor: { repository: 'owner/board', ref: 'a'.repeat(40), file: 'design/root.kicad_sch',
    objectId: 'symbol-1', position: { x: 15, y: 20 } } });

test('comments persist per repository/revision/file and reject unauthorized writers', async () => {
  localStore.clear();
  const note = sampleComment();
  assert.equal((await message({ type: 'comment-save', comment: note })).ok, true);
  const scope = note.anchor;
  assert.equal((await message({ type: 'comment-list', ...scope })).result.length, 1);
  assert.equal((await message({ type: 'comment-list', ...scope, ref: 'b'.repeat(40) })).result.length, 0);
  assert.equal((await message({ type: 'comment-list', ...scope, file: 'design/other.kicad_sch' })).result.length, 0);
  assert.match((await message({ type: 'comment-save', comment: note }, githubTab(3, '/owner/board/pull/7'))).error, /Only extension viewers/);
  assert.match((await message({ type: 'comment-save', comment: { ...note, text: 'x'.repeat(4001) } })).error, /4,000/);
  assert.equal((await message({ type: 'comment-delete', ...scope, id: note.id })).result.deleted, true);
  assert.equal((await message({ type: 'comment-list', ...scope })).result.length, 0);
});

test('connected Git-tracked sidecar becomes authoritative for comment CRUD', async (t) => {
  const store = global.KiCadReviewFileStore;
  const original = { ...store };
  t.after(() => Object.assign(store, original));
  const saved = [];
  Object.assign(store, {
    status: async () => ({ connected: true, name: 'board.kicad-review.json' }),
    read: async () => saved.slice(),
    save: async (note) => { saved.push(note); return note; },
    remove: async (scope, id) => {
      const index = saved.findIndex((item) => item.id === id && item.anchor.file === scope.file);
      if (index < 0) return { deleted: false };
      saved.splice(index, 1); return { deleted: true };
    }
  });
  localStore.clear();
  const note = sampleComment();
  assert.equal((await message({ type: 'comment-store-status' })).result.connected, true);
  assert.equal((await message({ type: 'comment-save', comment: note })).ok, true);
  assert.equal(localStore.size, 0, 'connected sidecar does not shadow-save into browser storage');
  assert.equal((await message({ type: 'comment-list', ...note.anchor })).result.length, 1);
  assert.equal((await message({ type: 'comment-delete', ...note.anchor, id: note.id })).result.deleted, true);
  assert.equal((await message({ type: 'comment-list', ...note.anchor })).result.length, 0);
});

test('saving a 101st note to one file is rejected while editing an existing note works', async () => {
  localStore.clear();
  const note = sampleComment();
  for (let index = 0; index < 100; index++) {
    assert.equal((await message({ type: 'comment-save', comment: { ...note, id: `note-${index}` } })).ok, true);
  }
  assert.match((await message({ type: 'comment-save', comment: { ...note, id: 'note-100' } })).error, /at most 100/);
  assert.equal((await message({ type: 'comment-save', comment: { ...note, id: 'note-0', text: 'Edited' } })).ok, true);
  const notes = (await message({ type: 'comment-list', ...note.anchor })).result;
  assert.equal(notes.length, 100);
  assert.equal(notes[0].text, 'Edited');
});

test('draft action opens issue composer or stages a PR textarea draft without posting', async () => {
  calls.created.length = calls.updated.length = calls.removed.length = 0;
  sessionStore.clear();
  const note = sampleComment();
  const issue = await message({ type: 'open-comment-draft', comment: note });
  assert.equal(issue.result.destination, 'issue');
  assert.match(calls.created[0].url, /^https:\/\/github.com\/owner\/board\/issues\/new\?/);
  assert.match(new URL(calls.created[0].url).searchParams.get('title'), /^\[Info\]/);
  assert.match(new URL(calls.created[0].url).searchParams.get('body'), /Check this symbol/);
  const forkNote = sampleComment();
  forkNote.anchor.repository = 'fork/board';
  const pull = await message({ type: 'open-comment-draft', comment: forkNote,
    pullNumber: 7, pullRepository: 'owner/board' });
  assert.equal(pull.result.destination, 'pull-request');
  assert.equal(calls.created[1].url, 'about:blank');
  assert.equal(calls.updated[0].url, 'https://github.com/owner/board/pull/7#issuecomment-new');
  const tabId = pull.result.tabId;
  assert.equal((await message({ type: 'claim-comment-draft' }, githubTab(tabId, '/owner/board/pull/8'))).result, null);
  assert.equal((await message({ type: 'claim-comment-draft' }, githubTab(tabId, '/owner/board/pull/7/files'))).result, null);
  const claim = await message({ type: 'claim-comment-draft' }, githubTab(tabId, '/owner/board/pull/7'));
  assert.match(claim.result.body, /Check this symbol/);
  assert.match(claim.result.body, /fork\/board/, 'draft retains the fork file anchor');
  assert.equal((await message({ type: 'ack-comment-draft' }, githubTab(tabId, '/owner/board/pull/7'))).result.acknowledged, true);
  assert.equal((await message({ type: 'claim-comment-draft' }, githubTab(tabId, '/owner/board/pull/7'))).result, null);
  assert.match((await message({ type: 'open-comment-draft', comment: note, pullNumber: 0 })).error, /Invalid pull/);
  assert.match((await message({ type: 'open-comment-draft', comment: forkNote, pullNumber: 7 })).error, /repository/);
  assert.match((await message({ type: 'open-comment-draft', comment: forkNote,
    pullNumber: 7, pullRepository: '../evil' })).error, /repository/);
  assert.match((await message({ type: 'open-comment-draft', comment: note }, githubTab(1, '/owner/board/pull/7'))).error, /Only extension viewers/);
});

test('discussion and existing issue drafts stay in their GitHub composers until user submits', async () => {
  calls.created.length = calls.updated.length = 0;
  sessionStore.clear();
  const note = { ...sampleComment(), severity: 'major' };
  const discussion = await message({ type: 'open-comment-draft', comment: note,
    destination: 'discussion', targetRepository: 'base/board' });
  assert.equal(discussion.result.destination, 'discussion');
  assert.equal(calls.updated[0].url, 'https://github.com/base/board/discussions/new');
  const claim = await message({ type: 'claim-comment-draft' },
    githubTab(discussion.result.tabId, '/base/board/discussions/new'));
  assert.match(claim.result.title, /^\[Major\]/);
  assert.match(claim.result.body, /\| Severity \| Major \|/);
  assert.equal((await message({ type: 'ack-comment-draft' },
    githubTab(discussion.result.tabId, '/base/board/discussions/new'))).result.acknowledged, true);
  const issue = await message({ type: 'open-comment-draft', comment: note,
    targetType: 'issue', targetNumber: 31, targetRepository: 'base/board' });
  assert.equal(calls.updated[1].url, 'https://github.com/base/board/issues/31#issuecomment-new');
  assert.equal((await message({ type: 'claim-comment-draft' },
    githubTab(issue.result.tabId, '/base/board/issues/31'))).result.title, undefined);
  assert.equal((await message({ type: 'claim-comment-draft' },
    githubTab(issue.result.tabId, '/other/board/issues/31'))).result, null);
  assert.match((await message({ type: 'open-comment-draft', comment: note,
    targetType: 'discussion', targetNumber: 0 })).error, /thread number/);
});

test('public issue reader matches fork-anchored notes and constructs only GitHub URLs', async (t) => {
  const note = { ...sampleComment(), severity: 'critical' };
  note.anchor.repository = 'fork/board';
  const markdown = global.KiCadReviewComments.toMarkdown(note);
  const before = global.fetch, urls = [];
  t.after(() => { global.fetch = before; });
  global.fetch = async (url) => {
    urls.push(url);
    if (url.includes('/issues?')) return json([
      { number: 11, state: 'open', body: markdown, user: { login: 'alice' },
        html_url: 'https://evil.example/forged' },
      { number: 7, state: 'closed', pull_request: {}, body: 'unrelated', user: { login: 'bob' } }
    ]);
    if (url.includes('/issues/7/comments')) return json([
      { id: 55, body: markdown, user: { login: 'reviewer' }, html_url: 'https://evil.example/forged' }
    ]);
    if(url.endsWith('/issues/7'))return json({number:7,state:'closed',pull_request:{},body:markdown,user:{login:'bob'},created_at:'2026-10-04T00:00:00Z',updated_at:'2026-10-04T01:00:00Z'});
    throw new Error(`Unexpected GitHub read ${url}`);
  };
  const reply = await message({ type: 'github-annotations', repository: 'fork/board',
    ref: note.anchor.ref, file: note.anchor.file, pullRepository: 'base/board',
    pullNumber: 7, includeDiscussions: true });
  assert.equal(reply.ok, true);
  assert.equal(reply.result.notes.length, 2);
  assert.equal(reply.result.notes[0].severity, 'critical');
  assert.equal(reply.result.notes[0].github.url, 'https://github.com/base/board/pull/7');
  assert.equal(reply.result.notes[0].github.createdAt,'2026-10-04T00:00:00Z');
  assert.equal(reply.result.notes[1].github.url, 'https://github.com/base/board/pull/7#issuecomment-55');
  assert.equal(reply.result.notes[1].github.source, 'pull-request');
  assert.ok(reply.result.warnings.some((warning) => /Discussion readback/.test(warning)));
  assert.equal(urls.length, 2);
  assert.ok(urls.every((url) => url.startsWith('https://api.github.com/repos/base/board/issues')));
  assert.match((await message({ type: 'github-annotations', repository: 'fork/board',
    ref: note.anchor.ref, file: note.anchor.file }, githubTab(9, '/base/board/issues/11'))).error,
    /Only extension viewers/);
});

test('public issue reader surfaces rate limits and bounded scan warnings', async (t) => {
  const before = global.fetch;
  t.after(() => { global.fetch = before; });
  global.fetch = async () => new Response('rate limit', { status: 403,
    headers: { 'x-ratelimit-remaining': '0' } });
  const scope = sampleComment().anchor;
  assert.match((await message({ type: 'github-annotations', ...scope })).error, /rate limit/);
  const urls = [];
  global.fetch = async (url) => {
    urls.push(url);
    if (url.includes('/comments?')) return json(Array.from({ length: 100 }, (_, index) => ({ id: index + 1, body: '' })));
    return json(Array.from({ length: 100 }, (_, index) => ({ number: index + 1, body: '' })));
  };
  const result = await message({ type: 'github-annotations', ...scope });
  assert.equal(result.ok, true);
  assert.equal(urls.length, 2, 'repository scan reads at most two issue pages');
  assert.ok(result.result.warnings.some((warning) => /200 recent/.test(warning)));
  urls.length=0;
  global.fetch=async url=>{urls.push(url);if(url.includes('/comments?'))return json(Array.from({length:100},(_,index)=>({id:index+1,body:''})));return json({number:1,state:'open',body:''});};
  const selected=await message({type:'github-annotations',...scope,issueNumber:1});
  assert.equal(selected.ok,true);assert.equal(urls.length,6,'selected thread reads its body and five comment pages');
  assert.ok(selected.result.warnings.some(warning=>/500 comments/.test(warning)));
});

test('toolbar action focuses the inline blob, navigates a PR, and ignores other hosts', async () => {
  calls.created.length = calls.updated.length = calls.messages.length = 0;
  calls.response = { focused: true };
  await background.openFromAction({ id: 3, url: 'https://github.com/owner/repo/blob/main/design/root.kicad_sch' });
  assert.deepEqual(calls.messages[0], { id: 3, message: { type: 'focusInline' } });
  assert.equal(calls.created.length, 0);
  await background.openFromAction({ id: 3, url: 'https://github.com/owner/repo/pull/12' });
  assert.equal(calls.updated[0].url, 'https://github.com/owner/repo/pull/12/files');
  await background.openFromAction({ id: 3, url: 'https://github.com/owner/repo/pull/12/files' });
  assert.deepEqual(calls.messages[1], { id: 3, message: { type: 'focusReview' } });
  await background.openFromAction({ id: 3, url: 'https://github.com/owner/repo' });
  await background.openFromAction({ id: 3, url: 'https://example.com/' });
  assert.equal(calls.created.length, 0);
  assert.equal(calls.messages.length, 2);
  assert.equal(typeof actionListener, 'function');
});

test('private annotation readback uses the connected account and loads comments beyond the first page',async t=>{
 const token='github_pat_'+ 'p'.repeat(60),before=global.fetch;
 t.after(async()=>{global.fetch=before;await global.KiCadGitHubReviewApi.clearToken();});
 await global.KiCadGitHubReviewApi.setToken(token);
 const note=sampleComment(),body=global.KiCadReviewComments.toMarkdown(note),calls=[];
 global.fetch=async(url,init)=>{calls.push(url);assert.equal(init.headers.Authorization,'Bearer '+token);assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');
  if(url.endsWith('/issues/23'))return json({number:23,state:'open',body:'',user:{login:'owner'}});
  if(url.endsWith('page=1'))return json(Array.from({length:100},(_,i)=>({id:i+1,body:''})));
  if(url.endsWith('page=2'))return json([{id:101,body,user:{login:'reviewer'},created_at:'2026-10-04T08:00:00Z',updated_at:'2026-10-04T09:00:00Z',html_url:'https://evil.example'}]);
  throw new Error('Unexpected annotation path');};
 const reply=await message({type:'github-annotations',...note.anchor,issueNumber:23});
 assert.equal(reply.ok,true);assert.equal(reply.result.notes.length,1);assert.equal(calls.length,3);
 assert.equal(reply.result.notes[0].github.url,'https://github.com/owner/board/issues/23#issuecomment-101');assert.equal(reply.result.notes[0].github.author,'reviewer');assert.equal(reply.result.notes[0].github.updatedAt,'2026-10-04T09:00:00Z');
});

test('token settings are options-only and never disclose the credential', async () => {
  sessionStore.clear();
  const token = 'github_pat_' + 'a'.repeat(60);
  assert.match((await message({ type: 'github-auth-set', token })).error, /Only extension options/);
  assert.match((await message({ type: 'github-auth-reset' })).error, /Only extension options/);
  assert.match((await message({ type: 'github-auth-set', token }, githubTab(5, '/owner/board'))).error,
    /Only extension options/);
  assert.equal((await message({ type: 'github-auth-set', token }, options)).result.configured, true);
  assert.equal((await message({ type: 'github-auth-status' })).result.configured, true);
  assert.equal(JSON.stringify((await message({ type: 'github-auth-status' })).result).includes(token), false);
  assert.equal((await message({ type: 'github-auth-status' }, githubTab(5, '/owner/board'))).ok, false);
  assert.equal((await message({ type: 'open-options' })).result.opened, true);
  assert.equal((await message({ type: 'github-auth-clear' }, options)).result.configured, false);
});

test('device sign-in requests public_repo and respects pending and slow_down intervals', async (t) => {
  localStore.clear(); sessionStore.clear();
  const urls = [], token = 'gho_' + 'z'.repeat(40);
  let pollResponse = { error: 'authorization_pending' };
  withFetch(t, async (url, init) => {
    urls.push({ url, init });
    if (url.endsWith('/login/device/code')) return json({ device_code: 'd'.repeat(40),
      user_code: 'ABCD-EFGH', verification_uri: 'https://github.com/login/device',
      expires_in: 900, interval: 5 });
    if (url.endsWith('/login/oauth/access_token')) return json(pollResponse);
    throw new Error('Unexpected OAuth URL');
  });
  assert.match((await message({ type: 'github-device-start', clientId: 'Ov23liExampleClient' })).error,
    /Only extension options/);
  const started = await message({ type: 'github-device-start', clientId: 'Ov23liExampleClient' }, options);
  assert.equal(started.result.state, 'pending');
  assert.equal(started.result.userCode, 'ABCD-EFGH');
  assert.equal(JSON.stringify(started.result).includes('d'.repeat(40)), false, 'device code is not disclosed');
  assert.equal(JSON.stringify([...sessionStore]).includes('d'.repeat(40)), false, 'device secret stays only in background memory');
  assert.equal(urls[0].url, 'https://github.com/login/device/code');
  assert.equal(new URLSearchParams(urls[0].init.body).get('scope'), 'public_repo');
  assert.equal((await message({ type: 'github-device-poll' }, options)).result.state, 'pending');
  assert.equal(urls.length, 1, 'worker enforces initial minimum interval');
  const pending = sessionStore.get('github-device-pending');
  pending.nextPollAt = Date.now() - 1;
  assert.equal((await message({ type: 'github-device-poll' }, options)).result.state, 'pending');
  assert.equal(urls.length, 2);
  assert.equal(new URLSearchParams(urls[1].init.body).get('grant_type'),
    'urn:ietf:params:oauth:grant-type:device_code');
  pollResponse = { error: 'slow_down', interval: 10 };
  pending.nextPollAt = Date.now() - 1;
  const slowed = await message({ type: 'github-device-poll' }, options);
  assert.equal(slowed.result.intervalSeconds, 10);
  assert.ok(slowed.result.retryAfterMs >= 9000);
  pollResponse = { access_token: token, token_type: 'bearer', scope: 'public_repo', expires_in: 28800 };
  pending.nextPollAt = Date.now() - 1;
  const connected = await message({ type: 'github-device-poll' }, options);
  assert.deepEqual(connected.result, { state: 'connected' });
  assert.equal(typeof sessionStore.get('github-review-token'), 'object');
  assert.equal(JSON.stringify(sessionStore.get('github-review-token')).includes(token), false);
  assert.equal(sessionStore.has('github-device-pending'), false);
  assert.equal(JSON.stringify(connected).includes(token), false, 'token never returns to options');
  assert.equal((await message({ type: 'github-device-status' }, options)).result.clientId,
    'Ov23liExampleClient');
  sessionStore.get('github-review-token').expiresAt = Date.now() - 1;
  assert.equal((await message({ type: 'github-auth-status' }, options)).result.configured, false);
  assert.equal(sessionStore.has('github-review-token'), false);
});

test('device sign-in cancellation and expiry cannot deposit a late token', async (t) => {
  localStore.clear(); sessionStore.clear();
  let release;
  withFetch(t, async (url) => {
    if (url.endsWith('/login/device/code')) return json({ device_code: 'e'.repeat(40),
      user_code: 'TEST-CODE', verification_uri: 'https://github.com/login/device',
      expires_in: 900, interval: 5 });
    return new Promise((resolve) => { release = resolve; });
  });
  await message({ type: 'github-device-start', clientId: 'Ov23liExampleClient' }, options);
  sessionStore.get('github-device-pending').nextPollAt = Date.now() - 1;
  const inFlight = message({ type: 'github-device-poll' }, options);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await message({ type: 'github-device-cancel' }, options)).result.state, 'cancelled');
  release(json({ access_token: 'gho_' + 'x'.repeat(40), token_type: 'bearer', scope: 'public_repo' }));
  assert.equal((await inFlight).result.state, 'cancelled');
  assert.equal(sessionStore.has('github-review-token'), false);
  await message({ type: 'github-device-start', clientId: 'Ov23liExampleClient' }, options);
  sessionStore.get('github-device-pending').expiresAt = Date.now() - 1;
  assert.equal((await message({ type: 'github-device-status' }, options)).result.expired, true);
  assert.equal(sessionStore.has('github-device-pending'), false);
});

test('device sign-in handles denial and rejects missing scope without exposing OAuth payload', async (t) => {
  localStore.clear(); sessionStore.clear();
  let poll = { error: 'access_denied' };
  withFetch(t, async (url) => url.endsWith('/login/device/code') ?
    json({ device_code: 'f'.repeat(40), user_code: 'TEST-CODE',
      verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 }) : json(poll));
  await message({ type: 'github-device-start', clientId: 'Ov23liExampleClient' }, options);
  sessionStore.get('github-device-pending').nextPollAt = Date.now() - 1;
  assert.equal((await message({ type: 'github-device-poll' }, options)).result.state, 'denied');
  assert.equal(sessionStore.has('github-device-pending'), false);
  await message({ type: 'github-device-start', clientId: 'Ov23liExampleClient' }, options);
  sessionStore.get('github-device-pending').nextPollAt = Date.now() - 1;
  poll = { access_token: 'gho_' + 'y'.repeat(40), token_type: 'bearer', scope: '' };
  assert.match((await message({ type: 'github-device-poll' }, options)).error, /public repository access/);
  assert.equal(sessionStore.has('github-review-token'), false);
});

test('explicit issue publication uses a fixed API origin and returns a Git sidecar reference', async (t) => {
  localStore.clear(); sessionStore.clear();
  await message({ type: 'github-auth-set', token: 'github_pat_' + 'a'.repeat(60) }, options);
  const seen = [];
  withPublishingFetch(t, async (url, init) => {
    seen.push({ url, init });
    return json({ number: 17, node_id: 'I_kw123' });
  });
  const note = sampleComment();
  const request = { type: 'github-publish-comment', comment: note, destination: 'new-issue',
    repository: 'base/board' };
  assert.match((await message(request, githubTab(6, '/owner/board/issues/1'))).error, /Only extension viewers/);
  assert.match((await message(request, options)).error, /Only extension viewers/);
  const result = await message(request);
  assert.equal(result.ok, true);
  assert.deepEqual({ kind: result.result.remoteRef.kind, repository: result.result.remoteRef.repository,
    number: result.result.remoteRef.number, url: result.result.remoteRef.url },
    { kind: 'issue', repository: 'base/board', number: 17, url: 'https://github.com/base/board/issues/17' });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, 'https://api.github.com/repos/base/board/issues');
  assert.equal(seen[0].init.method, 'POST');
  assert.match(JSON.parse(seen[0].init.body).body, /<!-- kicad-review:v1 /);
  assert.equal((await message(request)).result.duplicate, true);
  assert.equal(seen.length, 1, 'same note does not publish twice');
  assert.match((await message({ ...request, repository: '../evil' })).error, /Invalid target/);
  assert.equal(seen.length, 1);
});

test('GitHub auth failures are sanitized and definitive failures can be corrected', async (t) => {
  localStore.clear(); sessionStore.clear();
  const token = 'github_pat_' + 'd'.repeat(60);
  await message({ type: 'github-auth-set', token }, options);
  let count = 0;
  withPublishingFetch(t, async () => { count++; return new Response(`bad token: ${token}`, { status: 403 }); });
  const request = { type: 'github-publish-comment', comment: sampleComment(), destination: 'new-issue' };
  const first = await message(request), second = await message(request);
  assert.match(first.error, /denied access/);
  assert.equal(JSON.stringify(first).includes(token), false);
  assert.match(second.error, /denied access/);
  assert.equal(count, 2, 'definitive rejection clears pending state for corrected credentials');
});

test('uncertain issue response stays pending and prevents a retry', async (t) => {
  localStore.clear(); sessionStore.clear();
  await message({ type: 'github-auth-set', token: 'github_pat_' + 'b'.repeat(60) }, options);
  let count = 0;
  withPublishingFetch(t, async () => { count++; throw new Error('socket closed'); });
  const request = { type: 'github-publish-comment', comment: sampleComment(), destination: 'issue',
    repository: 'owner/board', number: 9 };
  assert.match((await message(request)).error, /may have succeeded/);
  assert.match((await message(request)).error, /unconfirmed outcome/);
  assert.equal(count, 1);
});

test('existing issue publication stores the exact comment link', async (t) => {
  localStore.clear(); sessionStore.clear();
  await message({ type: 'github-auth-set', token: 'github_pat_' + 'e'.repeat(60) }, options);
  withPublishingFetch(t, async (url) => {
    assert.equal(url, 'https://api.github.com/repos/owner/board/issues/9/comments');
    return json({ id: 456, node_id: 'IC_456' });
  });
  const result = await message({ type: 'github-publish-comment', destination: 'issue',
    repository: 'owner/board', number: 9, comment: sampleComment() });
  assert.equal(result.result.remoteRef.url, 'https://github.com/owner/board/issues/9#issuecomment-456');
  assert.deepEqual(global.KiCadReviewComments.validateComment({ ...sampleComment(),
    remoteRefs: [result.result.remoteRef] }).remoteRefs, [result.result.remoteRef]);
});

test('discussion categories and both discussion publication operations use GraphQL', async (t) => {
  localStore.clear(); sessionStore.clear();
  await message({ type: 'github-auth-set', token: 'github_pat_' + 'c'.repeat(60) }, options);
  const queries = [];
  withPublishingFetch(t, async (url, init) => {
    assert.equal(url, 'https://api.github.com/graphql');
    const payload = JSON.parse(init.body); queries.push(payload);
    if (payload.query.includes('discussionCategories')) return json({ data: { repository: {
      id: 'R_123', discussionCategories: { nodes: [{ id: 'DC_123', name: 'Ideas', slug: 'ideas' }] }
    } } });
    if (payload.query.includes('createDiscussion')) return json({ data: { createDiscussion: {
      discussion: { id: 'D_123', number: 7 }
    } } });
    if (payload.query.includes('discussion(number:')) return json({ data: { repository: {
      discussion: { id: 'D_123', number: 7 }
    } } });
    if (payload.query.includes('addDiscussionComment')) return json({ data: { addDiscussionComment: {
      comment: { id: 'DCOM_123' }
    } } });
    throw new Error('Unexpected query');
  });
  const categories = await message({ type: 'github-discussion-categories', repository: 'owner/board' });
  assert.equal(categories.result[0].id, 'DC_123');
  assert.match((await message({ type: 'github-discussion-categories', repository: 'owner/board' },
    githubTab(8, '/owner/board'))).error, /Only extension viewers/);
  const note = sampleComment();
  const created = await message({ type: 'github-publish-comment', destination: 'new-discussion',
    repository: 'owner/board', categoryId: 'DC_123', comment: note });
  assert.equal(created.result.remoteRef.url, 'https://github.com/owner/board/discussions/7');
  const replied = await message({ type: 'github-publish-comment', destination: 'discussion',
    repository: 'owner/board', number: 7, comment: note });
  assert.equal(replied.result.remoteRef.nodeId, 'DCOM_123');
  assert.equal(queries.filter((item) => item.query.includes('createDiscussion')).length, 1);
  assert.equal(queries.filter((item) => item.query.includes('addDiscussionComment')).length, 1);
});

test('3D model retrieval stays on the same GitHub revision and rejects unsafe paths', async (t) => {
  const urls = [];
  withFetch(t, async (url, init) => {
    urls.push({ url, init });
    return new Response(new Uint8Array([0x67, 0x6c, 0x54, 0x46]), {
      status: 200, headers: { 'content-type': 'application/octet-stream' }
    });
  });
  const request = { type: 'repo-asset', repository: 'owner/board', ref: 'a'.repeat(40),
    file: 'models/part.glb' };
  assert.match((await message(request, githubTab(2, '/owner/board'))).error, /Only extension viewers/);
  const result = await message(request);
  assert.equal(result.result.base64, 'Z2xURg==');
  assert.equal(result.result.mediaType, 'model/gltf-binary');
  assert.equal(urls[0].url, `https://api.github.com/repos/owner/board/contents/models/part.glb?ref=${'a'.repeat(40)}`);
  assert.equal(urls[0].init.headers.Accept, 'application/vnd.github.raw+json');
  for (const file of ['../escape.glb', '/absolute.wrl', 'models/evil.obj', 'models/../part.wrl',
    'models\\part.glb', 'https://evil.test/model.glb']) {
    assert.match((await message({ ...request, file })).error, /Invalid repository, revision, or 3D model path/);
  }
  assert.equal(urls.length, 1);
});

test('3D model retrieval accepts bounded GitHub JSON and rejects oversized payloads', async (t) => {
  const base64 = btoa('VRML');
  withFetch(t, async () => json({ encoding: 'base64', content: base64 }));
  const request = { type: 'repo-asset', repository: 'owner/models', ref: 'b'.repeat(40),
    file: 'models/part.wrl' };
  assert.equal((await message(request)).result.base64, base64);
  global.fetch = async () => new Response(new Uint8Array(8 * 1024 * 1024 + 1), {
    status: 200, headers: { 'content-type': 'application/octet-stream' }
  });
  assert.match((await message({ ...request, file: 'models/too-big.glb' })).error, /size limit/);
});

test('drawing pairing lists only same-directory KiCad files and opens a validated extension popup', async (t) => {
  const urls = [];
  withFetch(t, async (url) => {
    urls.push(url);
    return json([
      { type: 'file', path: 'boards/main.kicad_sch' },
      { type: 'file', path: 'boards/main.kicad_pcb' },
      { type: 'file', path: 'boards/notes.txt' },
      { type: 'dir', path: 'boards/sub.kicad_sch' },
      { type: 'file', path: 'other/forged.kicad_pcb' }
    ]);
  });
  const request = { type: 'drawing-files', repository: 'owner/board', ref: 'a'.repeat(40),
    file: 'boards/main.kicad_sch' };
  assert.match((await message(request, githubTab(2, '/owner/board'))).error, /Only extension viewers/);
  const listed = await message(request);
  assert.deepEqual(listed.result.files, ['boards/main.kicad_pcb', 'boards/main.kicad_sch']);
  assert.equal(urls[0], `https://api.github.com/repos/owner/board/contents/boards?ref=${'a'.repeat(40)}`);
  calls.windows.length = 0;
  const opened = await message({ type: 'open-viewer-window', repository: 'owner/board',
    ref: 'a'.repeat(40), file: 'boards/main.kicad_sch', pairedFile: 'boards/main.kicad_pcb' });
  assert.equal(opened.result.windowId, 41);
  const popup = new URL(calls.windows[0].url);
  assert.equal(popup.protocol, 'chrome-extension:');
  assert.equal(popup.host, 'test-id');
  assert.equal(popup.pathname, '/browser-viewer.html');
  assert.equal(popup.searchParams.get('head'), 'a'.repeat(40));
  assert.equal(popup.searchParams.get('pairedFile'), 'boards/main.kicad_pcb');
  assert.equal(calls.windows[0].type, 'popup');
  assert.equal(calls.windows[0].state, 'maximized');
  assert.equal(calls.windows[0].width, undefined);
  assert.match((await message({ type: 'open-viewer-window', repository: 'owner/board',
    ref: 'main', file: 'boards/main.kicad_sch', pairedFile: '../bad.kicad_pcb' })).error, /Paired drawing/);
  assert.match((await message({ type: 'open-viewer-window', repository: 'owner/board',
    ref: 'main', file: 'boards/main.kicad_sch', pairedFile: 'boards/other.kicad_sch' })).error, /opposite/);
  assert.equal(calls.windows.length, 1);
});

test('repository policy defaults to all but publishing still needs a token', async (t) => {
  sessionStore.clear(); localStore.clear();
  const urls = [];
  withFetch(t, async (url) => {
    urls.push(url);
    if (url === 'https://api.github.com/repos/owner/board') return json({
      private: false, full_name: 'owner/board', default_branch: 'main' });
    if (url.includes('/contents/.kicad-review-policy.json?')) return new Response(null, { status: 404 });
    throw new Error('Unexpected policy URL');
  });
  const reply = await message({ type: 'comment-policy-status', repository: 'owner/board' });
  assert.deepEqual({ mode: reply.result.mode, source: reply.result.source, allowed: reply.result.allowed,
    ref: reply.result.ref }, { mode: 'all', source: 'default', allowed: false, ref: 'main' });
  assert.match(reply.result.reason, /Connect GitHub/);
  assert.equal(urls.length, 2);
  assert.match((await message({ type: 'comment-policy-status', repository: 'owner/board' },
    githubTab(3, '/owner/board'))).error, /Only extension viewers/);
});

test('allowlist policy is read from target default branch and blocks a fork note before POST', async (t) => {
  sessionStore.clear(); localStore.clear();
  await message({ type: 'github-auth-set', token: 'github_pat_' + 'p'.repeat(60) }, options);
  const urls = [];
  let login = 'outsider';
  withFetch(t, async (url, init) => {
    urls.push({ url, method: init?.method || 'GET', authorization: init?.headers?.Authorization });
    if (url === 'https://api.github.com/repos/base/board') return json({
      private: false, full_name: 'base/board', default_branch: 'main' });
    if (url.includes('/contents/.kicad-review-policy.json?')) return json({
      schemaVersion: 1, commenting: { mode: 'allowlist', allowlist: ['Reviewer'] }
    });
    if (url === 'https://api.github.com/user') return json({ login });
    if (url === 'https://api.github.com/repos/base/board/issues') return json({ number: 19 });
    throw new Error('Unexpected policy URL');
  });
  const note = sampleComment(); note.anchor.repository = 'fork/board';
  const status = await message({ type: 'comment-policy-status', repository: 'base/board',
    ref: note.anchor.ref });
  assert.equal(status.result.allowed, false);
  const denied = await message({ type: 'github-publish-comment', destination: 'new-issue',
    repository: 'base/board', comment: note });
  assert.match(denied.error, /policy blocked publication/);
  assert.equal(urls.some((entry) => entry.method === 'POST'), false);
  assert.ok(urls.some((entry) => entry.url.endsWith('/contents/.kicad-review-policy.json?ref=main')),
    'fork note SHA cannot select a weaker policy revision');
  assert.equal(urls.find((entry) => entry.url.includes('/contents/.kicad-review-policy.json?')).authorization,
    undefined, 'public policy read does not depend on token Contents permission');
  login = 'Reviewer';
  const allowed = await message({ type: 'github-publish-comment', destination: 'new-issue',
    repository: 'base/board', comment: note });
  assert.equal(allowed.result.remoteRef.url, 'https://github.com/base/board/issues/19');
  assert.equal(urls.filter((entry) => entry.method === 'POST').length, 1);
});

test('owner always passes restricted policy and contributor scan paginates with a hard cap', async (t) => {
  sessionStore.clear();
  await message({ type: 'github-auth-set', token: 'github_pat_' + 'q'.repeat(60) }, options);
  let login = 'owner', pages = 0, include = true;
  withFetch(t, async (url) => {
    if (url === 'https://api.github.com/repos/owner/board') return json({
      private: false, full_name: 'owner/board', default_branch: 'main' });
    if (url.includes('/contents/.kicad-review-policy.json?')) return json({
      schemaVersion: 1, commenting: { mode: 'contributors' } });
    if (url === 'https://api.github.com/user') return json({ login });
    if (url.includes('/contributors?')) {
      pages++;
      const page = Number(new URL(url).searchParams.get('page'));
      return json(Array.from({ length: 100 }, (_, index) => ({
        login: include && page === 2 && index === 10 ? 'reviewer' : `user${page}-${index}`
      })));
    }
    throw new Error('Unexpected policy URL');
  });
  assert.equal((await message({ type: 'comment-policy-status', repository: 'owner/board' })).result.allowed, true);
  assert.equal(pages, 0, 'personal repository owner bypasses contributor enumeration');
  login = 'reviewer';
  assert.equal((await message({ type: 'comment-policy-status', repository: 'owner/board' })).result.allowed, true);
  assert.equal(pages, 2);
  pages = 0; include = false;
  const capped = await message({ type: 'comment-policy-status', repository: 'owner/board' });
  assert.equal(capped.result.allowed, false);
  assert.match(capped.result.reason, /1,000-account scan limit/);
  assert.equal(pages, 10);
});

test('collaborator and malformed-policy verification fail closed', async (t) => {
  sessionStore.clear(); localStore.clear();
  await message({ type: 'github-auth-set', token: 'github_pat_' + 'r'.repeat(60) }, options);
  let mode = 'collaborators', permission = 'write', failed = false;
  withFetch(t, async (url) => {
    if (url === 'https://api.github.com/repos/owner/board') return failed ?
      new Response(null, { status: 403 }) : json({ private: false, full_name: 'owner/board', default_branch: 'main' });
    if (url.includes('/contents/.kicad-review-policy.json?')) return json({
      schemaVersion: 1, commenting: { mode } });
    if (url === 'https://api.github.com/user') return json({ login: 'reviewer' });
    if (url.includes('/collaborators/reviewer/permission')) return permission === 'missing' ?
      new Response(null, { status: 404 }) : json({ permission });
    throw new Error('Unexpected policy URL');
  });
  assert.equal((await message({ type: 'comment-policy-status', repository: 'owner/board' })).result.allowed, true);
  permission = 'missing';
  assert.equal((await message({ type: 'comment-policy-status', repository: 'owner/board' })).result.allowed, false);
  mode = 'invalid';
  assert.match((await message({ type: 'comment-policy-status', repository: 'owner/board' })).error, /malformed/);
  mode = 'collaborators'; failed = true;
  assert.match((await message({ type: 'comment-policy-status', repository: 'owner/board' })).error, /could not verify/);
});

test('restricted contributor policy can explicitly invite an outside reviewer',async(t)=>{
 sessionStore.clear();localStore.clear();
 await message({type:'github-auth-set',token:'github_pat_'+'s'.repeat(60)},options);
 withFetch(t,async(url)=>{
  if(url==='https://api.github.com/repos/owner/board')return json({private:false,full_name:'owner/board',default_branch:'main'});
  if(url.includes('/contents/.kicad-review-policy.json?'))return json({schemaVersion:1,commenting:{mode:'contributors',allowlist:['guest-reviewer']}});
  if(url==='https://api.github.com/user')return json({login:'Guest-Reviewer'});
  throw new Error('Invited reviewer should not require contributor enumeration');
 });
 const reply=await message({type:'comment-policy-status',repository:'owner/board'});
 assert.equal(reply.result.allowed,true);assert.match(reply.result.reason,/allowlist/);
});


test('revision listings validate exact viewer senders, paths and repository before network',async(t)=>{
 const urls=[];withFetch(t,async url=>{urls.push(url);return json([]);});
 for(const type of ['revision-branches','revision-commits','revision-resolve']){
  const args={type,repository:'owner/board',ref:'main',file:'board.kicad_pcb'};
  for(const sender of [githubTab(9,'/owner/board'),options,{id:'test-id',url:extensionOrigin+'browser-viewer.html/evil'}])assert.notEqual((await message(args,sender)).ok,true);
  for(const changes of [{repository:'../board'},{file:'../board.kicad_pcb'},{file:'x:board.kicad_pcb'},{ref:'main\n'}])assert.equal((await message({...args,...changes})).ok,false);
 }
 assert.equal(urls.length,0);
});
test('file commit listing pins moving branch to SHA and remains in requested fork repository',async(t)=>{
 const urls=[];withFetch(t,async url=>{urls.push(url);if(url.includes('/commits/'))return json({sha:sha('a')});return json([{sha:sha('b'),commit:{message:'Change pads\nDetails',author:{name:'Yawar',date:'2026-10-04T10:00:00Z'}}}]);});
 const reply=await message({type:'revision-commits',repository:'fork/board',ref:'feature/board',file:'pcb/board name.kicad_pcb'});assert.equal(reply.ok,true);assert.equal(reply.result.repository,'fork/board');assert.equal(reply.result.snapshotRef,sha('a'));assert.equal(reply.result.commits[0].message,'Change pads');
 assert.match(urls[0],/repos\/fork\/board\/commits\/feature%2Fboard$/);const query=new URL(urls[1]).searchParams;assert.equal(query.get('sha'),sha('a'));assert.equal(query.get('path'),'pcb/board name.kicad_pcb');assert.equal(query.get('per_page'),'50');assert.equal(urls.length,2);
});
test('branch listing bounds pagination and authenticates only in trusted worker',async(t)=>{
 const token='test-credential-'.repeat(3);await KiCadGitHubReviewApi.setToken(token);sessionStore.delete('github-review-token-expiry');t.after(()=>sessionStore.delete('github-review-token'));
 withFetch(t,async(url,init)=>{assert.match(url,/branches\?per_page=100&page=1$/);assert.equal(init.headers.Authorization,'Bearer '+token);return new Response(JSON.stringify(Array.from({length:100},(_,i)=>({name:'branch/'+i,commit:{sha:sha('a')}}))),{status:200,headers:{'content-type':'application/json','link':'<https://api.github.com/next>; rel="next"'}});});
 const result=await message({type:'revision-branches',repository:'owner/board',ref:'main',file:'board.kicad_pcb'});assert.equal(result.ok,true);assert.equal(result.result.branches.length,100);assert.match(result.result.warnings.join(' '),/100/);assert.equal(JSON.stringify(result).includes(token),false);
});
test('revision endpoints reject malformed or oversized remote responses',async(t)=>{
 withFetch(t,async url=>url.includes('/commits/')?json({sha:'moving-name'}):json(Array.from({length:101},()=>({name:'main',commit:{sha:sha('a')}}))));
 assert.equal((await message({type:'revision-resolve',repository:'owner/board',ref:'main',file:'board.kicad_pcb'})).ok,false);assert.equal((await message({type:'revision-branches',repository:'owner/board',ref:'main',file:'board.kicad_pcb'})).ok,false);
 global.fetch=async()=>new Response('[]',{status:200,headers:{'content-length':String(1024*1024+1)}});assert.match((await message({type:'revision-branches',repository:'owner/board',ref:'main',file:'board.kicad_pcb'})).error,/1 MiB/);
});
test('project inventory and raw JSON settings use safe immutable repository paths and exact viewers',async(t)=>{
 const urls=[];withFetch(t,async url=>{urls.push(url);if(url.includes('/commits/'))return json({sha:sha('a'),commit:{tree:{sha:sha('b')}}});if(url.includes('/git/trees/'))return json({truncated:true,tree:[{path:'board.kicad_pro',type:'blob',mode:'100644',size:50},{path:'layers/top.gbr',type:'blob',mode:'100644',size:100},{path:'secret.kicad_pro',type:'blob',mode:'120000'},{path:'../escape.gbr',type:'blob',mode:'100644'}]});return json({board:{design_settings:{rules:{min_clearance:0.2}}}});});
 const sender={id:'test-id',url:extensionOrigin+'project-viewer.html?file=board.kicad_pro'};
 const inventory=await message({type:'project-inventory',repository:'owner/board',ref:'main',file:'board.kicad_pro'},sender);assert.equal(inventory.ok,true);assert.deepEqual(inventory.result.files.map(f=>f.path),['board.kicad_pro','layers/top.gbr']);assert.equal(inventory.result.snapshotRef,sha('a'));assert.match(inventory.result.warnings.join(' '),/truncated/);
 const settings=await message({type:'project-file',repository:'owner/board',ref:sha('a'),file:'board.kicad_pro'},sender);assert.equal(settings.ok,true);assert.equal(JSON.parse(settings.result.content).board.design_settings.rules.min_clearance,0.2);assert.match(urls.at(-1),new RegExp('ref='+sha('a')));
 const before=urls.length;assert.equal((await message({type:'project-file',repository:'owner/board',ref:'main',file:'../escape.gbr'},sender)).ok,false);assert.equal((await message({type:'project-file',repository:'owner/board',ref:'main',file:'board.kicad_pro'},githubTab(4,'/owner/board'))).ok,false);assert.equal(urls.length,before);
});


test('large PCB uses bounded raw Contents media and excludes credentials and redirects', async t => {
  const board = '(kicad_pcb ' + ' '.repeat(9 * 1024 * 1024) + ')';
  withFetch(t, async (url, options) => {
    assert.equal(url, 'https://api.github.com/repos/owner/board/contents/design/large.kicad_pcb?ref=main');
    assert.equal(options.headers.Accept, 'application/vnd.github.raw+json');
    assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, undefined);
    return new Response(board, {headers: {'content-type': 'application/vnd.github.raw+json'}});
  });
  assert.equal(await background.githubFile('owner/board', 'main', 'design/large.kicad_pcb'), board);
});

test('PCB raw byte cap rejects oversized headers; schematics retain their smaller stream cap', async t => {
  withFetch(t, async () => new Response('tiny', {headers: {'content-length': String(64 * 1024 * 1024 + 1)}}));
  await assert.rejects(background.githubFile('owner/board', 'main', 'large.kicad_pcb'), /size limit/);
  global.fetch = async () => new Response('x'.repeat(8 * 1024 * 1024 + 1));
  await assert.rejects(background.githubFile('owner/board', 'main', 'large.kicad_sch'), /size limit/);
  let calls = 0; global.fetch = async () => {calls++; return new Response('');};
  await assert.rejects(background.githubFile('owner/board', 'main', '../large.kicad_pcb'), /Invalid/);
  assert.equal(calls, 0);
});


test('drawing and project reads use the configured account only on the exact GitHub API host', async t => {
  sessionStore.clear(); const token='test-credential-'.repeat(3);await KiCadGitHubReviewApi.setToken(token);t.after(()=>sessionStore.clear());
  withFetch(t,async (url,init)=>{assert.equal(new URL(url).origin,'https://api.github.com');assert.equal(init.headers.Authorization,`Bearer ${token}`);assert.equal(init.redirect,'error');return url.includes('/contents/')?new Response('(kicad_pcb)'):json({sha:sha('a')});});
  assert.equal(await background.githubFile('wayri/board','main','board.kicad_pcb'),'(kicad_pcb)');
  assert.equal((await background.revisionResolve('wayri/board','main','board.kicad_pcb')).sha,sha('a'));
});
test('rate-limited API file reads recover through anonymous bounded raw content without leaking a token',async t=>{
  sessionStore.clear();await KiCadGitHubReviewApi.setToken('test-credential-'.repeat(3));t.after(()=>sessionStore.clear());const calls=[];
  withFetch(t,async(url,init)=>{calls.push(url);if(url.startsWith('https://api.github.com/'))return new Response(null,{status:403,headers:{'x-ratelimit-remaining':'0'}});assert.equal(url,'https://raw.githubusercontent.com/wayri/board/feature%2Ftest/folder/board.kicad_pcb');assert.equal(init.headers,undefined);assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');return new Response('(kicad_pcb)');});
  assert.equal(await background.githubFile('wayri/board','feature/test','folder/board.kicad_pcb'),'(kicad_pcb)');assert.equal(calls.length,2);
});
test('denied access is not treated as a rate limit and credential errors are sanitized',async t=>{
  sessionStore.clear();let calls=0;withFetch(t,async()=>{calls++;return new Response('SECRET',{status:403});});
  await assert.rejects(background.githubFile('wayri/board','main','board.kicad_pcb'),/denied.*permissions/);assert.equal(calls,1);
  global.fetch=async()=>new Response('SECRET',{status:401});await assert.rejects(background.githubFile('wayri/board','main','board.kicad_pcb'),/authentication failed/);
});
test('failed raw fallback retains the rate limit reset guidance without retrying API requests',async t=>{
  sessionStore.clear();let calls=0;withFetch(t,async()=>++calls===1?new Response(null,{status:403,headers:{'x-ratelimit-remaining':'0','x-ratelimit-reset':'2000000000'}}):new Response(null,{status:404}));
  await assert.rejects(background.githubFile('wayri/board','main','board.kicad_pcb'),/rate limit reached.*2033.*Connect your GitHub account/);assert.equal(calls,2);
});


test('private Contents and linked 3D assets use the configured token only on the fixed API origin', async t => {
  const token = 'private-test-token-1234567890';
  await KiCadGitHubReviewApi.setToken(token);
  sessionStore.delete('github-review-token-expiry');
  t.after(()=>sessionStore.delete('github-review-token'));
  const seen = [];
  withFetch(t,async (url,options)=>{
    seen.push(url);
    assert.ok(url.startsWith('https://api.github.com/repos/owner/private/contents/'));
    assert.equal(options.headers.Authorization,'Bearer '+token);
    assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');
    return new Response(url.includes('packages3D') ? 'solid test' : '(kicad_pcb)');
  });
  assert.equal(await background.githubFile('owner/private',sha('d'),'Hardware/HPBM-SMALL.kicad_pcb'),'(kicad_pcb)');
  const model = await background.githubAsset('owner/private',sha('d'),'Hardware/packages3D/test.wrl');
  assert.ok(model);assert.equal(seen.length,2);
});

test('concealed private-repository 404 stays on the requested revision and yields actionable guidance', async t => {
  let calls=0;
  withFetch(t,async ()=>{calls++;return new Response(null,{status:404});});
  const response=await message({type:'project',repository:'owner/private',ref:sha('e'),file:'Hardware/HPBM-SMALL.kicad_pcb'});
  assert.equal(response.ok,false);
  assert.match(response.error,/HTTP 404.*owner\/private.*eeee.*Hardware\/HPBM-SMALL.*access.*website sign-in.*Contents read/);
  assert.equal(calls,1);
});

test('publication recovery is restricted to the isolated viewer surface',async()=>{
 const input={type:'github-recover-publication',comment:sampleComment(),destination:'new-issue',recoveryNumber:1};
 for(const sender of [options,githubTab(6,'/owner/board/issues/1')])assert.match((await message(input,sender)).error,/Only extension viewers/);
});
