// Assembles the full base-pattern generation pipeline (README.md "How to use
// Squaresville") and the indexed pattern model it produces (ENGINEERING_DECISIONS.md
// ED-3): { cols, rows, palette, indices, counts, dimensions, itemType }.

import { rgbToHex, hexToRgb, colorDistanceSquared } from './color.js';
import { computeDimensions } from './dimensions.js';
import { resampleToGrid } from './resample.js';
import {
  buildPalette, mapWithStyle, distinctColorCount, CONVERSION_STYLES, PALETTE_STYLES,
} from './quantize.js';

/**
 * Generate a base pattern from an uploaded image.
 *
 * Required: rgba (Uint8ClampedArray), width, height (source pixels), squareSize,
 * units, maxColors. Optional: rows/cols (default: the image's pixel dimensions,
 * per README.md), conversionStyle (a CONVERSION_STYLES value, default nearest
 * per ED-8), paletteStyle (a PALETTE_STYLES value, default vivid per ED-11),
 * itemType (stored with the pattern, e.g. "quilt").
 */
export function generatePattern({
  rgba, width, height,
  rows = height, cols = width,
  squareSize, units, maxColors,
  conversionStyle = CONVERSION_STYLES.NEAREST,
  paletteStyle = PALETTE_STYLES.VIVID,
  itemType = null,
}) {
  const dimensions = computeDimensions({ rows, cols, squareSize, units });
  const grid = resampleToGrid(rgba, width, height, cols, rows);
  // ED-12: the grid's distinct colors are the ceiling; never build more than exist.
  const availableColors = distinctColorCount(grid);
  const rawPalette = buildPalette(grid, Math.min(maxColors, availableColors), paletteStyle);
  const rawIndices = mapWithStyle(grid, rawPalette, conversionStyle, cols, rows);

  // Keep only colors actually present in the pattern (README: the palette shows
  // "all the colors present in the pattern image"), remapping indices to match.
  const usedCounts = new Map();
  for (const index of rawIndices) {
    usedCounts.set(index, (usedCounts.get(index) ?? 0) + 1);
  }
  const usedOldIndices = [...usedCounts.keys()].sort((a, b) => a - b);
  const oldToNew = new Map(usedOldIndices.map((oldIndex, newIndex) => [oldIndex, newIndex]));

  return {
    cols,
    rows,
    palette: usedOldIndices.map((i) => rgbToHex(...rawPalette[i])),
    indices: rawIndices.map((i) => oldToNew.get(i)),
    counts: usedOldIndices.map((i) => usedCounts.get(i)),
    dimensions,
    availableColors, // ED-12: distinct colors in the grid (the palette ceiling)
    itemType,
  };
}

/**
 * Rebuild an indexed pattern from a (possibly redundant) hex palette + indices:
 * duplicate colors collapse to their first entry, unused colors drop, counts are
 * recomputed, and the surviving colors keep their existing order (ED-3, ED-7).
 */
function finalizeIndexed(paletteHex, indices, meta) {
  const firstForHex = new Map();
  const remap = paletteHex.map((hex, i) => {
    if (!firstForHex.has(hex)) firstForHex.set(hex, i);
    return firstForHex.get(hex);
  });
  const merged = indices.map((i) => remap[i]);
  const usedCounts = new Map();
  for (const i of merged) usedCounts.set(i, (usedCounts.get(i) ?? 0) + 1);
  const usedOld = [...usedCounts.keys()].sort((a, b) => a - b);
  const oldToNew = new Map(usedOld.map((old, next) => [old, next]));
  return {
    cols: meta.cols,
    rows: meta.rows,
    palette: usedOld.map((i) => paletteHex[i]),
    indices: merged.map((i) => oldToNew.get(i)),
    counts: usedOld.map((i) => usedCounts.get(i)),
    dimensions: meta.dimensions,
    availableColors: meta.availableColors,
    itemType: meta.itemType,
  };
}

