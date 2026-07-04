# TODO

## MVP build plan (README.md is the spec)
The MVP is being built in slices. Current slice in **bold**.

1. ~~Core flow: upload → parameters → base pattern + palette + dimensions (README "How to use Squaresville")~~ ✅ done (includes a basic zoom control; browser-verified end-to-end)
2. ~~Fine-tuning: adjust number of colors with automatic regeneration~~ ✅ done (session module + ED-6; browser-verified)
3. ~~Fine-tuning: color detail pane (swatch, hex, counts, nearest neighbors, color adjuster)~~ ✅ done (includes the pulse-highlight on selection from README; ED-7; browser-verified)
4. ~~Fine-tuning: delete a color; merge colors (A->B, A<-B, Average)~~ ✅ done (all reduce to the ED-7 changeColor machinery; browser-verified)
5. **Fine-tuning: palette sorting (standard color sorts + by frequency), selection survives sort**
6. Fine-tuning: conversion styles (dithering, diffusion, nearest color)
7. Fine-tuning: undo (10 recent actions against palette, dimensions, conversion style)
8. Saving: right-click-saveable pattern image that survives re-upload round-trip
9. Final export: "Generate Pattern" → tabbed .xlsx spreadsheet (pattern grid + color
   legend, symbols, row/column groups). **Decided 2026-07-03:** use `write-excel-file`
   (actively maintained, MIT, single small dep `fflate`), vendored as a static browser
   bundle so ED-4's no-build/no-CDN posture holds; amend ED-4 + its TDD test, credit
   both libraries in LICENSE.md, and go through the `dependency-change` skill when
   this slice starts. (ExcelJS rejected: unmaintained since 2023. SheetJS rejected:
   no cell styling in the free edition.) Cell fonts must be widely-installed ones
   (e.g. Calibri/Arial) — .xlsx cannot embed fonts, so Delius would not travel.
   "True symbols" should be Unicode geometric shapes that render in default fonts,
   not symbol fonts like Wingdings (decided 2026-07-03).
10. Deployment to squaresville.k4-713.com (and documented rollback path)

## Decided, not yet built (2026-07-03)
- **Measurement units:** offer inches, centimeters, and millimeters. Inches and cm
  exist; add millimeters to the units select.
- **"What kind of item":** should drive (a) sensible parameter defaults per craft
  (e.g. cross-stitch: small squares, higher counts; quilt: larger squares, fewer
  colors) and (b) UI terminology ("stitches" / "tiles" / "squares"). Both still
  fully editable by the user. Needs its own slice after the MVP list above.

## Future ideas (explicitly not MVP)
- **Printable PDF pattern export:** PDFs can embed the Delius font, so the printed
  pattern could carry the full Squaresville look (unlike .xlsx).
- **Craft-specific blended colors:** colors halfway between two palette/material
  colors, produced differently per craft — e.g. cross-stitch commonly twists two
  differently-colored threads together to get a blended color.

## Open questions for the user
- (none right now)
