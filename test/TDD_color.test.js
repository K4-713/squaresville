// ENGINEERING_DECISIONS.md ED-2 — canonical color format is uppercase #RRGGBB hex
import test from 'node:test';
import assert from 'node:assert/strict';
import { rgbToHex, hexToRgb } from '../src/pattern/color.js';

test('TDD_rgbToHex produces uppercase #RRGGBB (ED-2)', () => {
  assert.equal(rgbToHex(255, 255, 255), '#FFFFFF');
  assert.equal(rgbToHex(0, 0, 0), '#000000');
  assert.equal(rgbToHex(18, 52, 86), '#123456');
  assert.equal(rgbToHex(171, 205, 239), '#ABCDEF');
});

test('TDD_hexToRgb round-trips the canonical form (ED-2)', () => {
  for (const hex of ['#000000', '#FFFFFF', '#ABCDEF', '#0A0B0C']) {
    const { r, g, b } = hexToRgb(hex);
    assert.equal(rgbToHex(r, g, b), hex);
  }
});

test('TDD_hexToRgb accepts lowercase input but engine output stays canonical (ED-2)', () => {
  const { r, g, b } = hexToRgb('#abcdef');
  assert.equal(rgbToHex(r, g, b), '#ABCDEF');
});

test('TDD_color helpers reject garbage input', () => {
  assert.throws(() => hexToRgb('garbage'), RangeError);
  assert.throws(() => hexToRgb('#FFF'), RangeError); // shorthand is not canonical
  assert.throws(() => hexToRgb(''), RangeError);
  assert.throws(() => hexToRgb(123456), RangeError);
  assert.throws(() => rgbToHex(256, 0, 0), RangeError);
  assert.throws(() => rgbToHex(-1, 0, 0), RangeError);
  assert.throws(() => rgbToHex(0, NaN, 0), RangeError);
});
