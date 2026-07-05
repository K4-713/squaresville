// ENGINEERING_DECISIONS.md ED-12: the requested color count is delivered exactly, as
// used colors, up to the pattern's availableColors (distinct grid colors); no palette
// color is ever unused, so the count is honest and monotonic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePattern } from '../src/pattern/pattern.js';
import { buildPalette, distinctColorCount, PALETTE_STYLES } from '../src/pattern/quantize.js';

/** A width×1 source image (1:1 grid) from [[r,g,b], count] pairs. */
function sourceFromCounts(entries) {
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  const rgba = new Uint8ClampedArray(total * 4);
  let i = 0;
  for (const [[r, g, b], count] of entries) {
    for (let k = 0; k < count; k++) { rgba[i++] = r; rgba[i++] = g; rgba[i++] = b; rgba[i++] = 255; }
  }
  return { rgba, width: total, height: 1 };
}

// 24 distinct colors in 6 tight clusters of 4 — the clustered shape that used to make
// median-cut box averages land unused (dropping the delivered count below the request).
const CLUSTER_BASES = [[40, 90, 40], [30, 60, 130], [150, 60, 60], [200, 190, 40], [110, 80, 50], [140, 140, 140]];
const CLUSTERED = sourceFromCounts(
  CLUSTER_BASES.flatMap((base) => [0, 6, 12, 18].map((d, k) => [
    [base[0] + d, base[1] + (k % 2 ? d : 0), base[2] + d], 30 + k,
  ])),
);
const params = { ...CLUSTERED, squareSize: 1, units: 'cm' };

test('TDD_availableColors is the count of distinct colors in the grid (ED-12)', () => {
  const pattern = generatePattern({ ...params, maxColors: 8 });
  assert.equal(pattern.availableColors, 24, 'the clustered image has 24 distinct colors');
});

test('TDD_requesting N colors delivers exactly N used colors (ED-12)', () => {
  for (let n = 4; n <= 24; n++) {
    const pattern = generatePattern({ ...params, maxColors: n });
    assert.equal(pattern.palette.length, n, `requested ${n} colors`);
    assert.ok(pattern.counts.every((c) => c > 0), `no palette color may be unused (n=${n})`);
    assert.equal(new Set(pattern.palette).size, n, `no duplicate colors (n=${n})`);
  }
});

test('TDD_the delivered count never decreases as the request rises (ED-12)', () => {
  let previous = 0;
  for (let n = 1; n <= 24; n++) {
    const got = generatePattern({ ...params, maxColors: n }).palette.length;
    assert.ok(got >= previous, `count went backwards at n=${n}: ${previous} -> ${got}`);
    assert.ok(got <= n, `delivered more than requested at n=${n}: ${got}`);
    previous = got;
  }
});

test('TDD_requesting more colors than exist yields all available colors (ED-12)', () => {
  const pattern = generatePattern({ ...params, maxColors: 100 });
  assert.equal(pattern.palette.length, 24, 'capped at the 24 available colors');
  assert.ok(pattern.counts.every((c) => c > 0));
});

test('TDD_buildPalette returns only colors used under nearest mapping (ED-12)', () => {
  // Every returned color must be the nearest for at least one distinct grid color.
  const grid = CLUSTERED.rgba;
  for (const style of Object.values(PALETTE_STYLES)) {
    const palette = buildPalette(grid, 7, style);
    assert.equal(palette.length, 7);
    const usedCount = distinctColorCount(grid); // sanity: helper agrees with the source
    assert.equal(usedCount, 24);
    const distances = (color) => palette.map((p) => (p[0] - color[0]) ** 2 + (p[1] - color[1]) ** 2 + (p[2] - color[2]) ** 2);
    // build the set of palette indices that win at least one grid color
    const winners = new Set();
    for (let i = 0; i < grid.length; i += 4) {
      const d = distances([grid[i], grid[i + 1], grid[i + 2]]);
      winners.add(d.indexOf(Math.min(...d)));
    }
    assert.equal(winners.size, 7, `every palette color must be used (${style})`);
  }
});
