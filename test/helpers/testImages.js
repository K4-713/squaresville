// Builders for small synthetic RGBA images used by the TDD_ tests.
// An "image" here is { rgba: Uint8ClampedArray, width, height } — the same plain
// data the pattern engine consumes, so no canvas or DOM is involved.

/** Build an image where every pixel is the given [r, g, b] color. */
export function solidImage(width, height, [r, g, b]) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = 255;
  }
  return { rgba, width, height };
}

/**
 * Build an image from a grid of [r, g, b] colors, one per pixel.
 * `pixelRows` is an array of rows, each an array of colors.
 */
export function imageFromPixels(pixelRows) {
  const height = pixelRows.length;
  const width = pixelRows[0].length;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixelRows[y][x];
      const i = (y * width + x) * 4;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = 255;
    }
  }
  return { rgba, width, height };
}

/**
 * Build an image tiled from solid quadrant blocks: `quadrants` is a 2D array of
 * colors and each entry becomes a solid blockWidth x blockHeight block.
 */
export function blockImage(quadrants, blockWidth, blockHeight) {
  const rows = [];
  for (const quadRow of quadrants) {
    for (let by = 0; by < blockHeight; by++) {
      const row = [];
      for (const color of quadRow) {
        for (let bx = 0; bx < blockWidth; bx++) row.push(color);
      }
      rows.push(row);
    }
  }
  return imageFromPixels(rows);
}
