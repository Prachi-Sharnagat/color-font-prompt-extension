/**
 * Pure color conversion functions. No DOM access, so everything here is
 * unit-testable and reusable by the v2 design-system extractor.
 *
 * Conventions:
 *   RGB:   r, g, b in 0–255 (may be fractional), alpha a in 0–1
 *   HSL:   h in 0–360, s and l in 0–100
 *   OKLab: L in 0–1, a/b roughly −0.4–0.4
 *   OKLCH: l in 0–1, c >= 0 (≈0–0.37 for sRGB), h in 0–360
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}
export interface RGBA extends RGB {
  a: number;
}
export interface HSL {
  h: number;
  s: number;
  l: number;
}
export interface OKLab {
  l: number;
  a: number;
  b: number;
}
export interface OKLCH {
  l: number;
  c: number;
  h: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const roundTo = (value: number, digits: number): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const normalizeHue = (h: number): number => ((h % 360) + 360) % 360;

/** Clamp channels to 0–255 and round to integers. */
export function clampRgb({ r, g, b }: RGB): RGB {
  return {
    r: Math.round(clamp(r, 0, 255)),
    g: Math.round(clamp(g, 0, 255)),
    b: Math.round(clamp(b, 0, 255)),
  };
}

// ---------------------------------------------------------------- HEX

const toHexByte = (n: number): string => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');

/** `#RRGGBB`, or `#RRGGBBAA` when alpha < 1. Uppercase. */
export function rgbToHex(rgb: RGB, alpha = 1): string {
  const base = `#${toHexByte(rgb.r)}${toHexByte(rgb.g)}${toHexByte(rgb.b)}`;
  const a = clamp(alpha, 0, 1);
  return (a < 1 ? base + toHexByte(a * 255) : base).toUpperCase();
}

/** Parse `#RGB`, `#RGBA`, `#RRGGBB` or `#RRGGBBAA` (the `#` is optional). */
export function hexToRgb(hex: string): RGBA | null {
  const value = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-f]+$/i.test(value)) return null;

  let full: string;
  if (value.length === 3 || value.length === 4) {
    full = value
      .split('')
      .map((ch) => ch + ch)
      .join('');
  } else if (value.length === 6 || value.length === 8) {
    full = value;
  } else {
    return null;
  }

  const n = (i: number): number => parseInt(full.slice(i, i + 2), 16);
  return {
    r: n(0),
    g: n(2),
    b: n(4),
    a: full.length === 8 ? roundTo(n(6) / 255, 3) : 1,
  };
}

// ---------------------------------------------------------------- HSL

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) return { h: 0, s: 0, l: l * 100 };

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / delta) % 6;
  else if (max === gn) h = (bn - rn) / delta + 2;
  else h = (rn - gn) / delta + 4;

  return { h: normalizeHue(h * 60), s: s * 100, l: l * 100 };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const sn = clamp(s, 0, 100) / 100;
  const ln = clamp(l, 0, 100) / 100;
  const k = (n: number): number => (n + normalizeHue(h) / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number): number => ln - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 };
}

// ---------------------------------------------------------------- OKLab / OKLCH
// Matrices from Björn Ottosson, https://bottosson.github.io/posts/oklab/

/** sRGB channel (0–1) to linear-light. */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Linear-light channel to sRGB (0–1). */
export function linearToSrgb(c: number): number {
  const sign = c < 0 ? -1 : 1;
  const abs = Math.abs(c);
  return sign * (abs <= 0.0031308 ? abs * 12.92 : 1.055 * abs ** (1 / 2.4) - 0.055);
}

export function rgbToOklab({ r, g, b }: RGB): OKLab {
  const lr = srgbToLinear(r / 255);
  const lg = srgbToLinear(g / 255);
  const lb = srgbToLinear(b / 255);

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/** OKLab to sRGB (0–255). Out-of-gamut values are NOT clamped; use clampRgb. */
export function oklabToRgb({ l: L, a, b }: OKLab): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return {
    r: linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s) * 255,
    g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s) * 255,
    b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s) * 255,
  };
}

/** Chroma below this is treated as achromatic (hue meaningless). */
const ACHROMATIC_CHROMA = 1e-4;

export function rgbToOklch(rgb: RGB): OKLCH {
  const { l, a, b } = rgbToOklab(rgb);
  const c = Math.hypot(a, b);
  const h = c < ACHROMATIC_CHROMA ? 0 : normalizeHue((Math.atan2(b, a) * 180) / Math.PI);
  return { l, c, h };
}

export function oklchToRgb({ l, c, h }: OKLCH): RGB {
  const rad = (h * Math.PI) / 180;
  return oklabToRgb({ l, a: c * Math.cos(rad), b: c * Math.sin(rad) });
}

// ---------------------------------------------------------------- Formatting

export function formatHex(rgb: RGB, alpha = 1): string {
  return rgbToHex(rgb, alpha);
}

export function formatRgb(rgb: RGB, alpha = 1): string {
  const { r, g, b } = clampRgb(rgb);
  return alpha < 1 ? `rgb(${r} ${g} ${b} / ${roundTo(alpha, 2)})` : `rgb(${r}, ${g}, ${b})`;
}

export function formatHsl(rgb: RGB, alpha = 1): string {
  const { h, s, l } = rgbToHsl(clampRgb(rgb));
  const body = `${Math.round(h) % 360}, ${Math.round(s)}%, ${Math.round(l)}%`;
  return alpha < 1 ? `hsl(${body.replaceAll(',', '')} / ${roundTo(alpha, 2)})` : `hsl(${body})`;
}

export function formatOklch(rgb: RGB, alpha = 1): string {
  const { l, c, h } = rgbToOklch(clampRgb(rgb));
  const lStr = `${roundTo(l * 100, 1)}%`;
  const cStr = String(roundTo(c, 3));
  const hStr = c < ACHROMATIC_CHROMA ? '0' : String(roundTo(h, 1));
  const tail = alpha < 1 ? ` / ${roundTo(alpha, 2)}` : '';
  return `oklch(${lStr} ${cStr} ${hStr}${tail})`;
}

export interface ColorFormats {
  hex: string;
  rgb: string;
  hsl: string;
  oklch: string;
}

export function allFormats(rgb: RGB, alpha = 1): ColorFormats {
  return {
    hex: formatHex(rgb, alpha),
    rgb: formatRgb(rgb, alpha),
    hsl: formatHsl(rgb, alpha),
    oklch: formatOklch(rgb, alpha),
  };
}

/** Relative perceived lightness, handy for picking readable text on a swatch. */
export function isLight(rgb: RGB): boolean {
  return rgbToOklab(rgb).l > 0.65;
}
