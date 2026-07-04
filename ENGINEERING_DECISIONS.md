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
The production app is plain static files (HTML/CSS/JS) with no build or compile step
and no references to external origins (no CDN scripts, fonts, analytics, or remote
assets). Third-party code is permitted **only** as vendored, version-pinned static
files under `vendor/` (or `fonts/` for typefaces), each credited in LICENSE.md; npm
`dependencies` stay empty. Deploy is copying the files; rollback is restoring the
previous files.

Rationale: easy deploy/rollback (project guideline), a fully-auditable pinned
supply chain, and works with ED-1 (nothing external to call at runtime).
(Amended 2026-07-03: originally "no third-party runtime dependencies at all";
relaxed to admit the vendored spreadsheet library chosen for the final export.)

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

## ED-7: Palette edits preserve the indexed model; identical colors merge
Palette edits (changing a color's value, and later delete/merge operations) act
directly on the indexed pattern model — they never trigger regeneration from the
source. Every edit must uphold the ED-3 invariants; in particular, if an edit
would give two palette entries the same color, the entries are merged into one
(indices remapped, square counts summed) so the palette never contains duplicates.

Rationale: a palette with two identical colors is meaningless in a physical
pattern (same fabric/thread/tile) and would break symbol assignment at export.

## ED-8: Conversion style algorithms and default
The README's three image conversion styles are implemented as, and remain:
- **nearest color** — each square maps to the palette color with the smallest
  Euclidean RGB distance. This is the default style.
- **dithering** — ordered dithering with the standard 4×4 Bayer threshold matrix
  applied per channel before the nearest-color lookup.
- **diffusion** — Floyd–Steinberg error diffusion in left-to-right, top-to-bottom
  scan order with the standard 7/16, 3/16, 5/16, 1/16 weights.

The conversion style is a generation parameter: changing it regenerates from the
original source pixels (ED-6), and all three styles are deterministic — the same
inputs always produce the same pattern.

Rationale: these are the canonical, well-understood algorithms for each style;
determinism keeps patterns reproducible and the round-trip promise intact.

## ED-9: Export symbol assignment
Symbols are assigned to palette colors in palette order, deterministically.
"Numeric" symbols are 1-based integers rendered as strings ("1", "2", …).
"True symbols" come from a fixed, ordered set of Unicode geometric shapes chosen
to render in stock spreadsheet fonts (no symbol fonts like Wingdings — see the
portability decision in TODO slice 9); if the palette is larger than the symbol
set, the overflow entries fall back to numeric symbols. Within one export every
color's symbol is unique. Spreadsheet cells never name a custom font — .xlsx
cannot embed fonts, so styling sticks to universally-available defaults.

Rationale: deterministic, collision-free symbols keep the printed pattern and
legend trustworthy; Unicode geometric shapes survive Excel, LibreOffice, and
Google Sheets alike.

## ED-10: A pattern always retains at least one palette color
Operations that would leave the palette empty are refused (currently: deleting
the last remaining color). The indexed model (ED-3) is never valid with zero
colors — every square must reference a palette entry.

Rationale: an empty palette has no meaning for a physical pattern and would
break every downstream operation (rendering, counts, export).

## ED-11: Palette selection strategies; Vivid is the default
When an image has more distinct colors than the requested maximum, the palette is
built by one of two selection strategies, chosen as a generation parameter
(changing it regenerates from the source per ED-6):

- **balanced** — population-weighted median cut: repeatedly split the box holding
  the most squares, and represent each box by its population-weighted average.
  Faithful to the areas of the image (good for photographic subjects). This is the
  original algorithm.
- **vivid** (default) — a saturation-weighted median cut that preserves vivid,
  high-contrast accent colors even when they cover few squares. Each color is
  weighted by `count × (1 + K·saturation)`; boxes are split in order of
  `(total weight × color spread)` so a saturated cluster separates into its own box
  instead of being averaged away; and each box is represented by its
  saturation-weighted average.

Both strategies are deterministic — identical inputs always yield the identical
palette. Vivid is the default because Squaresville targets physical artwork
(quilts, cross-stitch, mosaics), where the striking colors of a design should
survive drastic palette reduction rather than being muddied into duller tones.

Rationale: a plain population median cut spends its palette on large flat regions
and averages rare vivid accents into grey; weighting by saturation and splitting by
color spread keeps a design's bold colors, which is what physical-craft users want.
