// DOM wiring for the Squaresville flow (README.md "How to use Squaresville" and
// "Fine-tuning your Squaresville pattern"): upload -> parameter form (rows/cols
// default to the image's pixel dimensions) -> side-by-side original + pattern
// preview, dimensions/square stats, palette, and fine-tuning controls that
// regenerate automatically. All state lives in the session (src/pattern/session.js);
// all processing happens in this browser tab — nothing is uploaded anywhere (ED-1).

import { patternToRgba, nearestNeighbors } from '../pattern/pattern.js';
import { proportionalDimension, formatFinishedSize } from '../pattern/dimensions.js';
import {
  hexToRgb, rgbToHex, rgbToCmyk, cmykToRgb, rgbToHsb, hsbToRgb,
} from '../pattern/color.js';
import { sliderGradientCss } from './adjusterGradients.js';
import { hueForVector, vectorForHue, svForPoint, pointForSv } from './colorPicker.js';
import { createSession, MERGE_STYLES } from '../pattern/session.js';
import { colorIndexAt } from '../pattern/pattern.js';
import { distinctColorCount } from '../pattern/quantize.js';
import { buildWorkbook } from '../pattern/export.js';
import { log } from './log.js';

const el = (id) => document.getElementById(id);

// How many nearest-neighbor colors the detail pane offers (README "Adjust
// Individual Palette Colors" leaves the number open; display choice, not engine).
const NEAREST_NEIGHBOR_DISPLAY_COUNT = 3;

const session = createSession();
let originalImageUrl = null;  // object URL for the uploaded file's preview
let selectedColorIndex = null; // palette index shown in the color detail area
let pendingMergeStyle = null;  // merge style while waiting for the second color

const MERGE_STYLE_LABELS = {
  [MERGE_STYLES.A_TO_B]: 'A→B',
  [MERGE_STYLES.B_TO_A]: 'A←B',
  [MERGE_STYLES.AVERAGE]: 'Average',
};

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
    // ED-12: the image's own distinct colors cap how many the palette can request.
    const imageColors = distinctColorCount(decoded.rgba);
    el('max-colors').max = imageColors;
    if (parseInt(el('max-colors').value, 10) > imageColors) el('max-colors').value = imageColors;
    el('original-image').src = originalImageUrl;
    el('parameters-section').hidden = false;
    el('results-section').hidden = true; // a new upload starts a fresh session
    showStatus(`Image loaded (${decoded.width} × ${decoded.height} pixels, ${imageColors} colors). Choose your pattern settings.`);
    log.info('image uploaded', {
      width: decoded.width, height: decoded.height, colors: imageColors, type: file.type,
    });
  } catch (error) {
    showStatus('That file could not be read as an image. Please try a different file.');
    log.warn('image decode failed', error);
  }
}

// Internal pixels-per-square for the rendered pattern PNG. Fixed and whole so a
// right-click-saved preview stays crisp and re-uploadable (TDD_save_resume); the
// on-screen size is handled by CSS, which fits the preview to its half of the pane
// (DESIGN.md "Equal side-by-side previews").
const PATTERN_RENDER_SCALE = 8;

/** Scale raw RGBA (one pixel per square) up by zoom into a PNG data URL. */
function rgbaToScaledPng(rgba, width, height, zoom) {
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
  return scaled.toDataURL('image/png');
}

/** Render the pattern into the preview <img> (CSS fits it to its half; right-click saveable). */
function renderPatternPreview(pattern) {
  const { rgba, width, height } = patternToRgba(pattern);
  el('pattern-image').src = rgbaToScaledPng(rgba, width, height, PATTERN_RENDER_SCALE);
}

/**
 * Slowly pulse the selected color's squares once in the preview (README "Adjust
 * Individual Palette Colors"): a white overlay marking those squares fades in
 * and out via the pulse-once CSS animation.
 */
