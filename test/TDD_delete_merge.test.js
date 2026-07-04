// README.md "Deleting a Color": deleting reassigns that color's pixels to the
// nearest remaining color in the palette.
// README.md "Merging Colors": A->B assigns A's pixels to B and removes A; A<-B
// assigns B's pixels to A and removes B; Average Color assigns both to the average
// of the two, removing both originals and adding the average to the palette.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../src/pattern/session.js';
import { blockImage } from './helpers/testImages.js';

// red, near-red, green, blue — red's nearest is unambiguously near-red
const MERGE_COLORS = [
  [[255, 0, 0], [250, 10, 5]],
  [[0, 255, 0], [0, 0, 255]],
];

function mergeSession() {
  const session = createSession();
  session.loadSource(blockImage(MERGE_COLORS, 3, 3)); // 9 squares per color
  session.generate({ rows: 2, cols: 2, squareSize: 1, units: 'cm', maxColors: 4 });
  return session;
}

const paletteIndex = (session, hex) => session.pattern.palette.indexOf(hex);

function assertModelInvariants(pattern) {
  assert.equal(new Set(pattern.palette).size, pattern.palette.length, 'no duplicate colors (ED-3)');
  for (const index of pattern.indices) {
    assert.ok(Number.isInteger(index) && index >= 0 && index < pattern.palette.length);
  }
  assert.equal(pattern.counts.reduce((a, b) => a + b, 0), pattern.dimensions.totalSquares);
}

test('TDD_deleting a color reassigns its squares to the nearest remaining color (README)', () => {
  const session = mergeSession();
  const { pattern, colorIndex } = session.deleteColor(paletteIndex(session, '#FF0000'));

  assert.equal(pattern.palette.length, 3);
  assert.ok(!pattern.palette.includes('#FF0000'), 'deleted color is gone');
  assert.equal(pattern.palette[colorIndex], '#FA0A05', 'red squares went to near-red');
  assert.equal(pattern.counts[colorIndex], 2, 'absorbing color has both counts');
  assertModelInvariants(pattern);
});

test('TDD_the last remaining color cannot be deleted', () => {
  const session = createSession();
  session.loadSource(blockImage([[[10, 20, 30]]], 2, 2));
  session.generate({ squareSize: 1, units: 'cm', maxColors: 4 });
  assert.throws(() => session.deleteColor(0), /only|last/i);
  assert.equal(session.pattern.palette.length, 1, 'pattern unchanged after refusal');
});

test('TDD_merge A->B assigns A\'s squares to B and removes A (README)', () => {
  const session = mergeSession();
  const a = paletteIndex(session, '#00FF00');
  const b = paletteIndex(session, '#0000FF');
  const { pattern, colorIndex } = session.mergeColors(a, b, 'a-to-b');

  assert.ok(!pattern.palette.includes('#00FF00'), 'A removed');
  assert.equal(pattern.palette[colorIndex], '#0000FF', 'result is B');
  assert.equal(pattern.counts[colorIndex], 2);
  assertModelInvariants(pattern);
});

test('TDD_merge A<-B assigns B\'s squares to A and removes B (README)', () => {
  const session = mergeSession();
  const a = paletteIndex(session, '#00FF00');
  const b = paletteIndex(session, '#0000FF');
  const { pattern, colorIndex } = session.mergeColors(a, b, 'b-to-a');

  assert.ok(!pattern.palette.includes('#0000FF'), 'B removed');
  assert.equal(pattern.palette[colorIndex], '#00FF00', 'result is A');
  assert.equal(pattern.counts[colorIndex], 2);
  assertModelInvariants(pattern);
});

test('TDD_merge Average replaces both colors with their average (README)', () => {
  const session = mergeSession();
  const a = paletteIndex(session, '#FF0000');
  const b = paletteIndex(session, '#0000FF');
  const { pattern, colorIndex } = session.mergeColors(a, b, 'average');

  assert.ok(!pattern.palette.includes('#FF0000'), 'A removed');
  assert.ok(!pattern.palette.includes('#0000FF'), 'B removed');
  assert.equal(pattern.palette[colorIndex], '#800080', 'average of red and blue');
  assert.equal(pattern.counts[colorIndex], 2, 'average holds both colors\' squares');
  assert.equal(pattern.palette.length, 3);
  assertModelInvariants(pattern);
});

test('TDD_an Average result identical to an existing color merges with it (ED-7)', () => {
  const session = createSession();
  // #64000A and #000A64 average to #320537; a third color already sits there
  session.loadSource(blockImage([
    [[0x64, 0x00, 0x0A], [0x00, 0x0A, 0x64]],
    [[0x32, 0x05, 0x37], [0xFF, 0xFF, 0xFF]],
  ], 2, 2));
  session.generate({ rows: 2, cols: 2, squareSize: 1, units: 'cm', maxColors: 4 });

  const a = paletteIndex(session, '#64000A');
  const b = paletteIndex(session, '#000A64');
  const { pattern, colorIndex } = session.mergeColors(a, b, 'average');
  assert.equal(pattern.palette.length, 2, 'A, B, and the existing average became one entry');
  assert.equal(pattern.palette[colorIndex], '#320537');
  assert.equal(pattern.counts[colorIndex], 3);
  assertModelInvariants(pattern);
});

test('TDD_delete and merge reject garbage and leave the pattern intact', () => {
  const session = mergeSession();
  const before = session.pattern;

  assert.throws(() => session.deleteColor(9), RangeError);
  assert.throws(() => session.deleteColor(-1), RangeError);
  assert.throws(() => session.mergeColors(0, 0, 'a-to-b'), RangeError); // same color twice
  assert.throws(() => session.mergeColors(0, 9, 'a-to-b'), RangeError);
  assert.throws(() => session.mergeColors(0, 1, 'sideways'), RangeError); // unknown style
  assert.equal(session.pattern, before, 'failed operations must not alter the pattern');

  const fresh = createSession();
  assert.throws(() => fresh.deleteColor(0), /pattern/i);
  assert.throws(() => fresh.mergeColors(0, 1, 'a-to-b'), /pattern/i);
});
