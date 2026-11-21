/**
 * Page color extraction. Reusable building block for the v2 design-system
 * generator.
 *
 *   collectColorSamples(doc)  DOM walk  → raw samples (role + weight)
 *   aggregatePalette(samples) pure      → ranked, de-duplicated palette
 *
 * "Usage" is mostly how many elements use a color, with a gentle boost for
 * large areas and long text. That way a brand color used on 40 buttons
 * outranks a single big hero background, but page backgrounds still count.
 */
import { rgbToHex, rgbToOklab, type RGB, type RGBA } from '../color-conversion';

export type ColorRole = 'background' | 'text' | 'border' | 'fill';

export interface ColorSample {
  color: RGBA;
  weight: number;
  role: ColorRole;
}

export interface PaletteColor {
  hex: string;
  rgb: RGB;
  /** Accumulated usage weight. */
  weight: number;
  /** Fraction of total weight, 0–1. */
  share: number;
  /** Roles this color was used in, most-weighted first. */
  roles: ColorRole[];
}

export interface AggregateOptions {
  /** Number of colors to return. */
  limit?: number;
  /**
   * Merge colors closer than this OKLab distance. 0.008 merges near-duplicates
   * (#FEFEFE/#FFFFFF) but keeps deliberate tints apart (#FAFAFA/#FFFFFF ≈ 0.015).
   */
  mergeDistance?: number;
}

interface Cluster {
  rgb: RGB;
  lab: { l: number; a: number; b: number };
  weight: number;
  roles: Map<ColorRole, number>;
}

/** Pure: rank samples into a palette, merging near-identical colors. */
export function aggregatePalette(
  samples: Iterable<ColorSample>,
  { limit = 10, mergeDistance = 0.008 }: AggregateOptions = {},
): PaletteColor[] {
  // 1. Bucket by exact opaque hex. Translucent colors count proportionally.
  const buckets = new Map<string, Cluster>();
  for (const { color, weight, role } of samples) {
    if (color.a <= 0 || weight <= 0) continue;
    const rgb = { r: Math.round(color.r), g: Math.round(color.g), b: Math.round(color.b) };
    const hex = rgbToHex(rgb);
    const w = weight * Math.min(1, color.a);
    let bucket = buckets.get(hex);
    if (!bucket) {
      bucket = { rgb, lab: rgbToOklab(rgb), weight: 0, roles: new Map() };
      buckets.set(hex, bucket);
    }
    bucket.weight += w;
    bucket.roles.set(role, (bucket.roles.get(role) ?? 0) + w);
  }

  // 2. Greedy merge, heaviest first, so each cluster keeps its dominant color.
  const clusters: Cluster[] = [];
  for (const bucket of [...buckets.values()].sort((x, y) => y.weight - x.weight)) {
    const near = clusters.find(
      (c) => Math.hypot(c.lab.l - bucket.lab.l, c.lab.a - bucket.lab.a, c.lab.b - bucket.lab.b) < mergeDistance,
    );
    if (near) {
      near.weight += bucket.weight;
      for (const [role, w] of bucket.roles) near.roles.set(role, (near.roles.get(role) ?? 0) + w);
    } else {
      clusters.push({ ...bucket, roles: new Map(bucket.roles) });
    }
  }

  const total = clusters.reduce((sum, c) => sum + c.weight, 0) || 1;
  return clusters
    .sort((x, y) => y.weight - x.weight)
    .slice(0, limit)
    .map((c) => ({
      hex: rgbToHex(c.rgb),
      rgb: c.rgb,
      weight: c.weight,
      share: c.weight / total,
      roles: [...c.roles.entries()].sort((x, y) => y[1] - x[1]).map(([role]) => role),
    }));
}

// ------------------------------------------------------------------ DOM walk

export interface CollectOptions {
  /** Stop after this many elements (protects huge pages). */
  maxElements?: number;
  /** Stop after this much time, in ms. */
  timeBudgetMs?: number;
  /** Only count elements that intersect the viewport. */
  viewportOnly?: boolean;
  /** Tag names to skip (e.g. our own UI host). */
  skipTags?: readonly string[];
}

