# Design Brief

## Direction (decided 2026-07-03)
Minimal, warm, and crafty. The UI should feel like a well-made sewing table: quiet
and precise, with small handmade touches — never busy. The user's image, pattern,
and palette are the color on screen; the chrome stays warm-neutral so it can't bias
color judgments while editing.

## Palette
Defined once as CSS custom properties in `styles.css` (no magic values in rules):

| Token           | Role                                              | Value     |
|-----------------|---------------------------------------------------|-----------|
| `--paper`       | Page background: light warm off-white             | `#FAF6EF` |
| `--ink`         | All primary text: warm near-black ink             | `#2E2A24` |
| `--stitch`      | Robin-egg blue: dashed "basting stitch" borders   | `#89CFC9` |
| `--pattern-paper` | Khaki panel fill, like old-school pattern tissue | `#E9DFC4` |
| `--pattern-line`  | Darker khaki for captions/secondary text         | `#69603F` |

Rules of use:
- Robin-egg blue is for **borders and accents only, never text** (insufficient
  contrast as text). Section separators are **long-dashed** lines in `--stitch`,
  evoking easily-removable test stitching (basting).
- Khaki `--pattern-paper` is a background fill for panels/asides; text on it is
  always `--ink`. `--pattern-line` is the only khaki usable as text, and only on
  `--paper` or `--pattern-paper` backgrounds.
- Swatches and the pattern preview sit on plain `--paper` with thin `--ink`-tone
  hairlines — no colored chrome adjacent to color-editing surfaces.

## Typography
- Primary face: **Delius** (OFL, vendored locally in `fonts/` — never loaded from a
  CDN, per ED-4). Rounded, airy, highly readable hand-print; used for headings,
  labels, buttons, and prose. Chosen over Patrick Hand, which felt cramped
  (2026-07-03).
- Hex codes, counts, and other data readouts use the system monospace stack —
  precision data should read as data.
- Fallback stack degrades to system fonts if the font file fails to load.

## Palette display (decided 2026-07-03)
The palette is a **packed area of plain swatches** — no inline text. Additional
information (hex code, square count) appears only on mouseover (tooltip) or on
click, which selects the color and fills the color detail area. Selection is shown
with a solid ink outline. Each swatch is a real button whose accessible name is
its hex code and square count, so the "swatch only" look never applies to screen
readers or keyboard users.

## Accessibility (binding)
- WCAG AA contrast (≥ 4.5:1) for all text token/background pairings — enforced by a
  `TDD_` test that parses the tokens from `styles.css` and computes the ratios.
- All functionality keyboard-operable; form controls labeled; every palette color's
  hex code is always available as text (accessible name, tooltip, and the detail
  area when selected) — color is never the only signal.
- Focus states use a solid (not dashed) high-contrast outline.

## Nearest-neighbor comparison chips (decided 2026-07-04)
Each nearest-neighbor entry in the color detail pane is a side-by-side comparison:
two larger swatches that touch with no gap or divider — the selected color on the
left, the neighbor on the right — so the difference between the likeliest merge
candidates can be judged directly at the shared edge. The neighbor's hex code and
square count remain visible as text on the chip, and each chip is a real button
whose accessible name names both colors and the count, so the comparison is never
color-only. Clicking a chip behaves as before: it selects the neighbor, or
completes an armed merge.

## Adjuster slider tracks (decided 2026-07-04)
Every color-adjuster slider (rgb, cmyk, hsb) paints its track as a gradient scale:
each position along the track shows the exact color the selected color would become
if the thumb were dragged there, with every other channel held at its current value.
Tracks repaint whenever the selected color changes **and live during a drag**
(amended 2026-07-04): while a slider is mid-drag, every track, the hex/picker
readouts, and the *other* slider families' positions follow the in-progress color.
The dragged slider's own family keeps its positions — those values are the source
of truth until release, so a transient extreme (e.g. brightness passing through 0)
never wipes out the family's other channels mid-drag. The edit still applies to the
palette on release. The scales always demonstrate what moving each slider will
actually do — including honestly painting a flat track when a slider would change
nothing (e.g. hue on a grey). Thumbs are high-contrast (ink ring on paper) and
slider values remain visible as text, so position is never conveyed by color alone.

## Layout
- **Compact editing workspace (decided 2026-07-03):** the results view is optimized
  so the palette can be manipulated while the pattern image stays in view — no
  scrolling between them. Two-column grid: the preview pane (stats, a compact
  zoom/style/undo toolbar, the original as a small thumbnail beside the dominant
  pattern preview, and the export controls) on the left, all palette tools in a
  right-hand column. The preview pane is sticky, so it stays put while a tall
  detail pane scrolls. Below ~68rem viewport width the columns stack.
- Original image and pattern preview remain side-by-side (README requirement);
  the original shrinks to a thumbnail so the preview dominates.
- Chrome stays tight everywhere: compact headings, spacing, and controls.
- Usable on a laptop screen without horizontal scrolling.