function pulseSelectedColor(pattern) {
  if (selectedColorIndex === null) return;
  const { cols, rows, indices } = pattern;
  const rgba = new Uint8ClampedArray(cols * rows * 4);
  for (let i = 0; i < indices.length; i++) {
    if (indices[i] === selectedColorIndex) {
      rgba[i * 4] = 255;
      rgba[i * 4 + 1] = 255;
      rgba[i * 4 + 2] = 255;
      rgba[i * 4 + 3] = 210;
    }
  }
  const overlay = el('pattern-highlight');
  overlay.src = rgbaToScaledPng(rgba, cols, rows, PATTERN_RENDER_SCALE);
  overlay.classList.remove('pulsing');
  void overlay.offsetWidth; // restart the animation even for repeated selections
  overlay.classList.add('pulsing');
}

const colorInfoText = (pattern, i) => {
  const count = pattern.counts[i];
  return `${pattern.palette[i]} — ${count} ${count === 1 ? 'square' : 'squares'}`;
};

// README "Locking a Color": a small lock icon marks a locked color's swatches in the
// palette and in neighbor comparisons. Decorative only (aria-hidden) — the locked state
// is also carried in each swatch's accessible name.
function lockBadge() {
  const badge = document.createElement('span');
  badge.className = 'lock-badge';
  badge.setAttribute('aria-hidden', 'true');
  badge.textContent = '🔒';
  return badge;
}

function selectColor(pattern, index) {
  selectedColorIndex = index;
  renderPalette(pattern);
  renderColorDetail(pattern);
  pulseSelectedColor(pattern);
}

function updateMergeButton() {
  el('merge-color').textContent = pendingMergeStyle ? 'Cancel merge' : 'Merge Color';
}

function cancelPendingMerge() {
  pendingMergeStyle = null;
  updateMergeButton();
}

// README "Merging Colors": with a style chosen and the merge armed, the next
// color the user picks (any swatch or neighbor chip) completes the merge.
function completeMerge(secondIndex) {
  const before = session.pattern;
  const firstHex = before.palette[selectedColorIndex];
  const secondHex = before.palette[secondIndex];
  try {
    const style = pendingMergeStyle;
    const { pattern, colorIndex } = session.mergeColors(selectedColorIndex, secondIndex, style);
    cancelPendingMerge();
    selectedColorIndex = colorIndex;
    renderResults(pattern);
    showStatus(`Merged ${firstHex} and ${secondHex} (${MERGE_STYLE_LABELS[style]}) into ${pattern.palette[colorIndex]}.`);
    log.info('colors merged', { style, result: pattern.palette[colorIndex], colors: pattern.palette.length });
  } catch (error) {
    // e.g. picking the same color twice: report it and stay armed for another pick
    showStatus(`Could not merge: ${error.message}`);
    log.warn('merge failed', error);
  }
}

function handleDeleteColor() {
  if (selectedColorIndex === null) return;
  const deletedHex = session.pattern.palette[selectedColorIndex];
  try {
    const { pattern, colorIndex } = session.deleteColor(selectedColorIndex);
    cancelPendingMerge();
    selectedColorIndex = colorIndex;
    renderResults(pattern);
    pulseSelectedColor(pattern);
    showStatus(`Deleted ${deletedHex} — its squares joined ${pattern.palette[colorIndex]}.`);
    log.info('color deleted', { deletedHex, absorbedBy: pattern.palette[colorIndex] });
  } catch (error) {
    showStatus(`Could not delete the color: ${error.message}`);
    log.warn('color delete failed', error);
  }
}

