// README.md "Saving The Final Pattern": the user picks row/column group size
// (3 or 5) and symbol type (numeric or true symbols); Squaresville assigns one
// symbol per palette color and generates the pattern and color legend as a
// tabbed spreadsheet. The pattern sheet corresponds cell-for-cell to the
// pattern image, with subtle alternating background colors per group; the
// legend has the symbol, a swatch with hex code, and the square count.
// ENGINEERING_DECISIONS.md ED-9: deterministic symbol assignment; each mark is a
// { value, color } pair. Numeric = 1-based strings, all black; true symbols = a
// fixed 86-mark set (geometric shapes + card suits + distinctive punctuation, Greek
// letters, and solar-system symbols) repeated in black, then dark blue, then dark red
// before numeric overflow; every (value, color) pair is unique within an export.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SYMBOL_TYPES, GROUP_SIZES, assignSymbols, buildWorkbook,
  PATTERN_HEADER_ROWS, PATTERN_HEADER_COLS, PATTERN_COLUMN_WIDTH, PATTERN_ROW_HEIGHT,
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

/** A minimal single-color pattern of the given dimensions (no image needed). */
function fakePattern(rows, cols) {
  return {
    rows, cols,
    indices: new Array(rows * cols).fill(0),
    palette: ['#FF0000'],
    counts: [rows * cols],
  };
}

/** The write-excel-file cell for pattern square (y, x), past the header offset (ED-15). */
const patternCell = (rows, y, x) => rows[PATTERN_HEADER_ROWS + y][PATTERN_HEADER_COLS + x];

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
  const symbols = assignSymbols(fakePalette(270), SYMBOL_TYPES.SYMBOLS);

  // Exactly three ink colors are used across the glyph tiers, black first.
  const inkTiers = [symbols[0].color, symbols[86].color, symbols[172].color];
  assert.equal(inkTiers[0], '#000000', 'the first tier is black');
  assert.equal(new Set(inkTiers).size, 3, 'three distinct ink colors before overflow');

  // Each tier reuses the same ordered glyphs, differing only by ink color.
  assert.equal(symbols[86].value, symbols[0].value, 'tier 2 reuses the glyph set');
  assert.equal(symbols[172].value, symbols[0].value, 'tier 3 reuses the glyph set');
  assert.notEqual(symbols[86].color, symbols[0].color);

  // 86 glyphs × 3 ink colors = 258 marks; the 259th falls back to a numeral.
  for (let i = 0; i < 258; i++) assert.ok(!/^\d+$/.test(symbols[i].value), `mark ${i} is a shape`);
  assert.equal(symbols[258].value, '259', 'overflow past 258 is numeric');
  assert.equal(symbols[258].color, '#000000');

  // Every (value, color) pair is unique across the whole assignment.
  assert.equal(new Set(symbols.map(markKey)).size, symbols.length, 'all marks unique');
});

test('TDD_suits, punctuation, Greek, and solar-system symbols are true symbols in the black tier (ED-9)', () => {
  // Beyond the geometric shapes, the set carries the four card suits, distinctive
  // punctuation, distinctive Greek letters, and the nine solar-system symbols —
  // all in the first (black) tier.
  const symbols = assignSymbols(fakePalette(86), SYMBOL_TYPES.SYMBOLS);
  const blackGlyphs = new Set(
    symbols.filter((m) => m.color === '#000000').map((m) => m.value),
  );
  const expected = [
    '♠', '♣', '♥', '♦',
    '#', '@', '%', '&', '§', '¶', '£', '¥', '$',
    'Γ', 'Ξ', 'Π', 'Σ', 'Φ', 'Ψ', 'Ω', 'α', 'β', 'δ', 'ζ', 'λ',
    '☿', '♀', '♁', '♂', '♃', '♄', '♅', '♆', '♇', // Mercury … Pluto
  ];
  for (const glyph of expected) {
    assert.ok(blackGlyphs.has(glyph), `expected ${glyph} among the black true symbols`);
  }
  // Earth ♁ replaced the visually-colliding circled-plus ⊕ (ED-9).
  assert.ok(!blackGlyphs.has('⊕'), 'the circled-plus ⊕ was dropped in favor of Earth ♁');
});

test('TDD_the pattern sheet corresponds cell-for-cell to the pattern (README)', () => {
  const pattern = exportPattern();
  const { patternRows } = buildWorkbook(pattern, { groupSize: 3, symbolType: SYMBOL_TYPES.NUMERIC });
  const symbols = assignSymbols(pattern, SYMBOL_TYPES.NUMERIC);

  // The data block sits past the two heading rows/columns (ED-15).
  assert.equal(patternRows.length, PATTERN_HEADER_ROWS + pattern.rows);
  for (let y = 0; y < pattern.rows; y++) {
    assert.equal(patternRows[PATTERN_HEADER_ROWS + y].length, PATTERN_HEADER_COLS + pattern.cols);
    for (let x = 0; x < pattern.cols; x++) {
      const mark = symbols[pattern.indices[y * pattern.cols + x]];
      assert.equal(patternCell(patternRows, y, x).value, mark.value);
      // textColor is the font-ink property write-excel-file actually honors (ED-9).
      assert.equal(patternCell(patternRows, y, x).textColor, mark.color, 'the cell carries the symbol ink color');
    }
  }
});