/**
 * Split one palette color into two by re-quantizing the source (grid) colors of the
 * squares assigned to it, then reassigning those squares to the nearer of the two
 * (ED-13). `grid` is the resampled RGBA grid (one entry per square, matching
 * pattern.indices). Every other color is left untouched. Returns the new pattern, or
 * the pattern unchanged if the color cannot be split (its squares are one grid color).
 */
export function splitPaletteColor(pattern, grid, colorIndex, style) {
  const { palette, indices } = pattern;
  if (!Number.isInteger(colorIndex) || colorIndex < 0 || colorIndex >= palette.length) {
    throw new RangeError(`colorIndex must be a valid palette index, got ${colorIndex}`);
  }
  const sub = [];
  for (let i = 0; i < indices.length; i++) {
    if (indices[i] === colorIndex) sub.push(grid[i * 4], grid[i * 4 + 1], grid[i * 4 + 2], 255);
  }
  const two = buildPalette(Uint8ClampedArray.from(sub), 2, style);
  if (two.length < 2) return pattern; // all one grid color — nothing to split

  // Keep the original color's value untouched (so manual recolors/merges stick, ED-13):
  // carve off only a *new* color for the sub-cluster of grid colors farther from it.
  const { r, g, b } = hexToRgb(palette[colorIndex]);
  const original = [r, g, b];
  const keepFirst = colorDistanceSquared(two[0], original) <= colorDistanceSquared(two[1], original);
  const keptRep = keepFirst ? two[0] : two[1];
  const newRep = keepFirst ? two[1] : two[0];

  const paletteHex = [...palette]; // the split color keeps its exact value
  const newIndex = paletteHex.push(rgbToHex(...newRep)) - 1;
  const reassigned = indices.map((idx, i) => {
    if (idx !== colorIndex) return idx;
    const gc = [grid[i * 4], grid[i * 4 + 1], grid[i * 4 + 2]];
    return colorDistanceSquared(gc, newRep) < colorDistanceSquared(gc, keptRep) ? newIndex : colorIndex;
  });
  return finalizeIndexed(paletteHex, reassigned, {
    cols: pattern.cols, rows: pattern.rows, dimensions: pattern.dimensions,
    availableColors: pattern.availableColors, itemType: pattern.itemType,
  });
}

/**
 * The palette colors nearest to the one at colorIndex, closest first (README.md
 * "Adjust Individual Palette Colors": the detail pane shows the selected color's
 * nearest neighbors and how many squares each has). Returns at most neighborCount
 * entries of { index, hex, count }.
 */
export function nearestNeighbors(pattern, colorIndex, neighborCount) {
  const { palette, counts } = pattern;
  if (!Number.isInteger(colorIndex) || colorIndex < 0 || colorIndex >= palette.length) {
    throw new RangeError(`colorIndex must be a valid palette index, got ${colorIndex}`);
  }
  if (!Number.isInteger(neighborCount) || neighborCount <= 0) {
    throw new RangeError(`neighborCount must be a positive integer, got ${neighborCount}`);
  }
  const selected = hexToRgb(palette[colorIndex]);
  const selectedRgb = [selected.r, selected.g, selected.b];
  return palette
    .map((hex, index) => {
      const { r, g, b } = hexToRgb(hex);
      return { index, hex, count: counts[index], distance: colorDistanceSquared(selectedRgb, [r, g, b]) };
    })
    .filter((entry) => entry.index !== colorIndex)
    .sort((a, b) => a.distance - b.distance || a.index - b.index)
    .slice(0, neighborCount)
    .map(({ index, hex, count }) => ({ index, hex, count }));
}

/**
 * Render a pattern back to RGBA pixels, one pixel per square. The UI scales this
 * up for display; saving it and re-uploading it resumes the pattern (README.md
 * "Saving the Pattern Image").
 */
export function patternToRgba(pattern) {
  const { cols, rows, palette, indices } = pattern;
  const rgbPalette = palette.map((hex) => hexToRgb(hex));
  const rgba = new Uint8ClampedArray(cols * rows * 4);
  for (let i = 0; i < indices.length; i++) {
    const { r, g, b } = rgbPalette[indices[i]];
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = 255;
  }
  return { rgba, width: cols, height: rows };
}