// DESIGN.md "Nearest-neighbor comparison chips": each neighbor is shown as two
// touching swatches — selected color left, neighbor right — so the difference
// reads directly at the shared edge; hex + count stay visible as text.
function renderNeighbors(pattern) {
  const list = el('neighbor-list');
  list.replaceChildren();
  const selectedHex = pattern.palette[selectedColorIndex];
  const lockedSet = session.lockedColors; // README: mark locked colors in comparisons too
  const neighbors = nearestNeighbors(
    pattern, selectedColorIndex,
    Math.min(NEAREST_NEIGHBOR_DISPLAY_COUNT, Math.max(1, pattern.palette.length - 1)),
  );
  for (const neighbor of neighbors) {
    const item = document.createElement('li');
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'neighbor-chip';
    const squares = `${neighbor.count} ${neighbor.count === 1 ? 'square' : 'squares'}`;
    const neighborLocked = lockedSet.has(neighbor.hex) ? ' (locked)' : '';
    chip.setAttribute('aria-label',
      `Compare selected ${selectedHex} with ${neighbor.hex}${neighborLocked} — ${squares}`);
    const pair = document.createElement('span');
    pair.className = 'compare-pair';
    pair.setAttribute('aria-hidden', 'true');
    for (const hex of [selectedHex, neighbor.hex]) {
      const half = document.createElement('span');
      half.className = 'compare-half';
      half.style.background = hex;
      if (lockedSet.has(hex)) half.append(lockBadge());
      pair.append(half);
    }
    const label = document.createElement('span');
    label.textContent = `${neighbor.hex} — ${squares}`;
    chip.append(pair, label);
    chip.addEventListener('click', () => (
      pendingMergeStyle !== null ? completeMerge(neighbor.index) : selectColor(pattern, neighbor.index)
    ));
    item.append(chip);
    list.append(item);
  }
}

// The color wheel's live hue/saturation/brightness. It is the source of truth
// while a wheel handle is being dragged (DESIGN.md "In-pane color picker"): at an
// achromatic extreme, hue read back from the resulting hex would be lost, so the
// wheel keeps its own h/s/v and only resyncs from the hex on an external change.
let pickerHsv = { h: 0, s: 0, v: 0 };
const RING_RADIUS_FRACTION = 0.9; // handle sits in the ring band, near the edge

/** Position the wheel's two handles and tint its square from pickerHsv. */
function renderColorWheel() {
  const { h, s, v } = pickerHsv;
  const hueColor = ((c) => rgbToHex(c.r, c.g, c.b))(hsbToRgb(h, 100, 100));
  el('wheel-square').style.setProperty('--wheel-hue-color', hueColor);

  const hueVector = vectorForHue(h, RING_RADIUS_FRACTION);
  const hueHandle = el('hue-handle');
  hueHandle.style.left = `${50 + hueVector.x * 50}%`;
  hueHandle.style.top = `${50 + hueVector.y * 50}%`;
  hueHandle.setAttribute('aria-valuenow', String(Math.round(h)));

  const svPoint = pointForSv(s, v, 100);
  const svHandle = el('sv-handle');
  svHandle.style.left = `${svPoint.x}%`;
  svHandle.style.top = `${svPoint.y}%`;
  svHandle.setAttribute('aria-valuenow', String(Math.round(s)));
  svHandle.setAttribute('aria-valuetext', `saturation ${Math.round(s)}%, brightness ${Math.round(v)}%`);
}

/**
 * Fill the adjuster controls (wheel, hex, rgb/cmyk/hsb sliders) from a hex color.
 * opts.hold: sliders whose positions must not be rewritten — during a drag the
 * dragged family's values are the source of truth (DESIGN.md "Adjuster slider
 * tracks": a transient extreme like brightness 0 must not wipe out the family's
 * other channels). Their gradient tracks still repaint. opts.fromPicker: the wheel
 * is driving, so keep pickerHsv rather than resyncing it from the hex.
 */
function renderAdjuster(hex, { hold = [], fromPicker = false } = {}) {
  const { r, g, b } = hexToRgb(hex);
  el('adjust-hex').value = hex;
  const cmyk = rgbToCmyk(r, g, b);
  const hsb = rgbToHsb(r, g, b);
  if (!fromPicker) pickerHsv = { h: hsb.h, s: hsb.s, v: hsb.b };
  renderColorWheel();
  const channels = {
    r, g, b,
    c: cmyk.c, m: cmyk.m, y: cmyk.y, k: cmyk.k,
    h: hsb.h, s: hsb.s, v: hsb.b, // 'v' is HSB brightness ('b' is blue's id)
  };
  for (const [channel, value] of Object.entries(channels)) {
    const slider = el(`adjust-${channel}`);
    if (!hold.includes(channel)) {
      slider.value = Math.round(value);
      el(`adjust-${channel}-value`).textContent = Math.round(value);
    }
    // DESIGN.md "Adjuster slider tracks": paint what moving this slider would do.
    slider.style.setProperty('--track-gradient', sliderGradientCss(channel, hex));
  }
}

