const test = require('node:test');
const assert = require('node:assert/strict');
const view = require('../view-state.js');

test('camera state rejects hostile coordinates and never mutates a rejected view', () => {
  const camera = {zoom: 1, center: {x: 5, y: 6, set(x,y) {this.x=x;this.y=y;}}};
  for (const bad of [null, {x:'1',y:2,zoom:3}, {x:1,y:NaN,zoom:3}, {x:1e7,y:2,zoom:3},
    {x:1,y:2,zoom:0}, {x:1,y:2,zoom:Infinity}]) {
    assert.equal(view.apply(camera, bad), false);
    assert.deepEqual(view.read(camera), {x:5,y:6,zoom:1});
  }
  assert.equal(view.apply(camera, {x:100,y:200,zoom:2}), true);
  assert.deepEqual(view.read(camera), {x:100,y:200,zoom:2});
});

test('a draw observer preserves renderer binding, return value, and restoration', () => {
  const canvas = {count:0,draw(delta) {this.count+=delta;return this.count;}};
  const original = canvas.draw, observations = [];
  const stop = view.watch(canvas, () => observations.push(canvas.count));
  assert.equal(canvas.draw(2), 2); assert.deepEqual(observations, [2]);
  stop(); assert.equal(canvas.draw, original);
  assert.equal(canvas.draw(3), 5); assert.deepEqual(observations, [2]);
});
