const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const parse = require('../parsing.js');

class Node {
  constructor(tag = 'div', className = '') {
    this.tag = tag; this.className = className; this.children = []; this.parentNode = null;
    this.hidden = false; this.dataset = {}; this.listeners = {}; this.style = {}; this.attributes = {};
    this.scrolls = 0; this.textContent = '';
    this.classList = { toggle: () => {}, add: () => {}, remove: () => {} };
  }
  get isConnected() { return this.tag === 'body' || Boolean(this.parentNode?.isConnected); }
  attachShadow() { this.shadowRoot = new Node('shadow'); this.shadowRoot.parentNode = this; return this.shadowRoot; }
  append(...nodes) { for (const node of nodes) this.insertBefore(node, null); }
  prepend(...nodes) { for (const node of [...nodes].reverse()) this.insertBefore(node, this.children[0] || null); }
  insertBefore(node, next) {
    node.remove(); node.parentNode = this;
    const index = next ? this.children.indexOf(next) : -1;
    if (index < 0) this.children.push(node); else this.children.splice(index, 0, node);
  }
  replaceChildren(...nodes) { for (const child of this.children) child.parentNode = null; this.children = []; this.append(...nodes); }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
    this.parentNode = null;
  }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  dispatch(type) { for (const listener of this.listeners[type] || []) listener({ target: this }); }
  dispatchEvent(event) { this.dispatch(event.type); return true; }
  click() { this.dispatch('click'); }
  scrollIntoView() { this.scrolls++; }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name] || null; }
  closest(selector) {
    if (selector.includes('.file') && this.parentNode?.className === 'file') return this.parentNode;
    return null;
  }
  querySelector(selector) {
    if (this.diffBody && selector.includes('.file-content')) return this.diffBody;
    return null;
  }
}

function walk(node) {
  return [node, ...(node.shadowRoot ? walk(node.shadowRoot) : []), ...node.children.flatMap(walk)];
}
function find(node, predicate) { return walk(node).find(predicate); }

