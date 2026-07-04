// An editing session: the original uploaded source pixels, the generation
// parameters, and the current pattern. Fine-tuning actions regenerate from the
// stored source pixels, never from the quantized pattern (ENGINEERING_DECISIONS.md
// ED-6). Pure data + engine calls — no DOM — so the whole session is testable in
// Node, and future fine-tuning features (undo, palette edits) share this seam.

import { generatePattern } from './pattern.js';
import { rgbToHex, hexToRgb } from './color.js';

export function createSession() {
  let source = null;   // { rgba, width, height }
  let params = null;   // last generation parameters with rows/cols resolved
  let pattern = null;  // current indexed pattern model (ED-3)

  function regenerate() {
    pattern = generatePattern({
      rgba: source.rgba,
      width: source.width,
      height: source.height,
      ...params,
    });
    // Keep resolved grid dimensions so later adjustments reuse the same grid.
    params = { ...params, rows: pattern.rows, cols: pattern.cols };
    return pattern;
  }

  return {
    get source() { return source; },
    get params() { return params; },
    get pattern() { return pattern; },

    /** Start a session from decoded upload pixels. Resets any previous pattern. */
    loadSource({ rgba, width, height }) {
      if (!(rgba instanceof Uint8ClampedArray) || rgba.length !== width * height * 4) {
        throw new RangeError('source rgba length does not match width * height * 4');
      }
      source = { rgba, width, height };
      params = null;
      pattern = null;
    },

    /** Generate the base pattern (README.md "How to use Squaresville"). */
    generate(generationParams) {
      if (!source) throw new Error('load a source image before generating');
      params = { ...generationParams };
      return regenerate();
    },

    /**
     * Change one palette color to a new value (README.md "Adjust Individual
     * Palette Colors"). A palette edit, not a regeneration: squares keep their
     * assignments (ED-7). If the new color duplicates another palette entry, the
     * two entries merge (indices remapped, counts summed) so the ED-3 no-duplicates
     * invariant holds. Returns { pattern, colorIndex } where colorIndex is the
     * edited color's position in the resulting palette.
     */
    changeColor(paletteIndex, newHex) {
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
    },

    /**
     * Fine-tune the target number of colors; regenerates automatically from the
     * source (README.md "Adjust Number of Colors", ED-6).
     */
    setTargetColors(maxColors) {
      if (!pattern) throw new Error('generate a pattern before adjusting colors');
      if (!Number.isInteger(maxColors) || maxColors <= 0) {
        throw new RangeError(`target number of colors must be a positive integer, got ${maxColors}`);
      }
      params = { ...params, maxColors };
      return regenerate();
    },
  };
}