// README "Locking a Color": a locked color cannot be deleted or altered, so its delete
// button and the whole adjuster (hex, sliders, and the color wheel) are disabled while it
// is selected. Merging stays available, but only in the direction that keeps the locked
// color: A←B lets it claim another color's squares (it survives unchanged), while A→B
// (which would remove it) and Average (which would alter it) are disabled. The lock/unlock
// button itself always stays enabled.
const ADJUSTER_INPUT_IDS = [
  'adjust-hex',
  'adjust-r', 'adjust-g', 'adjust-b',
  'adjust-c', 'adjust-m', 'adjust-y', 'adjust-k',
  'adjust-h', 'adjust-s', 'adjust-v',
];
const mergeStyleRadio = (value) => document.querySelector(`input[name="merge-style"][value="${value}"]`);
function setDetailEditingDisabled(locked) {
  el('delete-color').disabled = locked;
  for (const id of ADJUSTER_INPUT_IDS) el(id).disabled = locked;
  el('color-wheel').classList.toggle('locked', locked);
  // Take the wheel handles out of (or back into) the tab order to match.
  for (const id of ['hue-handle', 'sv-handle']) el(id).setAttribute('tabindex', locked ? '-1' : '0');

  // Merge stays possible; a locked color can only survive an A←B merge, so restrict the
  // style choice to that when locked and leave the Merge button itself enabled.
  mergeStyleRadio(MERGE_STYLES.A_TO_B).disabled = locked;
  mergeStyleRadio(MERGE_STYLES.AVERAGE).disabled = locked;
  mergeStyleRadio(MERGE_STYLES.B_TO_A).disabled = false;
  if (locked) mergeStyleRadio(MERGE_STYLES.B_TO_A).checked = true;
  el('merge-color').disabled = false;
}

/** Fill (or hide) the color detail pane for the selected swatch. */
function renderColorDetail(pattern) {
  const detail = el('color-detail');
  if (selectedColorIndex === null || selectedColorIndex >= pattern.palette.length) {
    selectedColorIndex = null;
    setDetailEditingDisabled(false); // don't leave controls disabled behind the hidden pane
    detail.hidden = true;
    return;
  }
  const hex = pattern.palette[selectedColorIndex];
  const isLocked = session.isLocked(selectedColorIndex);
  el('detail-swatch').style.background = hex;
  el('detail-text').textContent = isLocked
    ? `${colorInfoText(pattern, selectedColorIndex)} (locked)`
    : colorInfoText(pattern, selectedColorIndex);
  renderNeighbors(pattern);
  renderAdjuster(hex);
  updateMergeButton();
  // README "Locking a Color": the button toggles label, and locked colors can't be edited.
  const lockButton = el('lock-color');
  lockButton.textContent = isLocked ? 'Unlock Color' : 'Lock Color';
  lockButton.setAttribute('aria-pressed', String(isLocked));
  setDetailEditingDisabled(isLocked);
  detail.hidden = false;
}

// README "Adjust Individual Palette Colors": apply an edit from any adjuster
// control. The session merges entries if the new color duplicates one (ED-7).
function applyColorChange(newHex) {
  if (selectedColorIndex === null) return;
  try {
    const { pattern, colorIndex } = session.changeColor(selectedColorIndex, newHex);
    selectedColorIndex = colorIndex;
    renderResults(pattern);
    showStatus('');
    log.info('palette color changed', { colorIndex, newHex, colors: pattern.palette.length });
  } catch (error) {
    showStatus(`Could not change the color: ${error.message}`);
    log.warn('color change failed', error);
  }
}