test('TDD_row/column groups get subtle alternating backgrounds (README)', () => {
  const pattern = exportPattern();
  const { patternRows } = buildWorkbook(pattern, { groupSize: 3, symbolType: SYMBOL_TYPES.NUMERIC });
  const bg = (y, x) => patternCell(patternRows, y, x).backgroundColor;

  assert.notEqual(bg(0, 0), bg(0, 3), 'adjacent column groups must alternate');
  assert.notEqual(bg(0, 0), bg(3, 0), 'adjacent row groups must alternate');
  assert.equal(bg(0, 0), bg(3, 3), 'diagonal groups share a background');
  assert.equal(bg(0, 0), bg(2, 2), 'cells within one group share a background');

  const five = buildWorkbook(pattern, { groupSize: 5, symbolType: SYMBOL_TYPES.NUMERIC }).patternRows;
  const bg5 = (y, x) => five[PATTERN_HEADER_ROWS + y][PATTERN_HEADER_COLS + x].backgroundColor;
  assert.equal(bg5(0, 0), bg5(0, 4));
  assert.notEqual(bg5(0, 0), bg5(0, 5));
});

test('TDD_pattern sheet has dual group + absolute row/column headings (ED-15)', () => {
  // 5 rows x 7 cols, groups of 3: column groups span 3,3,1; row groups span 3,2.
  const pattern = fakePattern(5, 7);
  const groupSize = 3;
  const { patternRows } = buildWorkbook(pattern, { groupSize, symbolType: SYMBOL_TYPES.SYMBOLS });

  // The 2x2 corner where the heading rows and columns meet is blank.
  for (let r = 0; r < PATTERN_HEADER_ROWS; r++) {
    for (let c = 0; c < PATTERN_HEADER_COLS; c++) {
      const cell = patternRows[r][c];
      assert.ok(cell == null || cell.value == null, 'the heading corner is blank');
    }
  }

  // Outer top row = group headings: one merged cell per column group carrying the
  // 1-based group index; the trailing partial group merges only its real extent.
  const groupHeaderRow = patternRows[0];
  const g1 = groupHeaderRow[PATTERN_HEADER_COLS];
  assert.equal(g1.value, 1, 'first column group is numbered 1');
  assert.equal(g1.span, groupSize, 'a full column group merges groupSize columns');
  assert.equal(groupHeaderRow[PATTERN_HEADER_COLS + 1], null, 'merged-over cells are null');
  const lastGroup = groupHeaderRow[PATTERN_HEADER_COLS + 6]; // col index 6 starts group 3 (7%3==1)
  assert.equal(lastGroup.value, 3, 'the partial trailing column group is numbered 3');
  assert.equal(lastGroup.span, 1, 'the partial column group merges only its one real column');

  // Inner top row = absolute column numbers, 1..cols, never restarting per group.
  const numberHeaderRow = patternRows[1];
  for (let x = 0; x < pattern.cols; x++) {
    assert.equal(numberHeaderRow[PATTERN_HEADER_COLS + x].value, x + 1, `column ${x + 1} numbered`);
  }

  // Outer left column = group headings merged down each row group (rowSpan).
  const rowGroupStart = patternRows[PATTERN_HEADER_ROWS][0];
  assert.equal(rowGroupStart.value, 1, 'first row group is numbered 1');
  assert.equal(rowGroupStart.rowSpan, groupSize, 'a full row group merges groupSize rows');
  assert.equal(patternRows[PATTERN_HEADER_ROWS + 1][0], null, 'merged-over row-group cells are null');
  const rowGroup2 = patternRows[PATTERN_HEADER_ROWS + 3][0];
  assert.equal(rowGroup2.value, 2, 'the trailing partial row group is numbered 2');
  assert.equal(rowGroup2.rowSpan, 2, 'the partial row group merges only its two real rows');

  // Inner left column = absolute row numbers 1..rows.
  for (let y = 0; y < pattern.rows; y++) {
    assert.equal(patternRows[PATTERN_HEADER_ROWS + y][1].value, y + 1, `row ${y + 1} numbered`);
  }
});

