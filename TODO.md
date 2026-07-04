# TODO

## MVP build plan (README.md is the spec)
The MVP is being built in slices. Current slice in **bold**.

1. ~~Core flow: upload → parameters → base pattern + palette + dimensions (README "How to use Squaresville")~~ ✅ done (includes a basic zoom control; browser-verified end-to-end)
2. **Fine-tuning: adjust number of colors with automatic regeneration**
3. Fine-tuning: color detail pane (swatch, hex, counts, nearest neighbors, color adjuster)
4. Fine-tuning: delete a color; merge colors (A->B, A<-B, Average)
5. Fine-tuning: palette sorting (standard color sorts + by frequency), selection survives sort
6. Fine-tuning: conversion styles (dithering, diffusion, nearest color)
7. Fine-tuning: undo (10 recent actions), zoom factor, pulse-highlight of selected color
8. Saving: right-click-saveable pattern image that survives re-upload round-trip
9. Final export: "Generate Pattern" → tabbed spreadsheet (pattern grid + color legend, symbols, row/column groups)
10. Deployment to squaresville.k4-713.com (and documented rollback path)

## Open questions for the user
- **Measurement units:** README says the user picks units but not which are offered.
  Currently implementing inches and centimeters — confirm or extend.
- **"What kind of item" (quilt / cross-stitch / mosaic / other):** README collects this
  but doesn't say what it changes. Currently stored with the project only. Should it
  affect defaults (square size, units), terminology, or nothing yet?
- **Spreadsheet file format** for the final export (README "tabbed spreadsheet"):
  .xlsx is the likely candidate but needs a decision — writing it dependency-free vs.
  introducing a library (see dependency rules).
- **DESIGN.md** needs the user's visual/UX direction (see placeholder there).
