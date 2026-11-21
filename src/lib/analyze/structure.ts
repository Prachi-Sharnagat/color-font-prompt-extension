/**
 * Page structure model and pure simplification.
 *
 * The DOM collector (content/analyze/collect-structure.ts) produces a RawNode
 * tree with geometry and layout styles but NO text content or media URLs.
 * Everything here is pure: collapse wrappers, merge repeated siblings, cap
 * size, find sections, and describe nodes with placeholders.
 */

export type NodeKind =
  | 'container'
  | 'text'
  | 'image'
  | 'video'
  | 'svg'
  | 'canvas'
  | 'iframe'
  | 'button'
  | 'link'
  | 'input';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutInfo {
  display: string;
  position: string;
  flexDirection?: string;
  flexWrap?: string;
  justifyContent?: string;
  alignItems?: string;
  /** Row/column gap in px, when non-zero. */
  rowGap?: number;
  columnGap?: number;
  /** Resolved grid track sizes in px (from computed style). */
  gridColumns?: number[];
  gridRows?: number;
  zIndex?: number;
  maxWidth?: string;
  /** Horizontally centered by auto margins. */
  centered?: boolean;
  /** CSS padding shorthand (px), e.g. "96px 24px". */
  padding?: string;
  /** `top` value for sticky/fixed elements. */
  top?: string;
  overflowX?: string;
}

export interface StyleInfo {
  background?: string; // hex
  gradient?: string; // truncated background-image gradient
  backgroundImage?: boolean; // url() background (placeholder only)
  color?: string; // hex text color
  radius?: number;
  shadow?: string;
  border?: string; // e.g. "1px #E5E7EB"
  opacity?: number;
  transformed?: boolean;
  fontSize?: number;
  fontWeight?: number;
  lineHeight?: number; // ratio to font size
  letterSpacing?: number; // px
  textTransform?: string;
  fontFamily?: string; // primary family
}

export interface RawNode {
  tag: string;
  selector: string;
  /** Landmark or ARIA role (header, nav, main, footer, section…). */
  role?: string;
  kind: NodeKind;
  box: Box;
  layout: LayoutInfo;
  style: StyleInfo;
  /** For text-bearing nodes: word count and semantic level. Never the text. */
  text?: { words: number; level: string };
  /** For media: intrinsic or rendered aspect ratio (w/h). */
  media?: { aspect: number };
  /** Starts invisible (opacity 0 / hidden), likely animated in. */
  hiddenInitially?: boolean;
  children: RawNode[];
}

export interface StructureNode extends RawNode {
  children: StructureNode[];
  /** Number of identical consecutive siblings this node stands for. */
  repeat?: number;
  /** Descendants dropped by depth/node caps. */
  truncated?: number;
}

export interface Section {
  index: number;
  label: string;
  node: StructureNode;
}

export interface PageStructure {
  viewport: { w: number; h: number };
  page: { w: number; h: number };
  sections: Section[];
  stats: { rawNodes: number; keptNodes: number; mergedGroups: number; truncatedNodes: number };
}

export interface SimplifyOptions {
  maxDepth?: number;
  maxNodes?: number;
  /** Minimum consecutive identical siblings to merge into "x N". */
  minRepeat?: number;
}

// ------------------------------------------------------------------ helpers

export function countNodes(node: RawNode): number {
  return 1 + node.children.reduce((sum, c) => sum + countNodes(c), 0);
}

const hasVisualStyle = (n: RawNode): boolean =>
  Boolean(
    n.style.background ||
      n.style.gradient ||
      n.style.backgroundImage ||
      n.style.shadow ||
      n.style.border ||
      n.style.radius ||
      (n.layout.padding && n.layout.padding !== '0px'),
  );

const sameBox = (a: Box, b: Box, tolerance = 2): boolean =>
  Math.abs(a.x - b.x) <= tolerance &&
  Math.abs(a.y - b.y) <= tolerance &&
  Math.abs(a.w - b.w) <= tolerance &&
  Math.abs(a.h - b.h) <= tolerance;

