// Pure coordinate math for the in-pane color picker (DESIGN.md "In-pane color
// picker"): a hue ring around a saturation/brightness square. DOM-free so the
// geometry is unit-tested without a browser; color<->channel conversion reuses
// color.js (rgbToHsb/hsbToRgb) in the UI layer that drives this.

const DEGREES_PER_RADIAN = 180 / Math.PI;

function assertHue(hue) {
  if (typeof hue !== 'number' || !Number.isFinite(hue) || hue < 0 || hue > 360) {
    throw new RangeError(`hue must be a number 0-360, got ${hue}`);
  }
}

function assertPercent(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new RangeError(`${name} must be a number 0-100, got ${value}`);
  }
}

/**
 * Hue (0-360) for a pointer vector measured from the ring's center. The ring is
 * oriented like the CSS conic-gradient that paints it: 0deg at the top (12
 * o'clock), increasing clockwise. Screen y grows downward, so "up" is -y.
 */
export function hueForVector(dx, dy) {
  let angle = Math.atan2(dx, -dy) * DEGREES_PER_RADIAN;
  if (angle < 0) angle += 360;
  return angle % 360;
}

/**
 * Offset { x, y } from the ring center for a hue's marker, on a ring of the given
 * radius (any unit — px for pointer math, or a fraction for percentage layout).
 */
export function vectorForHue(hue, radius) {
  assertHue(hue);
  const angle = hue / DEGREES_PER_RADIAN;
  return { x: radius * Math.sin(angle), y: -radius * Math.cos(angle) };
}

/**
 * Saturation and brightness (0-100) for a point in a `size`-wide square, clamped
 * to its edges. Left→right is 0→100 saturation; top→bottom is 100→0 brightness.
 */
export function svForPoint(px, py, size) {
  const clamp = (value) => Math.min(size, Math.max(0, value));
  return {
    s: (clamp(px) / size) * 100,
    v: (1 - clamp(py) / size) * 100,
  };
}

/** Point { x, y } in a `size`-wide square for a saturation/brightness pair. */
export function pointForSv(s, v, size) {
  assertPercent(s, 'saturation');
  assertPercent(v, 'brightness');
  return { x: (s / 100) * size, y: (1 - v / 100) * size };
}