function fixture(url, { pull = false, initialHidden = false, delayedCard = false,
  draft = false, draftValue = '', draftTitle = false, titleValue = '',
  draftBody = 'Review note for U3', draftHeading = '[Major] KiCad review: U3',
  headRepository = 'owner/repo', privatePull=false, gitlabBlob = null } = {}) {
  const body = new Node('body'), main = new Node('main'); body.append(main);
  let source, card, header, comments, pathNode;
  const makeCard = () => {
    card = new Node('div', 'file'); header = new Node('header', 'file-header');
    comments = new Node('div', 'file-comments');
    source = new Node('div', 'file-content'); pathNode = new Node('div');
    pathNode.setAttribute('data-path', 'design/root.kicad_sch');
    card.diffBody = source; card.append(header, pathNode, source, comments); main.append(card);
    source.hidden = initialHidden;
    return { card, source, header, comments };
  };
  if (pull) {
    if (!delayedCard) makeCard();
  } else { source = new Node('div', 'blob-code'); main.append(source); source.hidden = initialHidden; }
  let textarea = null, titleInput = null;
  const addDraftFields = () => {
    textarea = new Node('textarea'); textarea.value = draftValue; main.append(textarea);
    if (draftTitle) { titleInput = new Node('input'); titleInput.value = titleValue; main.append(titleInput); }
    return { textarea, titleInput };
  };
  if (draft) addDraftFields();
  let listener, interval, intersection, mutation;
  const messages = [];
  const location = { href: url };
  const document = {
    body, documentElement: body,
    createElement: (tag) => new Node(tag),
    querySelector: (selector) => {
      if (selector === 'main') return main;
      if (selector === '#js-view-blob-app,#js-repository-blob-header-app') return gitlabBlob ? {dataset:gitlabBlob} : null;
      if (selector === '#blob-content-holder,.blob-viewer') return source?.isConnected ? source : null;
      if (selector.includes('textarea[name="comment[body]"]') || selector.includes('textarea[name="discussion[body]"]')) return textarea;
      if (selector.includes('input[name="discussion[title]"]')) return titleInput;
      if (!pull && selector.includes('.react-code-file-contents')) return source?.isConnected ? source : null;
      return null;
    },
    querySelectorAll: (selector) => {
      if (selector === 'script[type="application/json"]') return [];
      if (pull && selector === '[data-path],[data-file-path]') return pathNode?.isConnected ? [pathNode] : [];
      return [];
    }
  };
  const context = {
    KiCadGitHub: parse, URL, URLSearchParams, location, document,
    Event: class { constructor(type, options) { this.type = type; this.bubbles = options?.bubbles; } },
    CSSStyleSheet: class { replaceSync() {} },
    MutationObserver: class { constructor(callback) { this.callback = callback; mutation = this; } observe() {} },
    IntersectionObserver: class {
      constructor(callback) { this.callback = callback; this.observed = new Set(); intersection = this; }
      observe(node) { this.observed.add(node); }
      disconnect() { this.observed.clear(); }
      unobserve(node) { this.observed.delete(node); }
      trigger(node) { if (this.observed.has(node)) this.callback([{ target: node, isIntersecting: true }]); }
    },
    addEventListener: () => {},
    setInterval: (fn) => { interval = fn; return 1; },
    setTimeout: (fn, delay) => setTimeout(fn, delay === 300 ? 0 : delay),
    window: { open: () => {} },
    chrome: { runtime: {
      id: 'extension-id', getURL: (name) => `chrome-extension://extension-id/${name}`,
      sendMessage: async (message) => {
        messages.push(message);
        if (message.type === 'githubPull') return { ok: true, result: {
          base: 'a'.repeat(40), baseTip:'c'.repeat(40), head: 'b'.repeat(40), headRepository, changedFiles: 1, private:privatePull
        } };
        if (message.type === 'githubFiles') return { ok: true, result: [
          { file: 'design/root.kicad_sch', oldFile: 'design/root.kicad_sch', status: 'modified' }
        ] };
        if (message.type === 'claim-comment-draft') return { ok: true, result: {
          body: draftBody, ...(draftTitle ? { title: draftHeading } : {})
        } };
        if (message.type === 'ack-comment-draft') return { ok: true, result: { acknowledged: true } };
        throw new Error('Unexpected request');
      },
      onMessage: { addListener: (fn) => { listener = fn; } }
    } }
  };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../content.js'), 'utf8'), context);
  const send = (message, sender = { id: 'extension-id' }) => {
    let reply;
    const handled = listener(message, sender, (value) => { reply = value; });
    return { handled, reply };
  };
  return {
    body, main, get source() { return source; }, get card() { return card; },
    get header() { return header; }, get comments() { return comments; },
    location, messages, get textarea() { return textarea; }, get titleInput() { return titleInput; },
    addDraftFields, send, tick: () => interval(),
    mutate: () => mutation?.callback(),
    addCard: () => makeCard(),
    replaceCard: () => { card?.remove(); return makeCard(); },
    replaceBlobSource: () => {
      source?.remove(); source = new Node('div', 'blob-code'); main.append(source); return source;
    },
    triggerVisible: (node = card) => intersection?.trigger(node)
  };
}

test('blob mounts inline, source toggles, action focuses, and navigation restores source', () => {
  const ui = fixture('https://github.com/owner/repo/blob/main/design/root.kicad_sch');
  const host = find(ui.body, (node) => node.dataset.kicadVisualReview !== undefined);
  assert.ok(host, 'inline panel is mounted');
  assert.equal(host.parentNode, ui.main);
  assert.equal(ui.main.children.indexOf(host) + 1, ui.main.children.indexOf(ui.source));
  const frame = find(host, (node) => node.tag === 'iframe');
  assert.ok(frame, 'native viewer is embedded in GitHub');
  frame.dispatch('load');
  assert.equal(ui.source.hidden, true);
  const showSource = find(host, (node) => node.tag === 'button' && node.textContent === 'Show source');
  showSource.click();
  assert.equal(ui.source.hidden, false);
  assert.equal(ui.send({ type: 'focusInline' }).reply.focused, true);
  assert.ok(host.scrolls > 0);
  assert.equal(ui.send({ type: 'viewerContext' }, { id: 'other-extension' }).handled, false);
  ui.location.href = 'https://github.com/owner/repo';
  ui.tick();
  assert.equal(host.isConnected, false);
  assert.equal(ui.source.hidden, false);
});

