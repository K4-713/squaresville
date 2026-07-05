// Palette generation (median cut) and nearest-color mapping.
// Deterministic and dependency-free; operates on plain arrays of [r, g, b] colors.

import { colorDistanceSquared, rgbToHsl } from './color.js';

const CHANNELS = [0, 1, 2]; // r, g, b positions within a color triple

// Palette selection strategies (ENGINEERING_DECISIONS.md ED-11). Vivid is default.
export const PALETTE_STYLES = { BALANCED: 'balanced', VIVID: 'vivid' };
// How strongly a fully-saturated color outweighs a fully-dull one under vivid:
// weight = count * (1 + K * saturation), saturation in 0..1 (ED-11).
const VIVID_SATURATION_WEIGHT = 6;

/** 0..1 saturation (HSL) of an [r, g, b] color. */
function saturation01(color) {
  return rgbToHsl(color[0], color[1], color[2]).s / 100;
}

/** Per-color weight for a style: population, boosted by vividness for vivid (ED-11). */
function colorWeight({ color, count }, style) {
  if (style === PALETTE_STYLES.VIVID) {
    return count * (1 + VIVID_SATURATION_WEIGHT * saturation01(color));
  }
  return count;
}

/** Tally the distinct colors in a grid of RGBA squares as { color: [r,g,b], count }. */
function tallyDistinctColors(rgbaGrid) {
  const counts = new Map();
  for (let i = 0; i < rgbaGrid.length; i += 4) {
    const key = (rgbaGrid[i] << 16) | (rgbaGrid[i + 1] << 8) | rgbaGrid[i + 2];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([key, count]) => ({
    color: [(key >> 16) & 0xff, (key >> 8) & 0xff, key & 0xff],
    count,
  }));
}

/** How many distinct colors the resampled grid holds — a pattern's ceiling (ED-12). */
export function distinctColorCount(rgbaGrid) {
  return tallyDistinctColors(rgbaGrid).length;
}

const colorKey = ([r, g, b]) => (r << 16) | (g << 8) | b;
// Cap on reseed passes; each pass fills at least one empty slot, so this bounds work.
const MAX_RESEED_PASSES = 64;

/**
 * Ensure every palette color is the nearest color for at least one grid color (ED-12):
 * repeatedly reseed any unused palette entry onto the worst-represented grid color
 * until none are unused. Preserves the median-cut/vivid selection for the used
 * entries; only dead slots move. `distinct` is the weighted distinct-color list.
 */
function ensureAllUsed(distinct, palette) {
  for (let pass = 0; pass < MAX_RESEED_PASSES; pass++) {
    const used = new Array(palette.length).fill(false);
    const assignments = distinct.map((entry) => {
      const nearest = nearestIndex(entry.color, palette);
      used[nearest] = true;
      return { color: entry.color, distance: colorDistanceSquared(entry.color, palette[nearest]) };
    });
    const empties = [];
    for (let j = 0; j < palette.length; j++) {
      if (!used[j]) empties.push(j);
    }
    if (empties.length === 0) break;

    // Worst-represented grid colors first; skip any that already sit on a palette color.
    const claimed = new Set(palette.map(colorKey));
    const candidates = assignments
      .filter((a) => !claimed.has(colorKey(a.color)))
      .sort((a, b) => b.distance - a.distance || colorKey(a.color) - colorKey(b.color));
    let next = 0;
    for (const slot of empties) {
      if (next >= candidates.length) break; // no distinct colors left to seed with
      palette[slot] = [...candidates[next].color];
      claimed.add(colorKey(candidates[next].color));
      next += 1;
    }
  }
  return palette;
}

/** The channel a box spreads widest along, and that range. */
function widestExtent(entries) {
  let channel = 0;
  let range = -1;
  for (const axis of CHANNELS) {
    let min = 255;
    let max = 0;
    for (const { color } of entries) {
      if (color[axis] < min) min = color[axis];
      if (color[axis] > max) max = color[axis];
    }
    if (max - min > range) {
      range = max - min;
      channel = axis;
    }
  }
  return { channel, range };
}

/** Split a box of weighted colors at its weighted median along its widest channel. */
function splitBox(entries) {
  const { channel } = widestExtent(entries);
  const sorted = [...entries].sort((a, b) => a.color[channel] - b.color[channel]);
  const totalWeight = sorted.reduce((sum, e) => sum + e.weight, 0);
  let seen = 0;
  let cut = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    seen += sorted[i].weight;
    cut = i + 1;
    if (seen >= totalWeight / 2) break;
  }
  return [sorted.slice(0, cut), sorted.slice(cut)];
}

/** Weighted average color of a box, rounded to integer channels. */
function averageColor(entries) {
  let r = 0;
  let g = 0;
  let b = 0;
  let weight = 0;
  for (const e of entries) {
    r += e.color[0] * e.weight;
    g += e.color[1] * e.weight;
    b += e.color[2] * e.weight;
    weight += e.weight;
  }
  return [Math.round(r / weight), Math.round(g / weight), Math.round(b / weight)];
}

/**
 * Which box to split next (ED-11): the most-populous box for balanced, or the box
 * with the greatest vividness-weight × color spread for vivid (so a saturated
 * cluster is separated into its own box rather than averaged away).
 */
function boxPriority(entries, style) {
  const weight = entries.reduce((sum, e) => sum + e.weight, 0);
  return style === PALETTE_STYLES.VIVID ? weight * widestExtent(entries).range : weight;
}

/**
 * Build a palette of at most maxColors [r, g, b] colors for an RGBA square grid,
 * using a selection strategy (ED-11; default vivid). If the grid has no more
 * distinct colors than maxColors, they are returned exactly.
 */
