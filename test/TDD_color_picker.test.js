// DESIGN.md "In-pane color picker": a hue ring around a saturation/brightness
// square, preloaded with the selected color. These cover the pure coordinate math
// that places the markers and reads a pointer back into hue/saturation/brightness;
// the ring uses 0deg = top (12 o'clock), increasing clockwise, matching the CSS
// conic-gradient the wheel is painted with.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hueForVector, vectorForHue, svForPoint, pointForSv,
} from '../src/ui/colorPicker.js';

const near = (actual, expected, tol = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${expected}, got ${actual}`);

test('TDD_hue maps to ring position clockwise from the top (DESIGN.md)', () => {
  // hue 0 at top, 90 right, 180 bottom, 270 left (y grows downward on screen).
  const cases = [
    [0, 0, -1], [90, 1, 0], [180, 0, 1], [270, -1, 0],
  ];
  for (const [hue, x, y] of cases) {
    const v = vectorForHue(hue, 1);
    near(v.x, x);
    near(v.y, y);
    near(hueForVector(v.x, v.y), hue);
  }
});

test('TDD_a pointer vector reads back as a hue on the ring (DESIGN.md)', () => {
  near(hueForVector(0, -50), 0);   // straight up
  near(hueForVector(50, 0), 90);   // right
  near(hueForVector(0, 50), 180);  // down
  near(hueForVector(-50, 0), 270); // left
  // radius does not matter, only direction
  near(hueForVector(0, -3), hueForVector(0, -900));
});

test('TDD_vectorForHue rejects out-of-range hues', () => {
  assert.throws(() => vectorForHue(-1, 1), RangeError);
  assert.throws(() => vectorForHue(361, 1), RangeError);
  assert.throws(() => vectorForHue(NaN, 1), RangeError);
});

test('TDD_the square maps position to saturation and brightness (DESIGN.md)', () => {
  // (0,0) top-left = white (s 0, v 100); bottom-right = full color (s 100, v 0).
  assert.deepEqual(svForPoint(0, 0, 100), { s: 0, v: 100 });
  assert.deepEqual(svForPoint(100, 100, 100), { s: 100, v: 0 });
  assert.deepEqual(svForPoint(50, 50, 100), { s: 50, v: 50 });
});

test('TDD_points outside the square clamp to its edges (DESIGN.md)', () => {
  assert.deepEqual(svForPoint(-20, 130, 100), { s: 0, v: 0 });
  assert.deepEqual(svForPoint(180, -40, 100), { s: 100, v: 100 });
});

test('TDD_saturation/brightness round-trips to a marker position (DESIGN.md)', () => {
  for (const [s, v] of [[0, 100], [100, 0], [25, 75], [60, 40]]) {
    const p = pointForSv(s, v, 100);
    const back = svForPoint(p.x, p.y, 100);
    near(back.s, s);
    near(back.v, v);
  }
});

test('TDD_pointForSv rejects out-of-range channels', () => {
  assert.throws(() => pointForSv(-1, 50, 100), RangeError);
  assert.throws(() => pointForSv(50, 101, 100), RangeError);
  assert.throws(() => pointForSv(NaN, 50, 100), RangeError);
});
