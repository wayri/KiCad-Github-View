import assert from 'node:assert/strict';
import test from 'node:test';
import { viewportPixelRatio, boardClipRange } from '../extension/spike/renderQuality.mjs';

test('high density phone retains native 3x detail within bounded framebuffer', () => {
  assert.equal(viewportPixelRatio(390, 740, 3), 3);
  assert.equal(viewportPixelRatio(390, 740, 4), 3);
  assert.equal(viewportPixelRatio(1440, 900, 1), 1);
});

test('tablet, foldable and desktop framebuffer budget holds in both orientations', () => {
  for (const [w, h] of [[1536, 1100], [1100, 1536], [3840, 2160], [7680, 4320], [9000, 400]]) {
    const ratio = viewportPixelRatio(w, h, 3);
    assert.ok(w * h * ratio * ratio <= 4_000_000 + 1e-6);
    assert.ok(w * ratio <= 4096 + 1e-6 && h * ratio <= 4096 + 1e-6);
    assert.ok(ratio > 0 && ratio <= 3);
  }
  assert.equal(viewportPixelRatio(9000, 400, 3), 4096 / 9000);
  assert.equal(viewportPixelRatio(1200, 600, 3, 1024), 1024 / 1200);
});

test('invalid viewport metrics never create an invalid WebGL pixel ratio', () => {
  for (const input of [[0, 0, 0], [NaN, undefined, Infinity], [-1, -1, -1]]) {
    const ratio = viewportPixelRatio(...input);
    assert.ok(Number.isFinite(ratio) && ratio > 0);
  }
});

test('board clip interval contains the fitted board at all normal orbit distances', () => {
  for (const radius of [.5, 20, 150, 3000]) for (const factor of [2.7, 5, 32]) {
    const distance = radius * factor, range = boardClipRange(distance, radius);
    assert.ok(range.near < distance - radius);
    assert.ok(range.far > distance + radius);
    assert.ok(range.near > 0 && range.far > range.near);
  }
});

test('normal board view improves depth precision and close inspection lowers the near plane', () => {
  const normal = boardClipRange(150, 50);
  assert.ok(normal.far / normal.near < 3000 / .1);
  const range = boardClipRange(2, 50);
  assert.equal(range.near, .005);
  assert.equal(range.far, 202);
  for (const d of [NaN, Infinity, -1]) {
    const fallback = boardClipRange(d, d);
    assert.ok(Number.isFinite(fallback.near) && Number.isFinite(fallback.far));
  }
});
