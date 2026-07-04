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

## Accessibility (binding)
- WCAG AA contrast (≥ 4.5:1) for all text token/background pairings — enforced by a
  `TDD_` test that parses the tokens from `styles.css` and computes the ratios.
- All functionality keyboard-operable; form controls labeled; palette colors always
  paired with their hex text, never conveyed by swatch alone.
- Focus states use a solid (not dashed) high-contrast outline.

## Layout
- Original image and pattern preview side-by-side (README requirement).
- Usable on a laptop screen without horizontal scrolling.
