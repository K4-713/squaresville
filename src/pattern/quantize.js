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

/** Map every RGBA square to the index of its nearest palette color. */
export function mapToNearest(rgbaGrid, palette) {
  const indices = new Array(rgbaGrid.length / 4);
  for (let i = 0; i < rgbaGrid.length; i += 4) {
    const square = [rgbaGrid[i], rgbaGrid[i + 1], rgbaGrid[i + 2]];
    let best = 0;
    let bestDistance = Infinity;
    for (let p = 0; p < palette.length; p++) {
      const distance = colorDistanceSquared(square, palette[p]);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = p;
      }
    }
    indices[i / 4] = best;
  }
  return indices;
}
