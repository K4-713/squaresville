// ENGINEERING_DECISIONS.md ED-13: after a manual palette edit, the color-count control
// edits the current palette in place (split to add, merge to remove) so edits are
// preserved, instead of regenerating from the source (ED-6).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, MERGE_STYLES } from '../src/pattern/session.js';
import { splitPaletteColor } from '../src/pattern/pattern.js';
import { PALETTE_STYLES } from '../src/pattern/quantize.js';

/** A width×1 source image (1:1 grid) from a flat list of [r,g,b] colors. */
function sourceFromColors(colors) {
  const rgba = new Uint8ClampedArray(colors.length * 4);
  colors.forEach(([r, g, b], i) => { rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = 255; });
  return { rgba, width: colors.length, height: 1 };
}

// Two varied clusters (greens, reds) that can be split, plus a solid white block that
// becomes its own single-grid-color palette entry (unsplittable). 5 distinct colors.
const GREENS = [[40, 90, 40], [50, 120, 50]];
const REDS = [[140, 50, 50], [160, 40, 40]];
const WHITES = [[255, 255, 255], [255, 255, 255], [255, 255, 255]];
const SCENE = sourceFromColors([...GREENS, ...REDS, ...WHITES]);

function scene(maxColors) {
  const session = createSession();
  session.loadSource(SCENE);
  session.generate({ squareSize: 1, units: 'cm', maxColors });
  return session;
}

const totalSquares = (pattern) => pattern.counts.reduce((a, b) => a + b, 0);

test('TDD_the edited flag tracks manual palette edits (ED-13)', () => {
  const session = scene(4);
  assert.equal(session.edited, false, 'a freshly generated palette is un-edited');

  session.mergeColors(0, 1, MERGE_STYLES.A_TO_B);
  assert.equal(session.edited, true, 'merging is a manual edit');

  session.undo();
  assert.equal(session.edited, false, 'undo restores the un-edited state');

  session.changeColor(0, '#123456');
  assert.equal(session.edited, true);
  session.setTargetColors(3); // a rebuild from source
  assert.equal(session.edited, false, 'regenerating resets to un-edited');
});

test('TDD_splitColor adds exactly one color and leaves the others untouched (ED-13)', () => {
  const session = scene(2); // one green box, one red box — both varied
  const before = session.pattern;
  const other = before.palette[1];
  const { pattern } = session.splitColor(0);

  assert.equal(pattern.palette.length, 3, 'exactly one color was added');
  assert.ok(pattern.palette.includes(other), 'the untouched color is unchanged');
  assert.equal(totalSquares(pattern), totalSquares(before), 'no squares are lost');
  assert.ok(pattern.counts.every((c) => c > 0), 'no unused color');
  assert.equal(session.edited, true);
});

test('TDD_splitting a color keeps its exact value, so recolors stick (ED-13)', () => {
  const session = scene(2); // color 0 is a varied green+red group
  session.changeColor(0, '#FF00FF'); // recolor it to a value unrelated to its grid colors
  const magenta = session.pattern.palette.indexOf('#FF00FF');
  const { pattern } = session.splitColor(magenta);
  assert.equal(pattern.palette.length, 3, 'a color was added');
  assert.ok(pattern.palette.includes('#FF00FF'), 'the recolored value survives the split');
});

test('TDD_a single-grid-color palette entry cannot be split (ED-13)', () => {
  const session = scene(3); // greens, reds, and solid white
  const white = session.pattern.palette.indexOf('#FFFFFF');
  assert.ok(white >= 0, 'white is its own palette color');
  const before = session.pattern;
  session.splitColor(white);
  assert.equal(session.pattern, before, 'splitting a one-color group is a no-op');
});

test('TDD_setPaletteColorCount grows and shrinks the current palette to N (ED-13)', () => {
  const session = scene(3);
  const grown = session.setPaletteColorCount(5);
  assert.equal(grown.pattern.palette.length, 5);
  assert.ok(grown.pattern.counts.every((c) => c > 0));

  const shrunk = session.setPaletteColorCount(2);
  assert.equal(shrunk.pattern.palette.length, 2);
  assert.equal(totalSquares(shrunk.pattern), totalSquares(grown.pattern));
});

test('TDD_setPaletteColorCount is capped at availableColors (ED-13, ED-12)', () => {
  const session = scene(3);
  const { pattern } = session.setPaletteColorCount(100);
  assert.equal(pattern.palette.length, pattern.availableColors, 'cannot exceed available colors');
  assert.equal(pattern.availableColors, 5);
});

test('TDD_growing the count in place keeps edits that a rebuild would discard (ED-13, ED-6)', () => {
  const session = scene(3);
  const white = session.pattern.palette.indexOf('#FFFFFF');
  session.changeColor(white, '#FF00FF'); // recolor the unsplittable white group to magenta
  assert.ok(session.pattern.palette.includes('#FF00FF'));

  // Editing the count in place preserves the magenta edit...
  const edited = session.setPaletteColorCount(5);
  assert.equal(edited.pattern.palette.length, 5);
  assert.ok(edited.pattern.palette.includes('#FF00FF'), 'the recolor survives an in-place grow');

  // ...whereas a rebuild from source discards it and restores the original white.
  const rebuilt = session.setTargetColors(5);
  assert.ok(!rebuilt.palette.includes('#FF00FF'), 'a rebuild drops the edit');
  assert.ok(rebuilt.palette.includes('#FFFFFF'), 'a rebuild restores the source color');
});

test('TDD_an in-place count change is a single undo step (ED-13)', () => {
  const session = scene(3);
  session.changeColor(0, '#010203'); // become edited
  const steps = session.undoCount;
  session.setPaletteColorCount(5); // several splits internally
  assert.equal(session.undoCount, steps + 1, 'the whole count change undoes at once');
  assert.equal(session.pattern.palette.length, 5);
  session.undo();
  assert.equal(session.pattern.palette.length, 3, 'back to before the count change');
});

test('TDD_splitPaletteColor rejects a bad color index', () => {
  const session = scene(2);
  const grid = new Uint8ClampedArray(session.pattern.indices.length * 4);
  assert.throws(() => splitPaletteColor(session.pattern, grid, -1, PALETTE_STYLES.VIVID), RangeError);
  assert.throws(() => splitPaletteColor(session.pattern, grid, 9, PALETTE_STYLES.VIVID), RangeError);
});
