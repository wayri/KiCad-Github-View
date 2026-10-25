// Keep fine pad/model edges sharp on high-density phones without allocating an
// unbounded full-resolution framebuffer on large monitors or foldables.
export function viewportPixelRatio(width, height, deviceRatio = 1, maxDimension = 4096) {
  const w = Number.isFinite(width) && width > 0 ? width : 1;
  const h = Number.isFinite(height) && height > 0 ? height : 1;
  const dpr = Number.isFinite(deviceRatio) && deviceRatio > 0 ? deviceRatio : 1;
  const dimension = Number.isFinite(maxDimension) && maxDimension > 0 ? maxDimension : 4096;
  return Math.min(dpr, 3, Math.sqrt(4_000_000 / w / h), dimension / w, dimension / h);
}

// Avoid a kilometre-scale far plane for millimetre-scale boards. Updating this
// on orbit/zoom preserves thin copper depth precision and close inspection.
export function boardClipRange(distance, radius) {
  const d = Number.isFinite(distance) && distance > 0 ? distance : 1;
  const r = Number.isFinite(radius) && radius > 0 ? radius : 1;
  return { near: Math.max(.005, Math.min(.1, d / 1000)), far: Math.max(10, d + r * 4) };
}
