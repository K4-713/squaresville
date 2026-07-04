// README.md "Adjust Individual Palette Colors": the detail pane shows the selected
// color's swatch and hex, its square count, its nearest neighbor colors in the
// current palette with their counts, and a color adjuster (picker, rgb/cmyk
// sliders, or direct hex entry).
// ENGINEERING_DECISIONS.md ED-7: palette edits act on the indexed model and merge
// entries that become identical.
import test from 'node:test';
import assert from 'node:assert/strict';
import { nearestNeighbors } from '../src/pattern/pattern.js';
import { rgbToCmyk, cmykToRgb, rgbToHex, hexToRgb } from '../src/pattern/color.js';
import { createSession } from '../src/pattern/session.js';
import { blockImage } from './helpers/testImages.js';

// red, near-red, green, blue — distances from red are unambiguous
const DETAIL_COLORS = [
  [[255, 0, 0], [250, 10, 5]],
  [[0, 255, 0], [0, 0, 255]],
];

function detailSession() {
  const session = createSession();
  session.loadSource(blockImage(DETAIL_COLORS, 2, 2));
  session.generate({ rows: 2, cols: 2, squareSize: 1, units: 'cm', maxColors: 4 });
  return session;
}

test('TDD_nearest neighbors are the closest palette colors with counts (README)', () => {
  const session = detailSession();
  const pattern = session.pattern;
  const redIndex = pattern.palette.indexOf('#FF0000');
  const neighbors = nearestNeighbors(pattern, redIndex, 2);

  assert.equal(neighbors.length, 2);
  assert.equal(neighbors[0].hex, '#FA0A05', 'nearest to red must be near-red');
  for (const neighbor of neighbors) {
    assert.notEqual(neighbor.index, redIndex, 'a color is not its own neighbor');
    assert.equal(neighbor.count, pattern.counts[neighbor.index]);
  }
});

test('TDD_neighbor requests are clamped to the palette and reject garbage', () => {
  const session = detailSession();
  const pattern = session.pattern;
  assert.equal(nearestNeighbors(pattern, 0, 99).length, pattern.palette.length - 1);
  assert.throws(() => nearestNeighbors(pattern, -1, 2), RangeError);
  assert.throws(() => nearestNeighbors(pattern, 7, 2), RangeError);
  assert.throws(() => nearestNeighbors(pattern, 0, 0), RangeError);
});

test('TDD_changing a color recolors its squares without regenerating (README, ED-7)', () => {
  const session = detailSession();
  const before = session.pattern;
  const redIndex = before.palette.indexOf('#FF0000');

  const { pattern, colorIndex } = session.changeColor(redIndex, '#ab00cd');
  assert.equal(pattern.palette[colorIndex], '#AB00CD', 'hex is canonicalized (ED-2)');
  assert.deepEqual(pattern.indices, before.indices, 'square assignments must not change');
  assert.deepEqual(pattern.counts, before.counts);
  assert.equal(session.pattern, pattern);
});

test('TDD_an edit that duplicates another color merges the two entries (ED-7)', () => {
  const session = detailSession();
  const before = session.pattern;
  const redIndex = before.palette.indexOf('#FF0000');
  const nearRedIndex = before.palette.indexOf('#FA0A05');
  const expectedCount = before.counts[redIndex] + before.counts[nearRedIndex];

  const { pattern, colorIndex } = session.changeColor(redIndex, '#FA0A05');
  assert.equal(pattern.palette.length, before.palette.length - 1, 'palette shrinks by one');
  assert.equal(new Set(pattern.palette).size, pattern.palette.length, 'no duplicates (ED-3)');
  assert.equal(pattern.palette[colorIndex], '#FA0A05');
  assert.equal(pattern.counts[colorIndex], expectedCount, 'square counts are summed');
  for (const index of pattern.indices) {
    assert.ok(Number.isInteger(index) && index >= 0 && index < pattern.palette.length);
  }
  assert.equal(pattern.counts.reduce((a, b) => a + b, 0), pattern.dimensions.totalSquares);
});

test('TDD_color changes reject garbage and leave the pattern intact', () => {
  const session = detailSession();
  const before = session.pattern;
  assert.throws(() => session.changeColor(0, 'garbage'), RangeError);
  assert.throws(() => session.changeColor(0, '#FFF'), RangeError);
  assert.throws(() => session.changeColor(9, '#112233'), RangeError);
  assert.throws(() => session.changeColor(-1, '#112233'), RangeError);
  assert.equal(session.pattern, before, 'failed edits must not alter the pattern');

  const fresh = createSession();
  assert.throws(() => fresh.changeColor(0, '#112233'), /pattern/i);
});

test('TDD_rgb/cmyk conversions round-trip for the slider adjuster (README)', () => {
  for (const hex of ['#000000', '#FFFFFF', '#FF0000', '#00FFFF', '#69603F', '#89CFC9']) {
    const { r, g, b } = hexToRgb(hex);
    const { c, m, y, k } = rgbToCmyk(r, g, b);
    for (const channel of [c, m, y, k]) {
      assert.ok(channel >= 0 && channel <= 100, `cmyk channel out of range: ${channel}`);
    }
    const back = cmykToRgb(c, m, y, k);
    assert.ok(Math.abs(back.r - r) <= 1 && Math.abs(back.g - g) <= 1 && Math.abs(back.b - b) <= 1,
      `${hex} round-tripped to ${rgbToHex(back.r, back.g, back.b)}`);
  }
  // anchors
  assert.deepEqual(rgbToCmyk(0, 0, 0), { c: 0, m: 0, y: 0, k: 100 });
  assert.deepEqual(rgbToCmyk(255, 255, 255), { c: 0, m: 0, y: 0, k: 0 });
  assert.deepEqual(cmykToRgb(100, 0, 0, 0), { r: 0, g: 255, b: 255 });
});

test('TDD_cmyk conversions reject out-of-range garbage', () => {
  assert.throws(() => cmykToRgb(101, 0, 0, 0), RangeError);
  assert.throws(() => cmykToRgb(0, -5, 0, 0), RangeError);
  assert.throws(() => cmykToRgb(0, 0, NaN, 0), RangeError);
  assert.throws(() => rgbToCmyk(256, 0, 0), RangeError);
});
