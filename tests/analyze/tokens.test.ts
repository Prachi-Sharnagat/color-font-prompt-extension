import { describe, expect, it } from 'vitest';
import {
  buildRadii,
  buildShadows,
  buildSpacing,
  buildTokens,
  buildTypeScale,
  nameColors,
  parseBreakpoints,
  tokensToCss,
  type TokenSamples,
} from '../../src/lib/analyze/tokens';

const w = (value: number, weight = 1) => ({ value, weight });

describe('buildTypeScale', () => {
  it('names sizes around the most-used body size', () => {
    const { steps, ratio } = buildTypeScale([w(16, 50), w(14, 10), w(20, 5), w(25, 4), w(31.25, 3), w(39, 2), w(12, 2)]);
    // Sizes round to the nearest 0.5px.
    expect(steps.map((s) => `${s.name}:${s.px}`)).toEqual(['xs:12', 'sm:14', 'base:16', 'lg:20', 'xl:25', '2xl:31.5', '3xl:39']);
    expect(ratio).toBeCloseTo(1.25, 2); // major third
  });

  it('merges near-identical sizes', () => {
    const { steps } = buildTypeScale([w(16, 50), w(18, 5), w(18.5, 2), w(24, 3)]);
    expect(steps.map((s) => s.px)).toEqual([16, 18, 24]);
  });

  it('handles empty input', () => {
    expect(buildTypeScale([])).toEqual({ steps: [], ratio: null });
  });
});

describe('buildSpacing', () => {
  it('detects the largest grid most values fit', () => {
    expect(buildSpacing([8, 16, 24, 32, 16, 64, 8, 48, 96, 40]).base).toBe(8);
    // One odd 12 doesn't break an 8px grid (>= 70% fit)...
    expect(buildSpacing([8, 16, 24, 32, 16, 64, 8, 48, 12]).base).toBe(8);
    // ...but a mostly-4px rhythm is a 4px grid.
    expect(buildSpacing([4, 12, 20, 8, 16, 28, 8]).base).toBe(4);
  });

  it('returns the most common values as a sorted scale', () => {
    expect(buildSpacing([24, 24, 24, 8, 8, 16, 99]).scale).toEqual([8, 16, 24, 99]);
  });

  it('reports no base when values are irregular', () => {
    expect(buildSpacing([7, 13, 22, 31, 9]).base).toBeNull();
  });
});

describe('buildRadii and buildShadows', () => {
  it('collapses pill radii to "full"', () => {
    expect(buildRadii([8, 8, 16, 9999, 1000, 4])).toEqual([
      { name: 'sm', px: 4 },
      { name: 'md', px: 8 },
      { name: 'lg', px: 16 },
      { name: 'full', px: 9999 },
    ]);
  });

  it('counts normalized shadows', () => {
    const shadows = buildShadows(['0 1px  2px rgba(0,0,0,.1)', '0 1px 2px rgba(0,0,0,.1)', 'none', '0 10px 30px rgba(0,0,0,.2)']);
    expect(shadows[0]).toEqual({ name: 'sm', value: '0 1px 2px rgba(0,0,0,.1)', count: 2 });
    expect(shadows).toHaveLength(2);
  });
});

describe('nameColors', () => {
  const pc = (hex: string, r: number, g: number, b: number, share: number, role: 'background' | 'text' | 'border') => ({
    hex,
    rgb: { r, g, b },
    weight: share,
    share,
    roles: [role],
  });

  it('names the page background, accents by chroma, neutrals by role, and drops noise', () => {
    const names = nameColors(
      [
        pc('#E8EBF2', 232, 235, 242, 0.36, 'text'),
        pc('#9AA3B2', 154, 163, 178, 0.24, 'text'),
        pc('#1B2030', 27, 32, 48, 0.07, 'background'),
        pc('#0B0D12', 11, 13, 18, 0.06, 'background'),
        pc('#7C5CFF', 124, 92, 255, 0.04, 'background'),
        pc('#262D40', 38, 45, 64, 0.03, 'border'),
        pc('#000000', 0, 0, 0, 0.001, 'background'),
      ],
      '#0b0d12',
    ).map((c) => `${c.name}:${c.hex}`);
    expect(names).toEqual(['text:#E8EBF2', 'text-muted:#9AA3B2', 'surface:#1B2030', 'bg:#0B0D12', 'accent:#7C5CFF', 'border:#262D40']);
  });
});

describe('parseBreakpoints', () => {
  it('parses min/max widths in px and em and normalizes', () => {
    expect(
      parseBreakpoints([
        '(min-width: 768px)',
        'screen and (max-width: 767.98px)',
        '(min-width: 64em)',
        '(min-width: 1024px) and (max-width: 1279px)',
        'print',
        '(min-width: 100px)',
      ]),
    ).toEqual([768, 1024, 1279]);
  });
});

describe('buildTokens + tokensToCss', () => {
  it('produces a CSS variables block', () => {
    const samples: TokenSamples = {
      fontSizes: [w(16, 10), w(48, 1), w(24, 2), w(32, 1)],
      lineHeights: [w(1.5, 10), w(1.2, 3)],
      fontFamilies: [
        { family: 'Inter', weight: 10 },
        { family: 'Playfair Display', weight: 2 },
      ],
      fontWeights: [w(400, 10), w(700, 3)],
      spacings: [8, 16, 24, 32, 48, 64],
      radii: [12, 12, 9999],
      shadows: ['0 1px 2px rgba(0, 0, 0, 0.1)'],
      colors: [
        { color: { r: 255, g: 255, b: 255, a: 1 }, weight: 10, role: 'background' },
        { color: { r: 17, g: 24, b: 39, a: 1 }, weight: 8, role: 'text' },
        { color: { r: 37, g: 99, b: 235, a: 1 }, weight: 3, role: 'background' },
      ],
      mediaQueries: ['(min-width: 640px)', '(min-width: 1024px)'],
    };
    const tokens = buildTokens(samples);
    // #2563EB is saturated → accent, whatever role it was used in.
    expect(tokens.colors.map((c) => c.name)).toEqual(['bg', 'text', 'accent']);
    expect(tokens.fontFamilies.map((f) => f.name)).toEqual(['sans', 'display']);
    expect(tokens.spacing.base).toBe(8);

    const css = tokensToCss(tokens);
    expect(css).toContain('--color-bg: #FFFFFF;');
    expect(css).toContain('--font-display: "Playfair Display", system-ui, sans-serif;');
    expect(css).toContain('--text-base: 1rem; /* 16px */');
    expect(css).toContain('--radius-full: 9999px;');
    expect(css).toContain('/* Breakpoints: 640px, 1024px */');
  });
});
