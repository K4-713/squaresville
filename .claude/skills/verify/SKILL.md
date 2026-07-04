---
name: verify
description: Run and drive Squaresville in headless Chrome to verify a change at the real UI surface. Use when confirming a change works in the actual app (not just the node:test suite).
---

# Verifying Squaresville changes in the real app

Squaresville is static files with ES modules — **it must be served over HTTP**
(module imports are CORS-blocked from `file://`).

## Launch

The dev box already serves the working tree (uncommitted changes included) at
**http://localhost:84** (Apache vhost, DocumentRoot /srv/squaresville) — use it.
Fall back to `python3 -m http.server <port>` from the repo root only if that
vhost is down.

```bash
google-chrome --headless=new --remote-debugging-port=9223 \
  --user-data-dir=<scratch>/chrome-profile --window-size=1500,1100 \
  --hide-scrollbars "http://localhost:84/index.html" &
```

Use `google-chrome` (the snap chromium does not work headless here). Kill
Chrome (and any fallback server) when done.

## Drive

Talk to Chrome over the DevTools protocol with a plain Node script — Node ≥21
has a built-in `WebSocket` client, so no dependencies (Node 24 via `nvm use`;
system node is EOL). Pick the target from `http://127.0.0.1:9223/json` whose
`url` matches the app URL you launched (other pages/extension targets exist). Send
`Runtime.enable`, then `Runtime.evaluate` with `awaitPromise: true,
returnByValue: true`; capture images with `Page.captureScreenshot`.

Flow to reach the editing workspace (all inside one evaluated async function):

1. **Upload without a file picker:** draw a small multicolor `<canvas>`,
   `canvas.toBlob` → `File` → `DataTransfer`, assign to
   `#image-upload.files`, dispatch `new Event('change')`. Poll until
   `#parameters-section` unhides.
2. **Generate:** form defaults are valid once rows/cols autofill —
   `#parameters-form.requestSubmit()`. Poll until `#results-section` unhides.
3. **Select a color:** `document.querySelector('.palette-swatch').click()` —
   this opens `#color-detail` with the adjuster (`adjust-<channel>` sliders,
   `#adjust-hex`, `#adjust-picker`).
4. **Edit controls:** set `.value` then dispatch `change` to apply (sliders
   preview on `input`, apply on `change`). Watch `#status-message` for errors.
5. **Screenshot:** `scrollIntoView` the element first; the detail pane lives in
   the right-hand column.

A known-good driver from a past session:
`/tmp/claude-1000/-srv-squaresville/*/scratchpad/verify-cdp.mjs` (scratchpads
are ephemeral — the flow above is the durable recipe).
