// README.md "Adjust Individual Palette Colors": "the current color palette can be
// sorted in a variety of standard color sort methods, and also by frequency of
// that color in the current pattern image. When a color is selected, it will
// remain selected through a sorting operation."
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, SORT_METHODS, MERGE_STYLES } from '../src/pattern/session.js';
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

// README: "While a sort is active, the palette re-applies it after every change
// you make to the palette — adjusting a color, deleting, or merging." Covers all
// three palette manipulations, for both frequency and a color-value sort.

test('TDD_a merge re-applies an active most-used sort (README)', () => {
  const session = sortSession();
  session.sortPalette(SORT_METHODS.FREQUENCY); // yellow4, gray3, red2, blue1
  const red = session.pattern.palette.indexOf('#FF0000');
  const gray = session.pattern.palette.indexOf('#808080');
  const { pattern, colorIndex } = session.mergeColors(red, gray, MERGE_STYLES.A_TO_B);
  // red's squares join gray -> gray now has 5 and jumps to the front
  assert.deepEqual(pattern.counts, [5, 4, 1], 'palette re-sorted by the new counts');
  assert.equal(pattern.palette[0], '#808080');
  assert.equal(colorIndex, 0, 'the merged color is tracked to its new position');
  assert.equal(session.sortMethod, SORT_METHODS.FREQUENCY);
});

test('TDD_adjusting a color re-applies an active hue sort (README)', () => {
  const session = sortSession();
  session.sortPalette(SORT_METHODS.HUE); // gray(achr), red(0), yellow(60), blue(240)
  const red = session.pattern.palette.indexOf('#FF0000');
  const { pattern, colorIndex } = session.changeColor(red, '#00FF00'); // -> hue 120
  assert.deepEqual(pattern.palette, ['#808080', '#FFFF00', '#00FF00', '#0000FF'],
    'the edited color moves to its new hue position');
  assert.equal(pattern.palette[colorIndex], '#00FF00', 'the edited color stays selected');
  assert.equal(session.sortMethod, SORT_METHODS.HUE);
});

test('TDD_deleting a color re-applies an active sort (README)', () => {
  const session = sortSession();
  session.sortPalette(SORT_METHODS.HUE);
  const red = session.pattern.palette.indexOf('#FF0000');
  const { pattern } = session.deleteColor(red); // red's squares go to nearest (gray)
  assert.deepEqual(pattern.palette, ['#808080', '#FFFF00', '#0000FF'],
    'the remaining colors stay in hue order');
  assert.equal(session.sortMethod, SORT_METHODS.HUE);
});

test('TDD_with no active sort, editing does not reorder the palette', () => {
  const session = sortSession();
  assert.equal(session.sortMethod, null, 'no sort has been chosen');
  const before = session.pattern.palette.slice();
  const red = session.pattern.palette.indexOf('#FF0000');
  session.changeColor(red, '#010203'); // a distinct color, near nothing
  assert.equal(session.sortMethod, null, 'still no active sort');
  const after = session.pattern.palette;
  for (let i = 0; i < before.length; i++) {
    if (before[i] !== '#FF0000') assert.equal(after[i], before[i], 'untouched colors did not move');
  }
});

test('TDD_a no-op edit under an active sort adds no undo step', () => {
  const session = sortSession();
  session.sortPalette(SORT_METHODS.FREQUENCY);
  const steps = session.undoCount;
  const first = session.pattern.palette[0];
  session.changeColor(0, first); // change a color to the value it already has
  assert.equal(session.undoCount, steps, 'a no-op must not re-sort or add history');
});

test('TDD_the active sort is tracked and cleared on regeneration', () => {
  const session = sortSession();
  assert.equal(session.sortMethod, null);
  session.sortPalette(SORT_METHODS.LIGHTNESS);
  assert.equal(session.sortMethod, SORT_METHODS.LIGHTNESS);
  session.setTargetColors(2); // regenerates from source (ED-6)
  assert.equal(session.sortMethod, null, 'a freshly generated palette is no longer user-sorted');
});

test('TDD_an edit plus its automatic re-sort is a single undo step (README)', () => {
  const session = sortSession();
  session.sortPalette(SORT_METHODS.FREQUENCY);
  assert.equal(session.undoCount, 1);
  const red = session.pattern.palette.indexOf('#FF0000');
  const gray = session.pattern.palette.indexOf('#808080');
  session.mergeColors(red, gray, MERGE_STYLES.A_TO_B);
  assert.equal(session.undoCount, 2, 'merge + auto re-sort count as one action');
  const restored = session.undo();
  assert.deepEqual(restored.counts, [4, 3, 2, 1], 'back to the pre-merge most-used order');
  assert.equal(session.undoCount, 1);
  assert.equal(session.sortMethod, SORT_METHODS.FREQUENCY, 'the sort mode is restored too');
});

test('TDD_rgbToHsl anchors for the standard color sorts', () => {
  assert.deepEqual(rgbToHsl(255, 0, 0), { h: 0, s: 100, l: 50 });
  assert.deepEqual(rgbToHsl(0, 255, 0), { h: 120, s: 100, l: 50 });
  assert.deepEqual(rgbToHsl(0, 0, 255), { h: 240, s: 100, l: 50 });
  assert.deepEqual(rgbToHsl(255, 255, 255), { h: 0, s: 0, l: 100 });
  assert.deepEqual(rgbToHsl(0, 0, 0), { h: 0, s: 0, l: 0 });
  assert.throws(() => rgbToHsl(300, 0, 0), RangeError);
});
