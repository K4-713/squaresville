// Palette generation (median cut) and nearest-color mapping.
// Deterministic and dependency-free; operates on plain arrays of [r, g, b] colors.

import { colorDistanceSquared } from './color.js';

const CHANNELS = [0, 1, 2]; // r, g, b positions within a color triple

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

/** The channel index along which a set of weighted colors spreads the widest. */
function widestChannel(entries) {
  let best = 0;
  let bestRange = -1;
  for (const channel of CHANNELS) {
    let min = 255;
    let max = 0;
    for (const { color } of entries) {
      if (color[channel] < min) min = color[channel];
      if (color[channel] > max) max = color[channel];
    }
    if (max - min > bestRange) {
      bestRange = max - min;
      best = channel;
    }
  }
  return best;
}

/** Split a box of weighted colors at its weighted median along its widest channel. */
function splitBox(entries) {
  const channel = widestChannel(entries);
  const sorted = [...entries].sort((a, b) => a.color[channel] - b.color[channel]);
  const totalWeight = sorted.reduce((sum, e) => sum + e.count, 0);
  let seen = 0;
  let cut = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    seen += sorted[i].count;
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
  for (const { color, count } of entries) {
    r += color[0] * count;
    g += color[1] * count;
    b += color[2] * count;
    weight += count;
  }
  return [Math.round(r / weight), Math.round(g / weight), Math.round(b / weight)];
}

/**
 * Build a palette of at most maxColors [r, g, b] colors for an RGBA square grid.
 * If the grid has no more distinct colors than maxColors, they are returned exactly.
 */
export function buildPalette(rgbaGrid, maxColors) {
  if (!Number.isInteger(maxColors) || maxColors <= 0) {
    throw new RangeError(`maxColors must be a positive integer, got ${maxColors}`);
  }
  const distinct = tallyDistinctColors(rgbaGrid);
  if (distinct.length <= maxColors) {
    return distinct.map((entry) => entry.color);
  }

  // Median cut: repeatedly split the box holding the most squares until we have
  // maxColors boxes, then average each box into one palette color.
  const boxes = [distinct];
  while (boxes.length < maxColors) {
    boxes.sort((a, b) => b.reduce((s, e) => s + e.count, 0) - a.reduce((s, e) => s + e.count, 0));
    const candidate = boxes.findIndex((box) => box.length > 1);
    if (candidate === -1) break; // every box is a single color; cannot split further
    const [left, right] = splitBox(boxes[candidate]);
    boxes.splice(candidate, 1, left, right);
  }
  return boxes.map(averageColor);
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