// DESIGN.md "Palette display": packed plain swatches; hex and count appear only on
// mouseover (tooltip) or click (selects and fills the detail area). Each swatch's
// accessible name carries the same info for screen readers.
function renderPalette(pattern) {
  const list = el('palette-list');
  list.replaceChildren();
  pattern.palette.forEach((hex, i) => {
    const item = document.createElement('li');
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'palette-swatch';
    swatch.style.background = hex;
    // README "Locking a Color": a lock icon marks a locked swatch; its accessible name says so.
    const isLocked = session.isLocked(i);
    const label = isLocked ? `${colorInfoText(pattern, i)} (locked)` : colorInfoText(pattern, i);
    swatch.title = label;
    swatch.setAttribute('aria-label', label);
    swatch.setAttribute('aria-pressed', String(i === selectedColorIndex));
    swatch.addEventListener('click', () => {
      if (pendingMergeStyle !== null) {
        completeMerge(i); // an armed merge captures the next color pick
      } else if (selectedColorIndex === i) {
        selectedColorIndex = null; // click again to deselect
        renderPalette(pattern);
        renderColorDetail(pattern);
      } else {
        selectColor(pattern, i);
      }
    });
    if (isLocked) { swatch.classList.add('locked'); swatch.append(lockBadge()); }
    item.append(swatch);
    list.append(item);
  });
  renderColorDetail(pattern);
}

function renderStats(pattern) {
  const { totalSquares } = pattern.dimensions;
  // ED-16: finished size in the chosen unit, plus feet-and-inches when unit is inches.
  const size = formatFinishedSize(pattern.dimensions);
  // ED-12: show the palette size and, when fewer than exist, how many are available.
  const colors = pattern.availableColors > pattern.palette.length
    ? `${pattern.palette.length} of ${pattern.availableColors} colors`
    : `${pattern.palette.length} colors`;
  el('pattern-stats').textContent =
    `Finished size: ${size} • ${totalSquares} total squares • ${colors}`;
}

function renderResults(pattern) {
  el('results-section').hidden = false;
  renderStats(pattern);
  // The number-of-colors control always shows the actual palette size, matching
  // the stats line — both derive from pattern.palette.length (README "Adjust
  // Number of Colors"). Merges/deletes shrink the palette, so this must re-sync
  // on every render, not only on regeneration.
  el('target-colors').value = pattern.palette.length;
  el('target-colors').max = pattern.availableColors; // ED-12: can't request more than exist
  renderPalette(pattern);
  renderPatternPreview(pattern);
  // Keep the sort dropdown honest: it reflects the palette's active sort, which
  // edits re-apply (README) and regeneration clears back to "— choose a sort —".
  el('sort-method').value = session.sortMethod ?? '';
  el('undo-action').disabled = session.undoCount === 0;
}

// README: undo up to 10 recent actions against the palette, dimensions, and
// conversion style. Restores the previous pattern and re-syncs the fine-tuning
// controls to the restored parameters.
function handleUndo() {
  if (session.undoCount === 0) return;
  try {
    const pattern = session.undo();
    selectedColorIndex = null;
    cancelPendingMerge();
    el('conversion-style').value = session.params.conversionStyle ?? 'nearest';
    renderResults(pattern); // re-syncs the number-of-colors control to the palette
    showStatus('Undid the last action.');
    log.info('action undone', { remaining: session.undoCount });
  } catch (error) {
    showStatus(`Could not undo: ${error.message}`);
    log.warn('undo failed', error);
  }
}

function handleGenerate(event) {
  event.preventDefault();
  if (!session.source) {
    showStatus('Upload an image first.');
    return;
  }
  try {
    selectedColorIndex = null; // regeneration builds a new palette
    cancelPendingMerge();
    const pattern = session.generate({
      cols: parseInt(el('pattern-cols').value, 10),
      rows: parseInt(el('pattern-rows').value, 10),
      squareSize: parseFloat(el('square-size').value),
      units: el('units').value,
      maxColors: parseInt(el('max-colors').value, 10),
      paletteStyle: el('palette-style').value, // ED-11 (default vivid)
      itemType: el('item-type').value,
    });
    renderResults(pattern); // syncs the number-of-colors control to the palette
    showStatus('');
    log.info('pattern generated', {
      cols: pattern.cols, rows: pattern.rows, colors: pattern.palette.length,
    });
  } catch (error) {
    showStatus(`Could not generate the pattern: ${error.message}`);
    log.warn('pattern generation failed', error);
  }
}