test('TDD_pattern block has a heavy outer border and group-emphasized grid (ED-15)', () => {
  const pattern = fakePattern(6, 6);
  const groupSize = 3;
  const { patternRows } = buildWorkbook(pattern, { groupSize, symbolType: SYMBOL_TYPES.SYMBOLS });
  const cell = (y, x) => patternCell(patternRows, y, x);

  // Top-left square: block outer edges are thick, black.
  assert.equal(cell(0, 0).topBorderStyle, 'thick', 'outer top edge is thick');
  assert.equal(cell(0, 0).leftBorderStyle, 'thick', 'outer left edge is thick');
  assert.equal(cell(0, 0).topBorderColor, '#000000');
  // Interior, non-boundary edges are thin.
  assert.equal(cell(0, 0).rightBorderStyle, 'thin', 'an interior non-group edge is thin');
  assert.equal(cell(0, 0).bottomBorderStyle, 'thin', 'an interior non-group edge is thin');

  // A cell on an interior group boundary is drawn one weight heavier (medium).
  // Column index 2 is the last column of group 1 (cols 0..2); its right edge is a group line.
  assert.equal(cell(0, 2).rightBorderStyle, 'medium', 'interior group column line is medium');
  // Row index 2 is the last row of group 1; its bottom edge is a group line.
  assert.equal(cell(2, 0).bottomBorderStyle, 'medium', 'interior group row line is medium');

  // Bottom-right square: block outer edges are thick.
  assert.equal(cell(5, 5).bottomBorderStyle, 'thick', 'outer bottom edge is thick');
  assert.equal(cell(5, 5).rightBorderStyle, 'thick', 'outer right edge is thick');
});

test('TDD_row/column headings are ruled with the same thin/medium grid, no thick (ED-15)', () => {
  const pattern = fakePattern(6, 6);
  const groupSize = 3; // two column groups (0..2, 3..5) and two row groups
  const { patternRows } = buildWorkbook(pattern, { groupSize, symbolType: SYMBOL_TYPES.SYMBOLS });

  const colNumHeader = (x) => patternRows[1][PATTERN_HEADER_COLS + x];   // absolute column numbers
  const colGroupHeader = (x) => patternRows[0][PATTERN_HEADER_COLS + x]; // merged group index
  const rowNumHeader = (y) => patternRows[PATTERN_HEADER_ROWS + y][1];   // absolute row numbers
  const rowGroupHeader = (y) => patternRows[PATTERN_HEADER_ROWS + y][0]; // merged group index

  // Column-number headings: thin cell lines, medium on interior group boundaries, thin outer.
  assert.equal(colNumHeader(0).leftBorderStyle, 'thin', 'outer-left heading edge is thin');
  assert.equal(colNumHeader(2).rightBorderStyle, 'medium', 'interior group line runs up through the heading');
  assert.equal(colNumHeader(3).leftBorderStyle, 'medium', 'interior group line runs up through the heading');
  assert.equal(colNumHeader(5).rightBorderStyle, 'thin', 'outer-right heading edge is thin');
  assert.equal(colNumHeader(0).topBorderStyle, 'thin');

  // Merged group headings: medium on the interior group boundary, thin on the outer edge.
  assert.equal(colGroupHeader(0).leftBorderStyle, 'thin', 'first group heading outer-left is thin');
  assert.equal(colGroupHeader(0).rightBorderStyle, 'medium', 'group boundary under the label is medium');
  assert.equal(colGroupHeader(3).rightBorderStyle, 'thin', 'last group heading outer-right is thin');

  // Row-number headings mirror the same rule along rows.
  assert.equal(rowNumHeader(0).topBorderStyle, 'thin', 'outer-top heading edge is thin');
  assert.equal(rowNumHeader(2).bottomBorderStyle, 'medium', 'interior group line runs left through the heading');
  assert.equal(rowGroupHeader(0).bottomBorderStyle, 'medium', 'group boundary beside the label is medium');

  // No heading cell carries a thick edge — the thick frame belongs to the pattern block alone.
  for (const cell of [colNumHeader(0), colNumHeader(2), colGroupHeader(0), rowNumHeader(2), rowGroupHeader(0)]) {
    for (const side of ['top', 'bottom', 'left', 'right']) {
      assert.notEqual(cell[`${side}BorderStyle`], 'thick', 'headings carry no thick edge');
    }
  }
});

test('TDD_pattern cells are sized to read square (ED-15)', () => {
  const pattern = fakePattern(4, 4);
  const { patternRows, patternColumns } = buildWorkbook(
    pattern, { groupSize: 3, symbolType: SYMBOL_TYPES.SYMBOLS },
  );

  // Columns: two header columns, then one narrow square-width column per pattern column.
  assert.equal(patternColumns.length, PATTERN_HEADER_COLS + pattern.cols);
  for (let x = 0; x < pattern.cols; x++) {
    assert.equal(patternColumns[PATTERN_HEADER_COLS + x].width, PATTERN_COLUMN_WIDTH);
  }

  // Every pattern cell carries the derived square row height (a positive number of points).
  assert.ok(PATTERN_ROW_HEIGHT > 0, 'a positive row height is derived');
  for (let y = 0; y < pattern.rows; y++) {
    for (let x = 0; x < pattern.cols; x++) {
      assert.equal(patternCell(patternRows, y, x).height, PATTERN_ROW_HEIGHT);
    }
  }
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