test('closing and reopening a preview restores source and ignores a stale frame load', () => {
  const ui = fixture('https://github.com/owner/repo/blob/main/design/root.kicad_sch');
  const host = find(ui.body, (node) => node.dataset.kicadVisualReview !== undefined);
  const frame = find(host, (node) => node.tag === 'iframe');
  frame.dispatch('load');
  assert.equal(ui.source.hidden, true);
  find(host, (node) => node.tag === 'button' && node.textContent === 'Close preview').click();
  assert.equal(ui.source.hidden, false);
  assert.equal(Boolean(find(host, (node) => node.tag === 'iframe')), false);
  frame.dispatch('load');
  assert.equal(ui.source.hidden, false);
  find(host, (node) => node.tag === 'button' && node.textContent === 'Open visual preview').click();
  const reopened = find(host, (node) => node.tag === 'iframe');
  assert.ok(reopened);
  assert.notEqual(reopened, frame);
  reopened.dispatch('load');
  assert.equal(ui.source.hidden, true);
});

test('PR preview stays inside the file card and preserves its header and comments', async () => {
  const ui = fixture('https://github.com/owner/repo/pull/7/files', { pull: true });
  await new Promise(setImmediate);
  const picker = find(ui.body, (node) => node.tag === 'button' && node.textContent === 'design/root.kicad_sch');
  assert.ok(picker, 'PR KiCad file appears in picker');
  picker.click();
  const panel = find(ui.card, (node) => node.dataset.kicadVisualReview !== undefined);
  assert.ok(panel, 'visual panel is inside the GitHub file card');
  assert.equal(ui.card.children.indexOf(panel) + 1, ui.card.children.indexOf(ui.source));
  find(panel, (node) => node.tag === 'iframe').dispatch('load');
  assert.equal(ui.source.hidden, true);
  assert.equal(ui.card.hidden, false);
  assert.equal(ui.header.isConnected, true);
  assert.equal(ui.comments.isConnected, true);
  assert.equal(ui.comments.hidden, false);
  find(panel, (node) => node.tag === 'button' && node.textContent === 'Show source').click();
  assert.equal(ui.source.hidden, false);
  assert.equal(ui.send({ type: 'focusReview' }).reply.focused, true);
  assert.equal(ui.messages[1].expectedFiles, 1);
});

test('fork PR inline viewer receives the base PR context and fork source repository', async () => {
  const ui = fixture('https://github.com/owner/repo/pull/7/files',
    { pull: true, headRepository: 'fork/repo' });
  await new Promise(setImmediate);
  find(ui.body, (node) => node.tag === 'button' && node.textContent === 'design/root.kicad_sch').click();
  const frame = find(ui.card, (node) => node.tag === 'iframe');
  const params = new URL(frame.src).searchParams;
  assert.equal(params.get('repository'), 'owner/repo');
  assert.equal(params.get('headRepository'), 'fork/repo');
  assert.equal(params.get('pullRepository'), 'owner/repo');
  assert.equal(params.get('pullNumber'), '7');
});

test('authorized private fork PR mounts inline and requests the same pinned metadata snapshot',async()=>{
 const ui=fixture('https://github.com/owner/repo/pull/7/files',{pull:true,privatePull:true,headRepository:'private/repo'});
 await new Promise(setImmediate);
 find(ui.body,node=>node.tag==='button'&&node.textContent==='design/root.kicad_sch').click();
 const frame=find(ui.card,node=>node.tag==='iframe');assert.ok(frame);
 const params=new URL(frame.src).searchParams;assert.equal(params.get('headRepository'),'private/repo');assert.equal(params.get('head'),'b'.repeat(40));assert.equal(params.get('base'),'a'.repeat(40));
 const listing=ui.messages.find(m=>m.type==='githubFiles');assert.equal(listing.expectedHead,'b'.repeat(40));assert.equal(listing.expectedBase,'c'.repeat(40));
});