// README "Adjust Number of Colors": changing the count. On a pristine palette this
// rebuilds from the source (ED-6); once the palette has been hand-edited it edits the
// current palette in place so the edits are preserved (ED-13).
function handleTargetColors() {
  if (!session.pattern) return;
  try {
    const n = parseInt(el('target-colors').value, 10);
    const editing = session.edited;
    const result = editing ? session.setPaletteColorCount(n) : session.setTargetColors(n);
    const pattern = result.pattern ?? result; // setPaletteColorCount wraps; setTargetColors doesn't
    selectedColorIndex = null; // the palette was rebuilt or reshaped
    cancelPendingMerge();
    renderResults(pattern);
    showStatus('');
    log.info('color count adjusted', {
      requested: n, colors: pattern.palette.length, mode: editing ? 'edit' : 'rebuild',
    });
  } catch (error) {
    showStatus(`Could not adjust the colors: ${error.message}`);
    log.warn('color adjustment failed', error);
  }
}

// Adjuster wiring: sliders preview the in-progress color while dragging ('input')
// and apply it on release ('change'); the wheel and hex entry apply directly.
const rgbSliderValues = () =>
  rgbToHex(...['r', 'g', 'b'].map((ch) => parseInt(el(`adjust-${ch}`).value, 10)));

const cmykSliderValues = () => {
  const [c, m, y, k] = ['c', 'm', 'y', 'k'].map((ch) => parseInt(el(`adjust-${ch}`).value, 10));
  const { r, g, b } = cmykToRgb(c, m, y, k);
  return rgbToHex(r, g, b);
};

const hsbSliderValues = () => {
  const [h, s, v] = ['h', 's', 'v'].map((ch) => parseInt(el(`adjust-${ch}`).value, 10));
  const { r, g, b } = hsbToRgb(h, s, v);
  return rgbToHex(r, g, b);
};

const sliderFamilies = [
  { channels: ['r', 'g', 'b'], valuesToHex: rgbSliderValues },
  { channels: ['c', 'm', 'y', 'k'], valuesToHex: cmykSliderValues },
  { channels: ['h', 's', 'v'], valuesToHex: hsbSliderValues },
];
for (const { channels, valuesToHex } of sliderFamilies) {
  for (const channel of channels) {
    const slider = el(`adjust-${channel}`);
    // DESIGN.md "Adjuster slider tracks": preview live while dragging — every
    // track, the hex/picker readouts, and the other families' positions follow
    // the in-progress color; the dragged family's own positions are held.
    slider.addEventListener('input', () => {
      el(`adjust-${channel}-value`).textContent = slider.value;
      renderAdjuster(valuesToHex(), { hold: channels });
    });
    slider.addEventListener('change', () => applyColorChange(valuesToHex()));
  }
}

// DESIGN.md "In-pane color picker": the hue ring and saturation/brightness square.
// Dragging a handle previews the color live across the pane (renderAdjuster with
// fromPicker, so the wheel keeps its own h/s/v) and applies it on release.
const pickerHex = () => {
  const { r, g, b } = hsbToRgb(pickerHsv.h, pickerHsv.s, pickerHsv.v);
  return rgbToHex(r, g, b);
};

function previewPicker(commit) {
  const hex = pickerHex();
  renderAdjuster(hex, { fromPicker: true });
  if (commit) applyColorChange(hex);
}

function hueFromEvent(event) {
  const rect = el('color-wheel').getBoundingClientRect();
  pickerHsv.h = hueForVector(
    event.clientX - (rect.left + rect.width / 2),
    event.clientY - (rect.top + rect.height / 2),
  );
}

function svFromEvent(event) {
  const rect = el('wheel-square').getBoundingClientRect();
  const { s, v } = svForPoint(event.clientX - rect.left, event.clientY - rect.top, rect.width);
  pickerHsv.s = s;
  pickerHsv.v = v;
}

