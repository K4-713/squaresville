// README.md "How to use Squaresville": Squaresville displays "the final dimensions of
// the piece based on your parameters" and "how many total squares are in the pattern".
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDimensions } from '../src/pattern/dimensions.js';

test('TDD_final dimensions are squares times real-world square size (README)', () => {
  const d = computeDimensions({ rows: 40, cols: 30, squareSize: 2, units: 'inches' });
  assert.equal(d.width, 60);   // 30 cols * 2
  assert.equal(d.height, 80);  // 40 rows * 2
  assert.equal(d.units, 'inches');
});

test('TDD_total squares is rows times cols (README)', () => {
  assert.equal(computeDimensions({ rows: 40, cols: 30, squareSize: 2, units: 'cm' }).totalSquares, 1200);
  assert.equal(computeDimensions({ rows: 1, cols: 1, squareSize: 0.25, units: 'cm' }).totalSquares, 1);
});

test('TDD_fractional square sizes are supported (e.g. quarter-inch squares)', () => {
  const d = computeDimensions({ rows: 100, cols: 100, squareSize: 0.25, units: 'inches' });
  assert.equal(d.width, 25);
  assert.equal(d.height, 25);
});

test('TDD_dimensions reject garbage parameters', () => {
  assert.throws(() => computeDimensions({ rows: 0, cols: 10, squareSize: 1, units: 'cm' }), RangeError);
  assert.throws(() => computeDimensions({ rows: 10, cols: -5, squareSize: 1, units: 'cm' }), RangeError);
  assert.throws(() => computeDimensions({ rows: 2.5, cols: 10, squareSize: 1, units: 'cm' }), RangeError);
  assert.throws(() => computeDimensions({ rows: 10, cols: 10, squareSize: 0, units: 'cm' }), RangeError);
  assert.throws(() => computeDimensions({ rows: 10, cols: 10, squareSize: 'big', units: 'cm' }), RangeError);
});
