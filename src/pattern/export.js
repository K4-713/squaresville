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

// Unicode geometric shapes that render as monochrome text in stock spreadsheet
// fonts (ED-9; no symbol fonts — .xlsx cannot embed fonts). Ordered most-distinct
// first (solid/outline of clearly different base shapes, then fills, halves,
// hatches, and rotations of each family) so the most-used colors get the most
// tell-apart marks. Every glyph here was checked to render mono, not tofu/emoji.
const SYMBOL_SET = [
  '■', '○', '▲', '◆', '★', '✚', '▼', '◇',
  '□', '●', '△', '◈', '☆', '✖', '▽', '◐',
  '⊕', '⊗', '⊙', '⊘', '◉', '◎', '⦿', '◍',
  '⊞', '⊠', '⊟', '⊡', '▣', '▩', '▢', '◫',
  '▤', '▥', '▦', '▧', '▨', '◧', '◨', '◩',
  '◪', '◑', '◒', '◓', '◔', '◕', '◖', '◗',
  '▶', '◀', '▷', '◁', '◢', '◣', '◤', '◥',
  '✦', '✧', '✱', '✴', '❂', '❉', '⬟', '⬢',
];

// Symbol ink colors (ED-9). "True symbols" are drawn in black first; once the
// glyph set is exhausted it repeats in dark blue, then dark red, so a large
// palette gets 3× the distinct marks before falling back to numerals. Ordinary
// palettes (<= the glyph count) stay pure black, so black-and-white printing is
// unaffected. Colors are dark enough to read on both group backgrounds.
const SYMBOL_INK_BLACK = '#000000';
const SYMBOL_TIER_COLORS = [SYMBOL_INK_BLACK, '#0B3D91', '#9C1B1B'];

// Subtle alternating group backgrounds for the pattern sheet (README), and
// legend header styling.
const GROUP_BACKGROUNDS = ['#FFFFFF', '#EFEBDE'];
const PATTERN_COLUMN_WIDTH = 3;
const LEGEND_COLUMN_WIDTHS = [8, 12, 10];
// Below this HSL lightness, a swatch's hex label switches to white for contrast.
const DARK_SWATCH_LIGHTNESS = 55;

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

  // Pattern sheet: one cell per square; groups of groupSize rows/columns
  // alternate backgrounds checkerboard-style so large patterns stay followable.
  const patternRows = [];
  for (let y = 0; y < pattern.rows; y++) {
    const row = [];
    for (let x = 0; x < pattern.cols; x++) {
      const groupParity = (Math.floor(x / groupSize) + Math.floor(y / groupSize)) % 2;
      const mark = symbols[pattern.indices[y * pattern.cols + x]];
      row.push({
        value: mark.value,
        textColor: mark.color, // symbol ink (ED-9): black, or a tier color for large palettes
        align: 'center',
        backgroundColor: GROUP_BACKGROUNDS[groupParity],
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
    patternColumns: Array.from({ length: pattern.cols }, () => ({ width: PATTERN_COLUMN_WIDTH })),
    legendRows,
    legendColumns: LEGEND_COLUMN_WIDTHS.map((width) => ({ width })),
  };
}
