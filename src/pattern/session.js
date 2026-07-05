// An editing session: the original uploaded source pixels, the generation
// parameters, and the current pattern. Fine-tuning actions regenerate from the
// stored source pixels, never from the quantized pattern (ENGINEERING_DECISIONS.md
// ED-6). Pure data + engine calls — no DOM — so the whole session is testable in
// Node, and future fine-tuning features (undo, palette edits) share this seam.

import { generatePattern, nearestNeighbors, splitPaletteColor } from './pattern.js';
import { rgbToHex, hexToRgb, rgbToHsl, colorDistanceSquared } from './color.js';
import { CONVERSION_STYLES, PALETTE_STYLES } from './quantize.js';
import { resampleToGrid } from './resample.js';

/** Merge styles for mergeColors (README.md "Merging Colors"). */
export const MERGE_STYLES = {
  A_TO_B: 'a-to-b',   // A's squares -> B's color, A removed
  B_TO_A: 'b-to-a',   // B's squares -> A's color, B removed
  AVERAGE: 'average', // both -> the average color, both originals removed
};

/** Palette sort methods (README.md: standard color sorts plus frequency). */
export const SORT_METHODS = {
  HUE: 'hue',               // around the color wheel; achromatics first
  LIGHTNESS: 'lightness',   // dark to light
  SATURATION: 'saturation', // most vivid first
  FREQUENCY: 'frequency',   // most squares first
};

/** Sort key per method; ties always break on the hex string for determinism. */
const SORT_KEYS = {
  [SORT_METHODS.HUE]: ({ hsl }) => [hsl.s === 0 ? -1 : hsl.h, hsl.l],
  [SORT_METHODS.LIGHTNESS]: ({ hsl }) => [hsl.l, hsl.h],
  [SORT_METHODS.SATURATION]: ({ hsl }) => [-hsl.s, hsl.h],
  [SORT_METHODS.FREQUENCY]: ({ count }) => [-count],
};

// README.md: the user can undo up to this many recent actions.
const UNDO_DEPTH = 10;