test('navigation restores a source node that GitHub initially kept hidden', () => {
  const ui = fixture('https://github.com/owner/repo/blob/main/design/root.kicad_sch', { initialHidden: true });
  const host = find(ui.body, (node) => node.dataset.kicadVisualReview !== undefined);
  find(host, (node) => node.tag === 'iframe').dispatch('load');
  find(host, (node) => node.tag === 'button' && node.textContent === 'Show source').click();
  assert.equal(ui.source.hidden, false);
  ui.location.href = 'https://github.com/owner/repo';
  ui.tick();
  assert.equal(ui.source.hidden, true);
});

test('PR file card loaded after API metadata mounts inline when it becomes visible', async () => {
  const ui = fixture('https://github.com/owner/repo/pull/7/files', { pull: true, delayedCard: true });
  await new Promise(setImmediate);
  const picker = find(ui.body, (node) => node.tag === 'button' && node.textContent === 'design/root.kicad_sch');
  assert.ok(picker, 'metadata is available before GitHub renders the file card');
  assert.equal(ui.messages.length, 2);
  const { card, source, header } = ui.addCard();
  ui.tick();
  assert.equal(ui.messages.length, 2, 'DOM discovery does not refetch the pull request');
  ui.triggerVisible(card);
  const panel = find(card, (node) => node.dataset.kicadVisualReview !== undefined);
  assert.ok(panel, 'panel is mounted inside the late file card');
  find(panel, (node) => node.tag === 'iframe').dispatch('load');
  assert.equal(source.hidden, true);
  assert.equal(header.isConnected, true);
});

test('PR picker waits for a late file card and then mounts the requested preview', async () => {
  const ui = fixture('https://github.com/owner/repo/pull/7/files', { pull: true, delayedCard: true });
  await new Promise(setImmediate);
  const picker = find(ui.body, (node) => node.tag === 'button' && node.textContent === 'design/root.kicad_sch');
  picker.click();
  assert.equal(find(ui.main, (node) => node.tag === 'iframe'), undefined);
  const { card } = ui.addCard();
  ui.tick();
  assert.ok(find(card, (node) => node.tag === 'iframe'));
  assert.equal(ui.messages.length, 2);
});

test('GitHub mutation observer discovers added and replaced inline file cards', async () => {
  const ui = fixture('https://github.com/owner/repo/pull/7/files', { pull: true, delayedCard: true });
  await new Promise(setImmediate);
  const first = ui.addCard();
  ui.mutate();
  await new Promise((resolve) => setTimeout(resolve, 5));
  ui.triggerVisible(first.card);
  const panel = find(first.card, (node) => node.dataset.kicadVisualReview !== undefined);
  assert.ok(panel, 'new card receives a preview after the DOM mutation');
  find(panel, (node) => node.tag === 'iframe').dispatch('load');
  const second = ui.replaceCard();
  ui.mutate();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(find(second.card, (node) => node.tag === 'iframe'),
    'replacement card receives the already requested preview');
  assert.equal(first.source.hidden, false);
  assert.equal(ui.messages.length, 2, 'DOM mutations do not refetch PR metadata');
});

test('replaced PR file card remounts a requested panel and restores the old source', async () => {
  const ui = fixture('https://github.com/owner/repo/pull/7/files', { pull: true });
  await new Promise(setImmediate);
  const picker = find(ui.body, (node) => node.tag === 'button' && node.textContent === 'design/root.kicad_sch');
  picker.click();
  const oldCard = ui.card, oldSource = ui.source;
  const oldPanel = find(oldCard, (node) => node.dataset.kicadVisualReview !== undefined);
  find(oldPanel, (node) => node.tag === 'iframe').dispatch('load');
  assert.equal(oldSource.hidden, true);
  const { card, source, header, comments } = ui.replaceCard();
  ui.tick();
  const newPanel = find(card, (node) => node.dataset.kicadVisualReview !== undefined);
  assert.ok(newPanel, 'requested review remains mounted in replacement card');
  assert.notEqual(newPanel, oldPanel);
  assert.equal(oldPanel.isConnected, false);
  assert.equal(oldSource.hidden, false);
  find(newPanel, (node) => node.tag === 'iframe').dispatch('load');
  assert.equal(source.hidden, true);
  assert.equal(header.isConnected, true);
  assert.equal(comments.isConnected, true);
  assert.equal(ui.messages.length, 2);
  const second = ui.replaceCard();
  ui.tick();
  assert.equal(source.hidden, false, 'previous card source is restored');
  assert.equal(walk(ui.body).filter((node) => node.dataset.kicadVisualReview !== undefined).length, 2,
    'only the top review and current file preview remain connected');
  assert.ok(find(second.card, (node) => node.tag === 'iframe'));
});