/** Replace style-less single-child wrappers that occupy the same box as their child. */
export function collapseWrappers(node: RawNode): RawNode {
  const children = node.children.map(collapseWrappers);
  const self: RawNode = { ...node, children };
  const only = children[0];
  if (
    self.kind === 'container' &&
    children.length === 1 &&
    only &&
    !hasVisualStyle(self) &&
    self.layout.position !== 'sticky' &&
    self.layout.position !== 'fixed' &&
    sameBox(self.box, only.box)
  ) {
    const role = only.role ?? self.role;
    return role ? { ...only, role } : only;
  }
  return self;
}

/** Shape signature used to detect repeated siblings (cards, list items…). */
export function signature(node: RawNode, depth = 2): string {
  // Paint differences (a featured card with a shadow/scale) keep variants apart.
  const paint = `${node.style.shadow ? 's' : ''}${node.style.transformed ? 't' : ''}${node.style.border ?? ''}`;
  const head = `${node.kind}:${node.tag}:${node.layout.display}:${paint}`;
  if (depth <= 0 || node.children.length === 0) return head;
  return `${head}(${node.children.map((c) => signature(c, depth - 1)).join(',')})`;
}

/** Merge runs of >= minRepeat consecutive siblings with the same signature. */
export function mergeRepeats(children: StructureNode[], minRepeat = 3): { children: StructureNode[]; merged: number } {
  const out: StructureNode[] = [];
  let merged = 0;
  for (let i = 0; i < children.length; ) {
    const first = children[i]!;
    const sig = signature(first);
    let j = i + 1;
    while (j < children.length && signature(children[j]!) === sig) j++;
    const run = j - i;
    if (run >= minRepeat) {
      // The group, not its first member: drop a trailing :nth-of-type(n).
      out.push({ ...first, selector: first.selector.replace(/:nth-of-type\(\d+\)$/, ''), repeat: run });
      merged++;
    } else {
      out.push(...children.slice(i, j));
    }
    i = j;
  }
  return { children: out, merged };
}

// ------------------------------------------------------------------ placeholders

const NAMED_RATIOS: Array<[number, string]> = [
  [1, '1:1'],
  [4 / 3, '4:3'],
  [3 / 2, '3:2'],
  [16 / 9, '16:9'],
  [21 / 9, '21:9'],
  [3 / 4, '3:4'],
  [2 / 3, '2:3'],
  [9 / 16, '9:16'],
];

/** Nearest common aspect ratio label, or a decimal ratio if none is close. */
export function aspectLabel(aspect: number): string {
  if (!Number.isFinite(aspect) || aspect <= 0) return 'unknown ratio';
  let best: [number, string] | undefined;
  for (const entry of NAMED_RATIOS) {
    if (!best || Math.abs(Math.log(entry[0] / aspect)) < Math.abs(Math.log(best[0] / aspect))) best = entry;
  }
  if (best && Math.abs(Math.log(best[0] / aspect)) < 0.04) return best[1];
  return `${Math.round(aspect * 100) / 100}:1`;
}

const LEVEL_NAMES: Record<string, string> = {
  h1: 'Heading (h1)',
  h2: 'Heading (h2)',
  h3: 'Heading (h3)',
  h4: 'Heading (h4)',
  h5: 'Heading (h5)',
  h6: 'Heading (h6)',
  p: 'Paragraph',
  li: 'List item',
  button: 'Button label',
  link: 'Link text',
  label: 'Label',
  blockquote: 'Quote',
  small: 'Small text',
  text: 'Text',
};

const wordsLabel = (n: number): string => (n <= 1 ? '1 word' : n <= 12 ? `${n} words` : `~${Math.round(n / 5) * 5} words`);

