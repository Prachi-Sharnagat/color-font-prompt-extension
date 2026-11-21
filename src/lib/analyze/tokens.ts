/**
 * Design-token extraction (pure). The collector samples computed styles; this
 * module turns samples into a compact token set and a CSS-variables block.
 * Shared by the recreation prompt (v3) and a future design.md generator.
 */
import { rgbToOklch } from '../color-conversion';
import { aggregatePalette, type ColorSample, type PaletteColor } from '../extract/colors';

export interface WeightedValue {
  value: number;
  weight: number;
}

export interface TokenSamples {
  /** Font sizes (px) of text-bearing elements, weighted by text length. */
  fontSizes: WeightedValue[];
  /** Line-height / font-size ratios for text elements. */
  lineHeights: WeightedValue[];
  fontFamilies: Array<{ family: string; weight: number }>;
  fontWeights: WeightedValue[];
  /** Padding, margin and gap values (px, > 0). */
  spacings: number[];
  /** Border radii (px, > 0). Values >= 999 mean "pill/circle". */
  radii: number[];
  /** Computed box-shadow strings (not "none"). */
  shadows: string[];
  colors: ColorSample[];
  /** Media query condition texts from accessible stylesheets. */
  mediaQueries: string[];
  /** Effective page background (hex), so it can be named --color-bg. */
  pageBackground?: string;
}

export interface TypeStep {
  name: string;
  px: number;
  usage: number;
}

export interface DesignTokens {
  colors: Array<PaletteColor & { name: string }>;
  fontFamilies: Array<{ name: string; family: string; share: number }>;
  typeScale: TypeStep[];
  /** Average ratio between consecutive type steps (e.g. 1.25 "major third"). */
  typeRatio: number | null;
  lineHeights: number[];
  fontWeights: number[];
  spacing: { base: number | null; scale: number[] };
  radii: Array<{ name: string; px: number }>;
  shadows: Array<{ name: string; value: string; count: number }>;
  breakpoints: number[];
}

// ------------------------------------------------------------------ helpers

function topWeighted(values: WeightedValue[], round: (n: number) => number, limit: number): Array<{ value: number; weight: number }> {
  const map = new Map<number, number>();
  for (const { value, weight } of values) {
    if (!Number.isFinite(value) || value <= 0) continue;
    const key = round(value);
    map.set(key, (map.get(key) ?? 0) + weight);
  }
  return [...map.entries()]
    .map(([value, weight]) => ({ value, weight }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit);
}

const roundHalf = (n: number): number => Math.round(n * 2) / 2;

const TYPE_NAMES_UP = ['base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl'];
const TYPE_NAMES_DOWN = ['sm', 'xs', '2xs'];

/** Name sizes relative to the most-used (body) size. */
/** Merge values within `tolerance` (relative) into the heavier one. */
function mergeClose(values: Array<{ value: number; weight: number }>, tolerance: number): Array<{ value: number; weight: number }> {
  const kept: Array<{ value: number; weight: number }> = [];
  for (const v of [...values].sort((a, b) => b.weight - a.weight)) {
    const near = kept.find((k) => Math.abs(k.value - v.value) / k.value < tolerance);
    if (near) near.weight += v.weight;
    else kept.push({ ...v });
  }
  return kept;
}

export function buildTypeScale(samples: WeightedValue[], limit = 10): { steps: TypeStep[]; ratio: number | null } {
  // 18 vs 18.5px is noise, not two steps of a scale.
  const top = mergeClose(topWeighted(samples, roundHalf, 40), 0.03)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit);
  if (top.length === 0) return { steps: [], ratio: null };
  const base = top[0]!.value;
  const sizes = [...top].sort((a, b) => a.value - b.value);
  const below = sizes.filter((s) => s.value < base).reverse();
  const above = sizes.filter((s) => s.value > base);

  const steps: TypeStep[] = [];
  below.forEach((s, i) => steps.push({ name: TYPE_NAMES_DOWN[i] ?? `${i + 3}xs`, px: s.value, usage: s.weight }));
  steps.push({ name: 'base', px: base, usage: top[0]!.weight });
  above.forEach((s, i) => steps.push({ name: TYPE_NAMES_UP[i + 1] ?? `${i + 2}xl`, px: s.value, usage: s.weight }));
  steps.sort((a, b) => a.px - b.px);

  // Geometric mean of ratios between consecutive steps at/above base.
  const upper = steps.filter((s) => s.px >= base).map((s) => s.px);
  let ratio: number | null = null;
  if (upper.length >= 3) {
    const ratios = upper.slice(1).map((v, i) => v / upper[i]!);
    ratio = Math.round(Math.exp(ratios.reduce((sum, r) => sum + Math.log(r), 0) / ratios.length) * 1000) / 1000;
  }
  return { steps, ratio };
}

