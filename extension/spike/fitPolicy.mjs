/** A sphere fits in both frustum axes at every orbit angle. */
export function sphereFitDistance(radius, verticalFovDegrees, aspect, margin = 1.1) {
  if (!(radius > 0) || !Number.isFinite(radius) || !(aspect > 0) || !Number.isFinite(aspect) || !(verticalFovDegrees > 0 && verticalFovDegrees < 180)) return null;
  const verticalHalf = verticalFovDegrees * Math.PI / 360;
  const horizontalHalf = Math.atan(Math.tan(verticalHalf) * aspect);
  return radius * Math.max(1, margin) / Math.sin(Math.min(verticalHalf, horizontalHalf));
}
