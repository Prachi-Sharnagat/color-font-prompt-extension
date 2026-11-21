/**
 * DOM traversal helpers shared by the analysis collectors (isolated world).
 */
import { HOST_TAG } from '../../ui/shadow-host';

export const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
  'LINK',
  'META',
  'HEAD',
  'TITLE',
  'BASE',
  'BR',
  'WBR',
]);

export const isSkipped = (el: Element): boolean => SKIP_TAGS.has(el.tagName) || el.tagName.toLowerCase() === HOST_TAG;

/** Rendered children: shadow root content if any, slots resolved to assigned nodes. */
export function renderedChildren(el: Element): Element[] {
  if (el.tagName === 'SLOT') {
    const assigned = (el as HTMLSlotElement).assignedElements({ flatten: true });
    return assigned.length > 0 ? assigned : Array.from(el.children);
  }
  return Array.from((el.shadowRoot ?? el).children);
}

/** Flat walk in render order (open shadow roots included), capped. */
export function* walkRendered(root: Element, max = 6000): Generator<Element> {
  let count = 0;
  const stack: Element[] = [root];
  while (stack.length > 0 && count < max) {
    const el = stack.pop()!;
    if (isSkipped(el)) continue;
    count++;
    yield el;
    const kids = renderedChildren(el);
    for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]!);
  }
}

/** Length of the element's own (direct) text nodes. */
export function ownTextLength(el: Element): number {
  let length = 0;
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) length += (child.textContent ?? '').trim().length;
  }
  return length;
}

export function countWords(text: string | null): number {
  const trimmed = (text ?? '').trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export const pxValue = (value: string): number => {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};