// Wire each wheel surface as a pointer-drag: down starts and previews, moves
// preview while captured, up commits the edit to the palette.
function wireWheelDrag(surfaceId, readFromEvent) {
  const surface = el(surfaceId);
  let dragging = false;
  surface.addEventListener('pointerdown', (event) => {
    dragging = true;
    surface.setPointerCapture(event.pointerId);
    readFromEvent(event);
    previewPicker(false);
    event.preventDefault();
  });
  surface.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    readFromEvent(event);
    previewPicker(false);
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    previewPicker(true);
  };
  surface.addEventListener('pointerup', end);
  surface.addEventListener('pointercancel', end);
}
wireWheelDrag('wheel-ring', hueFromEvent);
wireWheelDrag('wheel-square', svFromEvent);

// Keyboard operability (DESIGN.md Accessibility, binding): arrow keys nudge the
// focused handle and apply the change, so the wheel needs no pointer.
const clampPercent = (value) => Math.min(100, Math.max(0, value));
el('hue-handle').addEventListener('keydown', (event) => {
  const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key];
  if (step === undefined) return;
  event.preventDefault();
  pickerHsv.h = (pickerHsv.h + step * (event.shiftKey ? 10 : 1) + 360) % 360;
  previewPicker(true);
});
el('sv-handle').addEventListener('keydown', (event) => {
  const delta = event.shiftKey ? 10 : 1;
  const move = {
    ArrowRight: () => { pickerHsv.s = clampPercent(pickerHsv.s + delta); },
    ArrowLeft: () => { pickerHsv.s = clampPercent(pickerHsv.s - delta); },
    ArrowUp: () => { pickerHsv.v = clampPercent(pickerHsv.v + delta); },
    ArrowDown: () => { pickerHsv.v = clampPercent(pickerHsv.v - delta); },
  }[event.key];
  if (!move) return;
  event.preventDefault();
  move();
  previewPicker(true);
});

// README: the pattern regenerates automatically according to the selected
// conversion style (algorithms per ED-8; regenerates from source per ED-6).
el('conversion-style').addEventListener('change', () => {
  if (!session.pattern) return;
  try {
    const pattern = session.setConversionStyle(el('conversion-style').value);
    selectedColorIndex = null; // regeneration can reshape the palette
    cancelPendingMerge();
    renderResults(pattern);
    showStatus('');
    log.info('conversion style changed', { style: el('conversion-style').value });
  } catch (error) {
    showStatus(`Could not change the conversion style: ${error.message}`);
    log.warn('conversion style change failed', error);
  }
});

// README: sorting reorders the palette display only; a selected color stays
// selected, and the pattern image is unchanged.
el('sort-method').addEventListener('change', () => {
  const method = el('sort-method').value;
  if (!method || !session.pattern) return;
  try {
    const { pattern, colorIndex } = session.sortPalette(method, selectedColorIndex);
    selectedColorIndex = colorIndex;
    renderResults(pattern);
    showStatus('');
    log.info('palette sorted', { method });
  } catch (error) {
    showStatus(`Could not sort the palette: ${error.message}`);
    log.warn('palette sort failed', error);
  }
});

// README "Locking a Color": lock/unlock the selected color. Locking marks the palette
// edited so the number-of-colors control edits in place and can preserve the lock (ED-14).
el('lock-color').addEventListener('click', () => {
  if (selectedColorIndex === null) return;
  const hex = session.pattern.palette[selectedColorIndex];
  const willLock = !session.isLocked(selectedColorIndex);
  try {
    if (willLock) session.lockColor(selectedColorIndex);
    else session.unlockColor(selectedColorIndex);
    cancelPendingMerge();
    // Re-render so the palette/neighbor lock icons and the count-control state refresh;
    // the selection is unchanged (locking never reorders the palette).
    renderResults(session.pattern);
    showStatus(willLock
      ? `Locked ${hex} — it won't be deleted, changed, or merged.`
      : `Unlocked ${hex}.`);
    log.info(willLock ? 'color locked' : 'color unlocked', { hex, locked: session.lockedColors.size });
  } catch (error) {
    showStatus(`Could not change the lock: ${error.message}`);
    log.warn('lock toggle failed', error);
  }
});

