/**
 * DOM helpers that work across open shadow roots and same-origin iframes.
 */
import type { RGB, RGBA } from './color-conversion';
import { parseCssColor } from './color-parse';
import { compositeOver } from './contrast';

export interface HitResult {
  element: Element;
  /** Offset of the element's frame viewport within the top-level viewport. */
  frameOffset: { x: number; y: number };
  /** True when the hit is a cross-origin iframe we can't look inside. */
  crossOriginFrame: boolean;
}

const isFrame = (el: Element): el is HTMLIFrameElement =>
  el.tagName === 'IFRAME' || el.tagName === 'FRAME';

/** Same-origin frame document, or null if cross-origin / not loaded. */
function frameDocument(frame: HTMLIFrameElement): Document | null {
  try {
    return frame.contentDocument;
  } catch {
    return null;
  }
}

/**
 * elementFromPoint that descends into open shadow roots and same-origin
 * iframes. Closed shadow roots stop at their host (by design).
 */
export function deepElementFromPoint(x: number, y: number, root: Document = document): HitResult | null {
  let offsetX = 0;
  let offsetY = 0;
  let el = root.elementFromPoint(x, y);

  for (let depth = 0; el && depth < 32; depth++) {
    // Pierce open shadow roots.
    const shadow: ShadowRoot | null = el.shadowRoot;
    if (shadow) {
      const inner = shadow.elementFromPoint(x - offsetX, y - offsetY);
      if (inner && inner !== el) {
        el = inner;
        continue;
      }
    }

    if (isFrame(el)) {
      const doc = frameDocument(el);
      if (!doc) return { element: el, frameOffset: { x: offsetX, y: offsetY }, crossOriginFrame: true };
      const rect = el.getBoundingClientRect();
      const style = getStyle(el);
      offsetX += rect.left + el.clientLeft + (Number.parseFloat(style.paddingLeft) || 0);
      offsetY += rect.top + el.clientTop + (Number.parseFloat(style.paddingTop) || 0);
      const inner = doc.elementFromPoint(x - offsetX, y - offsetY);
      if (!inner) break;
      el = inner;
      continue;
    }
    break;
  }

  return el ? { element: el, frameOffset: { x: offsetX, y: offsetY }, crossOriginFrame: false } : null;
}

/** getComputedStyle from the element's own window (matters for iframes). */
export function getStyle(el: Element): CSSStyleDeclaration {
  const view = el.ownerDocument.defaultView ?? window;
  return view.getComputedStyle(el);
}

/** Parent element, crossing shadow boundaries and same-origin frame borders. */
export function parentAcross(el: Element): Element | null {
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode();
  // Not `instanceof ShadowRoot`: that fails for nodes from another frame's realm.
  if (root.nodeType === Node.DOCUMENT_FRAGMENT_NODE && 'host' in root) {
    return (root as ShadowRoot).host;
  }
  try {
    return el.ownerDocument.defaultView?.frameElement ?? null;
  } catch {
    return null; // Cross-origin parent frame.
  }
}

// ------------------------------------------------------------------ colors

let colorCtx: CanvasRenderingContext2D | null | undefined;

/**
 * Parse any CSS color to sRGB. Uses the pure parser first, then lets a canvas
 * convert exotic forms (lab(), lch(), display-p3, named colors).
 */
export function resolveCssColor(value: string): RGBA | null {
  const parsed = parseCssColor(value);
  if (parsed) return parsed;

  if (colorCtx === undefined) {
    colorCtx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  }
  const ctx = colorCtx;
  if (!ctx) return null;
  ctx.canvas.width = 1;
  ctx.canvas.height = 1;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = '#010203';
  ctx.fillStyle = value;
  // fillStyle silently ignores invalid values; detect that.
  if (ctx.fillStyle === '#010203' && value.trim().toLowerCase() !== '#010203') return null;
  ctx.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0, a = 255] = ctx.getImageData(0, 0, 1, 1).data;
  return { r, g, b, a: Math.round((a / 255) * 1000) / 1000 };
}

export interface BackgroundResult {
  color: RGB;
  /** True when the real backdrop may differ (images, gradients, no bg set). */
  approximate: boolean;
  reasons: string[];
}

const WHITE: RGB = { r: 255, g: 255, b: 255 };

function isTransparent(style: CSSStyleDeclaration): boolean {
  const color = resolveCssColor(style.backgroundColor);
  return (!color || color.a === 0) && style.backgroundImage === 'none';
}

/**
 * Effective background behind an element: walk up ancestors collecting
 * background colors until an opaque one is found, then alpha-composite them.
 * Background images/gradients can't be resolved to one color, so they mark
 * the result approximate.
 */
export function effectiveBackground(el: Element): BackgroundResult {
  const layers: RGBA[] = [];
  const reasons = new Set<string>();
  let foundOpaque = false;

  for (let node: Element | null = el; node; node = parentAcross(node)) {
    const doc = node.ownerDocument;
    // CSS propagates <body>'s background to the whole canvas when <html> has
    // none, so text directly on <html> sits on the body color.
    const styleSource =
      node === doc.documentElement && doc.body && isTransparent(getStyle(node)) ? doc.body : node;
    const style = getStyle(styleSource);
    if (style.backgroundImage && style.backgroundImage !== 'none') {
      reasons.add(
        'A background image or gradient sits behind this text. The ratio uses the nearest solid color, so the real contrast may be lower.',
      );
    }
    const color = resolveCssColor(style.backgroundColor);
    if (color && color.a > 0) {
      layers.push(color);
      if (color.a >= 1) {
        foundOpaque = true;
        break;
      }
    }
  }

  if (!foundOpaque) {
    reasons.add('No solid background color found; assumed white.');
  }

  // Composite from the farthest ancestor down to the element.
  let result = WHITE;
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    if (layer) result = compositeOver(layer, result);
  }

  return { color: result, approximate: reasons.size > 0, reasons: [...reasons] };
}

// ------------------------------------------------------------------ scrolling

/** Nearest ancestor that can scroll in the wheel's direction. */
function scrollableAncestor(el: Element, dx: number, dy: number): Element | null {
  for (let node: Element | null = el; node; node = parentAcross(node)) {
    const doc = node.ownerDocument;
    if (node === doc.documentElement || node === doc.body) {
      return doc.scrollingElement;
    }
    const style = getStyle(node);
    const canY = /(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight;
    const canX = /(auto|scroll|overlay)/.test(style.overflowX) && node.scrollWidth > node.clientWidth;
    if ((dy !== 0 && canY) || (dx !== 0 && canX)) return node;
  }
  return document.scrollingElement;
}

/**
 * Our capture layer sits on top of the page, so wheel events would only scroll
 * the main document. Forward them to the scroll container under the cursor.
 */
export function forwardWheel(event: WheelEvent, target: Element | null): void {
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
  const dx = event.deltaX * unit;
  const dy = event.deltaY * unit;
  const scroller = target ? scrollableAncestor(target, dx, dy) : document.scrollingElement;
  if (!scroller) return;
  event.preventDefault();
  scroller.scrollBy({ left: dx, top: dy, behavior: 'instant' });
}
