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
  const files = ['index.html', 'guide.html', 'styles.css'];
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

// ED-4 (as amended 2026-07-07) forbids external URLs anywhere the browser would
// fetch them on page load. The allowed exceptions in HTML — none of which the
// page fetches — are stripped before scanning: user-clicked <a href> navigation,
// the <link rel="canonical"> declaration, crawler-read metadata (Open Graph /
// Twitter <meta> tags), and JSON-LD data blocks (never fetched or executed).
function stripAllowedNavigationUrls(html) {
  return html
    .replace(/<a\s[^>]*>/gi, '<a>')
    .replace(/<link rel="canonical"[^>]*>/gi, '')
    .replace(/<meta (?:property="og:|name="twitter:)[^>]*>/gi, '')
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/gi, '');
}

test('TDD_no source file contains network APIs or auto-loaded external URLs (ED-1, ED-4)', async () => {
  const forbidden = [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /EventSource/, /https?:\/\//i];
  for (const file of await collectSourceFiles()) {
    let text = await readFile(path.join(projectRoot, file), 'utf8');
    if (file.endsWith('.html')) text = stripAllowedNavigationUrls(text);
    for (const pattern of forbidden) {
      assert.ok(!pattern.test(text), `${file} matches forbidden pattern ${pattern}`);
    }
  }
});

test('TDD_npm dependencies stay empty — third-party code is vendored only (ED-4)', async () => {
  const pkg = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));
  assert.deepEqual(pkg.dependencies ?? {}, {});
});

test('TDD_every vendored file is version-pinned and credited in LICENSE.md (ED-4)', async () => {
  const license = await readFile(path.join(projectRoot, 'LICENSE.md'), 'utf8');
  for (const dir of ['vendor', 'fonts']) {
    for (const name of await readdir(path.join(projectRoot, dir))) {
      assert.ok(license.includes(`${dir}/${name}`),
        `${dir}/${name} is not credited in LICENSE.md`);
    }
  }
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
