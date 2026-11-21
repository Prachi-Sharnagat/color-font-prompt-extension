import { describe, expect, it } from 'vitest';
import {
  aspectLabel,
  collapseWrappers,
  describeLayout,
  mergeRepeats,
  placeholderFor,
  renderOutline,
  simplifyStructure,
  type RawNode,
  type StructureNode,
} from '../../src/lib/analyze/structure';

let seq = 0;
function node(partial: Partial<RawNode> & { children?: RawNode[] } = {}): RawNode {
  seq++;
  return {
    tag: 'div',
    selector: `div.n${seq}`,
    kind: 'container',
    box: { x: 0, y: 0, w: 1200, h: 100 },
    layout: { display: 'block', position: 'static' },
    style: {},
    children: [],
    ...partial,
  };
}

const card = (y: number): RawNode =>
  node({
    selector: 'article.card',
    tag: 'article',
    box: { x: 0, y, w: 360, h: 420 },
    layout: { display: 'flex', position: 'static', flexDirection: 'column', rowGap: 16 },
    style: { background: '#FFFFFF', radius: 16, shadow: '0 1px 2px #0000001a' },
    children: [
      node({ tag: 'img', kind: 'image', media: { aspect: 16 / 9 }, box: { x: 0, y, w: 360, h: 202 } }),
      node({ tag: 'h3', kind: 'text', text: { words: 4, level: 'h3' }, box: { x: 0, y: y + 210, w: 360, h: 28 } }),
      node({ tag: 'p', kind: 'text', text: { words: 23, level: 'p' }, box: { x: 0, y: y + 240, w: 360, h: 80 } }),
    ],
  });

describe('aspectLabel', () => {
  it('snaps to common ratios', () => {
    expect(aspectLabel(1920 / 1080)).toBe('16:9');
    expect(aspectLabel(1)).toBe('1:1');
    expect(aspectLabel(1080 / 1920)).toBe('9:16');
    expect(aspectLabel(1.33)).toBe('4:3');
  });

  it('falls back to a decimal ratio', () => {
    expect(aspectLabel(2.9)).toBe('2.9:1');
    expect(aspectLabel(0)).toBe('unknown ratio');
  });
});

describe('placeholderFor', () => {
  it('describes text by role and length only', () => {
    expect(placeholderFor(node({ kind: 'text', text: { words: 6, level: 'h1' } }))).toBe('Heading (h1), 6 words');
    expect(placeholderFor(node({ kind: 'text', text: { words: 43, level: 'p' } }))).toBe('Paragraph, ~45 words');
    expect(placeholderFor(node({ kind: 'button', text: { words: 2, level: 'button' } }))).toBe('Button label, 2 words');
  });

  it('describes media as aspect-ratio boxes', () => {
    expect(placeholderFor(node({ kind: 'image', media: { aspect: 16 / 9 } }))).toBe('Image 16:9');
    expect(placeholderFor(node({ kind: 'video', box: { x: 0, y: 0, w: 400, h: 400 } }))).toBe('Video 1:1');
    expect(placeholderFor(node())).toBeNull();
  });
});

describe('collapseWrappers', () => {
  it('removes style-less wrappers with the same box', () => {
    const inner = node({ selector: 'div.inner', style: { background: '#000000' } });
    const outer = node({ selector: 'div.outer', role: 'section', children: [inner] });
    const result = collapseWrappers(outer);
    expect(result.selector).toBe('div.inner');
    expect(result.role).toBe('section'); // landmark role is kept
  });

  it('keeps wrappers that paint something or are sticky', () => {
    const inner = node();
    expect(collapseWrappers(node({ style: { background: '#111111' }, children: [inner] })).children).toHaveLength(1);
    expect(collapseWrappers(node({ layout: { display: 'block', position: 'sticky' }, children: [node()] })).children).toHaveLength(1);
  });
});

describe('mergeRepeats', () => {
  it('merges runs of identical siblings', () => {
    const kids = [card(0), card(500), card(1000), card(1500)].map((c, i) => ({
      ...c,
      selector: `div.grid > article.card:nth-of-type(${i + 1})`,
    })) as StructureNode[];
    const { children, merged } = mergeRepeats(kids);
    expect(children).toHaveLength(1);
    expect(children[0]?.repeat).toBe(4);
    expect(children[0]?.selector).toBe('div.grid > article.card');
    expect(merged).toBe(1);
  });

  it('keeps a visually different variant (featured card) out of the run', () => {
    const featured = { ...card(500), style: { ...card(500).style, transformed: true, shadow: '0 20px 60px #0004' } };
    const kids = [card(0), featured, card(1000)] as StructureNode[];
    expect(mergeRepeats(kids).children).toHaveLength(3);
  });

  it('leaves short runs and different shapes alone', () => {
    const kids = [card(0), card(500), node({ tag: 'p', kind: 'text', text: { words: 3, level: 'p' } })] as StructureNode[];
    expect(mergeRepeats(kids).children).toHaveLength(3);
  });
});

