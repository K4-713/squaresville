// README.md "Saving The Final Pattern": the user picks row/column group size
// (3 or 5) and symbol type (numeric or true symbols); Squaresville assigns one
// symbol per palette color and generates the pattern and color legend as a
// tabbed spreadsheet. The pattern sheet corresponds cell-for-cell to the
// pattern image, with subtle alternating background colors per group; the
// legend has the symbol, a swatch with hex code, and the square count.
// ENGINEERING_DECISIONS.md ED-9: deterministic symbol assignment; each mark is a
// { value, color } pair. Numeric = 1-based strings, all black; true symbols = a
// fixed 64-glyph geometric set repeated in black, then dark blue, then dark red
// before numeric overflow; every (value, color) pair is unique within an export.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SYMBOL_TYPES, GROUP_SIZES, assignSymbols, buildWorkbook,
} from '../src/pattern/export.js';
import { generatePattern } from '../src/pattern/pattern.js';
import { blockImage } from './helpers/testImages.js';

const EXPORT_COLORS = [
  [[255, 0, 0], [0, 255, 0]],
  [[0, 0, 255], [255, 255, 0]],
];

/** A 6x6 pattern with 4 colors in 3x3 quadrant blocks. */
function exportPattern() {
  const { rgba, width, height } = blockImage(EXPORT_COLORS, 3, 3);
  return generatePattern({ rgba, width, height, squareSize: 1, units: 'cm', maxColors: 4 });
}

/** A fake pattern with n distinct-hex colors, for exercising symbol assignment. */
function fakePalette(n) {
  const palette = Array.from({ length: n }, (_, i) =>
    `#${(i + 1).toString(16).padStart(2, '0').toUpperCase()}0000`);
  return { palette, counts: palette.map(() => 1) };
}
const markKey = (m) => `${m.value}@${m.color}`;

test('TDD_numeric symbols are 1-based strings in black, one per color (README, ED-9)', () => {
  const pattern = exportPattern();
  assert.deepEqual(assignSymbols(pattern, SYMBOL_TYPES.NUMERIC), [
    { value: '1', color: '#000000' },
    { value: '2', color: '#000000' },
    { value: '3', color: '#000000' },
    { value: '4', color: '#000000' },
  ]);
});

test('TDD_true symbols are unique black geometric shapes for a small palette (README, ED-9)', () => {
  const pattern = exportPattern();
  const symbols = assignSymbols(pattern, SYMBOL_TYPES.SYMBOLS);
  assert.equal(symbols.length, pattern.palette.length);
  assert.equal(new Set(symbols.map(markKey)).size, symbols.length, 'marks must be unique');
  for (const mark of symbols) {
    assert.ok(!/^\d+$/.test(mark.value), `expected a shape, got numeric ${mark.value}`);
    assert.equal(mark.color, '#000000', 'small palettes stay black (B&W-safe)');
  }
  assert.deepEqual(assignSymbols(pattern, SYMBOL_TYPES.SYMBOLS), symbols, 'deterministic');
});

test('TDD_true symbols repeat in dark blue then dark red before numerals (ED-9)', () => {
  const symbols = assignSymbols(fakePalette(200), SYMBOL_TYPES.SYMBOLS);

  // Exactly three ink colors are used across the glyph tiers, black first.
  const inkTiers = [symbols[0].color, symbols[64].color, symbols[128].color];
  assert.equal(inkTiers[0], '#000000', 'the first tier is black');
  assert.equal(new Set(inkTiers).size, 3, 'three distinct ink colors before overflow');

  // Each tier reuses the same ordered glyphs, differing only by ink color.
  assert.equal(symbols[64].value, symbols[0].value, 'tier 2 reuses the glyph set');
  assert.equal(symbols[128].value, symbols[0].value, 'tier 3 reuses the glyph set');
  assert.notEqual(symbols[64].color, symbols[0].color);

  // 64 glyphs × 3 ink colors = 192 marks; the 193rd falls back to a numeral.
  for (let i = 0; i < 192; i++) assert.ok(!/^\d+$/.test(symbols[i].value), `mark ${i} is a shape`);
  assert.equal(symbols[192].value, '193', 'overflow past 192 is numeric');
  assert.equal(symbols[192].color, '#000000');

  // Every (value, color) pair is unique across the whole assignment.
  assert.equal(new Set(symbols.map(markKey)).size, symbols.length, 'all marks unique');
});

