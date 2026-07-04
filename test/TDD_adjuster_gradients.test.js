// DESIGN.md "Adjuster slider tracks": every adjuster slider's track is a gradient
// scale where each position shows the exact color the selected color would become
// if the thumb were dragged there, with every other channel held at its current
// value — including a flat track when a slider would change nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sliderGradientStops, sliderGradientCss } from '../src/ui/adjusterGradients.js';

test('TDD_rgb tracks span the channel range while other channels hold still (DESIGN.md)', () => {
  const stops = sliderGradientStops('r', '#69603F');
  assert.equal(stops[0].hex, '#00603F', 'left end is the color with red at 0');
  assert.equal(stops.at(-1).hex, '#FF603F', 'right end is the color with red at 255');
  assert.equal(stops[0].offset, 0);
  assert.equal(stops.at(-1).offset, 100);
  for (let i = 1; i < stops.length; i++) {
    assert.ok(stops[i].offset > stops[i - 1].offset, 'offsets must ascend');
  }
});

test('TDD_cmyk tracks preview the actual resulting colors (DESIGN.md)', () => {
  const cyanOnWhite = sliderGradientStops('c', '#FFFFFF');
  assert.equal(cyanOnWhite[0].hex, '#FFFFFF');
  assert.equal(cyanOnWhite.at(-1).hex, '#00FFFF', 'full cyan on white is pure cyan');

  const blackOnRed = sliderGradientStops('k', '#FF0000');
  assert.equal(blackOnRed[0].hex, '#FF0000');
  assert.equal(blackOnRed.at(-1).hex, '#000000', 'full black ink is black');
});

test('TDD_the hue track sweeps the spectrum and returns to the current hue (DESIGN.md)', () => {
  const stops = sliderGradientStops('h', '#FF0000');
  const hexes = stops.map((stop) => stop.hex);
  for (const corner of ['#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF']) {
    assert.ok(hexes.includes(corner), `hue sweep must pass through ${corner}`);
  }
  assert.equal(hexes[0], '#FF0000');
  assert.equal(hexes.at(-1), '#FF0000', '360° wraps back to the color itself');
});

test('TDD_a slider that would change nothing paints a flat track (DESIGN.md)', () => {
  for (const stop of sliderGradientStops('h', '#808080')) {
    assert.equal(stop.hex, '#808080', 'hue cannot change an achromatic grey');
  }
});

test('TDD_saturation and brightness tracks hold the current hue (DESIGN.md)', () => {
  const saturation = sliderGradientStops('s', '#0000FF');
  assert.equal(saturation[0].hex, '#FFFFFF', 'zero saturation at full brightness is white');
  assert.equal(saturation.at(-1).hex, '#0000FF');

  const brightness = sliderGradientStops('v', '#0000FF');
  assert.equal(brightness[0].hex, '#000000', 'zero brightness is black');
  assert.equal(brightness.at(-1).hex, '#0000FF');
});

test('TDD_gradient css lists every stop left to right (DESIGN.md)', () => {
  const css = sliderGradientCss('g', '#000000');
  assert.match(css, /^linear-gradient\(to right, #000000 0(\.0)?%, /);
  assert.match(css, /#00FF00 100(\.0)?%\)$/);
});

test('TDD_gradient requests reject unknown channels and garbage colors', () => {
  assert.throws(() => sliderGradientStops('q', '#FFFFFF'), RangeError);
  assert.throws(() => sliderGradientStops('r', '#FFF'), RangeError);
  assert.throws(() => sliderGradientStops('r', 'garbage'), RangeError);
});
