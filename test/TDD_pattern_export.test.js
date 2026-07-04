// README.md "Saving The Final Pattern": the user picks row/column group size
// (3 or 5) and symbol type (numeric or true symbols); Squaresville assigns one
// symbol per palette color and generates the pattern and color legend as a
// tabbed spreadsheet. The pattern sheet corresponds cell-for-cell to the
// pattern image, with subtle alternating background colors per group; the
// legend has the symbol, a swatch with hex code, and the square count.
// ENGINEERING_DECISIONS.md ED-9: deterministic symbol assignment; numeric =
// 1-based strings; true symbols = fixed Unicode geometric set with numeric
// overflow; unique within an export.
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

test('TDD_numeric symbols are 1-based strings, one per color (README, ED-9)', () => {
  const pattern = exportPattern();
  assert.deepEqual(assignSymbols(pattern, SYMBOL_TYPES.NUMERIC), ['1', '2', '3', '4']);
});

test('TDD_true symbols are unique geometric shapes, one per color (README, ED-9)', () => {
  const pattern = exportPattern();
  const symbols = assignSymbols(pattern, SYMBOL_TYPES.SYMBOLS);
  assert.equal(symbols.length, pattern.palette.length);
  assert.equal(new Set(symbols).size, symbols.length, 'symbols must be unique');
  for (const symbol of symbols) {
    assert.ok(!/^\d+$/.test(symbol), `expected a shape, got numeric ${symbol}`);
  }
  assert.deepEqual(assignSymbols(pattern, SYMBOL_TYPES.SYMBOLS), symbols, 'deterministic');
});

test('TDD_palettes larger than the symbol set overflow into numerics (ED-9)', () => {
  const bigPalette = Array.from({ length: 40 }, (_, i) =>
    `#${(i + 1).toString(16).padStart(2, '0').toUpperCase()}0000`);
  const fake = { palette: bigPalette, counts: bigPalette.map(() => 1) };
  const symbols = assignSymbols(fake, SYMBOL_TYPES.SYMBOLS);
  assert.equal(new Set(symbols).size, 40, 'still unique after overflow');
  assert.ok(/^\d+$/.test(symbols[39]), 'overflow entries are numeric');
});

test('TDD_the pattern sheet corresponds cell-for-cell to the pattern (README)', () => {
  const pattern = exportPattern();
  const { patternRows } = buildWorkbook(pattern, { groupSize: 3, symbolType: SYMBOL_TYPES.NUMERIC });
  const symbols = assignSymbols(pattern, SYMBOL_TYPES.NUMERIC);

  assert.equal(patternRows.length, pattern.rows);
  for (let y = 0; y < pattern.rows; y++) {
    assert.equal(patternRows[y].length, pattern.cols);
    for (let x = 0; x < pattern.cols; x++) {
      assert.equal(patternRows[y][x].value, symbols[pattern.indices[y * pattern.cols + x]]);
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
    assert.equal(symbolCell.value, symbols[i]);
    assert.equal(swatchCell.value, hex, 'the swatch shows its hex code');
    assert.equal(swatchCell.backgroundColor, hex, 'the swatch is filled with the color');
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
