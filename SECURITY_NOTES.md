# Security Notes

Working threat-model notes for protecting sensitive user data. Exploratory, not
binding — decisions graduate to ENGINEERING_DECISIONS.md / README.md / DESIGN.md
when actually chosen.

## Sensitive data in play
- **Uploaded images.** Frequently personal photos: faces, children, homes,
  identifiable places. Treat every uploaded image as PII.
- **Derived data.** Pattern images, palettes, and generated spreadsheets are
  derived from the upload and can reconstruct it (a pattern at original pixel
  dimensions *is* the image). Same sensitivity as the upload.

## Current posture
- Graduated to **ED-1**: all processing is client-side; image data never leaves
  the machine. There is no server to breach and nothing to retain.
- Graduated to **ED-4**: no external origins in production code — no CDN, fonts,
  or analytics that could observe usage or exfiltrate data via a compromised
  third party.

## Open considerations
- **Decoder attack surface.** Image parsing is delegated to the browser
  (`createImageBitmap`), not custom code — keep it that way; hand-rolled decoders
  would add attack surface for malicious image files.
- **Future persistence.** If we ever add "save project" via localStorage/IndexedDB,
  note that image data would then persist on shared machines; consider making
  persistence opt-in and easy to clear.
- **Future sharing/hosting features.** Any feature that uploads patterns to a
  server invalidates the ED-1 posture and needs a fresh threat model first.
- **Spreadsheet generation.** Keep it client-side (in scope of ED-1). Generated
  files contain the full pattern — same sensitivity as the image.
