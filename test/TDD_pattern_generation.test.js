// README.md "How to use Squaresville":
//  - the user chooses square size, rows/columns "(with the image's original dimensions
//    in pixels as the default)", and a maximum number of colors
//  - Squaresville generates a base pattern image, final dimensions, total squares, and
//    "an editable color palette with all the colors present in the pattern image"
// README.md "Saving the Pattern Image":
//  - the pattern image stays an indexed-color image, and re-uploading it resumes work
import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePattern, patternToRgba, colorIndexAt } from '../src/pattern/pattern.js';
import { solidImage, blockImage } from './helpers/testImages.js';

const BASE_PARAMS = { squareSize: 1, units: 'inches', maxColors: 16 };

test('TDD_a click point in the pattern maps to that square\'s color index (README: select a color "directly in the design image")', () => {
  // A 4x2 pattern with a known index layout:
  //   row 0:  0 0 1 1
  //   row 1:  2 2 3 3
  const pattern = { cols: 4, rows: 2, indices: [0, 0, 1, 1, 2, 2, 3, 3] };
  // Normalized (fractionX, fractionY) within each quadrant picks its color index.
  assert.equal(colorIndexAt(pattern, 0.10, 0.25), 0, 'top-left square');
  assert.equal(colorIndexAt(pattern, 0.60, 0.25), 1, 'top-right square');
  assert.equal(colorIndexAt(pattern, 0.10, 0.75), 2, 'bottom-left square');
  assert.equal(colorIndexAt(pattern, 0.90, 0.75), 3, 'bottom-right square');
  // A cell boundary falls into the higher cell (floor): 0.5 of 4 cols = col 2.
  assert.equal(colorIndexAt(pattern, 0.5, 0.0), 1, 'the midline lands in the 3rd column');
  // Edge/overshoot clicks clamp inside the grid rather than reading out of bounds.
  assert.equal(colorIndexAt(pattern, 0.0, 0.0), 0, 'top-left corner');
  assert.equal(colorIndexAt(pattern, 1.0, 1.0), 3, 'bottom-right corner clamps to the last square');
});

test('TDD_rows and cols default to the image pixel dimensions (README)', () => {
  const { rgba, width, height } = solidImage(7, 5, [10, 20, 30]);
  const pattern = generatePattern({ rgba, width, height, ...BASE_PARAMS });
  assert.equal(pattern.cols, 7);
  assert.equal(pattern.rows, 5);
  assert.equal(pattern.indices.length, 35);
});

test('TDD_palette contains exactly the colors present in the pattern (README)', () => {
  // Four solid 2x2 quadrants resampled onto a 2x2 grid: each square lands exactly
  // on one quadrant color, so the palette must be exactly those four colors.
  const colors = [
    [[255, 0, 0], [0, 255, 0]],
    [[0, 0, 255], [255, 255, 0]],
  ];
  const { rgba, width, height } = blockImage(colors, 2, 2);
  const pattern = generatePattern({ rgba, width, height, ...BASE_PARAMS, rows: 2, cols: 2 });
  assert.deepEqual(
    [...pattern.palette].sort(),
    ['#0000FF', '#00FF00', '#FF0000', '#FFFF00'],
  );
  // "all the colors present": no palette entry may be unused
  for (const count of pattern.counts) assert.ok(count > 0);
});

test('TDD_maximum number of colors is respected (README)', () => {
  const colors = [
    [[255, 0, 0], [250, 10, 5], [0, 255, 0], [10, 250, 5]],
    [[0, 0, 255], [5, 10, 250], [240, 240, 240], [255, 255, 255]],
  ];
  const { rgba, width, height } = blockImage(colors, 2, 2);
  const pattern = generatePattern({ rgba, width, height, ...BASE_PARAMS, rows: 2, cols: 4, maxColors: 3 });
  assert.ok(pattern.palette.length <= 3, `palette has ${pattern.palette.length} colors`);
  // every square is still assigned a color
  assert.equal(pattern.indices.length, 8);
});

test('TDD_a solid image yields a single-color palette with a full count', () => {
  const { rgba, width, height } = solidImage(3, 3, [12, 34, 56]);
  const pattern = generatePattern({ rgba, width, height, ...BASE_PARAMS });
  assert.deepEqual(pattern.palette, ['#0C2238']);
  assert.deepEqual(pattern.counts, [9]);
});

test('TDD_per-color square counts sum to the total squares (README)', () => {
  const colors = [
    [[255, 0, 0], [0, 255, 0]],
    [[0, 0, 255], [255, 0, 0]],
  ];
  const { rgba, width, height } = blockImage(colors, 3, 3);
  const pattern = generatePattern({ rgba, width, height, ...BASE_PARAMS, rows: 2, cols: 2 });
  const total = pattern.counts.reduce((a, b) => a + b, 0);
  assert.equal(total, pattern.dimensions.totalSquares);
  assert.equal(total, 4);
});

test('TDD_dimensions and total squares are reported with the pattern (README)', () => {
  const { rgba, width, height } = solidImage(4, 4, [0, 0, 0]);
  const pattern = generatePattern({
    rgba, width, height, rows: 4, cols: 4, squareSize: 2.5, units: 'cm', maxColors: 4,
  });
  assert.equal(pattern.dimensions.width, 10);
  assert.equal(pattern.dimensions.height, 10);
  assert.equal(pattern.dimensions.units, 'cm');
  assert.equal(pattern.dimensions.totalSquares, 16);
});

test('TDD_pattern image round-trips: re-uploading it resumes the same pattern (README)', () => {
  const colors = [
    [[200, 30, 40], [30, 200, 40]],
    [[40, 30, 200], [200, 200, 40]],
  ];
  const first = (() => {
    const { rgba, width, height } = blockImage(colors, 4, 4);
    return generatePattern({ rgba, width, height, ...BASE_PARAMS, rows: 2, cols: 2 });
  })();

  // Render the pattern back out to pixels, then feed it through again as an upload.
  const rendered = patternToRgba(first);
  const second = generatePattern({
    rgba: rendered.rgba, width: rendered.width, height: rendered.height,
    ...BASE_PARAMS, rows: first.rows, cols: first.cols,
  });
  assert.deepEqual([...second.palette].sort(), [...first.palette].sort());
  assert.deepEqual(second.counts.reduce((a, b) => a + b, 0), first.counts.reduce((a, b) => a + b, 0));
});

// ENGINEERING_DECISIONS.md ED-5
test('TDD_transparent source pixels are treated as if on a white background (ED-5)', () => {
  const rgba = new Uint8ClampedArray(4 * 4); // 2x2, all fully transparent black
  const pattern = generatePattern({ rgba, width: 2, height: 2, ...BASE_PARAMS });
  assert.deepEqual(pattern.palette, ['#FFFFFF']);
});

test('TDD_pattern generation rejects garbage parameters', () => {
  const { rgba, width, height } = solidImage(2, 2, [0, 0, 0]);
  const good = { rgba, width, height, ...BASE_PARAMS };
  assert.throws(() => generatePattern({ ...good, maxColors: 0 }), RangeError);
  assert.throws(() => generatePattern({ ...good, rows: 0 }), RangeError);
  assert.throws(() => generatePattern({ ...good, cols: -3 }), RangeError);
  assert.throws(() => generatePattern({ ...good, rgba: new Uint8ClampedArray(7) }), RangeError);
  assert.throws(() => generatePattern({ ...good, width: 0, height: 0 }), RangeError);
});