/**
 * Largest base unit (from common candidates) that most spacing values are
 * multiples of, plus the most frequent values as a scale.
 */
export function buildSpacing(values: number[], limit = 10): { base: number | null; scale: number[] } {
  const clean = values.filter((v) => Number.isFinite(v) && v > 0 && v < 1000).map((v) => Math.round(v));
  if (clean.length === 0) return { base: null, scale: [] };

  let base: number | null = null;
  for (const candidate of [8, 6, 5, 4]) {
    const fits = clean.filter((v) => v % candidate === 0).length / clean.length;
    if (fits >= 0.7) {
      base = candidate;
      break;
    }
  }

  const counts = new Map<number, number>();
  for (const v of clean) counts.set(v, (counts.get(v) ?? 0) + 1);
  const scale = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([v]) => v)
    .sort((a, b) => a - b);
  return { base, scale };
}

export function buildRadii(values: number[], limit = 5): Array<{ name: string; px: number }> {
  const counts = new Map<number, number>();
  for (const v of values) {
    if (!Number.isFinite(v) || v <= 0) continue;
    const key = v >= 999 ? 9999 : Math.round(v);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([v]) => v).sort((a, b) => a - b);
  const names = ['sm', 'md', 'lg', 'xl', '2xl'];
  let i = 0;
  return top.map((px) => ({ name: px === 9999 ? 'full' : (names[i++] ?? `r${i}`), px }));
}

export function buildShadows(values: string[], limit = 4): Array<{ name: string; value: string; count: number }> {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const value = raw.trim().replace(/\s+/g, ' ');
    if (!value || value === 'none') continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const names = ['sm', 'md', 'lg', 'xl'];
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count], i) => ({ name: names[i] ?? `s${i + 1}`, value, count }));
}

/**
 * Breakpoints (px) from media query texts like "(min-width: 768px)" or
 * "screen and (max-width: 63.99em)". max-width values are normalized up to the
 * next breakpoint (767.98px → 768). Clusters within 4px; most common first,
 * returned ascending.
 */