/** Elements in document order, descending into open shadow roots. */
function* walkElements(root: Document | ShadowRoot): Generator<Element> {
  const walker = (root instanceof Document ? root : root.ownerDocument).createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT,
  );
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node as Element;
    yield el;
    if (el.shadowRoot) yield* walkElements(el.shadowRoot);
  }
}

function ownTextLength(el: Element): number {
  let length = 0;
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) length += (child.textContent ?? '').trim().length;
  }
  return length;
}

const BORDER_SIDES = ['top', 'right', 'bottom', 'left'] as const;

/**
 * Walk visible elements and record the colors they paint.
 * @param resolveColor CSS color string → RGBA (see resolveCssColor in lib/dom).
 */
export function collectColorSamples(
  doc: Document,
  resolveColor: (value: string) => RGBA | null,
  { maxElements = 6000, timeBudgetMs = 150, viewportOnly = true, skipTags = [] }: CollectOptions = {},
): ColorSample[] {
  const view = doc.defaultView ?? window;
  const vw = view.innerWidth;
  const vh = view.innerHeight;
  const skip = new Set(skipTags.map((t) => t.toUpperCase()));
  const started = performance.now();
  const samples: ColorSample[] = [];
  // Many elements share identical color strings; cache parses.
  const colorCache = new Map<string, RGBA | null>();
  const resolve = (value: string): RGBA | null => {
    let cached = colorCache.get(value);
    if (cached === undefined) {
      cached = resolveColor(value);
      colorCache.set(value, cached);
    }
    return cached;
  };
  const push = (value: string, weight: number, role: ColorRole): void => {
    const color = resolve(value);
    if (color && color.a > 0) samples.push({ color, weight, role });
  };

  let count = 0;
  for (const el of walkElements(doc)) {
    if (skip.has(el.tagName.toUpperCase())) continue;
    if (++count > maxElements) break;
    if (count % 200 === 0 && performance.now() - started > timeBudgetMs) break;

    const isRoot = el === doc.documentElement || el === doc.body;
    const rect = el.getBoundingClientRect();
    const visibleW = Math.max(0, Math.min(rect.right, vw) - Math.max(rect.left, 0));
    const visibleH = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
    // <html>/<body> backgrounds paint the whole viewport regardless of their box.
    const area = isRoot ? vw * vh : visibleW * visibleH;
    if (!isRoot && (rect.width === 0 || rect.height === 0)) continue;
    if (viewportOnly && area === 0) continue;

    const style = view.getComputedStyle(el);
    if (style.visibility === 'hidden' || style.opacity === '0') continue;

    // Count-dominated weight with a gentle (log) boost for size.
    const areaWeight = 1 + Math.log2(1 + area / 2000);

    push(style.backgroundColor, areaWeight, 'background');

    const textLength = ownTextLength(el);
    if (textLength > 0) push(style.color, 1 + Math.log2(1 + textLength), 'text');

    for (const side of BORDER_SIDES) {
      const width = Number.parseFloat(style.getPropertyValue(`border-${side}-width`));
      const lineStyle = style.getPropertyValue(`border-${side}-style`);
      if (width > 0 && lineStyle !== 'none' && lineStyle !== 'hidden') {
        push(style.getPropertyValue(`border-${side}-color`), 0.25, 'border');
      }
    }

    if (el.namespaceURI === 'http://www.w3.org/2000/svg') {
      const fill = style.getPropertyValue('fill');
      if (fill && fill !== 'none' && !fill.startsWith('url(')) push(fill, areaWeight, 'fill');
    }
  }
  return samples;
}

export function extractPagePalette(
  doc: Document,
  resolveColor: (value: string) => RGBA | null,
  options: CollectOptions & AggregateOptions = {},
): PaletteColor[] {
  return aggregatePalette(collectColorSamples(doc, resolveColor, options), options);
}
