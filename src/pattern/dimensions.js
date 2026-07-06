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

// The unit whose finished-size readout also carries feet-and-inches notation (ED-16).
const INCHES_UNIT = 'inches';
const INCHES_PER_FOOT = 12;

/**
 * Format a length in inches as feet-and-inches notation (ED-16), e.g. 30 → "2′ 6″".
 * Whole feet omit the inches ("2′"); under a foot omits the feet ("6″"); fractional
 * inches are kept ("1′ 3.5″"). The inches remainder rounds to <= 2 decimals, and a
 * remainder that rounds up to 12 carries into the feet so no "12″" is ever shown.
 */
export function formatFeetInches(totalInches) {
  let feet = Math.floor(totalInches / INCHES_PER_FOOT);
  let inches = Math.round((totalInches - feet * INCHES_PER_FOOT) * 100) / 100;
  if (inches >= INCHES_PER_FOOT) {
    feet += 1;
    inches -= INCHES_PER_FOOT;
  }
  const feetPart = feet > 0 ? `${feet}′` : '';
  const inchesPart = inches > 0 ? `${inches}″` : '';
  // At least one part is always present (a positive length is feet, inches, or both).
  return [feetPart, inchesPart].filter(Boolean).join(' ') || '0″';
}

/**
 * The finished-size portion of the stats readout (ED-16): "<w> × <h> <units>", plus
 * feet-and-inches notation in parentheses when the unit is inches.
 */
export function formatFinishedSize({ width, height, units }) {
  const base = `${width} × ${height} ${units}`;
  if (units !== INCHES_UNIT) return base;
  return `${base} (${formatFeetInches(width)} × ${formatFeetInches(height)})`;
}
