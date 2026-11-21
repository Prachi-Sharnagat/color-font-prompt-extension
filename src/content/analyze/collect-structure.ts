/**
 * DOM → RawNode tree. Records geometry, layout and paint styles only. Text is
 * reduced to a word count and media to an aspect ratio; no text content, URLs
 * or alt text ever leave this function.
 */
import { rgbToHex } from '../../lib/color-conversion';
import { getStyle, resolveCssColor } from '../../lib/dom';
import { parseFontFamilyList } from '../../lib/extract/typography';
import { stableSelector } from '../../lib/analyze/selectors';
import type { LayoutInfo, NodeKind, RawNode, StyleInfo } from '../../lib/analyze/structure';
import { countWords, isSkipped, pxValue, renderedChildren } from './walk';

const INLINE_TAGS = new Set([
  'SPAN', 'STRONG', 'EM', 'B', 'I', 'U', 'A', 'CODE', 'SMALL', 'MARK', 'SUB', 'SUP', 'ABBR', 'TIME',
  'S', 'DEL', 'INS', 'KBD', 'Q', 'CITE', 'LABEL', 'BR', 'WBR', 'DFN', 'VAR', 'BDI', 'BDO', 'DATA',
]);

const LANDMARKS: Record<string, string> = {
  HEADER: 'header',
  NAV: 'nav',
  MAIN: 'main',
  FOOTER: 'footer',
  SECTION: 'section',
  ASIDE: 'aside',
  ARTICLE: 'article',
  FORM: 'form',
};

const TEXT_LEVELS: Record<string, string> = {
  H1: 'h1', H2: 'h2', H3: 'h3', H4: 'h4', H5: 'h5', H6: 'h6',
  P: 'p', LI: 'li', BUTTON: 'button', A: 'link', LABEL: 'label', BLOCKQUOTE: 'blockquote', SMALL: 'small',
};

const MEDIA_KINDS = new Set<NodeKind>(['image', 'video', 'svg', 'canvas', 'iframe', 'input']);

function kindOf(el: Element): NodeKind {
  const tag = el.tagName;
  if (tag === 'IMG' || tag === 'PICTURE') return 'image';
  if (tag === 'VIDEO') return 'video';
  if (tag.toLowerCase() === 'svg') return 'svg';
  if (tag === 'CANVAS') return 'canvas';
  if (tag === 'IFRAME' || tag === 'EMBED' || tag === 'OBJECT') return 'iframe';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return 'input';
  if (tag === 'BUTTON' || el.getAttribute('role') === 'button') return 'button';
  if (tag === 'A' && el.hasAttribute('href')) return 'link';
  return 'container';
}

/**
 * Only inline-rendered descendants, so the element reads as one run of text.
 * Uses computed display: children of flex/grid containers and positioned
 * elements compute to block even when they are <a>/<span>.
 */
function isInlineOnly(el: Element): boolean {
  for (const child of Array.from(el.children)) {
    if (!INLINE_TAGS.has(child.tagName)) return false;
    const display = getStyle(child).display;
    if (display !== 'inline' && display !== 'contents') return false;
    if (!isInlineOnly(child)) return false;
  }
  return true;
}

/** Rendered words (innerText inserts spaces/newlines between boxes). */
function renderedWords(el: Element): number {
  const text = el instanceof HTMLElement ? el.innerText : el.textContent;
  return countWords(text);
}

function compressBox(t: number, r: number, b: number, l: number): string | undefined {
  const v = [t, r, b, l].map((n) => Math.round(n));
  if (v.every((n) => n === 0)) return undefined;
  const [vt, vr, vb, vl] = v as [number, number, number, number];
  if (vt === vr && vr === vb && vb === vl) return `${vt}px`;
  if (vt === vb && vl === vr) return `${vt}px ${vr}px`;
  return `${vt}px ${vr}px ${vb}px ${vl}px`;
}

