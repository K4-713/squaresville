// Builds the final pattern spreadsheet data (README.md "Saving The Final
// Pattern"): a pattern sheet corresponding cell-for-cell to the pattern image,
// grouped with subtle alternating backgrounds, and a color legend sheet.
// Symbol assignment rules are fixed by ED-9. This module produces plain data in
// write-excel-file's cell format ({ value, ...style }); the UI hands it to the
// vendored library for the actual .xlsx download.

import { hexToRgb, rgbToHsl } from './color.js';

/** Symbol type choices offered at export (README). */
export const SYMBOL_TYPES = {
  NUMERIC: 'numeric',
  SYMBOLS: 'symbols',
};

/** Row/column group sizes offered at export (README: 3 or 5). */
export const GROUP_SIZES = [3, 5];

// Marks that render as monochrome text in stock spreadsheet fonts (ED-9; no symbol
// fonts — .xlsx cannot embed fonts). Ordered most-distinct first (solid/outline of
// clearly different base shapes, then fills, halves, hatches, and rotations of each
// family) so the most-used colors get the most tell-apart marks. Every mark here was
// checked to render mono, not tofu/emoji.
// - The four card suits sit in the front-distinct group; distinctive punctuation,
//   Greek letters, and the nine solar-system symbols follow the geometric set.
// - Emoji-capable marks (♥/♦ suits, ♀/♂) take the font ink and render mono in the
//   LibreOffice/Excel family, but browser spreadsheets like Google Sheets may color
//   them — an accepted tradeoff (ED-9).
// - Excluded on purpose: Latin look-alike Greek (Α Β Ε Ζ Η … / ε ν ο υ χ …), shapes
//   that collide with the geometric marks (Δ, Λ), both cases of one letter, and the
//   circled-plus ⊕ (dropped when Earth ♁ was added, as the two look alike).
const SYMBOL_SET = [
  // geometric shapes and card suits
  '■', '○', '▲', '◆', '★', '✚', '▼', '◇',
  '♠', '♣', '♥', '♦', '□', '●', '△', '◈',
  '☆', '✖', '▽', '◐', '⊙', '⊘', '◉', '◎',
  '◍', '⊞', '⊠', '⊟', '⊡', '▣', '▢', '◫',
  '▨', '◧', '◨', '◩', '◪', '◔', '◕', '◖',
  '◗', '▶', '◀', '▷', '◁', '◢', '◣', '◤',
  '◥', '✦', '✧', '✱', '✸', '❂', '❉', '⬟',
  // distinctive punctuation
  '#', '@', '%', '&', '§', '¶', '£', '¥', '$',
  // distinctive Greek letters
  'Γ', 'Ξ', 'Π', 'Σ', 'Φ', 'Ψ', 'Ω', 'α', 'β', 'δ', 'ζ', 'λ',
  // solar-system symbols: Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto
  '☿', '♀', '♁', '♂', '♃', '♄', '♅', '♆', '♇',
];

// Symbol ink colors (ED-9). "True symbols" are drawn in black first; once the
// glyph set is exhausted it repeats in dark blue, then dark red, so a large
// palette gets 3× the distinct marks before falling back to numerals. Ordinary
// palettes (<= the glyph count) stay pure black, so black-and-white printing is
// unaffected. Colors are dark enough to read on both group backgrounds.
const SYMBOL_INK_BLACK = '#000000';
const SYMBOL_TIER_COLORS = [SYMBOL_INK_BLACK, '#0B3D91', '#9C1B1B'];

// Subtle alternating group backgrounds for the pattern sheet (README).
const GROUP_BACKGROUNDS = ['#FFFFFF', '#EFEBDE'];

// Pattern-sheet layout (ED-15): the data block is a standard fiber-arts chart with
// two heading rows/columns, a framed grid with emphasized group lines, and square
// cells. The outer heading (top row / left column) carries the merged group index;
// the inner heading (adjacent to the pattern) carries the absolute row/column number.
export const PATTERN_HEADER_ROWS = 2;
export const PATTERN_HEADER_COLS = 2;
const HEADER_GROUP_COL_WIDTH = 5;   // fits a 1–2 digit group index
const HEADER_NUMBER_COL_WIDTH = 5;  // fits a 1–3 digit absolute row number

// Grid border weights (ED-15): thin on every cell edge, one weight heavier on an
// interior group boundary, heaviest around the whole block. The heaviest applicable
// weight wins per edge (outer > group > thin). 'thick' is the widest solid xlsx rule.
const BORDER_COLOR = '#000000';
const BORDER_THIN = 'thin';
const BORDER_GROUP = 'medium';
const BORDER_OUTER = 'thick';

