// Gradient scales for the color-adjuster slider tracks. DESIGN.md "Adjuster
// slider tracks": each position along a track shows the exact color the selected
// color would become if the thumb were dragged there, with every other channel
// held at its current value. Pure data in/out so it stays testable without a DOM.
import {
  hexToRgb, rgbToHex, rgbToCmyk, cmykToRgb, rgbToHsb, hsbToRgb,
} from '../pattern/color.js';

const withCmykChannel = (channel) => (rgb, value) => {
  const cmyk = { ...rgbToCmyk(rgb.r, rgb.g, rgb.b), [channel]: value };
  return cmykToRgb(cmyk.c, cmyk.m, cmyk.y, cmyk.k);
};

const withHsbChannel = (channel) => (rgb, value) => {
  const hsb = { ...rgbToHsb(rgb.r, rgb.g, rgb.b), [channel]: value };
  return hsbToRgb(hsb.h, hsb.s, hsb.b);
};

// How each slider rebuilds the color when its channel is forced to a value.
// Keys match the adjust-<channel> control ids in index.html ('v' is HSB
// brightness, since 'b' is blue's id).
const SLIDER_CHANNELS = {
  r: { max: 255, colorAt: (rgb, value) => ({ ...rgb, r: value }) },
  g: { max: 255, colorAt: (rgb, value) => ({ ...rgb, g: value }) },
  b: { max: 255, colorAt: (rgb, value) => ({ ...rgb, b: value }) },
  c: { max: 100, colorAt: withCmykChannel('c') },
  m: { max: 100, colorAt: withCmykChannel('m') },
  y: { max: 100, colorAt: withCmykChannel('y') },
  k: { max: 100, colorAt: withCmykChannel('k') },
  h: { max: 360, colorAt: withHsbChannel('h') },
  s: { max: 100, colorAt: withHsbChannel('s') },
  v: { max: 100, colorAt: withHsbChannel('b') },
};

// 13 evenly spaced stops put a stop on every 30° of hue, so the piecewise-linear
// spectrum sweep hits each 60° corner exactly; the linear channels simply get
// redundant intermediate stops.
const STOP_COUNT = 13;

/** Evenly spaced { offset (0-100), hex } gradient stops for one slider's track. */
export function sliderGradientStops(channel, hex) {
  const slider = SLIDER_CHANNELS[channel];
  if (!slider) {
    throw new RangeError(`unknown adjuster slider channel ${JSON.stringify(channel)}`);
  }
  const rgb = hexToRgb(hex);
  return Array.from({ length: STOP_COUNT }, (_, i) => {
    const fraction = i / (STOP_COUNT - 1);
    const { r, g, b } = slider.colorAt(rgb, Math.round(fraction * slider.max));
    return { offset: fraction * 100, hex: rgbToHex(r, g, b) };
  });
}

/** The same stops as a CSS linear-gradient, ready to paint on the track. */
export function sliderGradientCss(channel, hex) {
  const stops = sliderGradientStops(channel, hex)
    .map((stop) => `${stop.hex} ${stop.offset.toFixed(1)}%`);
  return `linear-gradient(to right, ${stops.join(', ')})`;
}