/** Placeholder description; never contains original content. */
export function placeholderFor(node: RawNode): string | null {
  switch (node.kind) {
    case 'image':
      return `Image ${aspectLabel(node.media?.aspect ?? node.box.w / Math.max(1, node.box.h))}`;
    case 'video':
      return `Video ${aspectLabel(node.media?.aspect ?? node.box.w / Math.max(1, node.box.h))}`;
    case 'svg':
      return `Icon/graphic ${Math.round(node.box.w)}×${Math.round(node.box.h)}`;
    case 'canvas':
      return `Canvas ${Math.round(node.box.w)}×${Math.round(node.box.h)} (see 3D/WebGL)`;
    case 'iframe':
      return `Embed ${aspectLabel(node.box.w / Math.max(1, node.box.h))}`;
    case 'input':
      return `Form field ${Math.round(node.box.w)}×${Math.round(node.box.h)}`;
    default:
      break;
  }
  if (node.text) {
    const name = LEVEL_NAMES[node.text.level] ?? 'Text';
    return `${name}, ${wordsLabel(node.text.words)}`;
  }
  return null;
}

// ------------------------------------------------------------------ description

const px = (n: number): string => `${Math.round(n)}px`;

export function describeLayout(node: RawNode): string {
  const l = node.layout;
  const parts: string[] = [];
  if (l.display.includes('grid')) {
    const cols = l.gridColumns ?? [];
    if (cols.length > 0) {
      const equal = cols.every((c) => Math.abs(c - (cols[0] ?? 0)) < 2);
      parts.push(`grid ${cols.length} col${cols.length === 1 ? '' : 's'}${equal && cols.length > 1 ? ' (equal)' : ''}`);
    } else {
      parts.push('grid');
    }
  } else if (l.display.includes('flex')) {
    parts.push(`flex ${l.flexDirection?.startsWith('column') ? 'column' : 'row'}${l.flexWrap === 'wrap' ? ' wrap' : ''}`);
  }
  const gap =
    l.rowGap && l.columnGap && Math.abs(l.rowGap - l.columnGap) > 1
      ? `gap ${px(l.rowGap)} ${px(l.columnGap)}`
      : l.rowGap || l.columnGap
        ? `gap ${px(l.rowGap ?? l.columnGap ?? 0)}`
        : null;
  if (gap) parts.push(gap);
  if (l.justifyContent && !['normal', 'flex-start', 'start'].includes(l.justifyContent)) {
    parts.push(`justify ${l.justifyContent}`);
  }
  if (l.alignItems && !['normal', 'stretch'].includes(l.alignItems)) parts.push(`align ${l.alignItems}`);
  if (l.position === 'sticky' || l.position === 'fixed') parts.push(`${l.position}${l.top ? ` top ${l.top}` : ''}`);
  else if (l.position === 'absolute') parts.push('absolute');
  if (l.maxWidth) parts.push(`max-width ${l.maxWidth}${l.centered ? ' centered' : ''}`);
  if (l.padding && l.padding !== '0px') parts.push(`padding ${l.padding}`);
  if (l.zIndex !== undefined) parts.push(`z ${l.zIndex}`);
  if (l.overflowX === 'auto' || l.overflowX === 'scroll') parts.push('horizontal scroll');
  return parts.join(', ');
}

export function describeStyle(node: RawNode): string {
  const s = node.style;
  const parts: string[] = [];
  if (s.background) parts.push(`bg ${s.background}`);
  if (s.gradient) parts.push(`gradient ${s.gradient}`);
  if (s.backgroundImage) parts.push('bg image');
  if (node.kind === 'text' || node.kind === 'button' || node.kind === 'link') {
    if (s.fontSize) parts.push(`${px(s.fontSize)}/${s.fontWeight ?? 400}`);
    if (s.color) parts.push(s.color);
    if (s.textTransform && s.textTransform !== 'none') parts.push(s.textTransform);
  }
  if (s.radius) parts.push(`radius ${px(s.radius)}`);
  if (s.border) parts.push(`border ${s.border}`);
  if (s.shadow) parts.push('shadow');
  if (node.hiddenInitially) parts.push('starts hidden (animated in?)');
  return parts.join(', ');
}

// ------------------------------------------------------------------ simplify

function toStructure(node: RawNode): StructureNode {
  return { ...node, children: node.children.map(toStructure) };
}