export function parseBreakpoints(queries: string[], limit = 6): number[] {
  const counts = new Map<number, number>();
  const re = /(min|max)-width\s*:\s*([\d.]+)(px|em|rem)/gi;
  for (const q of queries) {
    for (const match of q.matchAll(re)) {
      let px = Number.parseFloat(match[2] ?? '');
      if (!Number.isFinite(px)) continue;
      if (match[3] !== 'px') px *= 16;
      if (match[1]?.toLowerCase() === 'max') px = Math.ceil(px);
      px = Math.round(px);
      if (px < 200 || px > 4000) continue;
      const near = [...counts.keys()].find((k) => Math.abs(k - px) <= 4);
      const key = near ?? px;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([px]) => px)
    .sort((a, b) => a - b);
}

/** OKLCH chroma above which a color reads as a brand/accent hue. */
const ACCENT_CHROMA = 0.08;

/**
 * Name palette colors: the page background is `bg`; saturated hues are
 * `accent`, `accent-2`…; neutrals by dominant role (`surface`, `text`,
 * `text-muted`, `border`…). Colors under `minShare` are dropped as noise.
 */
export function nameColors(
  palette: PaletteColor[],
  pageBackground?: string,
  minShare = 0.005,
): Array<PaletteColor & { name: string }> {
  const counters = new Map<string, number>();
  const take = (base: string): string => {
    const n = (counters.get(base) ?? 0) + 1;
    counters.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };
  const textNames = ['text', 'text-muted'];
  let textCount = 0;
  const bgHex = pageBackground?.toUpperCase();
  if (bgHex && palette.some((c) => c.hex === bgHex)) counters.set('bg', 1);

  return palette
    .filter((c) => c.share >= minShare || c.hex === bgHex)
    .map((color) => {
      if (color.hex === bgHex) return { ...color, name: 'bg' };
      if (rgbToOklch(color.rgb).c >= ACCENT_CHROMA) return { ...color, name: take('accent') };
      const role = color.roles[0];
      if (role === 'text') {
        const name = textNames[textCount] ?? `text-${textCount + 1}`;
        textCount++;
        return { ...color, name };
      }
      if (role === 'border') return { ...color, name: take('border') };
      if (role === 'background') return { ...color, name: counters.has('bg') ? take('surface') : take('bg') };
      return { ...color, name: take('neutral') };
    });
}

// ------------------------------------------------------------------ build

export function buildTokens(samples: TokenSamples): DesignTokens {
  const familyWeights = new Map<string, number>();
  for (const { family, weight } of samples.fontFamilies) {
    if (family) familyWeights.set(family, (familyWeights.get(family) ?? 0) + weight);
  }
  const familyTotal = [...familyWeights.values()].reduce((a, b) => a + b, 0) || 1;
  const fontFamilies = [...familyWeights.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([family, weight], i) => ({ name: ['sans', 'display', 'mono'][i] ?? `font-${i + 1}`, family, share: weight / familyTotal }));

  const { steps, ratio } = buildTypeScale(samples.fontSizes);
  return {
    colors: nameColors(aggregatePalette(samples.colors, { limit: 12 }), samples.pageBackground),
    fontFamilies,
    typeScale: steps,
    typeRatio: ratio,
    lineHeights: topWeighted(samples.lineHeights, (n) => Math.round(n * 20) / 20, 4).map((v) => v.value).sort((a, b) => a - b),
    fontWeights: topWeighted(samples.fontWeights, (n) => Math.round(n / 100) * 100, 5).map((v) => v.value).sort((a, b) => a - b),
    spacing: buildSpacing(samples.spacings),
    radii: buildRadii(samples.radii),
    shadows: buildShadows(samples.shadows),
    breakpoints: parseBreakpoints(samples.mediaQueries),
  };
}

const quoteFamily = (f: string): string => (/^[\w-]+$/.test(f) ? f : `"${f.replace(/"/g, '\\"')}"`);

/** `:root { --color-bg: …; … }` block for the prompt. */
export function tokensToCss(tokens: DesignTokens): string {
  const lines: string[] = [];
  for (const c of tokens.colors) lines.push(`  --color-${c.name}: ${c.hex};`);
  for (const f of tokens.fontFamilies) lines.push(`  --font-${f.name}: ${quoteFamily(f.family)}, system-ui, sans-serif;`);
  for (const s of tokens.typeScale) lines.push(`  --text-${s.name}: ${s.px / 16}rem; /* ${s.px}px */`);
  tokens.lineHeights.forEach((lh, i) => lines.push(`  --leading-${i + 1}: ${lh};`));
  if (tokens.spacing.base) lines.push(`  --space-unit: ${tokens.spacing.base}px;`);
  tokens.spacing.scale.forEach((v, i) => lines.push(`  --space-${i + 1}: ${v}px;`));
  for (const r of tokens.radii) lines.push(`  --radius-${r.name}: ${r.px === 9999 ? '9999px' : `${r.px}px`};`);
  for (const s of tokens.shadows) lines.push(`  --shadow-${s.name}: ${s.value};`);
  const body = lines.join('\n');
  const bp = tokens.breakpoints.length > 0 ? `\n/* Breakpoints: ${tokens.breakpoints.map((b) => `${b}px`).join(', ')} */` : '';
  return `:root {\n${body}\n}${bp}`;
}
