/* World-coordinate camera state shared by the inline revision viewers. */
(function (root) {
  "use strict";
  function valid(view) {
    return Boolean(view && Number.isFinite(view.x) && Number.isFinite(view.y) &&
      Math.abs(view.x) <= 1000000 && Math.abs(view.y) <= 1000000 &&
      Number.isFinite(view.zoom) && view.zoom >= .001 && view.zoom <= 10000 && (view.flipped===undefined||typeof view.flipped==='boolean') &&
      (view.quarterTurns===undefined||Number.isFinite(view.quarterTurns)&&view.quarterTurns>=0&&view.quarterTurns<4));
  }
  function read(camera) {
    const view = { x: camera?.center?.x, y: camera?.center?.y, zoom: camera?.zoom };
    if(camera?.flipped!==undefined)view.flipped=camera.flipped;
    if(camera?.quarterTurns!==undefined)view.quarterTurns=camera.quarterTurns;
    return valid(view) ? view : null;
  }
  function apply(camera, view) {
    if (!valid(view) || typeof camera?.center?.set !== "function") return false;
    camera.center.set(view.x, view.y);
    camera.zoom = view.zoom;
    if(view.flipped!==undefined)camera.flipped=view.flipped;
    if(view.quarterTurns!==undefined)camera.quarterTurns=view.quarterTurns;
    return true;
  }
  function watch(canvas, changed) {
    const original = canvas.draw;
    function draw(...args) {
      const result = original.apply(this, args);
      changed();
      return result;
    }
    canvas.draw = draw;
    return () => { if (canvas.draw === draw) canvas.draw = original; };
  }
  const api = { valid, read, apply, watch };
  root.KiCadViewState = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(globalThis);
