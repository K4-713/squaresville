# Engineering Decisions

Binding, non-user-facing decisions the implementation must adhere to. Each decision
is covered by a `TDD_` test that cites its `ED-<n>` id. Violating one of these is a bug.

## ED-1: All image processing is client-side only
Uploaded images and all data derived from them (pattern images, palettes, generated
spreadsheets) are processed entirely in the user's browser. No image data or derived
pattern data is ever transmitted to any server or third party. The pattern engine
must make no network calls of any kind.

Rationale: uploaded images are frequently personal photos (PII). Never transmitting
them is the strongest available protection and eliminates server-side data handling
entirely.

## ED-2: Canonical color format is uppercase #RRGGBB hex
Everywhere a color is represented as a string (palette entries, legend, detail pane),
the canonical form is a 24-bit uppercase hex string of the form `#RRGGBB`. Conversion
helpers must produce this form, and parsers must accept it.

Rationale: one unambiguous format prevents palette-matching bugs (e.g. `#fff` vs
`#FFFFFF` treated as different colors) and matches what users see in the UI.

## ED-3: Patterns are stored as an indexed-color model
A generated pattern is a palette plus a grid of palette indices:
`{ cols, rows, palette: [hex...], indices: [i...] }` where `indices.length === cols * rows`,
every index is a valid integer position in `palette`, and `palette` contains no
duplicate colors. All pattern operations (recolor, delete, merge, export) operate on
this model, never on raw RGBA pixels.

Rationale: palette editing, symbol assignment, and square counting all require exact
color identity; an indexed model makes those operations exact and cheap.

## ED-4: The app ships as self-contained static files
The production app is plain static files (HTML/CSS/JS) with no build or compile step,
no third-party runtime dependencies, and no references to external origins (no CDN
scripts, fonts, analytics, or remote assets). Deploy is copying the files; rollback is
restoring the previous files.

Rationale: easy deploy/rollback (project guideline), no supply-chain exposure in
production code, and works with ED-1 (nothing external to call).

## ED-5: Transparent source pixels composite over white
When an uploaded image has transparency, each pixel is composited over a white
background before resampling and quantization, as if the image were printed on
white fabric/paper. Fully transparent regions therefore become white squares.

Rationale: physical patterns have no transparency; white is the least surprising
substitute and keeps results deterministic across images with alpha channels.

## ED-6: Fine-tuning regenerates from the original source pixels
Any regeneration triggered by fine-tuning parameters (e.g. changing the target
number of colors) re-runs the pipeline from the original uploaded image's pixels,
which are kept in memory for the life of the editing session. Regeneration never
re-quantizes the current pattern. Consequence: lowering the color count and then
raising it again restores color detail rather than staying degraded.

Rationale: quantization is lossy; chaining regenerations off the pattern would
compound the loss and make fine-tuning controls feel broken (a one-way ratchet).
