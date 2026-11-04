const test = require('node:test');
const assert = require('node:assert/strict');
const { exportAndroidDocument } = require('../draftsman-workspace.js');

function host(complete) {
  const listeners = new Set();
  return {
    addEventListener(name, callback) { assert.equal(name, 'kicad-android-document-export'); listeners.add(callback); },
    removeEventListener(name, callback) { assert.equal(name, 'kicad-android-document-export'); listeners.delete(callback); },
    AndroidKiCad: { exportDocument(...args) { queueMicrotask(() => complete(args, detail => { for (const callback of [...listeners]) callback({ detail }); })); } },
    listeners
  };
}

test('Android Draftsman PDF passes bounded binary bytes and awaits its matching picker result', async () => {
  const bytes = Uint8Array.from([37, 80, 68, 70, 45, 49, 46, 52, 10, 0, 128, 255]);
  const native = host(([id, name, mime, encoding, data], reply) => {
    assert.equal(name, 'assembly.pdf'); assert.equal(mime, 'application/pdf'); assert.equal(encoding, 'base64');
    assert.deepEqual(Buffer.from(data, 'base64'), Buffer.from(bytes));
    reply({ id: 'another-request', ok: false, error: 'must be ignored' });
    reply({ id, ok: true, cancelled: false });
  });
  assert.equal(await exportAndroidDocument('assembly.pdf', new Blob([bytes], { type: 'application/pdf' }), native), true);
  assert.equal(native.listeners.size, 0);
});

test('Android SVG and editable JSON pass UTF-8 text without blob URL navigation', async () => {
  for (const [name, mime, value] of [['assembly.svg', 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg"><text>π</text></svg>'], ['assembly.json', 'application/json', '{"title":"π"}']]) {
    const native = host(([id, actualName, actualMime, encoding, data], reply) => {
      assert.equal(actualName, name); assert.equal(actualMime, mime); assert.equal(encoding, 'utf8'); assert.equal(data, value); reply({ id, ok: true });
    });
    await exportAndroidDocument(name, new Blob([value], { type: mime }), native);
  }
});

test('native picker cancellation rejects once and never starts an automatic retry', async () => {
  let calls = 0;
  const native = host(([id], reply) => { calls++; reply({ id, ok: false, cancelled: true, error: 'Export cancelled.' }); });
  await assert.rejects(exportAndroidDocument('assembly.json', new Blob(['{}'], { type: 'application/json' }), native), error => error.name === 'AbortError' && error.message === 'Export cancelled.');
  assert.equal(calls, 1); assert.equal(native.listeners.size, 0);
});

test('oversized or unsupported generated documents fail before reaching native', async () => {
  let calls = 0;
  const native = host(() => { calls++; });
  await assert.rejects(exportAndroidDocument('assembly.svg', new Blob(['x'.repeat(8 * 1024 * 1024 + 1)], { type: 'image/svg+xml' }), native), /export limit/);
  await assert.rejects(exportAndroidDocument('assembly.html', new Blob(['<html></html>'], { type: 'text/html' }), native), /export limit/);
  assert.equal(calls, 0);
});