// Square cells (ED-15): Excel column width is measured in character widths and row
// height in points, so the height is derived from the width via the standard
// approximations (≈7 px per width unit + ~5 px padding; 0.75 pt per px). This makes
// a cell read close to square, but not pixel-exact (it depends on the viewer's font).
export const PATTERN_COLUMN_WIDTH = 3;
const EXCEL_PX_PER_WIDTH_UNIT = 7;
const EXCEL_COL_PADDING_PX = 5;
const POINTS_PER_PX = 0.75;
export const PATTERN_ROW_HEIGHT =
  (PATTERN_COLUMN_WIDTH * EXCEL_PX_PER_WIDTH_UNIT + EXCEL_COL_PADDING_PX) * POINTS_PER_PX;

const LEGEND_COLUMN_WIDTHS = [8, 12, 10];
// Below this HSL lightness, a swatch's hex label switches to white for contrast.
const DARK_SWATCH_LIGHTNESS = 55;

// The border weight for a cell's leading (top/left) edge along one axis: thick on
// the block's outer boundary, medium on an interior group boundary, thin otherwise.
function leadingEdgeStyle(index, groupSize) {
  if (index === 0) return BORDER_OUTER;
  return index % groupSize === 0 ? BORDER_GROUP : BORDER_THIN;
}

// The border weight for a cell's trailing (bottom/right) edge along one axis.
function trailingEdgeStyle(index, count, groupSize) {
  if (index === count - 1) return BORDER_OUTER;
  return (index + 1) % groupSize === 0 ? BORDER_GROUP : BORDER_THIN;
}

// Heading-strip border weights (ED-15): the same ruling as the pattern grid but
// without the thick frame — thin cell lines, medium on interior group boundaries,
// thin on the strip's outer edge.
function headerLeadingStyle(index, groupSize) {
  if (index === 0) return BORDER_THIN; // outer edge of the heading strip
  return index % groupSize === 0 ? BORDER_GROUP : BORDER_THIN;
}
function headerTrailingStyle(index, count, groupSize) {
  if (index === count - 1) return BORDER_THIN; // outer edge
  return (index + 1) % groupSize === 0 ? BORDER_GROUP : BORDER_THIN;
}

/**
 * Assign one mark per palette color, in palette order (ED-9). Returns
 * { value, color } entries — value is the glyph or numeral, color is the font ink.
 * Numeric = 1-based strings, all black. True symbols = the fixed geometric set,
 * repeated in successive ink colors (black, dark blue, dark red) before falling
 * back to numerals; each (value, color) pair is unique within the export.
 */
export function assignSymbols(pattern, symbolType) {
  if (symbolType === SYMBOL_TYPES.NUMERIC) {
    return pattern.palette.map((_, i) => ({ value: String(i + 1), color: SYMBOL_INK_BLACK }));
  }
  if (symbolType === SYMBOL_TYPES.SYMBOLS) {
    return pattern.palette.map((_, i) => {
      const tier = Math.floor(i / SYMBOL_SET.length);
      if (tier < SYMBOL_TIER_COLORS.length) {
        return { value: SYMBOL_SET[i % SYMBOL_SET.length], color: SYMBOL_TIER_COLORS[tier] };
      }
      // Past every glyph in every ink color: fall back to plain numerals.
      return { value: String(i + 1), color: SYMBOL_INK_BLACK };
    });
  }
  throw new RangeError(`unknown symbol type: ${symbolType}`);
}

/**
 * Build the two sheets of the export workbook. Returns
 * { patternRows, patternColumns, legendRows, legendColumns } where the rows are
 * write-excel-file cell arrays and the columns are width descriptors.
 */
