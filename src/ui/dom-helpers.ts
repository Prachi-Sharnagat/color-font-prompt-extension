/** Tiny typed element builder. Never uses innerHTML, so page-derived text is always safe. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { class?: string; text?: string; attrs?: Record<string, string> } = {},
  children: Array<Node | string> = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.attrs) {
    for (const [key, value] of Object.entries(props.attrs)) el.setAttribute(key, value);
  }
  for (const child of children) el.append(child);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Build an SVG icon from static path data. */
export function icon(paths: readonly string[], viewBox = '0 0 24 24'): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

export const ICON_CLOSE = ['M18 6 6 18', 'M6 6l12 12'] as const;