describe('describeLayout', () => {
  it('summarizes grid and flex', () => {
    expect(
      describeLayout(node({ layout: { display: 'grid', position: 'static', gridColumns: [360, 360, 360], rowGap: 32, columnGap: 32 } })),
    ).toBe('grid 3 cols (equal), gap 32px');
    expect(
      describeLayout(
        node({
          layout: { display: 'flex', position: 'sticky', top: '0px', justifyContent: 'space-between', alignItems: 'center', maxWidth: '1200px', centered: true },
        }),
      ),
    ).toBe('flex row, justify space-between, align center, sticky top 0px, max-width 1200px centered');
  });
});

describe('simplifyStructure', () => {
  const page = { w: 1200, h: 3000 };
  const viewport = { w: 1200, h: 800 };

  it('finds sections through app wrappers and merges cards', () => {
    const header = node({ tag: 'header', role: 'header', selector: 'header.site', layout: { display: 'flex', position: 'sticky', top: '0px' } });
    const grid = node({
      selector: 'div.grid',
      layout: { display: 'grid', position: 'static', gridColumns: [360, 360, 360], rowGap: 32, columnGap: 32 },
      children: Array.from({ length: 6 }, (_, i) => card(i * 450)),
    });
    const features = node({ tag: 'section', selector: 'section#features', style: { background: '#F8FAFC' }, children: [grid] });
    const footer = node({ tag: 'footer', role: 'footer', selector: 'footer' });
    const app = node({ selector: '#__next', box: { x: 0, y: 0, w: 1200, h: 3000 }, style: { background: '#FFFFFF' }, children: [header, features, footer] });
    const body = node({ tag: 'body', selector: 'body', box: { x: 0, y: 0, w: 1200, h: 3000 }, children: [app] });

    const result = simplifyStructure(body, viewport, page);
    expect(result.sections.map((s) => s.label)).toEqual(['header (header.site)', 'section (section#features)', 'footer (footer)']);
    const gridNode = result.sections[1]?.node.children[0];
    expect(gridNode?.children).toHaveLength(1);
    expect(gridNode?.children[0]?.repeat).toBe(6);
    expect(result.stats.mergedGroups).toBe(1);
  });

  it('lists the children of <main> as individual sections', () => {
    const hero = node({ tag: 'section', selector: 'section.hero' });
    const pricing = node({ tag: 'section', selector: '#pricing' });
    const main = node({ tag: 'main', role: 'main', selector: 'main', children: [hero, pricing] });
    const body = node({ tag: 'body', selector: 'body', children: [node({ tag: 'header', role: 'header', selector: 'header' }), main] });
    const result = simplifyStructure(body, viewport, page);
    expect(result.sections.map((s) => s.node.selector)).toEqual(['header', 'section.hero', '#pricing']);
  });

  it('caps depth and records truncated nodes', () => {
    let deep = node({ kind: 'text', text: { words: 1, level: 'text' } });
    for (let i = 0; i < 12; i++) deep = node({ style: { background: '#000000' }, children: [deep, node({ style: { border: '1px #000000' } })] });
    const body = node({ tag: 'body', selector: 'body', children: [deep] });
    const result = simplifyStructure(body, viewport, page, { maxDepth: 4 });
    expect(result.stats.truncatedNodes).toBeGreaterThan(0);
    const outline = renderOutline(result);
    expect(outline).toContain('more nodes');
  });

  it('caps total nodes', () => {
    const kids = Array.from({ length: 50 }, (_, i) => node({ selector: `div.unique${i}`, tag: `x-${i}` }));
    const body = node({ tag: 'body', selector: 'body', children: [node({ selector: 'main', role: 'main', children: kids })] });
    const result = simplifyStructure(body, viewport, page, { maxNodes: 10 });
    expect(result.stats.keptNodes).toBeLessThanOrEqual(12);
  });
});

describe('renderOutline', () => {
  it('prints placeholders, never text content', () => {
    const body = node({ tag: 'body', selector: 'body', children: [node({ tag: 'section', selector: 'section.hero', children: [card(0)] })] });
    const outline = renderOutline(simplifyStructure(body, { w: 1200, h: 800 }, { w: 1200, h: 800 }));
    expect(outline).toContain('"Image 16:9"');
    expect(outline).toContain('"Heading (h3), 4 words"');
    expect(outline).toContain('"Paragraph, ~25 words"');
  });
});