export function buildWorkbook(pattern, { groupSize, symbolType }) {
  if (!GROUP_SIZES.includes(groupSize)) {
    throw new RangeError(`group size must be one of ${GROUP_SIZES.join(', ')}, got ${groupSize}`);
  }
  const symbols = assignSymbols(pattern, symbolType); // validates symbolType

  // Pattern sheet (ED-15): a standard fiber-arts chart. Two heading rows and two
  // heading columns frame the data; the data block is a bordered grid with
  // emphasized group lines and square cells, keeping the alternating group
  // backgrounds (README) so large patterns stay followable.
  const patternRows = [];
  const cornerBlanks = () => Array.from({ length: PATTERN_HEADER_COLS }, () => null);

  // Top heading rows: outer = merged group index per column group; inner = absolute
  // column number. Cells hidden under a merge are emitted as null (the writer needs it).
  const groupHeaderRow = cornerBlanks();
  const numberHeaderRow = cornerBlanks();
  for (let x = 0; x < pattern.cols; x++) {
    if (x % groupSize === 0) {
      const span = Math.min(groupSize, pattern.cols - x); // trailing partial group merges its real extent
      groupHeaderRow.push({
        value: Math.floor(x / groupSize) + 1,
        span,
        align: 'center', alignVertical: 'center', fontWeight: 'bold',
        // Merged label: medium on its interior group boundaries, thin on the block's outer edge.
        leftBorderStyle: x === 0 ? BORDER_THIN : BORDER_GROUP, leftBorderColor: BORDER_COLOR,
        rightBorderStyle: x + span >= pattern.cols ? BORDER_THIN : BORDER_GROUP, rightBorderColor: BORDER_COLOR,
        topBorderStyle: BORDER_THIN, topBorderColor: BORDER_COLOR,
        bottomBorderStyle: BORDER_THIN, bottomBorderColor: BORDER_COLOR,
      });
    } else {
      groupHeaderRow.push(null);
    }
    numberHeaderRow.push({
      value: x + 1, align: 'center',
      leftBorderStyle: headerLeadingStyle(x, groupSize), leftBorderColor: BORDER_COLOR,
      rightBorderStyle: headerTrailingStyle(x, pattern.cols, groupSize), rightBorderColor: BORDER_COLOR,
      topBorderStyle: BORDER_THIN, topBorderColor: BORDER_COLOR,
      bottomBorderStyle: BORDER_THIN, bottomBorderColor: BORDER_COLOR,
    });
  }
  patternRows.push(groupHeaderRow, numberHeaderRow);

  // Data rows: outer left = merged group index per row group; inner left = absolute
  // row number; then one square per pattern cell.
  for (let y = 0; y < pattern.rows; y++) {
    const row = [];
    if (y % groupSize === 0) {
      const rowSpan = Math.min(groupSize, pattern.rows - y);
      row.push({
        value: Math.floor(y / groupSize) + 1,
        rowSpan,
        align: 'center', alignVertical: 'center', fontWeight: 'bold',
        // Merged label: medium on its interior group boundaries, thin on the outer edge.
        topBorderStyle: y === 0 ? BORDER_THIN : BORDER_GROUP, topBorderColor: BORDER_COLOR,
        bottomBorderStyle: y + rowSpan >= pattern.rows ? BORDER_THIN : BORDER_GROUP, bottomBorderColor: BORDER_COLOR,
        leftBorderStyle: BORDER_THIN, leftBorderColor: BORDER_COLOR,
        rightBorderStyle: BORDER_THIN, rightBorderColor: BORDER_COLOR,
      });
    } else {
      row.push(null); // hidden under the row-group merge above
    }
    row.push({
      value: y + 1, align: 'center', alignVertical: 'center',
      topBorderStyle: headerLeadingStyle(y, groupSize), topBorderColor: BORDER_COLOR,
      bottomBorderStyle: headerTrailingStyle(y, pattern.rows, groupSize), bottomBorderColor: BORDER_COLOR,
      leftBorderStyle: BORDER_THIN, leftBorderColor: BORDER_COLOR,
      rightBorderStyle: BORDER_THIN, rightBorderColor: BORDER_COLOR,
    });

    for (let x = 0; x < pattern.cols; x++) {
      const groupParity = (Math.floor(x / groupSize) + Math.floor(y / groupSize)) % 2;
      const mark = symbols[pattern.indices[y * pattern.cols + x]];
      row.push({
        value: mark.value,
        textColor: mark.color, // symbol ink (ED-9): black, or a tier color for large palettes
        align: 'center', alignVertical: 'center',
        backgroundColor: GROUP_BACKGROUNDS[groupParity],
        height: PATTERN_ROW_HEIGHT, // square cells (ED-15); row height = max cell height
        leftBorderStyle: leadingEdgeStyle(x, groupSize), leftBorderColor: BORDER_COLOR,
        rightBorderStyle: trailingEdgeStyle(x, pattern.cols, groupSize), rightBorderColor: BORDER_COLOR,
        topBorderStyle: leadingEdgeStyle(y, groupSize), topBorderColor: BORDER_COLOR,
        bottomBorderStyle: trailingEdgeStyle(y, pattern.rows, groupSize), bottomBorderColor: BORDER_COLOR,
      });
    }
    patternRows.push(row);
  }

  // Legend sheet: header, then symbol / color swatch (hex on its own fill,
  // readable on dark colors) / square count per palette color.
  const legendRows = [[
    { value: 'Symbol', fontWeight: 'bold' },
    { value: 'Color', fontWeight: 'bold' },
    { value: 'Squares', fontWeight: 'bold' },
  ]];
  pattern.palette.forEach((hex, i) => {
    const { r, g, b } = hexToRgb(hex);
    const darkSwatch = rgbToHsl(r, g, b).l < DARK_SWATCH_LIGHTNESS;
    legendRows.push([
      { value: symbols[i].value, textColor: symbols[i].color, align: 'center' },
      { value: hex, backgroundColor: hex, textColor: darkSwatch ? '#FFFFFF' : '#000000' },
      { value: pattern.counts[i], type: Number },
    ]);
  });

  return {
    patternRows,
    patternColumns: [
      { width: HEADER_GROUP_COL_WIDTH },
      { width: HEADER_NUMBER_COL_WIDTH },
      ...Array.from({ length: pattern.cols }, () => ({ width: PATTERN_COLUMN_WIDTH })),
    ],
    legendRows,
    legendColumns: LEGEND_COLUMN_WIDTHS.map((width) => ({ width })),
  };
}
