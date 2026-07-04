// ENGINEERING_DECISIONS.md ED-11: palette selection strategies (balanced / vivid),
// with vivid the default — it preserves vivid, high-contrast accent colors when
// the palette is drastically reduced, where balanced averages them into duller tones.
// README.md "How to use Squaresville": palette style is a generation prompt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPalette, PALETTE_STYLES } from '../src/pattern/quantize.js';
import { generatePattern } from '../src/pattern/pattern.js';
import { rgbToHsl, colorDistanceSquared } from '../src/pattern/color.js';

/** A raw RGBA grid (one entry per square) from [[r,g,b], count] pairs. */
function gridFromCounts(entries) {
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  const rgba = new Uint8ClampedArray(total * 4);
  let i = 0;
  for (const [[r, g, b], count] of entries) {
    for (let k = 0; k < count; k++) { rgba[i++] = r; rgba[i++] = g; rgba[i++] = b; rgba[i++] = 255; }
  }
  return rgba;
}

const saturation = ([r, g, b]) => rgbToHsl(r, g, b).s;
const maxSaturation = (palette) => Math.max(...palette.map(saturation));

// A dull green majority with a vivid green minority (they share a box), plus a
// dull red that splits off. Under reduction to 2 colors the greens must share one
// palette entry — balanced makes it dull, vivid keeps it saturated.
const ACCENT_GRID = gridFromCounts([
  [[0, 180, 0], 8],    // vivid green accent — few squares, fully saturated
  [[60, 90, 60], 20],  // dull green — the populous majority of that box
  [[160, 50, 50], 20], // dull red — becomes the other palette color
]);

test('TDD_vivid keeps a saturated accent that balanced dulls (ED-11)', () => {
  const vivid = buildPalette(ACCENT_GRID, 2, PALETTE_STYLES.VIVID);
  const balanced = buildPalette(ACCENT_GRID, 2, PALETTE_STYLES.BALANCED);
  assert.equal(vivid.length, 2);
  assert.equal(balanced.length, 2);
  assert.ok(maxSaturation(vivid) > maxSaturation(balanced) + 10,
    `vivid palette should be more saturated: vivid ${maxSaturation(vivid)} vs balanced ${maxSaturation(balanced)}`);
});

test('TDD_vivid lands closer to the vivid accent color than balanced (ED-11)', () => {
  const accent = [0, 180, 0];
  const nearest = (palette) => Math.min(...palette.map((c) => colorDistanceSquared(c, accent)));
  const vivid = buildPalette(ACCENT_GRID, 2, PALETTE_STYLES.VIVID);
  const balanced = buildPalette(ACCENT_GRID, 2, PALETTE_STYLES.BALANCED);
  assert.ok(nearest(vivid) < nearest(balanced),
    'vivid must reproduce the accent more faithfully than balanced');
});

test('TDD_vivid is the default palette style (ED-11)', () => {
  assert.deepEqual(buildPalette(ACCENT_GRID, 2), buildPalette(ACCENT_GRID, 2, PALETTE_STYLES.VIVID));
});

test('TDD_both styles return the exact colors when they already fit (ED-11)', () => {
  for (const style of Object.values(PALETTE_STYLES)) {
    const palette = buildPalette(ACCENT_GRID, 5, style); // 3 distinct <= 5
    const set = new Set(palette.map((c) => c.join(',')));
    assert.deepEqual(set, new Set(['0,180,0', '60,90,60', '160,50,50']));
  }
});

test('TDD_palette building is deterministic for both styles (ED-11)', () => {
  for (const style of Object.values(PALETTE_STYLES)) {
    assert.deepEqual(buildPalette(ACCENT_GRID, 2, style), buildPalette(ACCENT_GRID, 2, style));
  }
});

test('TDD_an unknown palette style is rejected (ED-11)', () => {
  assert.throws(() => buildPalette(ACCENT_GRID, 2, 'psychedelic'), RangeError);
});

test('TDD_generatePattern defaults to vivid and threads the palette style (ED-11)', () => {
  // 48x1 source: 3 distinct colors reduced to 2, so the style changes the result.
  const rgba = ACCENT_GRID;
  const params = { rgba, width: 48, height: 1, squareSize: 1, units: 'cm', maxColors: 2 };
  assert.deepEqual(
    generatePattern(params),
    generatePattern({ ...params, paletteStyle: PALETTE_STYLES.VIVID }),
    'the default must be vivid',
  );
  const vivid = generatePattern({ ...params, paletteStyle: PALETTE_STYLES.VIVID });
  const balanced = generatePattern({ ...params, paletteStyle: PALETTE_STYLES.BALANCED });
  assert.notDeepEqual(vivid.palette, balanced.palette,
    'the two styles must produce different palettes when reducing');
});
