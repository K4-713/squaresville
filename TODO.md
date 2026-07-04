# TODO

## MVP build plan (README.md is the spec)
Feature slices 1–9 are complete (2026-07-03): the full README feature set is
built, TDD_-tested, and browser-verified — see the git history for each slice.
Layout/design tweaks so far: compact two-column editing workspace, proportional
rows/columns linking, packed swatch palette; (2026-07-04) HSB sliders, gradient
scales on all adjuster slider tracks with live mid-drag repaint, and side-by-side
nearest-neighbor comparison chips.

Remaining:

10. Deployment to squaresville.k4-713.com (and documented rollback path)

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