export function createSession() {
  let source = null;   // { rgba, width, height }
  let params = null;   // last generation parameters with rows/cols resolved
  let pattern = null;  // current indexed pattern model (ED-3)
  let sortMethod = null; // the sort the palette is currently in, or null if none
  let edited = false;  // has the palette been manually edited since the last generation? (ED-13)
  let history = [];    // undo snapshots of { pattern, params, sortMethod, edited }, oldest first
  let actionInProgress = false;

  // Every public mutating method is wrapped as one undoable *user action*: a
  // snapshot is taken at entry and committed to history only if the action
  // actually changed the pattern. Nested internal calls (e.g. mergeColors
  // delegating to changeColor) fall inside the outer action and never create
  // extra history entries, so one action always equals one undo step (README).
  //
  // opts.reapplySort marks a palette manipulation: when the outermost such action
  // finishes and a sort is active, the palette is re-sorted so it stays in the
  // chosen order (README), tracking the edited color. The re-sort runs inside the
  // action (actionInProgress still set), so it adds no separate undo step.
  function undoable(method, { reapplySort = false } = {}) {
    return function (...args) {
      const outermost = !actionInProgress;
      const snapshot = outermost ? { pattern, params, sortMethod, edited } : null;
      if (outermost) actionInProgress = true;
      try {
        let result = method.apply(this, args);
        // Re-apply the active sort only when the edit actually changed the pattern,
        // so a no-op edit stays a no-op (adds no undo step) even while sorted.
        if (outermost && reapplySort && sortMethod !== null && result
            && pattern !== snapshot.pattern) {
          result = this.sortPalette(sortMethod, result.colorIndex ?? null);
        }
        return result;
      } finally {
        if (outermost) {
          actionInProgress = false;
          if (snapshot.pattern !== null && pattern !== snapshot.pattern) {
            if (reapplySort) edited = true; // a manual palette edit (ED-13)
            history.push(snapshot);
            if (history.length > UNDO_DEPTH) history.shift();
          }
        }
      }
    };
  }

  function regenerate() {
    pattern = generatePattern({
      rgba: source.rgba,
      width: source.width,
      height: source.height,
      ...params,
    });
    // Keep resolved grid dimensions so later adjustments reuse the same grid.
    params = { ...params, rows: pattern.rows, cols: pattern.cols };
    sortMethod = null; // a freshly generated palette is no longer in a user sort
    edited = false;    // a fresh generation is the un-edited baseline (ED-13)
    return pattern;
  }

  /** The resampled RGBA grid (one entry per square) the current pattern was built from. */
  function currentGrid() {
    return resampleToGrid(source.rgba, source.width, source.height, params.cols, params.rows);
  }

  /** Palette index whose squares span the widest color range (best to split), or -1 (ED-13). */
  function mostVariedSplittableColor() {
    const grid = currentGrid();
    const n = pattern.palette.length;
    const min = Array.from({ length: n }, () => [255, 255, 255]);
    const max = Array.from({ length: n }, () => [0, 0, 0]);
    for (let i = 0; i < pattern.indices.length; i++) {
      const c = pattern.indices[i];
      for (let ch = 0; ch < 3; ch++) {
        const v = grid[i * 4 + ch];
        if (v < min[c][ch]) min[c][ch] = v;
        if (v > max[c][ch]) max[c][ch] = v;
      }
    }
    let best = -1;
    let bestSpread = 0;
    for (let c = 0; c < n; c++) {
      const spread = Math.max(max[c][0] - min[c][0], max[c][1] - min[c][1], max[c][2] - min[c][2]);
      if (spread > bestSpread) { bestSpread = spread; best = c; }
    }
    return best;
  }

  /** The two closest palette colors (indices), for merging when removing a color (ED-13). */
  function nearestColorPair() {
    const rgb = pattern.palette.map((hex) => { const { r, g, b } = hexToRgb(hex); return [r, g, b]; });
    let pair = [0, 1];
    let best = Infinity;
    for (let i = 0; i < rgb.length; i++) {
      for (let j = i + 1; j < rgb.length; j++) {
        const d = colorDistanceSquared(rgb[i], rgb[j]);
        if (d < best) { best = d; pair = [i, j]; }
      }
    }
    return pair;
  }

  return {
    get source() { return source; },
    get params() { return params; },
    get pattern() { return pattern; },
    get sortMethod() { return sortMethod; },
    get edited() { return edited; }, // has the palette been hand-edited since generation? (ED-13)
    get undoCount() { return history.length; },

    /** Start a session from decoded upload pixels. Resets pattern and history. */
    loadSource({ rgba, width, height }) {
      if (!(rgba instanceof Uint8ClampedArray) || rgba.length !== width * height * 4) {
        throw new RangeError('source rgba length does not match width * height * 4');
      }
      source = { rgba, width, height };
      params = null;
      pattern = null;
      sortMethod = null;
      edited = false;
      history = [];
      actionInProgress = false;
    },

    /** Undo the most recent action (README.md: up to 10 recent actions). */
    undo() {
      if (history.length === 0) throw new Error('nothing to undo');
      const snapshot = history.pop();
      pattern = snapshot.pattern;
      params = snapshot.params;
      sortMethod = snapshot.sortMethod;
      edited = snapshot.edited;
      return pattern;
    },

    /** Generate the base pattern (README.md "How to use Squaresville"). */
    generate: undoable(function (generationParams) {
      if (!source) throw new Error('load a source image before generating');
      params = { ...generationParams };
      return regenerate();
    }),

    /**
     * Change one palette color to a new value (README.md "Adjust Individual
     * Palette Colors"). A palette edit, not a regeneration: squares keep their
     * assignments (ED-7). If the new color duplicates another palette entry, the
     * two entries merge (indices remapped, counts summed) so the ED-3 no-duplicates
     * invariant holds. Returns { pattern, colorIndex } where colorIndex is the
     * edited color's position in the resulting palette.
     */
    changeColor: undoable(function (paletteIndex, newHex) {
      if (!pattern) throw new Error('generate a pattern before editing colors');
      if (!Number.isInteger(paletteIndex) || paletteIndex < 0 || paletteIndex >= pattern.palette.length) {
        throw new RangeError(`paletteIndex must be a valid palette index, got ${paletteIndex}`);
      }
      const { r, g, b } = hexToRgb(newHex); // throws RangeError on garbage
      const canonical = rgbToHex(r, g, b);  // canonical uppercase form (ED-2)

      if (canonical === pattern.palette[paletteIndex]) {
        return { pattern, colorIndex: paletteIndex }; // no-op
      }

      const duplicateIndex = pattern.palette.indexOf(canonical);
      if (duplicateIndex === -1) {
        const palette = [...pattern.palette];
        palette[paletteIndex] = canonical;
        pattern = { ...pattern, palette };
        return { pattern, colorIndex: paletteIndex };
      }

      // Merge the edited entry into the existing identical one (ED-7).
      const oldToNew = new Map();
      pattern.palette.forEach((_, oldIndex) => {
        if (oldIndex !== paletteIndex) {
          oldToNew.set(oldIndex, oldIndex - (oldIndex > paletteIndex ? 1 : 0));
        }
      });
      const mergedIndex = oldToNew.get(duplicateIndex);
      const palette = pattern.palette.filter((_, i) => i !== paletteIndex);
      const counts = pattern.counts.filter((_, i) => i !== paletteIndex);
      counts[mergedIndex] += pattern.counts[paletteIndex];
      const indices = pattern.indices.map(
        (i) => (i === paletteIndex ? mergedIndex : oldToNew.get(i)),
      );
      pattern = { ...pattern, palette, counts, indices };
      return { pattern, colorIndex: mergedIndex };
    }, { reapplySort: true }),

    /**
     * Delete a palette color (README.md "Deleting a Color"): its squares are
     * reassigned to the nearest remaining color. Reduces to a changeColor merge
     * into that nearest color (ED-7).
     */
    deleteColor: undoable(function (paletteIndex) {
      if (!pattern) throw new Error('generate a pattern before editing colors');
      if (pattern.palette.length < 2) {
        throw new Error('cannot delete the only color in the palette');
      }
      const nearest = nearestNeighbors(pattern, paletteIndex, 1)[0]; // validates index
      return this.changeColor(paletteIndex, nearest.hex);
    }, { reapplySort: true }),

    /**
     * Merge two palette colors (README.md "Merging Colors") in one of the
     * MERGE_STYLES. Every style reduces to changeColor merges (ED-7). Returns
     * { pattern, colorIndex } with colorIndex at the surviving color.
     */
    mergeColors: undoable(function (firstIndex, secondIndex, style) {
      if (!pattern) throw new Error('generate a pattern before merging colors');
      for (const index of [firstIndex, secondIndex]) {
        if (!Number.isInteger(index) || index < 0 || index >= pattern.palette.length) {
          throw new RangeError(`merge index must be a valid palette index, got ${index}`);
        }
      }
      if (firstIndex === secondIndex) {
        throw new RangeError('choose two different colors to merge');
      }

      const hexA = pattern.palette[firstIndex];
      const hexB = pattern.palette[secondIndex];
      switch (style) {
        case MERGE_STYLES.A_TO_B:
          return this.changeColor(firstIndex, hexB);
        case MERGE_STYLES.B_TO_A:
          return this.changeColor(secondIndex, hexA);
        case MERGE_STYLES.AVERAGE: {
          const a = hexToRgb(hexA);
          const b = hexToRgb(hexB);
          const averageHex = rgbToHex(
            Math.round((a.r + b.r) / 2),
            Math.round((a.g + b.g) / 2),
            Math.round((a.b + b.b) / 2),
          );
          this.changeColor(firstIndex, averageHex);
          // A is now the average (possibly merged with an existing identical
          // entry); pull B in too unless it already was the average color.
          const remainingB = pattern.palette.indexOf(hexB);
          return remainingB === -1
            ? { pattern, colorIndex: pattern.palette.indexOf(averageHex) }
            : this.changeColor(remainingB, averageHex);
        }
        default:
          throw new RangeError(`unknown merge style: ${style}`);
      }
    }, { reapplySort: true }),

    /**
     * Reorder the palette by a SORT_METHODS entry (README.md: standard color
     * sorts plus frequency). Purely a reordering: indices are remapped so the
     * rendered pattern is unchanged. Pass trackIndex to follow a color through
     * the sort (README: a selected color remains selected); returns
     * { pattern, colorIndex } with its new position (null if not tracking).
     */
    sortPalette: undoable(function (method, trackIndex = null) {
      if (!pattern) throw new Error('generate a pattern before sorting the palette');
      const sortKey = SORT_KEYS[method];
      if (!sortKey) throw new RangeError(`unknown sort method: ${method}`);
      if (trackIndex !== null
          && (!Number.isInteger(trackIndex) || trackIndex < 0 || trackIndex >= pattern.palette.length)) {
        throw new RangeError(`trackIndex must be a valid palette index, got ${trackIndex}`);
      }

      const keyed = pattern.palette.map((hex, index) => {
        const { r, g, b } = hexToRgb(hex);
        return { hex, index, key: sortKey({ hsl: rgbToHsl(r, g, b), count: pattern.counts[index] }) };
      });
      keyed.sort((a, b) => {
        for (let k = 0; k < a.key.length; k++) {
          if (a.key[k] !== b.key[k]) return a.key[k] - b.key[k];
        }
        return a.hex < b.hex ? -1 : 1;
      });

      const oldToNew = new Map(keyed.map(({ index }, newIndex) => [index, newIndex]));
      pattern = {
        ...pattern,
        palette: keyed.map(({ hex }) => hex),
        counts: keyed.map(({ index }) => pattern.counts[index]),
        indices: pattern.indices.map((i) => oldToNew.get(i)),
      };
      sortMethod = method; // the palette is now in this order; edits re-apply it (README)
      return { pattern, colorIndex: trackIndex === null ? null : oldToNew.get(trackIndex) };
    }),

    /**
     * Split one palette color into two, re-quantized from its squares' source colors
     * (ED-13). A manual palette edit that leaves every other color untouched; a color
     * whose squares are all one grid color cannot be split, and the pattern is left
     * unchanged. Returns { pattern, colorIndex } tracking the split color.
     */
    splitColor: undoable(function (colorIndex) {
      if (!pattern) throw new Error('generate a pattern before editing colors');
      const style = params.paletteStyle ?? PALETTE_STYLES.VIVID;
      const next = splitPaletteColor(pattern, currentGrid(), colorIndex, style);
      if (next.palette.length <= pattern.palette.length) {
        return { pattern, colorIndex: null }; // unsplittable — leave the pattern as is
      }
      pattern = next;
      return { pattern, colorIndex };
    }, { reapplySort: true }),

    /**
     * Edit the current palette to hold `n` colors, preserving all manual edits
     * (ED-13): grow by splitting the most color-varied color, shrink by merging the
     * two nearest. Capped at the pattern's availableColors (ED-12). One undoable
     * action. Distinct from setTargetColors, which rebuilds from the source (ED-6).
     */
    setPaletteColorCount: undoable(function (n) {
      if (!pattern) throw new Error('generate a pattern before adjusting colors');
      if (!Number.isInteger(n) || n <= 0) {
        throw new RangeError(`number of colors must be a positive integer, got ${n}`);
      }
      const target = Math.min(n, pattern.availableColors);
      while (pattern.palette.length < target) {
        const c = mostVariedSplittableColor();
        if (c === -1) break; // nothing left to split — the true ceiling
        const before = pattern.palette.length;
        this.splitColor(c);
        if (pattern.palette.length === before) break; // safety: no forward progress
      }
      while (pattern.palette.length > target && pattern.palette.length > 1) {
        const [i, j] = nearestColorPair();
        const [smaller, larger] = pattern.counts[i] <= pattern.counts[j] ? [i, j] : [j, i];
        this.mergeColors(smaller, larger, MERGE_STYLES.A_TO_B);
      }
      return { pattern, colorIndex: null };
    }, { reapplySort: true }),

    /**
     * Fine-tune the target number of colors; regenerates automatically from the
     * source (README.md "Adjust Number of Colors", ED-6).
     */
    setTargetColors: undoable(function (maxColors) {
      if (!pattern) throw new Error('generate a pattern before adjusting colors');
      if (!Number.isInteger(maxColors) || maxColors <= 0) {
        throw new RangeError(`number of colors must be a positive integer, got ${maxColors}`);
      }
      params = { ...params, maxColors };
      return regenerate();
    }),

    /**
     * Switch the image conversion style (README.md fine-tuning; algorithms per
     * ED-8) and regenerate automatically from the source (ED-6).
     */
    setConversionStyle: undoable(function (style) {
      if (!pattern) throw new Error('generate a pattern before changing the conversion style');
      if (!Object.values(CONVERSION_STYLES).includes(style)) {
        throw new RangeError(`unknown conversion style: ${style}`);
      }
      params = { ...params, conversionStyle: style };
      return regenerate();
    }),
  };
}
