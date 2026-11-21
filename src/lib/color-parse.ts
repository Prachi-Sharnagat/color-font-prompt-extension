/**
 * Parse CSS color strings as returned by getComputedStyle into sRGB.
 * Pure (no DOM). Handles the forms Chrome serializes computed colors into for
 * common cases: rgb()/rgba(), color(srgb …), oklch(), oklab(), hsl(), hex and
 * `transparent`. Anything else (lab(), lch(), display-p3, named colors) returns
 * null so the caller can fall back to a canvas-based conversion.
 */
import { clampRgb, hexToRgb, hslToRgb, linearToSrgb, oklabToRgb, oklchToRgb, type RGBA } from './color-conversion';

/** Split the inside of `fn(...)` into channel tokens and an optional alpha token. */
function splitArgs(body: string): { channels: string[]; alpha: string | undefined } {
  const [main = '', alpha] = body.split('/').map((s) => s.trim());
  const channels = main
    .replace(/,/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0);
  // Legacy rgba(r, g, b, a) form: the 4th comma-separated value is alpha.
  if (alpha === undefined && channels.length === 4) {
    return { channels: channels.slice(0, 3), alpha: channels[3] };
  }
  return { channels, alpha };
}

/** Parse a number or percentage. `percentScale` is the value 100% maps to. */
function num(token: string | undefined, percentScale: number): number | null {
  if (token === undefined) return null;
  if (token === 'none') return 0;
  const isPercent = token.endsWith('%');
  const value = Number.parseFloat(isPercent ? token.slice(0, -1) : token.replace(/deg$/, ''));
  if (!Number.isFinite(value)) return null;
  return isPercent ? (value / 100) * percentScale : value;
}

function parseAlpha(token: string | undefined): number | null {
  if (token === undefined) return 1;
  const a = num(token, 1);
  return a === null ? null : Math.min(1, Math.max(0, a));
}

export function parseCssColor(input: string): RGBA | null {
  const value = input.trim().toLowerCase();
  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (value.startsWith('#')) return hexToRgb(value);

  const match = /^([a-z-]+)\((.*)\)$/.exec(value);
  if (!match) return null;
  const fn = match[1] ?? '';
  const body = match[2] ?? '';

  if (fn === 'color') {
    const [space = '', ...rest] = body.trim().split(/\s+/);
    const { channels, alpha } = splitArgs(rest.join(' '));
    const [r, g, b] = channels.map((t) => num(t, 1));
    const a = parseAlpha(alpha);
    if (r == null || g == null || b == null || a === null) return null;
    if (space === 'srgb') return { ...clampRgb({ r: r * 255, g: g * 255, b: b * 255 }), a };
    if (space === 'srgb-linear') {
      return {
        ...clampRgb({ r: linearToSrgb(r) * 255, g: linearToSrgb(g) * 255, b: linearToSrgb(b) * 255 }),
        a,
      };
    }
    return null; // display-p3, rec2020, xyz…: let the caller use the canvas fallback.
  }

  const { channels, alpha } = splitArgs(body);
  const a = parseAlpha(alpha);
  if (channels.length !== 3 || a === null) return null;

  switch (fn) {
    case 'rgb':
    case 'rgba': {
      const [r, g, b] = channels.map((t) => num(t, 255));
      if (r == null || g == null || b == null) return null;
      return { ...clampRgb({ r, g, b }), a };
    }
    case 'hsl':
    case 'hsla': {
      const h = num(channels[0], 360);
      const s = num(channels[1], 100);
      const l = num(channels[2], 100);
      if (h === null || s === null || l === null) return null;
      return { ...clampRgb(hslToRgb({ h, s, l })), a };
    }
    case 'oklch': {
      const l = num(channels[0], 1);
      const c = num(channels[1], 0.4);
      const h = num(channels[2], 360);
      if (l === null || c === null || h === null) return null;
      return { ...clampRgb(oklchToRgb({ l, c, h })), a };
    }
    case 'oklab': {
      const l = num(channels[0], 1);
      const aa = num(channels[1], 0.4);
      const bb = num(channels[2], 0.4);
      if (l === null || aa === null || bb === null) return null;
      return { ...clampRgb(oklabToRgb({ l, a: aa, b: bb })), a };
    }
    default:
      return null;
  }
}
