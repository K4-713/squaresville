// README.md "Saving the Pattern Image": "At any point, right-clicking and saving
// the pattern image will work: The indexed color image will remain saveable,
// making it easy to resume progress by re-uploading the pattern image."
// The saved preview is zoomed (each square is zoom x zoom identical pixels), so
// resuming must survive that scaling, and must work after fine-tuning edits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePattern, patternToRgba } from '../src/pattern/pattern.js';
import { createSession, MERGE_STYLES } from '../src/pattern/session.js';
import { blockImage } from './helpers/testImages.js';

const RESUME_COLORS = [
  [[200, 30, 40], [30, 200, 40]],
  [[40, 30, 200], [200, 200, 40]],
];

/** Scale 1px-per-square RGBA up by an integer zoom, like the preview does. */
function zoomRgba({ rgba, width, height }, zoom) {
  const out = new Uint8ClampedArray(width * zoom * height * zoom * 4);
  for (let y = 0; y < height * zoom; y++) {
    for (let x = 0; x < width * zoom; x++) {
      const src = ((Math.floor(y / zoom) * width) + Math.floor(x / zoom)) * 4;
      const dst = (y * width * zoom + x) * 4;
      for (let c = 0; c < 4; c++) out[dst + c] = rgba[src + c];
    }
  }
  return { rgba: out, width: width * zoom, height: height * zoom };
}

test('TDD_a zoomed saved pattern image resumes to the identical pattern (README)', () => {
  const session = createSession();
  session.loadSource(blockImage(RESUME_COLORS, 4, 4));
  const first = session.generate({ rows: 2, cols: 2, squareSize: 1, units: 'cm', maxColors: 4 });

  // Save at zoom 7 (a right-click save of the preview), then re-upload it.
  const saved = zoomRgba(patternToRgba(first), 7);
  const resumed = generatePattern({
    rgba: saved.rgba, width: saved.width, height: saved.height,
    rows: first.rows, cols: first.cols, squareSize: 1, units: 'cm', maxColors: 4,
  });
  assert.deepEqual(resumed.palette, first.palette);
  assert.deepEqual(resumed.indices, first.indices);
  assert.deepEqual(resumed.counts, first.counts);
});

test('TDD_saving works at any point: a fine-tuned pattern also round-trips (README)', () => {
  const session = createSession();
  session.loadSource(blockImage(RESUME_COLORS, 4, 4));
  session.generate({ rows: 2, cols: 2, squareSize: 1, units: 'cm', maxColors: 4 });

  // Fine-tune: recolor one entry, then average-merge two others.
  session.changeColor(0, '#112233');
  const edited = session.mergeColors(1, 2, MERGE_STYLES.AVERAGE).pattern;

  const saved = zoomRgba(patternToRgba(edited), 5);
  const resumed = generatePattern({
    rgba: saved.rgba, width: saved.width, height: saved.height,
    rows: edited.rows, cols: edited.cols, squareSize: 1, units: 'cm', maxColors: 4,
  });
  assert.deepEqual([...resumed.palette].sort(), [...edited.palette].sort(),
    'the edited palette must survive the save/re-upload round trip');
  assert.deepEqual(
    patternToRgba(resumed).rgba, patternToRgba(edited).rgba,
    'the resumed pattern must render identically to the saved one',
  );
});
