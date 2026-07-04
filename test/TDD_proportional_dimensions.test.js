// README.md "How to use Squaresville": "Changing the number of columns or rows of
// squares will change the other, unchanged number so the pattern stays
// proportionate to your image."
import test from 'node:test';
import assert from 'node:assert/strict';
import { proportionalDimension } from '../src/pattern/dimensions.js';

test('TDD_changing one dimension yields a proportionate other dimension (README)', () => {
  // A 200x100 image (2:1): columns drive rows and vice versa.
  assert.equal(proportionalDimension(8, 200, 100), 4);   // 8 cols -> 4 rows
  assert.equal(proportionalDimension(4, 100, 200), 8);   // 4 rows -> 8 cols
  assert.equal(proportionalDimension(50, 200, 100), 25);
  // A square image keeps them equal.
  assert.equal(proportionalDimension(37, 64, 64), 37);
});

test('TDD_proportionate values round to the nearest whole square (README)', () => {
  // 3 cols on a 200x100 image -> 1.5 rows -> rounds to 2
  assert.equal(proportionalDimension(3, 200, 100), 2);
  // 5 cols on a 300x100 image -> 1.67 rows -> rounds to 2
  assert.equal(proportionalDimension(5, 300, 100), 2);
});

test('TDD_a proportionate dimension is never less than one square', () => {
  assert.equal(proportionalDimension(1, 1000, 10), 1); // would be 0.01 rows
});

test('TDD_proportional linking rejects garbage', () => {
  assert.throws(() => proportionalDimension(0, 100, 100), RangeError);
  assert.throws(() => proportionalDimension(-3, 100, 100), RangeError);
  assert.throws(() => proportionalDimension(2.5, 100, 100), RangeError);
  assert.throws(() => proportionalDimension(5, 0, 100), RangeError);
  assert.throws(() => proportionalDimension(5, 100, -1), RangeError);
});
