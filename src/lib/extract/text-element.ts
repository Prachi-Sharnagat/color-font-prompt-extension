/**
 * Full typography + contrast report for one text element. This is the
 * building block the font detector shows, and what the v2 design-system
 * extractor can run over many elements.
 */
import { rgbToHex, type RGB } from '../color-conversion';
import { compositeOver, contrastRatio, evaluateContrast, isLargeText, type WcagResult } from '../contrast';
import { effectiveBackground, getStyle, resolveCssColor, type BackgroundResult } from '../dom';
import { resolveRenderedFont, type RenderedFont } from '../font-resolve';
import { familiesFromGoogleFontsHref, isGoogleFont } from '../google-fonts';
import { readTypography, type TypographyInfo } from './typography';

export interface TextElementReport {
  /** Short selector-like label, e.g. "h2.title". */
  label: string;
  typography: TypographyInfo;
  rendered: RenderedFont;
  /** Text color after compositing any alpha over the background. */
  textColor: RGB;
  textHex: string;
  background: BackgroundResult;
  backgroundHex: string;
  contrast: WcagResult;
  isLargeText: boolean;
  /** Family to link on fonts.google.com, if any family in the stack is one. */
  googleFamily: string | null;
}

export function elementLabel(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
  return cls ? `${tag}.${cls}` : tag;
}

/** Text the element shows (form fields expose it via value). */
export function elementText(el: Element): string {
  // Tag checks rather than instanceof: elements may come from an iframe's realm.
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
    const field = el as HTMLInputElement | HTMLTextAreaElement;
    return field.value || field.placeholder || '';
  }
  return (el.textContent ?? '').trim().slice(0, 500);
}

/** Families the page requests from fonts.googleapis.com. */
export function pageGoogleFamilies(doc: Document): Set<string> {
  const families = new Set<string>();
  const hrefs = new Set<string>();
  doc.querySelectorAll<HTMLLinkElement>('link[href*="fonts.googleapis.com"]').forEach((link) => hrefs.add(link.href));
  for (const sheet of Array.from(doc.styleSheets)) {
    if (sheet.href) hrefs.add(sheet.href);
  }
  for (const href of hrefs) {
    for (const family of familiesFromGoogleFontsHref(href)) families.add(family.toLowerCase());
  }
  return families;
}

export function inspectTextElement(el: Element): TextElementReport {
  const style = getStyle(el);
  const typography = readTypography(style);
  const doc = el.ownerDocument;

  const rendered = resolveRenderedFont(typography.familyStack, doc, typography.fontWeight, elementText(el));

  const background = effectiveBackground(el);
  const rawText = resolveCssColor(typography.color) ?? { r: 0, g: 0, b: 0, a: 1 };
  const textColor = compositeOver(rawText, background.color);
  const ratio = contrastRatio(textColor, background.color);

  const googleSet = pageGoogleFamilies(doc);
  // Link the rendered family, or the family the author asked for.
  const candidates = [rendered.family, typography.primaryFamily];
  const googleFamily = candidates.find((family) => isGoogleFont(family, googleSet)) ?? null;

  return {
    label: elementLabel(el),
    typography,
    rendered,
    textColor,
    textHex: rgbToHex(textColor),
    background,
    backgroundHex: rgbToHex(background.color),
    contrast: evaluateContrast(ratio),
    isLargeText: isLargeText(typography.fontSizePx, typography.fontWeight),
    googleFamily,
  };
}