test('PR diff body replacement in the same card moves the preview to the new source', async () => {
  const ui = fixture('https://github.com/owner/repo/pull/7/files', { pull: true });
  await new Promise(setImmediate);
  const picker = find(ui.body, (node) => node.tag === 'button' && node.textContent === 'design/root.kicad_sch');
  picker.click();
  const oldSource = ui.source;
  const oldPanel = find(ui.card, (node) => node.dataset.kicadVisualReview !== undefined);
  find(oldPanel, (node) => node.tag === 'iframe').dispatch('load');
  oldSource.remove();
  const newSource = new Node('div', 'file-content');
  ui.card.diffBody = newSource;
  ui.card.insertBefore(newSource, ui.comments);
  ui.tick();
  const newPanel = find(ui.card, (node) => node.dataset.kicadVisualReview !== undefined);
  assert.notEqual(newPanel, oldPanel);
  assert.equal(oldSource.hidden, false);
  assert.equal(ui.card.children.indexOf(newPanel) + 1, ui.card.children.indexOf(newSource));
});

test('picker launch from a stale route cannot mount a panel', async () => {
  const ui = fixture('https://github.com/owner/repo/pull/7/files', { pull: true });
  await new Promise(setImmediate);
  const picker = find(ui.body, (node) => node.tag === 'button' && node.textContent === 'design/root.kicad_sch');
  ui.location.href = 'https://github.com/owner/repo';
  picker.click();
  assert.equal(find(ui.card, (node) => node.dataset.kicadVisualReview !== undefined), undefined);
  assert.equal(ui.source.hidden, false);
  ui.tick();
  assert.equal(picker.isConnected, false);
});

test('blob source replacement remounts the inline panel by the new source', () => {
  const ui = fixture('https://github.com/owner/repo/blob/main/design/root.kicad_sch');
  const oldSource = ui.source;
  const oldPanel = find(ui.main, (node) => node.dataset.kicadVisualReview !== undefined);
  find(oldPanel, (node) => node.tag === 'iframe').dispatch('load');
  assert.equal(oldSource.hidden, true);
  const source = ui.replaceBlobSource();
  ui.tick();
  const panel = find(ui.main, (node) => node.dataset.kicadVisualReview !== undefined);
  assert.ok(panel);
  assert.notEqual(panel, oldPanel);
  assert.equal(oldSource.hidden, false);
  assert.equal(ui.main.children.indexOf(panel) + 1, ui.main.children.indexOf(source));
  find(panel, (node) => node.tag === 'iframe').dispatch('load');
  assert.equal(source.hidden, true);
  ui.tick();
  ui.tick();
  assert.equal(walk(ui.body).filter((node) => node.dataset.kicadVisualReview !== undefined).length, 1,
    'later checks retain just the active inline panel');
  assert.equal(ui.send({ type: 'focusInline' }).reply.focused, true);
  assert.ok(panel.scrolls > 0, 'the current panel receives focus');
  ui.location.href = 'https://github.com/owner/repo';
  ui.tick();
  assert.equal(source.hidden, false, 'navigation restores the current source');
});

test('GitHub PR draft fills only an empty textarea and never submits', async () => {
  const ui = fixture('https://github.com/owner/board/pull/7#issuecomment-new', { draft: true });
  let inputEvents = 0;
  ui.textarea.addEventListener('input', () => { inputEvents++; });
  ui.tick();
  await new Promise(setImmediate);
  assert.equal(ui.textarea.value, 'Review note for U3');
  assert.equal(inputEvents, 1);
  assert.deepEqual(ui.messages.map((item) => item.type), ['claim-comment-draft', 'ack-comment-draft']);
  ui.tick();
  assert.equal(ui.messages.length, 2);
});