/** Find the node whose children are the page's top-level sections. */
function sectionParent(root: StructureNode, pageWidth: number): StructureNode {
  let node = root;
  for (let i = 0; i < 6; i++) {
    const wide = node.children.filter((c) => c.box.w >= pageWidth * 0.6);
    // Descend through app wrappers (#__next, #root, <main>) with one wide child.
    if (wide.length === 1 && wide[0]!.kind === 'container' && wide[0]!.children.length > 0) {
      const only = wide[0]!;
      const hasLandmarkSiblings = node.children.some((c) => c !== only && c.role);
      if (hasLandmarkSiblings && only.role !== 'main') break;
      node = only;
      continue;
    }
    break;
  }
  return node;
}

function sectionLabel(node: StructureNode, index: number): string {
  const role = node.role ?? (['header', 'nav', 'main', 'footer', 'section', 'aside', 'article'].includes(node.tag) ? node.tag : undefined);
  return role ? `${role} (${node.selector})` : `Section ${index + 1} (${node.selector})`;
}

function capTree(
  node: StructureNode,
  depth: number,
  opts: Required<SimplifyOptions>,
  budget: { left: number; truncated: number; merged: number },
): StructureNode {
  budget.left--;
  if (depth >= opts.maxDepth || budget.left <= 0) {
    const dropped = node.children.reduce((sum, c) => sum + countNodes(c), 0);
    budget.truncated += dropped;
    return { ...node, children: [], ...(dropped > 0 ? { truncated: dropped } : {}) };
  }
  const { children, merged } = mergeRepeats(node.children, opts.minRepeat);
  budget.merged += merged;
  const capped = children.map((c) => capTree(c, depth + 1, opts, budget));
  return { ...node, children: capped };
}

export function simplifyStructure(
  raw: RawNode,
  viewport: { w: number; h: number },
  page: { w: number; h: number },
  options: SimplifyOptions = {},
): PageStructure {
  const opts: Required<SimplifyOptions> = { maxDepth: 8, maxNodes: 400, minRepeat: 3, ...options };
  const rawNodes = countNodes(raw);
  const collapsed = toStructure(collapseWrappers(raw));
  const parent = sectionParent(collapsed, page.w);

  // <main> usually wraps the page's real sections: list them individually.
  const topLevel = parent.children.flatMap((child) =>
    (child.role === 'main' || child.tag === 'main') && child.children.length > 1 ? child.children : [child],
  );

  const budget = { left: opts.maxNodes, truncated: 0, merged: 0 };
  const top = mergeRepeats(topLevel, opts.minRepeat);
  budget.merged += top.merged;
  const sections: Section[] = [];
  for (const [index, child] of top.children.entries()) {
    if (budget.left <= 0) {
      // Out of budget: count the remaining sections as truncated.
      budget.truncated += countNodes(child);
      continue;
    }
    sections.push({ index, label: sectionLabel(child, index), node: capTree(child, 1, opts, budget) });
  }

  const kept = sections.reduce((sum, s) => sum + countNodes(s.node), 0);
  return {
    viewport,
    page,
    sections,
    stats: { rawNodes, keptNodes: kept, mergedGroups: budget.merged, truncatedNodes: budget.truncated },
  };
}

// ------------------------------------------------------------------ outline

function outlineLine(node: StructureNode): string {
  const name = node.repeat ? `${node.selector} × ${node.repeat}` : node.selector;
  const size = `${Math.round(node.box.w)}×${Math.round(node.box.h)}`;
  const details = [describeLayout(node), describeStyle(node)].filter(Boolean).join('; ');
  const placeholder = placeholderFor(node);
  const tail = node.truncated ? ` … (+${node.truncated} more nodes)` : '';
  return `${name} [${size}]${placeholder ? ` "${placeholder}"` : ''}${details ? ` {${details}}` : ''}${tail}`;
}

/** Indented, human/model-readable outline of the page structure. */
export function renderOutline(structure: PageStructure): string {
  const lines: string[] = [];
  const walk = (node: StructureNode, depth: number): void => {
    lines.push(`${'  '.repeat(depth)}- ${outlineLine(node)}`);
    for (const child of node.children) walk(child, depth + 1);
  };
  for (const section of structure.sections) {
    lines.push(`## ${section.label}`);
    walk(section.node, 0);
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}