function layoutOf(style: CSSStyleDeclaration, rect: DOMRect, parentWidth: number): LayoutInfo {
  const layout: LayoutInfo = { display: style.display, position: style.position };
  const isFlex = style.display.includes('flex');
  const isGrid = style.display.includes('grid');
  if (isFlex) {
    layout.flexDirection = style.flexDirection;
    layout.flexWrap = style.flexWrap;
  }
  if (isFlex || isGrid) {
    layout.justifyContent = style.justifyContent;
    layout.alignItems = style.alignItems;
    const rowGap = pxValue(style.rowGap);
    const columnGap = pxValue(style.columnGap);
    if (rowGap > 0) layout.rowGap = rowGap;
    if (columnGap > 0) layout.columnGap = columnGap;
  }
  if (isGrid) {
    const cols = style.gridTemplateColumns.split(/\s+/).map(pxValue).filter((n) => n > 0);
    if (cols.length > 0) layout.gridColumns = cols.map((n) => Math.round(n));
    const rows = style.gridTemplateRows.split(/\s+/).filter((t) => pxValue(t) > 0).length;
    if (rows > 0) layout.gridRows = rows;
  }
  if (style.position !== 'static' && style.zIndex !== 'auto') {
    const z = Number.parseInt(style.zIndex, 10);
    if (Number.isFinite(z)) layout.zIndex = z;
  }
  if (style.maxWidth !== 'none') layout.maxWidth = style.maxWidth;
  const ml = pxValue(style.marginLeft);
  const mr = pxValue(style.marginRight);
  if (ml > 0 && Math.abs(ml - mr) < 1 && rect.width < parentWidth - 2) layout.centered = true;
  const padding = compressBox(pxValue(style.paddingTop), pxValue(style.paddingRight), pxValue(style.paddingBottom), pxValue(style.paddingLeft));
  if (padding) layout.padding = padding;
  if (style.position === 'sticky' || style.position === 'fixed') layout.top = style.top;
  if (style.overflowX === 'auto' || style.overflowX === 'scroll') layout.overflowX = style.overflowX;
  return layout;
}

function hexOf(value: string): string | undefined {
  const color = resolveCssColor(value);
  if (!color || color.a <= 0) return undefined;
  return rgbToHex(color, color.a);
}

function styleOf(style: CSSStyleDeclaration, textual: boolean): StyleInfo {
  const info: StyleInfo = {};
  const bg = hexOf(style.backgroundColor);
  if (bg) info.background = bg;
  const bgImage = style.backgroundImage;
  if (bgImage && bgImage !== 'none') {
    if (bgImage.includes('gradient(')) info.gradient = bgImage.length > 160 ? `${bgImage.slice(0, 157)}…` : bgImage;
    if (bgImage.includes('url(')) info.backgroundImage = true;
  }
  const radius = pxValue(style.borderTopLeftRadius);
  if (radius > 0) info.radius = style.borderTopLeftRadius.endsWith('%') && radius >= 50 ? 9999 : Math.round(radius);
  if (style.boxShadow && style.boxShadow !== 'none') {
    info.shadow = style.boxShadow.length > 120 ? `${style.boxShadow.slice(0, 117)}…` : style.boxShadow;
  }
  const bw = pxValue(style.borderTopWidth);
  if (bw > 0 && style.borderTopStyle !== 'none') {
    const bc = hexOf(style.borderTopColor);
    if (bc) info.border = `${Math.round(bw)}px ${bc}`;
  }
  const opacity = Number.parseFloat(style.opacity);
  if (opacity < 1) info.opacity = Math.round(opacity * 100) / 100;
  if (style.transform && style.transform !== 'none') info.transformed = true;

  if (textual) {
    const color = hexOf(style.color);
    if (color) info.color = color;
    const size = pxValue(style.fontSize);
    if (size > 0) info.fontSize = Math.round(size * 10) / 10;
    info.fontWeight = Number.parseFloat(style.fontWeight) || 400;
    const lh = pxValue(style.lineHeight);
    if (lh > 0 && size > 0) info.lineHeight = Math.round((lh / size) * 100) / 100;
    const ls = pxValue(style.letterSpacing);
    if (ls !== 0) info.letterSpacing = Math.round(ls * 100) / 100;
    if (style.textTransform !== 'none') info.textTransform = style.textTransform;
    const family = parseFontFamilyList(style.fontFamily)[0];
    if (family) info.fontFamily = family;
  }
  return info;
}

