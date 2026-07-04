// README.md "Fine-tuning your Squaresville pattern": image conversion styles are
// dithering, diffusion, and nearest color; "The pattern image will automatically
// regenerate, according to your selected conversion style."
// ENGINEERING_DECISIONS.md ED-8: nearest = Euclidean RGB (default), dithering =
// 4x4 Bayer ordered, diffusion = Floyd-Steinberg; all deterministic; style changes
// regenerate from the source (ED-6).
import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePattern } from '../src/pattern/pattern.js';
import {
  CONVERSION_STYLES, mapToNearest, mapOrderedDither, mapErrorDiffusion,
} from '../src/pattern/quantize.js';
import { createSession } from '../src/pattern/session.js';
import { solidImage, blockImage } from './helpers/testImages.js';

const BLACK_WHITE = [[0, 0, 0], [255, 255, 255]];

/** A 4x4 grid of uniform mid-gray RGBA squares — ambiguous between black and white. */
function midGrayGrid() {
  return solidImage(4, 4, [128, 128, 128]).rgba;
}

test('TDD_nearest color maps every square to its closest palette color (ED-8)', () => {
  const indices = mapToNearest(midGrayGrid(), BLACK_WHITE);
  assert.ok(indices.every((i) => i === indices[0]),
    'a uniform image maps uniformly under nearest color');
});

test('TDD_ordered dithering mixes palette colors across ambiguous regions (ED-8)', () => {
  const indices = mapOrderedDither(midGrayGrid(), BLACK_WHITE, 4, 4);
  const used = new Set(indices);
  assert.ok(used.has(0) && used.has(1),
    'mid-gray under a black/white palette must dither into both colors');
  assert.deepEqual(mapOrderedDither(midGrayGrid(), BLACK_WHITE, 4, 4), indices,
    'ordered dithering is deterministic');
});

test('TDD_error diffusion mixes palette colors across ambiguous regions (ED-8)', () => {
  const indices = mapErrorDiffusion(midGrayGrid(), BLACK_WHITE, 4, 4);
  const used = new Set(indices);
  assert.ok(used.has(0) && used.has(1),
    'mid-gray under a black/white palette must diffuse into both colors');
  assert.deepEqual(mapErrorDiffusion(midGrayGrid(), BLACK_WHITE, 4, 4), indices,
    'error diffusion is deterministic');
});

test('TDD_diffusion preserves overall brightness roughly (ED-8)', () => {
  // 16 mid-gray squares between black and white should land near half and half.
  const indices = mapErrorDiffusion(midGrayGrid(), BLACK_WHITE, 4, 4);
  const whites = indices.filter((i) => i === 1).length;
  assert.ok(whites >= 5 && whites <= 11, `expected roughly half white, got ${whites}/16`);
});

test('TDD_nearest color is the default conversion style (ED-8)', () => {
  const { rgba, width, height } = blockImage([[[10, 10, 10], [240, 240, 240]]], 2, 2);
  const params = { rgba, width, height, squareSize: 1, units: 'cm', maxColors: 2 };
  assert.deepEqual(
    generatePattern(params),
    generatePattern({ ...params, conversionStyle: CONVERSION_STYLES.NEAREST }),
  );
});

test('TDD_changing the conversion style regenerates the pattern (README, ED-6)', () => {
  const session = createSession();
  session.loadSource(solidImage(4, 4, [128, 128, 128]));
  session.generate({ squareSize: 1, units: 'cm', maxColors: 2 });

  const regenerated = session.setConversionStyle(CONVERSION_STYLES.DIFFUSION);
  assert.equal(session.pattern, regenerated);
  assert.equal(session.params.conversionStyle, CONVERSION_STYLES.DIFFUSION);
  // invariants hold whatever the style produced
  assert.equal(regenerated.indices.length, 16);
  assert.equal(regenerated.counts.reduce((a, b) => a + b, 0), 16);
  for (const index of regenerated.indices) {
    assert.ok(index >= 0 && index < regenerated.palette.length);
  }
});

test('TDD_conversion style survives other fine-tuning regenerations (README)', () => {
  const session = createSession();
  session.loadSource(solidImage(4, 4, [128, 128, 128]));
  session.generate({ squareSize: 1, units: 'cm', maxColors: 2 });
  session.setConversionStyle(CONVERSION_STYLES.DITHERING);
  session.setTargetColors(3);
  assert.equal(session.params.conversionStyle, CONVERSION_STYLES.DITHERING,
    'adjusting the color count must not silently reset the style');
});

test('TDD_conversion style rejects garbage and bad ordering', () => {
  const session = createSession();
  session.loadSource(solidImage(2, 2, [1, 2, 3]));
  session.generate({ squareSize: 1, units: 'cm', maxColors: 2 });
  const before = session.pattern;
  assert.throws(() => session.setConversionStyle('impressionist'), RangeError);
  assert.equal(session.pattern, before);

  const fresh = createSession();
  assert.throws(() => fresh.setConversionStyle(CONVERSION_STYLES.DITHERING), /pattern/i);

  const { rgba, width, height } = solidImage(2, 2, [1, 2, 3]);
  assert.throws(
    () => generatePattern({ rgba, width, height, squareSize: 1, units: 'cm', maxColors: 2, conversionStyle: 'impressionist' }),
    RangeError,
  );
});
