/**
 * Work out which font in a font-family stack the browser most likely renders.
 *
 * There is no web API that reports the face actually used, so we check each
 * family in order:
 *   1. A web font in document.fonts with status "loaded"   → high confidence
 *   2. A locally installed font, detected by canvas text measurement → medium
 *   3. A generic family (sans-serif, system-ui…)            → low/medium
 * The first family that passes is "likely rendered".
 */

export type Confidence = 'high' | 'medium' | 'low';

export interface RenderedFont {
  family: string;
  source: 'webfont' | 'installed' | 'generic' | 'default';
  confidence: Confidence;
  note: string;
}

const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'emoji',
  'math',
  'fangsong',
]);

/** Apple-only aliases for the system font; ignored by Chrome elsewhere. */
const APPLE_SYSTEM_ALIASES = new Set(['-apple-system', 'blinkmacsystemfont']);

const isApple = (): boolean => /Mac|iPhone|iPad/.test(navigator.userAgent);
const isWindows = (): boolean => /Windows/.test(navigator.userAgent);

const unquote = (family: string): string => family.trim().replace(/^["']|["']$/g, '');

function cssFamily(family: string): string {
  return `"${family.replace(/["\\]/g, '\\$&')}"`;
}

/** Does a FontFace's weight descriptor ("400" or "100 900") cover `weight`? */
function coversWeight(face: FontFace, weight: number): boolean {
  const parts = face.weight.split(/\s+/).map((p) => (p === 'normal' ? 400 : p === 'bold' ? 700 : Number(p)));
  const [min = 400, max = min] = parts;
  return weight >= min && weight <= max;
}

function webFontFaces(doc: Document, family: string): FontFace[] {
  const key = family.toLowerCase();
  const faces: FontFace[] = [];
  doc.fonts.forEach((face) => {
    if (unquote(face.family).toLowerCase() === key) faces.push(face);
  });
  return faces;
}

// Cache installed-font checks per document; measuring is relatively costly.
const installedCache = new WeakMap<Document, Map<string, boolean>>();
const TEST_TEXT = 'mmmmmmmmmmlli1WQ@#&ÄgjyBx';
const BASE_FAMILIES = ['monospace', 'serif', 'sans-serif'];

/**
 * A font is available if text set in `"Family", <generic>` measures differently
 * from `<generic>` alone for at least one generic fallback.
 */
function isFontAvailable(doc: Document, family: string): boolean {
  let cache = installedCache.get(doc);
  if (!cache) {
    cache = new Map();
    installedCache.set(doc, cache);
  }
  const key = family.toLowerCase();
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const ctx = doc.createElement('canvas').getContext('2d');
  let available = false;
  if (ctx) {
    for (const base of BASE_FAMILIES) {
      ctx.font = `72px ${base}`;
      const baseWidth = ctx.measureText(TEST_TEXT).width;
      ctx.font = `72px ${cssFamily(family)}, ${base}`;
      if (ctx.measureText(TEST_TEXT).width !== baseWidth) {
        available = true;
        break;
      }
    }
  }
  cache.set(key, available);
  return available;
}

function genericResult(family: string): RenderedFont {
  if (family === 'system-ui' || family === 'ui-sans-serif') {
    const name = isWindows() ? 'Segoe UI' : isApple() ? 'San Francisco' : null;
    return {
      family: name ? `${name} (system-ui)` : 'System UI font',
      source: 'generic',
      confidence: name ? 'medium' : 'low',
      note: 'The operating system’s UI font. It differs by platform.',
    };
  }
  const windowsDefaults: Record<string, string> = {
    'sans-serif': 'Arial',
    serif: 'Times New Roman',
    monospace: 'Consolas',
  };
  const likely = isWindows() ? windowsDefaults[family] : undefined;
  return {
    family: likely ? `${likely} (${family})` : family,
    source: 'generic',
    confidence: 'low',
    note: `Browser default ${family} font. The exact face depends on the OS and browser settings.`,
  };
}

/**
 * @param stack     Families in order (from parseFontFamilyList).
 * @param doc       The element's document (iframes have their own fonts).
 * @param weight    Computed font-weight, to flag synthesized bold.
 * @param sampleText The element's text, to flag non-Latin per-glyph fallback.
 */
export function resolveRenderedFont(
  stack: readonly string[],
  doc: Document,
  weight: number,
  sampleText: string,
): RenderedFont {
  const nonLatin = /[^\u0000-\u024F\u1E00-\u1EFF\u2000-\u206F\u20A0-\u20CF\u2100-\u214F\s]/.test(sampleText);
  const withGlyphNote = (result: RenderedFont): RenderedFont =>
    nonLatin
      ? { ...result, note: `${result.note} Some non-Latin characters may come from a different fallback font.` }
      : result;

  for (const raw of stack) {
    const family = unquote(raw);
    const key = family.toLowerCase();

    if (APPLE_SYSTEM_ALIASES.has(key)) {
      if (isApple()) {
        return withGlyphNote({
          family: `San Francisco (${family})`,
          source: 'generic',
          confidence: 'medium',
          note: 'Apple’s system font alias.',
        });
      }
      continue; // Not used outside Apple platforms.
    }

    if (GENERIC_FAMILIES.has(key)) return withGlyphNote(genericResult(key));

    const faces = webFontFaces(doc, family);
    const loaded = faces.filter((f) => f.status === 'loaded');
    if (loaded.length > 0) {
      const weightOk = loaded.some((f) => coversWeight(f, weight));
      return withGlyphNote({
        family,
        source: 'webfont',
        confidence: weightOk ? 'high' : 'medium',
        note: weightOk
          ? 'Web font loaded by this page.'
          : `Web font loaded, but no face covers weight ${weight}; the browser may be faking it (synthesized).`,
      });
    }
    if (faces.some((f) => f.status === 'loading')) {
      return withGlyphNote({
        family,
        source: 'webfont',
        confidence: 'medium',
        note: 'Web font is still loading; a fallback may be showing right now.',
      });
    }

    if (isFontAvailable(doc, family)) {
      return withGlyphNote({
        family,
        source: 'installed',
        confidence: 'medium',
        note: faces.length > 0
          ? 'The page’s web font didn’t load, but a local copy is installed on this device.'
          : 'Installed on this device (detected by text measurement). Visitors without it see the next font.',
      });
    }
    // Not available: the browser moves on to the next family.
  }

  return withGlyphNote({
    family: 'Browser default',
    source: 'default',
    confidence: 'low',
    note: 'None of the listed fonts seem available, so the browser default font is used.',
  });
}
