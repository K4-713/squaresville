// README.md "Adjust Individual Palette Colors": "the current color palette can be
// sorted in a variety of standard color sort methods, and also by frequency of
// that color in the current pattern image. When a color is selected, it will
// remain selected through a sorting operation."
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, SORT_METHODS } from '../src/pattern/session.js';
import { rgbToHsl } from '../src/pattern/color.js';
import { patternToRgba } from '../src/pattern/pattern.js';
import { imageFromPixels } from './helpers/testImages.js';

// One row of distinct colors with distinct frequencies via repetition:
// blue x1, red x2, gray x3, yellow x4  (10 pixels total, 10x1 grid)
const SORT_PIXELS = [[
  [0, 0, 255],
  [255, 0, 0], [255, 0, 0],
  [128, 128, 128], [128, 128, 128], [128, 128, 128],
  [255, 255, 0], [255, 255, 0], [255, 255, 0], [255, 255, 0],
]];

function sortSession() {
  const session = createSession();
  session.loadSource(imageFromPixels(SORT_PIXELS));
  session.generate({ squareSize: 1, units: 'cm', maxColors: 8 });
  return session;
}

test('TDD_sort by frequency puts the most-used colors first (README)', () => {
  const session = sortSession();
  const { pattern } = session.sortPalette(SORT_METHODS.FREQUENCY);
  assert.deepEqual(pattern.counts, [4, 3, 2, 1], 'counts descend');
  assert.equal(pattern.palette[0], '#FFFF00');
  assert.equal(pattern.palette[3], '#0000FF');
});

test('TDD_sort by hue orders colors around the color wheel (README)', () => {
  const session = sortSession();
  const { pattern } = session.sortPalette(SORT_METHODS.HUE);
  const chromatic = pattern.palette.filter((hex) => hex !== '#808080');
  assert.deepEqual(chromatic, ['#FF0000', '#FFFF00', '#0000FF'],
    'red (0°) before yellow (60°) before blue (240°)');
});

test('TDD_sort by lightness orders dark to light (README)', () => {
  const session = createSession();
  session.loadSource(imageFromPixels([[[255, 255, 255], [0, 0, 0], [128, 128, 128]]]));
  session.generate({ squareSize: 1, units: 'cm', maxColors: 4 });
  const { pattern } = session.sortPalette(SORT_METHODS.LIGHTNESS);
  assert.deepEqual(pattern.palette, ['#000000', '#808080', '#FFFFFF']);
});

test('TDD_sorting never changes the rendered pattern image (README, ED-3)', () => {
  const session = sortSession();
  const before = patternToRgba(session.pattern);
  for (const method of Object.values(SORT_METHODS)) {
    const { pattern } = session.sortPalette(method);
    assert.deepEqual(patternToRgba(pattern).rgba, before.rgba,
      `sorting by ${method} altered the image`);
    assert.equal(new Set(pattern.palette).size, pattern.palette.length);
  }
});

test('TDD_a selected color remains selected through sorting (README)', () => {
  const session = sortSession();
  const selectedHex = '#FF0000';
  const selectedIndex = session.pattern.palette.indexOf(selectedHex);
  const { pattern, colorIndex } = session.sortPalette(SORT_METHODS.FREQUENCY, selectedIndex);
  assert.equal(pattern.palette[colorIndex], selectedHex,
    'the tracked index must follow the color to its new position');
});

test('TDD_sorting with nothing selected tracks nothing', () => {
  const session = sortSession();
  const { colorIndex } = session.sortPalette(SORT_METHODS.HUE, null);
  assert.equal(colorIndex, null);
});

test('TDD_sorting rejects garbage and leaves the pattern intact', () => {
  const session = sortSession();
  const before = session.pattern;
  assert.throws(() => session.sortPalette('by-vibes'), RangeError);
  assert.throws(() => session.sortPalette(SORT_METHODS.HUE, 99), RangeError);
  assert.equal(session.pattern, before);

  const fresh = createSession();
  assert.throws(() => fresh.sortPalette(SORT_METHODS.HUE), /pattern/i);
});

test('TDD_rgbToHsl anchors for the standard color sorts', () => {
  assert.deepEqual(rgbToHsl(255, 0, 0), { h: 0, s: 100, l: 50 });
  assert.deepEqual(rgbToHsl(0, 255, 0), { h: 120, s: 100, l: 50 });
  assert.deepEqual(rgbToHsl(0, 0, 255), { h: 240, s: 100, l: 50 });
  assert.deepEqual(rgbToHsl(255, 255, 255), { h: 0, s: 0, l: 100 });
  assert.deepEqual(rgbToHsl(0, 0, 0), { h: 0, s: 0, l: 0 });
  assert.throws(() => rgbToHsl(300, 0, 0), RangeError);
});