export function buildPalette(rgbaGrid, maxColors, style = PALETTE_STYLES.VIVID) {
  if (!Number.isInteger(maxColors) || maxColors <= 0) {
    throw new RangeError(`maxColors must be a positive integer, got ${maxColors}`);
  }
  if (!Object.values(PALETTE_STYLES).includes(style)) {
    throw new RangeError(`unknown palette style: ${style}`);
  }
  const distinct = tallyDistinctColors(rgbaGrid)
    .map((entry) => ({ ...entry, weight: colorWeight(entry, style) }));
  if (distinct.length <= maxColors) {
    return distinct.map((entry) => entry.color);
  }

  // Median cut: repeatedly split the highest-priority box until we have maxColors
  // boxes, then collapse each box into one (weighted-average) palette color.
  const boxes = [distinct];
  while (boxes.length < maxColors) {
    let target = -1;
    let bestPriority = -Infinity;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].length < 2) continue; // a single color cannot be split
      const priority = boxPriority(boxes[i], style);
      if (priority > bestPriority) {
        bestPriority = priority;
        target = i;
      }
    }
    if (target === -1) break; // every box is a single color; cannot split further
    const [left, right] = splitBox(boxes[target]);
    boxes.splice(target, 1, left, right);
  }
  // ED-12: reseed any box color that no square is nearest to, so the palette has
  // exactly maxColors *used* colors.
  return ensureAllUsed(distinct, boxes.map(averageColor));
}

/** Index of the palette color nearest to one [r, g, b] value. */
function nearestIndex(rgb, palette) {
  let best = 0;
  let bestDistance = Infinity;
  for (let p = 0; p < palette.length; p++) {
    const distance = colorDistanceSquared(rgb, palette[p]);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = p;
    }
  }
  return best;
}

/** Map every RGBA square to the index of its nearest palette color (ED-8). */
export function mapToNearest(rgbaGrid, palette) {
  const indices = new Array(rgbaGrid.length / 4);
  for (let i = 0; i < rgbaGrid.length; i += 4) {
    indices[i / 4] = nearestIndex([rgbaGrid[i], rgbaGrid[i + 1], rgbaGrid[i + 2]], palette);
  }
  return indices;
}

// The image conversion styles (README "Fine-tuning your Squaresville pattern";
// algorithms fixed by ED-8).
export const CONVERSION_STYLES = {
  NEAREST: 'nearest',
  DITHERING: 'dithering',
  DIFFUSION: 'diffusion',
};

// Standard 4x4 Bayer threshold matrix for ordered dithering (ED-8).
const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
// How far (in channel units) the Bayer thresholds push a value before the
// nearest-color lookup; the classic +/- spread/2 around the true value.
const ORDERED_DITHER_SPREAD = 48;

const clampChannel = (value) => Math.max(0, Math.min(255, value));

/** Ordered (Bayer 4x4) dithering: threshold-shift each square, then map (ED-8). */
export function mapOrderedDither(rgbaGrid, palette, cols, rows) {
  const indices = new Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      const offset = ((BAYER_4X4[y % 4][x % 4] + 0.5) / 16 - 0.5) * ORDERED_DITHER_SPREAD;
      indices[y * cols + x] = nearestIndex([
        clampChannel(rgbaGrid[i] + offset),
        clampChannel(rgbaGrid[i + 1] + offset),
        clampChannel(rgbaGrid[i + 2] + offset),
      ], palette);
    }
  }
  return indices;
}

// Floyd-Steinberg weights: right 7/16, down-left 3/16, down 5/16, down-right 1/16.
const FLOYD_STEINBERG = [
  { dx: 1, dy: 0, weight: 7 / 16 },
  { dx: -1, dy: 1, weight: 3 / 16 },
  { dx: 0, dy: 1, weight: 5 / 16 },
  { dx: 1, dy: 1, weight: 1 / 16 },
];

/** Floyd-Steinberg error diffusion in scan order (ED-8). */
export function mapErrorDiffusion(rgbaGrid, palette, cols, rows) {
  // Work on floats so pushed error accumulates without clamping artifacts.
  const working = new Float64Array(cols * rows * 3);
  for (let i = 0; i < cols * rows; i++) {
    working[i * 3] = rgbaGrid[i * 4];
    working[i * 3 + 1] = rgbaGrid[i * 4 + 1];
    working[i * 3 + 2] = rgbaGrid[i * 4 + 2];
  }

  const indices = new Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const square = y * cols + x;
      const value = [
        clampChannel(working[square * 3]),
        clampChannel(working[square * 3 + 1]),
        clampChannel(working[square * 3 + 2]),
      ];
      const chosen = nearestIndex(value, palette);
      indices[square] = chosen;

      for (const { dx, dy, weight } of FLOYD_STEINBERG) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= cols || ny >= rows) continue;
        const neighbor = (ny * cols + nx) * 3;
        for (let channel = 0; channel < 3; channel++) {
          working[neighbor + channel] += (value[channel] - palette[chosen][channel]) * weight;
        }
      }
    }
  }
  return indices;
}

/** Dispatch a conversion style to its mapping algorithm (ED-8). */
export function mapWithStyle(rgbaGrid, palette, style, cols, rows) {
  switch (style) {
    case CONVERSION_STYLES.NEAREST: return mapToNearest(rgbaGrid, palette);
    case CONVERSION_STYLES.DITHERING: return mapOrderedDither(rgbaGrid, palette, cols, rows);
    case CONVERSION_STYLES.DIFFUSION: return mapErrorDiffusion(rgbaGrid, palette, cols, rows);
    default: throw new RangeError(`unknown conversion style: ${style}`);
  }
}
