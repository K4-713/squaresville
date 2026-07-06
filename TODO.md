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

## Decided, not yet built (2026-07-03)
- **Measurement units:** offer inches, centimeters, and millimeters. Inches and cm
  exist; add millimeters to the units select.
- **"What kind of item":** should drive (a) sensible parameter defaults per craft
  (e.g. cross-stitch: small squares, higher counts; quilt: larger squares, fewer
  colors) and (b) UI terminology ("stitches" / "tiles" / "squares"). Both still
  fully editable by the user. Needs its own slice after the MVP list above.

## Future ideas (explicitly not MVP)
- **More standard symbols in the true-symbol set:** add common keyboard characters
  (@, $, &, *, etc.) to `SYMBOL_SET` (ED-9) to lengthen the black tier before ink
  colors kick in. Its own commit; keep the distinctiveness ordering and re-check
  each renders monochrome in stock spreadsheet fonts.
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
