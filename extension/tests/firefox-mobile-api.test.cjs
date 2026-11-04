const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../firefox/browser-api.js'), 'utf8');

function setup({ windows, createTab } = {}) {
  const calls = [];
  const browser = {
    runtime: { id: 'owned-addon', getURL: name => 'moz-extension://owned-addon/' + name },
    tabs: { create: createTab || (async options => { calls.push(options); return { id: 23, windowId: 0, url: options.url }; }) },
    ...(windows ? { windows } : {}),
  };
  const context = vm.createContext({ browser, URL });
  vm.runInContext(source, context);
  return { context, browser, calls };
}

test('Android viewer pop-out becomes an internal active tab without new permissions', async () => {
  const { browser, context, calls } = setup();
  assert.equal(context.chrome, browser);
  const options = { url: 'moz-extension://owned-addon/browser-viewer.html?repository=owner%2Fboard&head=main&file=board.kicad_pcb', type: 'popup', state: 'maximized' };
  const result = await context.chrome.windows.create(options);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, options.url);
  assert.equal(calls[0].active, true);
  assert.equal(result.id, 0);
  assert.equal(result.tabs[0].id, 23);
  assert.equal(options.type, 'popup');
  vm.runInContext(source, context);
  assert.equal(context.chrome, browser);
});

test('Android project overview preserves its route and explicit focus preference', async () => {
  const { browser, calls } = setup();
  await browser.windows.create({ url: 'moz-extension://owned-addon/project-viewer.html?provider=gitlab&file=board.kicad_pro', focused: false });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].active, false);
  assert.match(calls[0].url, /provider=gitlab/);
});

test('Mobile fallback rejects external, foreign, privileged and unsupported requests before opening tabs', async () => {
  const { browser, calls } = setup();
  for (const options of [
    { url: 'https://github.com/owner/board' },
    { url: 'moz-extension://foreign-addon/browser-viewer.html' },
    { url: 'moz-extension://owned-addon.evil/browser-viewer.html' },
    { url: 'moz-extension://owned-addon/options.html' },
    { url: 'moz-extension://owned-addon/browser-viewer.html#unexpected' },
    { url: 'moz-extension://owned-addon/%2e%2e/options.html' },
    { url: ['moz-extension://owned-addon/browser-viewer.html'] },
    { url: 'moz-extension://owned-addon/browser-viewer.html', incognito: true },
    { url: 'moz-extension://owned-addon/browser-viewer.html', type: 'normal' },
    { url: 'moz-extension://owned-addon/browser-viewer.html', focused: 'true' },
    { url: 'moz-extension://owned-addon/browser-viewer.html?' + 'x'.repeat(16384) },
    null,
  ]) await assert.rejects(browser.windows.create(options));
  assert.equal(calls.length, 0);
});

test('Desktop Firefox windows and rejected policy decisions remain untouched', async () => {
  let attempts = 0;
  const denied = new Error('Denied by browser policy');
  const windows = { create: async () => { attempts++; throw denied; }, update() {} };
  const { browser, calls } = setup({ windows });
  assert.equal(browser.windows, windows);
  await assert.rejects(browser.windows.create({ url: 'moz-extension://owned-addon/browser-viewer.html' }), error => error === denied);
  assert.equal(attempts, 1);
  assert.equal(calls.length, 0);
});

test('Mobile tab failures surface directly and do not retry a denied operation', async () => {
  let attempts = 0;
  const denied = new Error('Tab creation denied');
  const { browser } = setup({ createTab: async () => { attempts++; throw denied; } });
  await assert.rejects(browser.windows.create({ url: 'moz-extension://owned-addon/browser-viewer.html' }), error => error === denied);
  assert.equal(attempts, 1);
  delete browser.tabs;
  await assert.rejects(browser.windows.create({ url: 'moz-extension://owned-addon/browser-viewer.html' }), /unavailable/);
});