test('TDD_the pattern sheet corresponds cell-for-cell to the pattern (README)', () => {
  const pattern = exportPattern();
  const { patternRows } = buildWorkbook(pattern, { groupSize: 3, symbolType: SYMBOL_TYPES.NUMERIC });
  const symbols = assignSymbols(pattern, SYMBOL_TYPES.NUMERIC);

  assert.equal(patternRows.length, pattern.rows);
  for (let y = 0; y < pattern.rows; y++) {
    assert.equal(patternRows[y].length, pattern.cols);
    for (let x = 0; x < pattern.cols; x++) {
      const mark = symbols[pattern.indices[y * pattern.cols + x]];
      assert.equal(patternRows[y][x].value, mark.value);
      // textColor is the font-ink property write-excel-file actually honors (ED-9).
      assert.equal(patternRows[y][x].textColor, mark.color, 'the cell carries the symbol ink color');
    }
  }
});

test('TDD_row/column groups get subtle alternating backgrounds (README)', () => {
  const pattern = exportPattern();
  const { patternRows } = buildWorkbook(pattern, { groupSize: 3, symbolType: SYMBOL_TYPES.NUMERIC });
  const bg = (y, x) => patternRows[y][x].backgroundColor;

  assert.notEqual(bg(0, 0), bg(0, 3), 'adjacent column groups must alternate');
  assert.notEqual(bg(0, 0), bg(3, 0), 'adjacent row groups must alternate');
  assert.equal(bg(0, 0), bg(3, 3), 'diagonal groups share a background');
  assert.equal(bg(0, 0), bg(2, 2), 'cells within one group share a background');

  const five = buildWorkbook(pattern, { groupSize: 5, symbolType: SYMBOL_TYPES.NUMERIC }).patternRows;
  assert.equal(five[0][0].backgroundColor, five[0][4].backgroundColor);
  assert.notEqual(five[0][0].backgroundColor, five[0][5].backgroundColor);
});

test('TDD_the legend lists symbol, swatch with hex, and square count (README)', () => {
  const pattern = exportPattern();
  const { legendRows } = buildWorkbook(pattern, { groupSize: 3, symbolType: SYMBOL_TYPES.SYMBOLS });
  const symbols = assignSymbols(pattern, SYMBOL_TYPES.SYMBOLS);

  assert.equal(legendRows.length, pattern.palette.length + 1, 'header plus one row per color');
  pattern.palette.forEach((hex, i) => {
    const [symbolCell, swatchCell, countCell] = legendRows[i + 1];
    assert.equal(symbolCell.value, symbols[i].value);
    assert.equal(symbolCell.textColor, symbols[i].color, 'the legend mark uses its ink color');
    assert.equal(swatchCell.value, hex, 'the swatch shows its hex code');
    assert.equal(swatchCell.backgroundColor, hex, 'the swatch is filled with the color');
    // The hex label stays readable on the swatch fill (white on dark, black on light).
    assert.ok(['#FFFFFF', '#000000'].includes(swatchCell.textColor), 'the hex label sets a readable ink');
    assert.equal(countCell.value, pattern.counts[i]);
  });
});

test('TDD_export options reject garbage (README: groups of 3 or 5)', () => {
  const pattern = exportPattern();
  assert.deepEqual(GROUP_SIZES, [3, 5]);
  assert.throws(() => buildWorkbook(pattern, { groupSize: 4, symbolType: SYMBOL_TYPES.NUMERIC }), RangeError);
  assert.throws(() => buildWorkbook(pattern, { groupSize: 3, symbolType: 'runes' }), RangeError);
  assert.throws(() => assignSymbols(pattern, 'runes'), RangeError);
});
