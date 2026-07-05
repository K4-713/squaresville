// README.md "Locking a Color" / ENGINEERING_DECISIONS.md ED-14: a locked palette color
// cannot be deleted, altered, or merged away; lowering the color count preserves locked
// colors and raising it never splits one; locks are hex-identified, cleared on a rebuild
// from source, and travel with the undo timeline.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, MERGE_STYLES } from '../src/pattern/session.js';
import { CONVERSION_STYLES } from '../src/pattern/quantize.js';

/** A width×1 source image (1:1 grid) from a flat list of [r,g,b] colors. */
function sourceFromColors(colors) {
  const rgba = new Uint8ClampedArray(colors.length * 4);
  colors.forEach(([r, g, b], i) => { rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = 255; });
  return { rgba, width: colors.length, height: 1 };
}

// Two varied clusters (greens, reds) — 4 distinct colors, every generated color splittable.
const GREENS = [[40, 90, 40], [50, 120, 50]];
const REDS = [[140, 50, 50], [160, 40, 40]];
const TWO_CLUSTERS = sourceFromColors([...GREENS, ...REDS]);

// The same two clusters plus a solid white block (unsplittable) — 5 distinct colors.
const WHITES = [[255, 255, 255], [255, 255, 255], [255, 255, 255]];
const SCENE = sourceFromColors([...GREENS, ...REDS, ...WHITES]);

function sceneFrom(source, maxColors) {
  const session = createSession();
  session.loadSource(source);
  session.generate({ squareSize: 1, units: 'cm', maxColors });
  return session;
}
const scene = (maxColors) => sceneFrom(SCENE, maxColors);
const totalSquares = (pattern) => pattern.counts.reduce((a, b) => a + b, 0);

test('TDD_lockColor and unlockColor toggle a color\'s locked state (README, ED-14)', () => {
  const session = scene(4);
  const hex = session.pattern.palette[0];
  assert.equal(session.isLocked(0), false, 'colors start unlocked');
  assert.equal(session.lockedColors.size, 0);

  session.lockColor(0);
  assert.equal(session.isLocked(0), true);
  assert.ok(session.lockedColors.has(hex), 'the locked set carries the color\'s hex');

  session.unlockColor(0);
  assert.equal(session.isLocked(0), false);
  assert.equal(session.lockedColors.size, 0);
});

test('TDD_locking a color marks the palette edited so count changes edit in place (ED-14, ED-13)', () => {
  const session = scene(4);
  assert.equal(session.edited, false, 'a freshly generated palette is un-edited');
  session.lockColor(0);
  assert.equal(session.edited, true, 'locking is a manual curation edit');
});

test('TDD_a locked color cannot be altered (README, ED-14)', () => {
  const session = scene(4);
  const before = session.pattern;
  const hex = before.palette[0];
  session.lockColor(0);
  assert.throws(() => session.changeColor(0, '#010203'), /lock/i);
  assert.equal(session.pattern, before, 'the failed change left the pattern untouched');
  assert.ok(session.pattern.palette.includes(hex), 'the locked color is unchanged');
});

test('TDD_a locked color cannot be deleted (README, ED-14)', () => {
  const session = scene(4);
  const before = session.pattern;
  const hex = before.palette[0];
  session.lockColor(0);
  assert.throws(() => session.deleteColor(0), /lock/i);
  assert.equal(session.pattern, before, 'the failed delete left the pattern untouched');
  assert.ok(session.pattern.palette.includes(hex));
});

test('TDD_a locked color cannot be merged away (README, ED-14)', () => {
  const session = scene(4);
  session.lockColor(0);
  const before = session.pattern;
  // A→B removes the first color; B←A removes the second; average removes/alters both.
  assert.throws(() => session.mergeColors(0, 1, MERGE_STYLES.A_TO_B), /lock/i);
  assert.throws(() => session.mergeColors(1, 0, MERGE_STYLES.B_TO_A), /lock/i);
  assert.throws(() => session.mergeColors(0, 1, MERGE_STYLES.AVERAGE), /lock/i);
  assert.throws(() => session.mergeColors(1, 0, MERGE_STYLES.AVERAGE), /lock/i);
  assert.equal(session.pattern, before, 'no merge left a half-applied result');
});

test('TDD_another color may still be merged into a locked color (README, ED-14)', () => {
  const session = scene(4);
  const lockedHex = session.pattern.palette[0];
  const goneHex = session.pattern.palette[1];
  session.lockColor(0);
  // A→B: color 1's squares take color 0's (locked) value; color 1 is removed, 0 survives.
  const { pattern } = session.mergeColors(1, 0, MERGE_STYLES.A_TO_B);
  assert.ok(pattern.palette.includes(lockedHex), 'the locked survivor keeps its value');
  assert.ok(!pattern.palette.includes(goneHex), 'the unlocked color was merged in');
  assert.equal(totalSquares(pattern), totalSquares(session.pattern));
});

