// Assembles the full base-pattern generation pipeline (README.md "How to use
// Squaresville") and the indexed pattern model it produces (ENGINEERING_DECISIONS.md
// ED-3): { cols, rows, palette, indices, counts, dimensions, itemType }.

import { rgbToHex, hexToRgb } from './color.js';
import { computeDimensions } from './dimensions.js';
import { resampleToGrid } from './resample.js';
import { buildPalette, mapToNearest } from './quantize.js';

/**
 * Generate a base pattern from an uploaded image.
 *
 * Required: rgba (Uint8ClampedArray), width, height (source pixels), squareSize,
 * units, maxColors. Optional: rows/cols (default: the image's pixel dimensions,
 * per README.md), itemType (stored with the pattern, e.g. "quilt").
 */
export function generatePattern({
  rgba, width, height,
  rows = height, cols = width,
  squareSize, units, maxColors,
  itemType = null,
}) {
  const dimensions = computeDimensions({ rows, cols, squareSize, units });
  const grid = resampleToGrid(rgba, width, height, cols, rows);
  const rawPalette = buildPalette(grid, maxColors);
  const rawIndices = mapToNearest(grid, rawPalette);

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
    itemType,
  };
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
