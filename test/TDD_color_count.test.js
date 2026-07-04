// README.md "Adjust Number of Colors": adjusting the target number of colors in the
// palette automatically regenerates the pattern image.
// ENGINEERING_DECISIONS.md ED-6: regeneration always re-runs from the original
// uploaded source pixels, never from the already-quantized pattern.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../src/pattern/session.js';
import { blockImage, solidImage } from './helpers/testImages.js';

const QUADRANT_COLORS = [
  [[255, 0, 0], [0, 255, 0]],
  [[0, 0, 255], [255, 255, 0]],
];
const QUADRANT_HEXES = ['#0000FF', '#00FF00', '#FF0000', '#FFFF00'];

function sessionWithQuadrantPattern(maxColors = 4) {
  const session = createSession();
  session.loadSource(blockImage(QUADRANT_COLORS, 2, 2));
  session.generate({ rows: 2, cols: 2, squareSize: 1, units: 'inches', maxColors });
  return session;
}

test('TDD_adjusting the target color count regenerates the pattern (README)', () => {
  const session = sessionWithQuadrantPattern(4);
  assert.equal(session.pattern.palette.length, 4);

  const regenerated = session.setTargetColors(2);
  assert.ok(regenerated.palette.length <= 2,
    `expected at most 2 colors, got ${regenerated.palette.length}`);
  assert.equal(session.pattern, regenerated, 'session.pattern must be the new pattern');
});

test('TDD_raising the target back up restores colors from the source (ED-6)', () => {
  const session = sessionWithQuadrantPattern(4);
  session.setTargetColors(2);
  const restored = session.setTargetColors(4);
  assert.deepEqual([...restored.palette].sort(), QUADRANT_HEXES,
    'regenerating from the source must recover the original colors');
});

test('TDD_color count changes keep the grid and physical parameters (README)', () => {
  const session = sessionWithQuadrantPattern(4);
  const before = session.pattern;
  const after = session.setTargetColors(2);
  assert.equal(after.rows, before.rows);
  assert.equal(after.cols, before.cols);
  assert.deepEqual(after.dimensions, before.dimensions);
  assert.equal(after.counts.reduce((a, b) => a + b, 0), before.dimensions.totalSquares);
});

test('TDD_grid defaults carry through the session like direct generation (README)', () => {
  const session = createSession();
  session.loadSource(solidImage(5, 3, [9, 9, 9]));
  const pattern = session.generate({ squareSize: 1, units: 'cm', maxColors: 8 });
  assert.equal(pattern.cols, 5);
  assert.equal(pattern.rows, 3);
  // and the resolved defaults survive a color-count regeneration
  const regenerated = session.setTargetColors(3);
  assert.equal(regenerated.cols, 5);
  assert.equal(regenerated.rows, 3);
});

test('TDD_target color adjustments reject garbage and bad ordering', () => {
  const fresh = createSession();
  assert.throws(() => fresh.setTargetColors(4), /pattern/i); // nothing generated yet
  assert.throws(() => fresh.generate({ squareSize: 1, units: 'cm', maxColors: 4 }), /source/i);

  const session = sessionWithQuadrantPattern(4);
  assert.throws(() => session.setTargetColors(0), RangeError);
  assert.throws(() => session.setTargetColors(-2), RangeError);
  assert.throws(() => session.setTargetColors(2.5), RangeError);
  assert.throws(() => session.setTargetColors('lots'), RangeError);
  // a failed adjustment must not corrupt the current pattern
  assert.equal(session.pattern.palette.length, 4);
});

test('TDD_loading a new source resets the session pattern', () => {
  const session = sessionWithQuadrantPattern(4);
  session.loadSource(solidImage(3, 3, [1, 2, 3]));
  assert.equal(session.pattern, null, 'a new upload starts a fresh editing session');
  assert.throws(() => session.setTargetColors(2), /pattern/i);
});
