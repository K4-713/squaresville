// DESIGN.md "Accessibility (binding)": WCAG AA contrast (>= 4.5:1) for all text
// token/background pairings, robin-egg blue (--stitch) never used as text, and the
// hand font (Delius) vendored locally (never a CDN — see also ED-4 and LICENSE.md).
// Also the stylesheet-level commitments of DESIGN.md "Adjuster slider tracks" and
// "Nearest-neighbor comparison chips".
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hexToRgb } from '../src/pattern/color.js';

const projectRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const stylesheet = await readFile(path.join(projectRoot, 'styles.css'), 'utf8');

function designToken(name) {
  const match = stylesheet.match(new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`));
  assert.ok(match, `styles.css must define ${name} as a 6-digit hex token`);
  return match[1];
}

/** WCAG 2.x relative luminance of a #RRGGBB color. */
function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const [lr, lg, lb] = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** WCAG contrast ratio between two #RRGGBB colors. */
function contrastRatio(hexA, hexB) {
  const [lighter, darker] = [relativeLuminance(hexA), relativeLuminance(hexB)]
    .sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

test('TDD_all DESIGN.md text/background token pairings meet WCAG AA 4.5:1', () => {
  const ink = designToken('--ink');
  const paper = designToken('--paper');
  const stitch = designToken('--stitch');
  const patternPaper = designToken('--pattern-paper');
  const patternLine = designToken('--pattern-line');

  // Every pairing DESIGN.md permits for text:
  const pairings = [
    ['--ink on --paper', ink, paper],
    ['--ink on --pattern-paper', ink, patternPaper],
    ['--ink on --stitch (button text)', ink, stitch],
    ['--pattern-line on --paper', patternLine, paper],
    ['--pattern-line on --pattern-paper', patternLine, patternPaper],
  ];
  for (const [label, fg, bg] of pairings) {
    const ratio = contrastRatio(fg, bg);
    assert.ok(ratio >= 4.5, `${label} is ${ratio.toFixed(2)}:1, below WCAG AA 4.5:1`);
  }
});

test('TDD_robin-egg blue is never used as a text color (DESIGN.md)', () => {
  assert.ok(!/(^|[^-])color:\s*var\(--stitch\)/m.test(stylesheet),
    'styles.css sets color: var(--stitch), but --stitch is borders/accents only');
});

test('TDD_the hand font is vendored locally, never fetched externally (DESIGN.md, ED-4)', async () => {
  const fontFace = stylesheet.match(/@font-face\s*{[^}]+}/)?.[0];
  assert.ok(fontFace, 'styles.css must declare the hand font @font-face');
  const src = fontFace.match(/url\(['"]?([^'")]+)['"]?\)/)[1];
  assert.ok(!/^[a-z]+:|^\/\//i.test(src), `font src must be a relative path, got ${src}`);
  const fontFile = await stat(path.join(projectRoot, src));
  assert.ok(fontFile.size > 0, 'vendored font file is missing or empty');
});

test('TDD_vendored font is credited in LICENSE.md (dependency rule)', async () => {
  const license = await readFile(path.join(projectRoot, 'LICENSE.md'), 'utf8');
  assert.match(license, /Delius/);
  assert.match(license, /Open Font License/);
});

test('TDD_adjuster slider tracks are painted from the gradient property (DESIGN.md)', () => {
  // DESIGN.md "Adjuster slider tracks": the track itself is the gradient scale,
  // fed per-slider through --track-gradient (see src/ui/adjusterGradients.js for
  // the tested stop math and TDD_adjuster_gradients.test.js).
  const sliderRule = stylesheet.match(/\.slider-group input\[type="range"\]\s*{[^}]+}/)?.[0];
  assert.ok(sliderRule, 'styles.css must style the slider-group range inputs');
  assert.match(sliderRule, /background:\s*var\(--track-gradient/,
    'range tracks must paint from --track-gradient');
  assert.match(sliderRule, /appearance:\s*none/,
    'native track chrome must be removed so the gradient scale shows');
});

test('TDD_neighbor comparison swatches touch with no divider (DESIGN.md)', () => {
  // DESIGN.md "Nearest-neighbor comparison chips": the two swatches meet flush so
  // the color difference reads at the shared edge.
  const pairRule = stylesheet.match(/\.compare-pair\s*{[^}]+}/)?.[0];
  assert.ok(pairRule, 'styles.css must define the .compare-pair comparison block');
  assert.match(pairRule, /display:\s*flex/);
  assert.match(pairRule, /overflow:\s*hidden/,
    'halves must meet flush inside the rounded border');
  const halfRule = stylesheet.match(/\.compare-half\s*{[^}]+}/)?.[0];
  assert.ok(halfRule, 'styles.css must define the .compare-half swatches');
  assert.ok(!/border/.test(halfRule), 'no divider may separate the two swatches');
});