export interface CollectStructureResult {
  root: RawNode;
  viewport: { w: number; h: number };
  page: { w: number; h: number };
  rawCount: number;
  capped: boolean;
}

export function collectStructure(doc: Document = document, maxNodes = 4000): CollectStructureResult {
  const view = doc.defaultView ?? window;
  const scrollX = view.scrollX;
  const scrollY = view.scrollY;
  const budget = { count: 0, capped: false };

  const visit = (el: Element, parentWidth: number): RawNode[] => {
    if (isSkipped(el)) return [];
    if (budget.count >= maxNodes) {
      budget.capped = true;
      return [];
    }
    const style = getStyle(el);
    if (style.display === 'none') return [];
    if (style.display === 'contents') return renderedChildren(el).flatMap((c) => visit(c, parentWidth));

    const rect = el.getBoundingClientRect();
    let kind = kindOf(el);
    const leafMedia = MEDIA_KINDS.has(kind);
    const inlineOnly = !leafMedia && el !== doc.body && isInlineOnly(el) && !el.shadowRoot;
    const words = inlineOnly ? renderedWords(el) : 0;

    const children = leafMedia || inlineOnly ? [] : renderedChildren(el).flatMap((c) => visit(c, rect.width));

    const empty = rect.width < 1 || rect.height < 1;
    if (empty && children.length === 0 && style.position !== 'fixed') return [];
    if (style.visibility === 'hidden' && children.length === 0) return [];

    if (inlineOnly && words > 0 && kind === 'container') kind = 'text';
    const textual = words > 0;
    const info = styleOf(style, textual);
    // Drop empty, unpainted boxes (spacers, clearfix divs).
    if (kind === 'container' && children.length === 0 && !textual && !info.background && !info.gradient && !info.backgroundImage && !info.border && !info.shadow) {
      return [];
    }

    budget.count++;
    const node: RawNode = {
      tag: el.tagName.toLowerCase(),
      selector: stableSelector(el),
      kind,
      box: {
        x: Math.round(rect.left + scrollX),
        y: Math.round(rect.top + scrollY),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      },
      layout: layoutOf(style, rect, parentWidth),
      style: info,
      children,
    };
    const role = el.getAttribute('role') ?? LANDMARKS[el.tagName];
    if (role) node.role = role;
    if (textual) node.text = { words, level: TEXT_LEVELS[el.tagName] ?? 'text' };
    if (kind === 'image' || kind === 'video') {
      const media = el as HTMLImageElement & HTMLVideoElement;
      const iw = kind === 'image' ? media.naturalWidth : media.videoWidth;
      const ih = kind === 'image' ? media.naturalHeight : media.videoHeight;
      const aspect = iw > 0 && ih > 0 ? iw / ih : rect.width / Math.max(1, rect.height);
      node.media = { aspect: Math.round(aspect * 1000) / 1000 };
    }
    if (style.opacity === '0' || style.visibility === 'hidden') node.hiddenInitially = true;
    return [node];
  };

  const body = doc.body;
  const rootNodes = body ? visit(body, view.innerWidth) : [];
  const scroller = doc.scrollingElement ?? doc.documentElement;
  const root: RawNode = rootNodes[0] ?? {
    tag: 'body',
    selector: 'body',
    kind: 'container',
    box: { x: 0, y: 0, w: view.innerWidth, h: view.innerHeight },
    layout: { display: 'block', position: 'static' },
    style: {},
    children: [],
  };
  return {
    root,
    viewport: { w: view.innerWidth, h: view.innerHeight },
    page: { w: scroller.scrollWidth, h: scroller.scrollHeight },
    rawCount: budget.count,
    capped: budget.capped,
  };
}