test('GitHub PR draft does not overwrite text already in the composer', async () => {
  const ui = fixture('https://github.com/owner/board/pull/7#issuecomment-new',
    { draft: true, draftValue: 'Existing GitHub draft' });
  ui.tick();
  await new Promise(setImmediate);
  assert.equal(ui.textarea.value, 'Existing GitHub draft');
  assert.equal(ui.messages.length, 0);
});

test('discussion draft survives category selection and fills empty title and body without submitting', async () => {
  const ui = fixture('https://github.com/owner/board/discussions/new', { draftTitle: true });
  ui.tick();
  assert.equal(ui.messages.length, 0, 'category selection has no editor to claim the draft');
  ui.location.href = 'https://github.com/owner/board/discussions/new?category=general';
  ui.addDraftFields();
  let titleInputs = 0, bodyInputs = 0;
  ui.titleInput.addEventListener('input', () => { titleInputs++; });
  ui.textarea.addEventListener('input', () => { bodyInputs++; });
  ui.mutate();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(ui.titleInput.value, '[Major] KiCad review: U3');
  assert.equal(ui.textarea.value, 'Review note for U3');
  assert.equal(titleInputs, 1);
  assert.equal(bodyInputs, 1);
  assert.deepEqual(ui.messages.map((item) => item.type), ['claim-comment-draft', 'ack-comment-draft']);
});

test('discussion draft never overwrites an existing title or body', async () => {
  const ui = fixture('https://github.com/owner/board/discussions/new?category=general',
    { draft: true, draftTitle: true, titleValue: 'My own discussion' });
  ui.tick();
  await new Promise(setImmediate);
  assert.equal(ui.titleInput.value, 'My own discussion');
  assert.equal(ui.textarea.value, '');
  assert.equal(ui.messages.length, 0);
});

test('existing issue comment draft fills an empty GitHub textarea', async () => {
  const ui = fixture('https://github.com/owner/board/issues/31#issuecomment-new', { draft: true });
  await new Promise(setImmediate);
  assert.equal(ui.textarea.value, 'Review note for U3');
  assert.deepEqual(ui.messages.map((item) => item.type), ['claim-comment-draft', 'ack-comment-draft']);
});

test('PR files view never claims a conversation draft into a diff textarea', async () => {
  const ui = fixture('https://github.com/owner/repo/pull/7/files', { pull: true, draft: true });
  await new Promise(setImmediate);
  ui.tick();
  assert.equal(ui.textarea.value, '');
  assert.deepEqual(ui.messages.map((item) => item.type), ['githubPull', 'githubFiles']);
});


test('GitLab blob preview mounts at the native source and preserves namespace/ref metadata', () => {
  const ui = fixture('https://gitlab.com/group/subgroup/board/-/blob/feature/power/design/root.kicad_sch', {
    gitlabBlob:{projectPath:'group/subgroup/board',blobPath:'design/root.kicad_sch',originalBranch:'feature/power'}
  });
  const frame = find(ui.body, node => node.tag === 'iframe');
  assert.ok(frame);
  const params = new URL(frame.src).searchParams;
  assert.equal(params.get('provider'),'gitlab');
  assert.equal(params.get('repository'),'group/subgroup/board');
  assert.equal(params.get('head'),'feature/power');
  assert.equal(params.get('file'),'design/root.kicad_sch');
  frame.dispatch('load');
  assert.equal(ui.source.hidden, true);
  ui.location.href = 'https://gitlab.com/group/subgroup/board';
  ui.tick();
  assert.equal(ui.source.hidden, false);
});

test('GitLab blob URL without matching authoritative metadata never guesses a ref', () => {
  const ui = fixture('https://gitlab.com/group/board/-/blob/feature/power/root.kicad_sch');
  assert.equal(find(ui.body,node=>node.tag==='iframe'),undefined);
});
