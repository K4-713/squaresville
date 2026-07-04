// Downsampling of source image pixels onto the pattern grid.
// Each pattern square takes the box average of the source pixels it covers, with
// transparency composited over white first (see ARCHITECTURE.md).

/**
 * Resample an RGBA image onto a cols x rows grid.
 * Returns a Uint8ClampedArray of length cols * rows * 4 (one RGBA value per square).
 */
export function resampleToGrid(rgba, srcWidth, srcHeight, cols, rows) {
  if (!(rgba instanceof Uint8ClampedArray) || rgba.length !== srcWidth * srcHeight * 4) {
    throw new RangeError('rgba length does not match srcWidth * srcHeight * 4');
  }
  if (!Number.isInteger(srcWidth) || srcWidth <= 0 || !Number.isInteger(srcHeight) || srcHeight <= 0) {
    throw new RangeError(`source dimensions must be positive integers, got ${srcWidth}x${srcHeight}`);
  }
  if (!Number.isInteger(cols) || cols <= 0 || !Number.isInteger(rows) || rows <= 0) {
    throw new RangeError(`grid dimensions must be positive integers, got ${cols}x${rows}`);
  }

  const out = new Uint8ClampedArray(cols * rows * 4);
  for (let gy = 0; gy < rows; gy++) {
    // Source pixel band this grid row covers (at least one pixel).
    const y0 = Math.floor((gy * srcHeight) / rows);
    const y1 = Math.max(y0 + 1, Math.ceil(((gy + 1) * srcHeight) / rows));
    for (let gx = 0; gx < cols; gx++) {
      const x0 = Math.floor((gx * srcWidth) / cols);
      const x1 = Math.max(x0 + 1, Math.ceil(((gx + 1) * srcWidth) / cols));

      let r = 0;
      let g = 0;
      let b = 0;
      let sampleCount = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * srcWidth + x) * 4;
          const alpha = rgba[i + 3] / 255;
          // Composite over white: blend each channel toward 255 by (1 - alpha).
          r += rgba[i] * alpha + 255 * (1 - alpha);
          g += rgba[i + 1] * alpha + 255 * (1 - alpha);
          b += rgba[i + 2] * alpha + 255 * (1 - alpha);
          sampleCount++;
        }
      }
      const o = (gy * cols + gx) * 4;
      out[o] = Math.round(r / sampleCount);
      out[o + 1] = Math.round(g / sampleCount);
      out[o + 2] = Math.round(b / sampleCount);
      out[o + 3] = 255;
    }
  }
  return out;
}
