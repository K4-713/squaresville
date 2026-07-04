// Real-world size math for a pattern: rows/cols of squares at a physical square size.
// README.md: Squaresville displays the final dimensions of the piece and the total
// number of squares in the pattern.

function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer, got ${value}`);
  }
}

/**
 * Compute the piece's physical dimensions and square count.
 * `squareSize` is the real-world edge length of one square, in `units`.
 */
/**
 * The proportionate counterpart of a rows/cols value (README.md: changing one
 * changes the other so the pattern stays proportionate to the image). `value`
 * is the changed count along the axis with `fromPixels` source pixels; returns
 * the matching count along the axis with `toPixels`, at least 1.
 */
export function proportionalDimension(value, fromPixels, toPixels) {
  assertPositiveInteger(value, 'value');
  assertPositiveInteger(fromPixels, 'fromPixels');
  assertPositiveInteger(toPixels, 'toPixels');
  return Math.max(1, Math.round((value * toPixels) / fromPixels));
}

export function computeDimensions({ rows, cols, squareSize, units }) {
  assertPositiveInteger(rows, 'rows');
  assertPositiveInteger(cols, 'cols');
  if (typeof squareSize !== 'number' || !Number.isFinite(squareSize) || squareSize <= 0) {
    throw new RangeError(`squareSize must be a positive number, got ${squareSize}`);
  }
  return {
    width: cols * squareSize,
    height: rows * squareSize,
    units,
    totalSquares: rows * cols,
  };
}
