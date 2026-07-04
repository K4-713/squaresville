# Architecture

Descriptive notes on how the current code is built. Unlike ENGINEERING_DECISIONS.md,
nothing here is a commitment — it can change without breaking a promise.

## Overview
Squaresville is a static, fully client-side web app (see ED-1, ED-4). There is no
server component and no build step: the files in this repository are the deployable
artifact.

```
index.html          Entry page: upload control, parameter form, results layout
styles.css          All styling; design tokens per DESIGN.md live in :root
LICENSE.md          Project license + third-party attribution (fonts, libraries)
fonts/              Vendored web fonts (Patrick Hand, OFL) — never CDN-loaded
src/
  pattern/          Pure pattern engine — no DOM, no I/O, plain data in/out
    color.js        Hex/RGB conversion, color distance
    dimensions.js   Real-world size and square-count math
    resample.js     Downsamples RGBA pixels to the pattern grid (box average)
    quantize.js     Median-cut palette generation + nearest-color mapping
    pattern.js      Orchestrates the above into the indexed pattern model (ED-3);
                    also nearest-neighbor lookup for the color detail pane
    session.js      Editing-session state: source pixels, params, current pattern;
                    parameter changes regenerate from the source (ED-6), palette
                    edits act on the indexed model and merge duplicates (ED-7)
  ui/
    main.js         DOM wiring: file upload, form, preview rendering, palette list
    log.js          Leveled logger; level is a localStorage setting, not code
test/
  TDD_*.test.js     Documentation-driven tests (node:test runner, zero deps)
```

## Pattern engine
The engine under `src/pattern/` is deliberately pure: every function takes plain
data (typed arrays, numbers, objects) and returns plain data. This keeps the entire
pipeline testable in Node without a browser or DOM mocks.

Pipeline for base pattern generation:
1. `resample.js` box-averages the source RGBA pixels into one RGBA value per
   pattern square (cols × rows). Transparent pixels are composited over white first.
2. `quantize.js` builds a palette of at most `maxColors` colors using median-cut,
   then maps every square to its nearest palette color (Euclidean RGB distance).
3. `pattern.js` assembles the indexed pattern model (ED-3), drops unused palette
   entries, and computes per-color square counts and real-world dimensions.

## UI layer
`src/ui/main.js` is a thin layer over the engine: it decodes the uploaded file via
`createImageBitmap` + an offscreen canvas to get RGBA pixels, drives the editing
session, and renders the result — scaled by the zoom factor with image smoothing
off — into an `<img>` (as a PNG data URL) so right-click → "Save image as" works
everywhere. All state lives in the session object from `src/pattern/session.js`
(plus an object URL for the original-image preview); the engine never touches the
DOM. Fine-tuning controls (target color count, the color detail pane's adjuster)
call session methods and re-render. The detail pane's RGB/CMYK sliders convert via
color.js; the selection pulse is a second absolutely-positioned <img> overlaying
the preview — white where the selected color's squares are — faded in and out once
by a CSS animation (shortened under prefers-reduced-motion).

## Runtime and tooling
- Browser: evergreen browsers with ES modules; no transpilation.
- Node 24 LTS (pinned in `.nvmrc`) for tests only, using the built-in `node:test`
  runner and `node:assert` — no test-framework dependency.
- `npm test` runs everything under `test/`.
