/**
 * WCAG 2.x contrast math. Pure functions, unit-tested.
 * https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio
 */
import { srgbToLinear, type RGB, type RGBA } from './color-conversion';

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance({ r, g, b }: RGB): number {
  return (
    0.2126 * srgbToLinear(r / 255) + 0.7152 * srgbToLinear(g / 255) + 0.0722 * srgbToLinear(b / 255)
  );
}

/** Contrast ratio between two opaque colors, 1 to 21. Order doesn't matter. */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Alpha-composite a (possibly translucent) color over an opaque backdrop. */
export function compositeOver(fg: RGBA, bg: RGB): RGB {
  const a = Math.min(1, Math.max(0, fg.a));
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
  };
}

/**
 * WCAG "large text": at least 18pt (24px), or 14pt (≈18.67px) and bold (700+).
 */
export function isLargeText(fontSizePx: number, fontWeight: number): boolean {
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);
}

export interface WcagResult {
  ratio: number;
  aa: { normal: boolean; large: boolean };
  aaa: { normal: boolean; large: boolean };
}

export function evaluateContrast(ratio: number): WcagResult {
  return {
    ratio,
    aa: { normal: ratio >= 4.5, large: ratio >= 3 },
    aaa: { normal: ratio >= 7, large: ratio >= 4.5 },
  };
}

/**
 * Display a ratio like "4.48:1". Truncates instead of rounding so a failing
 * ratio (e.g. 4.499) is never shown as a passing "4.50".
 */
export function formatRatio(ratio: number): string {
  return `${(Math.floor(ratio * 100) / 100).toFixed(2)}:1`;
}
