// Tests for ENGINEERING_DECISIONS.md ED-1, ED-3, ED-4.
// (ED-2 is covered in TDD_color.test.js.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePattern } from '../src/pattern/pattern.js';
import { hexToRgb } from '../src/pattern/color.js';
import { blockImage } from './helpers/testImages.js';

const projectRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

async function collectSourceFiles() {
  const files = ['index.html', 'styles.css'];
  for (const dir of ['src/pattern', 'src/ui']) {
    for (const name of await readdir(path.join(projectRoot, dir))) {
      if (name.endsWith('.js')) files.push(path.join(dir, name));
    }
  }
  return files;
}

test('TDD_pattern generation makes no network calls (ED-1)', () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (...args) => {
    calls.push(args);
    return Promise.reject(new Error('network use is forbidden (ED-1)'));
  };
  try {
    const colors = [
      [[255, 0, 0], [0, 255, 0]],
      [[0, 0, 255], [255, 255, 0]],
    ];
    const { rgba, width, height } = blockImage(colors, 2, 2);
    generatePattern({ rgba, width, height, rows: 2, cols: 2, squareSize: 1, units: 'cm', maxColors: 4 });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.deepEqual(calls, []);
});

test('TDD_no source file contains network APIs or external URLs (ED-1, ED-4)', async () => {
  const forbidden = [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /EventSource/, /https?:\/\//i];
  for (const file of await collectSourceFiles()) {
    const text = await readFile(path.join(projectRoot, file), 'utf8');
    for (const pattern of forbidden) {
      assert.ok(!pattern.test(text), `${file} matches forbidden pattern ${pattern}`);
    }
  }
});

test('TDD_production code has no third-party runtime dependencies (ED-4)', async () => {
  const pkg = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));
  assert.deepEqual(pkg.dependencies ?? {}, {});
});

test('TDD_pattern model is indexed color with valid indices and no duplicate palette colors (ED-3)', () => {
  const colors = [
    [[255, 0, 0], [250, 10, 5], [0, 255, 0], [10, 250, 5]],
    [[0, 0, 255], [5, 10, 250], [240, 240, 240], [255, 255, 255]],
  ];
  const { rgba, width, height } = blockImage(colors, 2, 2);
  const pattern = generatePattern({ rgba, width, height, rows: 2, cols: 4, squareSize: 1, units: 'cm', maxColors: 5 });

  assert.equal(pattern.indices.length, pattern.cols * pattern.rows);
  for (const index of pattern.indices) {
    assert.ok(Number.isInteger(index) && index >= 0 && index < pattern.palette.length,
      `index ${index} out of palette range`);
  }
  assert.equal(new Set(pattern.palette).size, pattern.palette.length, 'duplicate palette colors');
  // every palette entry is a parseable canonical color (ED-2 format, ED-3 model)
  for (const hex of pattern.palette) assert.ok(hexToRgb(hex));
});
