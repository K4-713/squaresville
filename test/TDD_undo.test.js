// README.md "Fine-tuning your Squaresville pattern": "you will be able to undo up
// to 10 recent actions against the palette, project dimensions, and image
// conversion style (dithering, diffusion, nearest color)."
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, MERGE_STYLES, SORT_METHODS } from '../src/pattern/session.js';
import { CONVERSION_STYLES } from '../src/pattern/quantize.js';
import { blockImage, solidImage } from './helpers/testImages.js';

const UNDO_COLORS = [
  [[255, 0, 0], [0, 255, 0]],
  [[0, 0, 255], [255, 255, 0]],
];

function undoSession() {
  const session = createSession();
  session.loadSource(blockImage(UNDO_COLORS, 2, 2));
  session.generate({ rows: 2, cols: 2, squareSize: 1, units: 'cm', maxColors: 4 });
  return session;
}

test('TDD_undo reverses a palette color change (README)', () => {
  const session = undoSession();
  const before = session.pattern;
  session.changeColor(0, '#123456');
  assert.notDeepEqual(session.pattern, before);
  const restored = session.undo();
  assert.deepEqual(restored, before);
  assert.equal(session.pattern, restored);
});

test('TDD_undo reverses color count and conversion style changes (README)', () => {
  const session = undoSession();
  const original = session.pattern;
  session.setTargetColors(2);
  session.setConversionStyle(CONVERSION_STYLES.DITHERING);
  session.undo();
  assert.equal(session.params.conversionStyle, undefined,
    'undoing the style change restores the previous params');
  session.undo();
  assert.deepEqual(session.pattern, original);
  assert.equal(session.params.maxColors, 4);
});

test('TDD_undo reverses a project dimensions change (README)', () => {
  const session = undoSession();
  const before = session.pattern;
  session.generate({ rows: 1, cols: 2, squareSize: 3, units: 'inches', maxColors: 4 });
  assert.equal(session.pattern.rows, 1);
  session.undo();
  assert.deepEqual(session.pattern, before);
  assert.equal(session.params.rows, 2);
  assert.equal(session.params.squareSize, 1);
  assert.equal(session.params.units, 'cm');
});

test('TDD_a merge or delete undoes as a single action (README)', () => {
  const session = undoSession();
  const before = session.pattern;
  // Average merge internally performs two color changes — still one undo step.
  session.mergeColors(0, 1, MERGE_STYLES.AVERAGE);
  assert.equal(session.pattern.palette.length, 3);
  session.undo();
  assert.deepEqual(session.pattern, before);

  session.deleteColor(0);
  session.undo();
  assert.deepEqual(session.pattern, before);
});

test('TDD_sorting the palette is an undoable action (README)', () => {
  const session = undoSession();
  const before = session.pattern;
  session.sortPalette(SORT_METHODS.FREQUENCY);
  session.undo();
  assert.deepEqual(session.pattern, before);
});

test('TDD_at most 10 recent actions can be undone (README)', () => {
  const session = undoSession();
  // 12 distinct color edits on entry 0
  for (let i = 1; i <= 12; i++) {
    session.changeColor(0, `#0000${(10 + i).toString(16).padStart(2, '0').toUpperCase()}`);
  }
  assert.equal(session.undoCount, 10, 'history is capped at 10');
  const afterSecondEdit = '#00000C'; // state after edit #2 is the oldest restorable
  for (let i = 0; i < 10; i++) session.undo();
  assert.equal(session.pattern.palette[0], afterSecondEdit);
  assert.throws(() => session.undo(), /nothing to undo/i);
});

test('TDD_actions that change nothing add no undo step', () => {
  const session = undoSession();
  session.changeColor(0, '#ABCDEF');
  const steps = session.undoCount;
  session.changeColor(0, '#ABCDEF'); // no-op: same color
  assert.equal(session.undoCount, steps, 'a no-op must not consume undo history');
});

test('TDD_failed actions add no undo step and undo still works', () => {
  const session = undoSession();
  const before = session.pattern;
  session.changeColor(0, '#123456');
  assert.throws(() => session.setTargetColors(0), RangeError);
  assert.throws(() => session.changeColor(99, '#111111'), RangeError);
  session.undo();
  assert.deepEqual(session.pattern, before, 'failed actions must not pollute history');
});

test('TDD_a new upload starts with empty undo history', () => {
  const session = undoSession();
  session.changeColor(0, '#123456');
  session.loadSource(solidImage(2, 2, [5, 5, 5]));
  assert.equal(session.undoCount, 0);
  assert.throws(() => session.undo(), /nothing to undo/i);
});

test('TDD_the first generation is not undoable (there is nothing before it)', () => {
  const session = createSession();
  session.loadSource(solidImage(2, 2, [5, 5, 5]));
  session.generate({ squareSize: 1, units: 'cm', maxColors: 2 });
  assert.equal(session.undoCount, 0);
  assert.throws(() => session.undo(), /nothing to undo/i);
});
