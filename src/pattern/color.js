// Color helpers. The canonical string form for a color everywhere in Squaresville
// is uppercase #RRGGBB hex — see ENGINEERING_DECISIONS.md ED-2.

const CANONICAL_HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

function assertChannel(value, name) {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new RangeError(`${name} channel must be an integer 0-255, got ${value}`);
  }
}

/** Convert integer RGB channels to the canonical uppercase #RRGGBB form (ED-2). */
export function rgbToHex(r, g, b) {
  assertChannel(r, 'red');
  assertChannel(g, 'green');
  assertChannel(b, 'blue');
  const packed = (r << 16) | (g << 8) | b;
  return `#${packed.toString(16).padStart(6, '0').toUpperCase()}`;
}

/** Parse a #RRGGBB string (any letter case) into { r, g, b }. */
export function hexToRgb(hex) {
  if (typeof hex !== 'string' || !CANONICAL_HEX_PATTERN.test(hex)) {
    throw new RangeError(`expected a #RRGGBB color, got ${JSON.stringify(hex)}`);
  }
  const packed = parseInt(hex.slice(1), 16);
  return { r: (packed >> 16) & 0xff, g: (packed >> 8) & 0xff, b: packed & 0xff };
}

/** Squared Euclidean distance between two [r, g, b] triples. */
export function colorDistanceSquared([r1, g1, b1], [r2, g2, b2]) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return dr * dr + dg * dg + db * db;
}
