# TODO

## MVP build plan (README.md is the spec)
Feature slices 1–9 are complete (2026-07-03): the full README feature set is
built, TDD_-tested, and browser-verified — see the git history for each slice.
Layout/design tweaks so far: compact two-column editing workspace, proportional
rows/columns linking, packed swatch palette; (2026-07-04) HSB sliders, gradient
scales on all adjuster slider tracks with live mid-drag repaint, and side-by-side
nearest-neighbor comparison chips. (2026-07-05) default maximum colors raised to 64
(auto-capped to the image's own colors), and palette color locking (ED-14): a locked
color can't be deleted, altered, or merged, survives a count decrease, and shows a
lock icon on its swatches and neighbor comparisons. Export true-symbol set grown to
79 distinctiveness-ordered monochrome marks — geometric shapes, the four card suits
(♠ ♣ ♥ ♦), distinctive punctuation (# @ % & § ¶ £ ¥ $), and distinctive Greek letters
(Γ Ξ Π Σ Φ Ψ Ω α β δ ζ λ; Latin look-alikes and geometric-collision shapes excluded) —
repeated in black/dark-blue/dark-red ink tiers (237 marks) before numeric fallback (ED-9);
all verified black-by-default and cleanly recolorable in the LibreOffice/Excel family via
real-renderer checks (Google Sheets may show ♥/♦ as red emoji, an accepted tradeoff). Also
fixed a latent bug where the legend swatch's readable text color used the wrong
write-excel-file property (`color` → `textColor`). The pattern sheet is now laid out as a
standard fiber-arts chart (ED-15): dual row/column headings (merged group index + absolute
number), a heavy black frame around the data block, a thin grid with medium group lines
(extended through the heading strips too), and square cells — verified end-to-end through
the real write-excel-file writer. True symbols are now the default export symbol type
(was numeric). Dropped ✴ (U+2734) from the symbol set — it is in the Unicode emoji set and
rendered as a color glyph in LibreOffice — replacing it with the non-emoji sunburst ✸ (U+2738).
Added the nine solar-system symbols (☿ ♀ ♁ ♂ ♃ ♄ ♅ ♆ ♇; all verified mono in LibreOffice),
dropping the circled-plus ⊕ in favor of Earth ♁ since the two look alike; set is now 86 marks
(258 across the three ink tiers before numeric fallback), ED-9.

Remaining:

10. Deployment to squaresville.k4-713.com (and documented rollback path)
    — deployed 2026-07-07; rollback = restore previous files (ED-4), rsync recipe
    in the websites repo's DROPLET_SETUP.md.

## Site graphics — for Katie (specs; the discoverability tags are already wired)

- **Link-preview image (og:image).** PNG or JPG, **1200×630** (the standard OG
  ratio; anything ≥600×315 works — nudgery ships fine at 1024×500), no
  transparency, keep it under ~300 KB. A photogenic sample pattern next to its
  source image would be the natural art. Drop it at `assets/social/og-image.png`,
  then add to `index.html` `<head>`:
  `<meta property="og:image" content="https://squaresville.k4-713.com/assets/social/og-image.png">`
  and change `twitter:card` from `summary` to `summary_large_image`.
- **Favicon set.** Full recipe in the websites repo's `FAVICON_REFERENCE.md`
  (dimensions, flattening, head tags). Short version: `favicon.ico` multi-res
  16/32/48 at the **site root**; `favicon.svg` cropped tight to the artwork;
  `apple-touch-icon.png` 180×180 **flat, no alpha** (iOS rounds its own corners);
  optional 32×32/16×16 PNGs. Until these exist, `/favicon.ico` 404s in the logs.

## Code-review follow-ups (2026-07-05, export ED-9/ED-15 work in 6bc0cc6)
`/code-review` found no correctness bugs (two independent correctness passes plus
edge-case execution). Outstanding quality/doc items, most-valuable first:

Cheap fixes (close real gaps):
- **Square-cell test is tautological** (`test/TDD_pattern_export.test.js`, "sized to
  read square"): it imports `PATTERN_ROW_HEIGHT` and asserts cells equal that same
  constant, so a broken derivation (e.g. cells becoming 2:1) still passes. Assert
  squareness independently — `PATTERN_ROW_HEIGHT` (points) ≈ `PATTERN_COLUMN_WIDTH`
  (px→points) within a tolerance.
- **Module docstring stale** (`src/pattern/export.js` lines 1–6): describes only the
  old "cell-for-cell / alternating backgrounds / legend" and omits the ED-15 layout
  (dual headings, framed grid, square cells). Update per "keep code comments current".
- **This changelog entry is internally stale**: the MVP paragraph above says the set
  "grown to 79 … (237 marks)" and later "set is now 86 marks (258)". Reconcile to the
  current 86/258.
- **No test guards the ✴→✸ emoji swap**: add a cheap assertion (✴ U+2734 absent, ✸
  U+2738 present) to the black-tier presence test so the emoji glyph can't creep back.

Optional refactors (code is correct + verified; maintainability only):
- **Edge-weight rule duplicated** (`export.js`): `leadingEdgeStyle`/`trailingEdgeStyle`
  vs `headerLeadingStyle`/`headerTrailingStyle` differ only in the outer weight (thick
  vs thin), and the merged group-header cells re-implement the same rule inline.
  Collapse to two helpers taking an `outerStyle` param, called everywhere.
- **`BORDER_COLOR` repeated ~20×** across five cell shapes: a small `borders({...})`
  helper would centralize the color and per-edge properties.
- **The four heading-cell builders are axis-transposed copies** (~40 lines in
  `buildWorkbook`): factorable, though the row/col transposition makes a shared helper
  a little awkward (lower ROI).
- **`height` set on every N×M data cell** though the writer takes the row max: one cell
  per row suffices (minor; setting it everywhere is also defensibly robust).

Noted, not acting:
- **`index.html` symbol-type default flip is untested**: consistent with the other
  selects (`vivid`, `nearest`) that pin defaults via `selected` with no test, and there
  is no DOM test harness (adding one needs a new dep — see "Automated browser tests").

## Decided, not yet built (2026-07-03)
- **Measurement units:** offer inches, centimeters, and millimeters. Inches and cm
  exist; add millimeters to the units select.
- **"What kind of item":** should drive (a) sensible parameter defaults per craft
  (e.g. cross-stitch: small squares, higher counts; quilt: larger squares, fewer
  colors) and (b) UI terminology ("stitches" / "tiles" / "squares"). Both still
  fully editable by the user. Needs its own slice after the MVP list above.

## Future ideas (explicitly not MVP)
- **Automated browser tests:** UI-level behaviors and the DESIGN.md layout /
  accessibility commitments are verified per-change with ad-hoc headless-Chrome
  harnesses; a permanent browser test suite (e.g. Playwright) would make those
  regression-proof. (Engine behavior is fully covered by the node:test suite.)
- **Resume helper:** a saved pattern image re-uploads at zoom-scaled pixel
  dimensions (e.g. 12×12 pattern at zoom 9 = 108×108 file), so the user must
  re-enter the original rows/columns. Detecting the uniform square grid in an
  upload and suggesting the right rows/cols would make resuming one click.
- **Printable PDF pattern export:** PDFs can embed the Delius font, so the printed
  pattern could carry the full Squaresville look (unlike .xlsx).
- **Craft-specific blended colors:** colors halfway between two palette/material
  colors, produced differently per craft — e.g. cross-stitch commonly twists two
  differently-colored threads together to get a blended color.

## Open questions for the user
- (none right now)
