// DOM wiring for the Squaresville flow (README.md "How to use Squaresville" and
// "Fine-tuning your Squaresville pattern"): upload -> parameter form (rows/cols
// default to the image's pixel dimensions) -> side-by-side original + pattern
// preview, dimensions/square stats, palette, and fine-tuning controls that
// regenerate automatically. All state lives in the session (src/pattern/session.js);
// all processing happens in this browser tab — nothing is uploaded anywhere (ED-1).

import { patternToRgba, nearestNeighbors } from '../pattern/pattern.js';
import { proportionalDimension } from '../pattern/dimensions.js';
import {
  hexToRgb, rgbToHex, rgbToCmyk, cmykToRgb, rgbToHsb, hsbToRgb,
} from '../pattern/color.js';
import { sliderGradientCss } from './adjusterGradients.js';
import { createSession, MERGE_STYLES } from '../pattern/session.js';
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

const currentZoom = () => Math.max(1, parseInt(el('zoom-factor').value, 10) || 1);

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

/** Render the pattern at the current zoom into the preview <img> (right-click saveable). */
function renderPatternPreview(pattern) {
  const { rgba, width, height } = patternToRgba(pattern);
  el('pattern-image').src = rgbaToScaledPng(rgba, width, height, currentZoom());
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
  overlay.src = rgbaToScaledPng(rgba, cols, rows, currentZoom());
  overlay.classList.remove('pulsing');
  void overlay.offsetWidth; // restart the animation even for repeated selections
  overlay.classList.add('pulsing');
}

const colorInfoText = (pattern, i) => {
  const count = pattern.counts[i];
  return `${pattern.palette[i]} — ${count} ${count === 1 ? 'square' : 'squares'}`;
};

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
    chip.setAttribute('aria-label',
      `Compare selected ${selectedHex} with ${neighbor.hex} — ${squares}`);
    const pair = document.createElement('span');
    pair.className = 'compare-pair';
    pair.setAttribute('aria-hidden', 'true');
    for (const hex of [selectedHex, neighbor.hex]) {
      const half = document.createElement('span');
      half.className = 'compare-half';
      half.style.background = hex;
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

/**
 * Fill the adjuster controls (picker, hex, rgb/cmyk/hsb sliders) from a hex color.
 * holdChannels: sliders whose positions must not be rewritten — during a drag the
 * dragged family's values are the source of truth (DESIGN.md "Adjuster slider
 * tracks": a transient extreme like brightness 0 must not wipe out the family's
 * other channels). Their gradient tracks still repaint.
 */
function renderAdjuster(hex, holdChannels = []) {
  const { r, g, b } = hexToRgb(hex);
  el('adjust-picker').value = hex.toLowerCase(); // input[type=color] wants lowercase
  el('adjust-hex').value = hex;
  const cmyk = rgbToCmyk(r, g, b);
  const hsb = rgbToHsb(r, g, b);
  const channels = {
    r, g, b,
    c: cmyk.c, m: cmyk.m, y: cmyk.y, k: cmyk.k,
    h: hsb.h, s: hsb.s, v: hsb.b, // 'v' is HSB brightness ('b' is blue's id)
  };
  for (const [channel, value] of Object.entries(channels)) {
    const slider = el(`adjust-${channel}`);
    if (!holdChannels.includes(channel)) {
      slider.value = Math.round(value);
      el(`adjust-${channel}-value`).textContent = Math.round(value);
    }
    // DESIGN.md "Adjuster slider tracks": paint what moving this slider would do.
    slider.style.setProperty('--track-gradient', sliderGradientCss(channel, hex));
  }
}

/** Fill (or hide) the color detail pane for the selected swatch. */
function renderColorDetail(pattern) {
  const detail = el('color-detail');
  if (selectedColorIndex === null || selectedColorIndex >= pattern.palette.length) {
    selectedColorIndex = null;
    detail.hidden = true;
    return;
  }
  const hex = pattern.palette[selectedColorIndex];
  el('detail-swatch').style.background = hex;
  el('detail-text').textContent = colorInfoText(pattern, selectedColorIndex);
  renderNeighbors(pattern);
  renderAdjuster(hex);
  updateMergeButton();
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
    swatch.title = colorInfoText(pattern, i);
    swatch.setAttribute('aria-label', colorInfoText(pattern, i));
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
    item.append(swatch);
    list.append(item);
  });
  renderColorDetail(pattern);
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
  el('undo-action').disabled = session.undoCount === 0;
  el('results-section').hidden = false;
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
    el('target-colors').value = session.params.maxColors;
    el('conversion-style').value = session.params.conversionStyle ?? 'nearest';
    renderResults(pattern);
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
    selectedColorIndex = null; // regeneration builds a new palette
    cancelPendingMerge();
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

// Adjuster wiring: sliders preview the in-progress color while dragging ('input')
// and apply it on release ('change'); picker and hex entry apply directly.
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
      renderAdjuster(valuesToHex(), channels);
    });
    slider.addEventListener('change', () => applyColorChange(valuesToHex()));
  }
}

// README: the pattern regenerates automatically according to the selected
// conversion style (algorithms per ED-8; regenerates from source per ED-6).
el('conversion-style').addEventListener('change', () => {
  if (!session.pattern) return;
  try {
    const pattern = session.setConversionStyle(el('conversion-style').value);
    selectedColorIndex = null; // regeneration can reshape the palette
    cancelPendingMerge();
    el('target-colors').value = pattern.palette.length;
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

el('adjust-picker').addEventListener('change', () => applyColorChange(el('adjust-picker').value));
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
el('zoom-factor').addEventListener('change', () => {
  if (session.pattern) renderPatternPreview(session.pattern);
});
log.debug('squaresville ui initialized');
