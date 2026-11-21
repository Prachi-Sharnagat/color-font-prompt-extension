/**
 * Typography extraction from computed styles.
 * Takes a minimal style interface (not an Element) so it is unit-testable and
 * reusable by the v2 design-system extractor, which will aggregate these.
 */

/** The subset of CSSStyleDeclaration we read. */
export interface StyleLike {
  getPropertyValue(property: string): string;
}

export interface TypographyInfo {
  /** Families in order, unquoted, e.g. ["Open Sans", "Arial", "sans-serif"]. */
  familyStack: string[];
  /** First family in the stack (what the author asked for). */
  primaryFamily: string;
  /** Raw computed font-family string. */
  familyRaw: string;
  fontSizePx: number;
  fontWeight: number;
  fontStyle: string;
  lineHeight: { raw: string; px: number | null };
  letterSpacing: { raw: string; px: number | null };
  /** Raw computed color string; parse with parseCssColor. */
  color: string;
  textTransform: string;
}

/**
 * Split a CSS font-family list, respecting single/double quotes and escapes.
 * `"Open Sans", 'Helvetica Neue', Arial, sans-serif` → 4 entries.
 */
export function parseFontFamilyList(value: string): string[] {
  const families: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < value.length; i++) {
    const ch = value[i] ?? '';
    if (ch === '\\' && i + 1 < value.length) {
      current += value[i + 1];
      i++;
    } else if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ',') {
      families.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  families.push(current);

  return families.map((f) => f.trim().replace(/\s+/g, ' ')).filter((f) => f.length > 0);
}

const px = (raw: string): number | null => {
  const match = /^(-?[\d.]+)px$/.exec(raw.trim());
  return match ? Number.parseFloat(match[1] ?? '') : null;
};

export function readTypography(style: StyleLike): TypographyInfo {
  const familyRaw = style.getPropertyValue('font-family');
  const familyStack = parseFontFamilyList(familyRaw);
  const lineHeightRaw = style.getPropertyValue('line-height').trim() || 'normal';
  const letterSpacingRaw = style.getPropertyValue('letter-spacing').trim() || 'normal';
  const weight = Number.parseFloat(style.getPropertyValue('font-weight'));

  return {
    familyStack,
    primaryFamily: familyStack[0] ?? '',
    familyRaw,
    fontSizePx: px(style.getPropertyValue('font-size')) ?? 16,
    fontWeight: Number.isFinite(weight) ? weight : 400,
    fontStyle: style.getPropertyValue('font-style').trim() || 'normal',
    lineHeight: { raw: lineHeightRaw, px: px(lineHeightRaw) },
    letterSpacing: { raw: letterSpacingRaw, px: px(letterSpacingRaw) },
    color: style.getPropertyValue('color').trim(),
    textTransform: style.getPropertyValue('text-transform').trim() || 'none',
  };
}

const WEIGHT_NAMES: Array<[number, string]> = [
  [100, 'Thin'],
  [200, 'Extra Light'],
  [300, 'Light'],
  [400, 'Regular'],
  [500, 'Medium'],
  [600, 'Semibold'],
  [700, 'Bold'],
  [800, 'Extra Bold'],
  [900, 'Black'],
];

/** "600 · Semibold". Variable-font weights snap to the nearest name. */
export function describeWeight(weight: number): string {
  let best = WEIGHT_NAMES[3];
  for (const entry of WEIGHT_NAMES) {
    if (best && Math.abs(entry[0] - weight) < Math.abs(best[0] - weight)) best = entry;
  }
  return `${Math.round(weight)} · ${best?.[1] ?? 'Regular'}`;
}

/** Trim trailing zeros: 16 → "16px", 15.5 → "15.5px". */
export function formatPx(value: number): string {
  return `${Math.round(value * 100) / 100}px`;
}