test('TDD_a locked color may claim another color\'s squares via A←B (README, ED-14)', () => {
  const session = scene(4);
  const lockedHex = session.pattern.palette[0];
  const goneHex = session.pattern.palette[1];
  session.lockColor(0);
  // A←B from the locked color: the picked color's squares become the locked color's
  // value; the picked color is removed, the locked color survives unchanged.
  const { pattern, colorIndex } = session.mergeColors(0, 1, MERGE_STYLES.B_TO_A);
  assert.ok(pattern.palette.includes(lockedHex), 'the locked color survived and kept its value');
  assert.ok(!pattern.palette.includes(goneHex), 'the picked color was absorbed');
  assert.equal(pattern.palette[colorIndex], lockedHex, 'the survivor is the locked color');
  assert.equal(session.isLocked(colorIndex), true, 'and it stays locked');
  assert.equal(totalSquares(pattern), totalSquares(session.pattern));
});

test('TDD_lowering the count preserves a locked color (README, ED-14)', () => {
  const session = scene(4);
  const lockedHex = session.pattern.palette[0];
  session.lockColor(0);
  const { pattern } = session.setPaletteColorCount(1); // ask below everything
  assert.ok(pattern.palette.includes(lockedHex), 'the locked color survived the shrink');
  assert.equal(pattern.palette.length, 1, 'shrank down to just the locked color');
});

test('TDD_the count cannot drop below the number of locked colors (ED-14)', () => {
  const session = scene(4);
  const a = session.pattern.palette[0];
  const b = session.pattern.palette[1];
  session.lockColor(0);
  session.lockColor(1);
  const { pattern } = session.setPaletteColorCount(1);
  assert.equal(pattern.palette.length, 2, 'two locked colors form the floor');
  assert.ok(pattern.palette.includes(a) && pattern.palette.includes(b));
});

test('TDD_raising the count never splits a locked color (README, ED-14)', () => {
  const session = sceneFrom(TWO_CLUSTERS, 2); // two varied, splittable colors
  const lockedHex = session.pattern.palette[0];
  session.lockColor(0);
  const lockedCount = session.pattern.counts[0];
  const { pattern } = session.setPaletteColorCount(3); // grow by one
  assert.equal(pattern.palette.length, 3, 'the palette grew by splitting the unlocked color');
  const idx = pattern.palette.indexOf(lockedHex);
  assert.ok(idx >= 0, 'the locked color is still present');
  assert.equal(pattern.counts[idx], lockedCount, 'no squares were carved off the locked color');
});

test('TDD_a lock follows its color through a sort (ED-14)', () => {
  const session = scene(4);
  const lockedHex = session.pattern.palette[0];
  session.lockColor(0);
  const { pattern } = session.sortPalette('hue');
  const idx = pattern.palette.indexOf(lockedHex);
  assert.ok(idx >= 0);
  assert.equal(session.isLocked(idx), true, 'the lock stays with the color, not the position');
});

test('TDD_rebuilding from the source clears all locks (ED-14)', () => {
  const session = scene(3);
  session.lockColor(0);
  assert.equal(session.lockedColors.size, 1);
  session.setConversionStyle(CONVERSION_STYLES.DITHERING); // regenerates from source
  assert.equal(session.lockedColors.size, 0, 'a rebuilt palette has no locks');
});

test('TDD_undo restores the locks that a rebuild cleared (ED-14)', () => {
  const session = scene(3);
  const lockedHex = session.pattern.palette[0];
  session.lockColor(0);
  session.setConversionStyle(CONVERSION_STYLES.DITHERING); // clears locks
  assert.equal(session.lockedColors.size, 0);
  session.undo();
  assert.ok(session.lockedColors.has(lockedHex), 'undo brought the lock back with the palette');
});

test('TDD_a refused lock-protected action adds no undo step (ED-14)', () => {
  const session = scene(4);
  session.lockColor(0);
  const steps = session.undoCount;
  assert.throws(() => session.changeColor(0, '#010203'));
  assert.equal(session.undoCount, steps, 'the failed action left the undo history untouched');
});

test('TDD_lock/unlock validate the palette index (ED-14)', () => {
  const session = scene(4);
  assert.throws(() => session.lockColor(-1), RangeError);
  assert.throws(() => session.lockColor(99), RangeError);
  assert.throws(() => session.unlockColor(-1), RangeError);

  const fresh = createSession();
  assert.throws(() => fresh.lockColor(0), /generate/);
});