el('delete-color').addEventListener('click', handleDeleteColor);
el('merge-color').addEventListener('click', () => {
  if (selectedColorIndex === null) return;
  if (pendingMergeStyle !== null) {
    cancelPendingMerge();
    showStatus('Merge cancelled.');
    return;
  }
  pendingMergeStyle = document.querySelector('input[name="merge-style"]:checked').value;
  updateMergeButton();
  showStatus('Now select the color to merge with — click any swatch or nearby color.');
});

el('adjust-hex').addEventListener('change', () => {
  const entered = el('adjust-hex').value.trim();
  applyColorChange(entered.startsWith('#') ? entered : `#${entered}`);
});

// README "Saving The Final Pattern": the Generate Pattern button prompts for
// group size and symbol type, then builds the tabbed spreadsheet. The vendored
// write-excel-file bundle (window.writeXlsxFile) performs the .xlsx download
// entirely in the browser (ED-1, ED-4).
el('generate-pattern-file').addEventListener('click', () => {
  if (!session.pattern) return;
  el('export-options').hidden = !el('export-options').hidden;
});

el('confirm-export').addEventListener('click', async () => {
  if (!session.pattern) return;
  try {
    const groupSize = parseInt(el('group-size').value, 10);
    const symbolType = el('symbol-type').value;
    const workbook = buildWorkbook(session.pattern, { groupSize, symbolType });
    await window.writeXlsxFile([
      { data: workbook.patternRows, columns: workbook.patternColumns, sheet: 'Pattern' },
      { data: workbook.legendRows, columns: workbook.legendColumns, sheet: 'Color Legend' },
    ]).toFile('squaresville-pattern.xlsx');
    showStatus('Pattern spreadsheet created — check your downloads.');
    log.info('pattern exported', {
      groupSize, symbolType, colors: session.pattern.palette.length,
    });
  } catch (error) {
    showStatus(`Could not create the spreadsheet: ${error.message}`);
    log.warn('pattern export failed', error);
  }
});

el('undo-action').addEventListener('click', handleUndo);
document.addEventListener('keydown', (e) => {
  // Ctrl/Cmd+Z undoes a pattern action — but never while typing in a control,
  // where the browser's own text undo must keep working.
  const typing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName);
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing && session.pattern) {
    e.preventDefault();
    handleUndo();
  }
});

// README: changing columns or rows updates the other so the pattern stays
// proportionate to the uploaded image. Programmatic .value updates fire no
// input events, so the two listeners cannot loop.
function linkProportionalInputs(changedId, otherId, axisOf) {
  el(changedId).addEventListener('input', () => {
    if (!session.source) return;
    const value = parseInt(el(changedId).value, 10);
    if (!Number.isInteger(value) || value <= 0) return; // wait for a usable number
    const { from, to } = axisOf(session.source);
    el(otherId).value = proportionalDimension(value, from, to);
  });
}
linkProportionalInputs('pattern-cols', 'pattern-rows',
  ({ width, height }) => ({ from: width, to: height }));
linkProportionalInputs('pattern-rows', 'pattern-cols',
  ({ width, height }) => ({ from: height, to: width }));

el('image-upload').addEventListener('change', (e) => handleUpload(e.target.files[0]));
el('parameters-form').addEventListener('submit', handleGenerate);
el('target-colors').addEventListener('change', handleTargetColors);

// README "Adjust Individual Palette Colors": clicking a square directly in the
// pattern preview selects that square's color, exactly like clicking its palette
// swatch — and, mid-merge, picks the second color to merge into (like a neighbor
// chip). The palette swatches remain the keyboard-operable path.
el('pattern-image').addEventListener('click', (event) => {
  if (!session.pattern) return;
  const rect = event.currentTarget.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  const index = colorIndexAt(
    session.pattern,
    (event.clientX - rect.left) / rect.width,
    (event.clientY - rect.top) / rect.height,
  );
  if (pendingMergeStyle !== null) {
    completeMerge(index);
  } else {
    selectColor(session.pattern, index);
  }
});

log.debug('squaresville ui initialized');
