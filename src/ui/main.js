// DOM wiring for the Squaresville flow (README.md "How to use Squaresville" and
// "Fine-tuning your Squaresville pattern"): upload -> parameter form (rows/cols
// default to the image's pixel dimensions) -> side-by-side original + pattern
// preview, dimensions/square stats, palette, and fine-tuning controls that
// regenerate automatically. All state lives in the session (src/pattern/session.js);
// all processing happens in this browser tab — nothing is uploaded anywhere (ED-1).

import { patternToRgba } from '../pattern/pattern.js';
import { createSession } from '../pattern/session.js';
import { log } from './log.js';

const el = (id) => document.getElementById(id);

const session = createSession();
let originalImageUrl = null; // object URL for the uploaded file's preview

function showStatus(message) {
  el('status-message').textContent = message;
}

/** Decode an uploaded file into raw RGBA pixels via an offscreen canvas. */
async function decodeImageFile(file) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  context.drawImage(bitmap, 0, 0);
  const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close();
  return { rgba: data, width: canvas.width, height: canvas.height };
}

async function handleUpload(file) {
  if (!file) return;
  try {
    const decoded = await decodeImageFile(file);
    session.loadSource(decoded);
    if (originalImageUrl) URL.revokeObjectURL(originalImageUrl);
    originalImageUrl = URL.createObjectURL(file);

    // README: rows/columns default to the image's original dimensions in pixels.
    el('pattern-cols').value = decoded.width;
    el('pattern-rows').value = decoded.height;
    el('original-image').src = originalImageUrl;
    el('parameters-section').hidden = false;
    el('results-section').hidden = true; // a new upload starts a fresh session
    showStatus(`Image loaded (${decoded.width} × ${decoded.height} pixels). Choose your pattern settings.`);
    log.info('image uploaded', { width: decoded.width, height: decoded.height, type: file.type });
  } catch (error) {
    showStatus('That file could not be read as an image. Please try a different file.');
    log.warn('image decode failed', error);
  }
}

/** Render the pattern at the current zoom into the preview <img> (right-click saveable). */
function renderPatternPreview(pattern) {
  const zoom = Math.max(1, parseInt(el('zoom-factor').value, 10) || 1);
  const { rgba, width, height } = patternToRgba(pattern);

  const base = document.createElement('canvas');
  base.width = width;
  base.height = height;
  base.getContext('2d').putImageData(new ImageData(rgba, width, height), 0, 0);

  const scaled = document.createElement('canvas');
  scaled.width = width * zoom;
  scaled.height = height * zoom;
  const context = scaled.getContext('2d');
  context.imageSmoothingEnabled = false; // keep squares crisp and colors exact
  context.drawImage(base, 0, 0, scaled.width, scaled.height);
  el('pattern-image').src = scaled.toDataURL('image/png');
}

function renderPalette(pattern) {
  const list = el('palette-list');
  list.replaceChildren();
  pattern.palette.forEach((hex, i) => {
    const item = document.createElement('li');
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = hex;
    const label = document.createElement('span');
    const count = pattern.counts[i];
    label.textContent = `${hex} — ${count} ${count === 1 ? 'square' : 'squares'}`;
    item.append(swatch, label);
    list.append(item);
  });
}

function renderStats(pattern) {
  const { width, height, units, totalSquares } = pattern.dimensions;
  el('pattern-stats').textContent =
    `Finished size: ${width} × ${height} ${units} • ${totalSquares} total squares • ` +
    `${pattern.palette.length} colors`;
}

function renderResults(pattern) {
  renderStats(pattern);
  renderPalette(pattern);
  renderPatternPreview(pattern);
  el('results-section').hidden = false;
}

function handleGenerate(event) {
  event.preventDefault();
  if (!session.source) {
    showStatus('Upload an image first.');
    return;
  }
  try {
    const pattern = session.generate({
      cols: parseInt(el('pattern-cols').value, 10),
      rows: parseInt(el('pattern-rows').value, 10),
      squareSize: parseFloat(el('square-size').value),
      units: el('units').value,
      maxColors: parseInt(el('max-colors').value, 10),
      itemType: el('item-type').value,
    });
    el('target-colors').value = pattern.palette.length;
    renderResults(pattern);
    showStatus('');
    log.info('pattern generated', {
      cols: pattern.cols, rows: pattern.rows, colors: pattern.palette.length,
    });
  } catch (error) {
    showStatus(`Could not generate the pattern: ${error.message}`);
    log.warn('pattern generation failed', error);
  }
}

// README "Adjust Number of Colors": changing the target regenerates automatically.
function handleTargetColors() {
  if (!session.pattern) return;
  try {
    const pattern = session.setTargetColors(parseInt(el('target-colors').value, 10));
    renderResults(pattern);
    showStatus('');
    log.info('target colors adjusted', {
      target: el('target-colors').value, colors: pattern.palette.length,
    });
  } catch (error) {
    showStatus(`Could not adjust the colors: ${error.message}`);
    log.warn('color adjustment failed', error);
  }
}

el('image-upload').addEventListener('change', (e) => handleUpload(e.target.files[0]));
el('parameters-form').addEventListener('submit', handleGenerate);
el('target-colors').addEventListener('change', handleTargetColors);
el('zoom-factor').addEventListener('change', () => {
  if (session.pattern) renderPatternPreview(session.pattern);
});
log.debug('squaresville ui initialized');
