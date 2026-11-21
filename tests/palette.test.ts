import { describe, expect, it } from 'vitest';
import { aggregatePalette, type ColorSample } from '../src/lib/extract/colors';

const s = (r: number, g: number, b: number, weight: number, role: ColorSample['role'] = 'background', a = 1): ColorSample => ({
  color: { r, g, b, a },
  weight,
  role,
});

describe('aggregatePalette', () => {
  it('ranks colors by total weight', () => {
    const palette = aggregatePalette([s(255, 0, 0, 1), s(0, 0, 255, 3), s(255, 0, 0, 1), s(0, 255, 0, 0.5)]);
    expect(palette.map((c) => c.hex)).toEqual(['#0000FF', '#FF0000', '#00FF00']);
    expect(palette[0]?.share).toBeCloseTo(3 / 5.5, 5);
  });

  it('merges perceptually identical colors into the heavier one', () => {
    const palette = aggregatePalette([s(255, 255, 255, 5), s(254, 254, 254, 1), s(0, 0, 0, 1)]);
    expect(palette).toHaveLength(2);
    expect(palette[0]).toMatchObject({ hex: '#FFFFFF', weight: 6 });
  });

  it('keeps deliberate tints apart', () => {
    expect(aggregatePalette([s(255, 255, 255, 1), s(230, 230, 230, 1)])).toHaveLength(2);
    // #FAFAFA is a common off-white token; it must not merge into white.
    expect(aggregatePalette([s(255, 255, 255, 1), s(250, 250, 250, 1)])).toHaveLength(2);
  });

  it('ignores transparent samples and scales translucent ones', () => {
    const palette = aggregatePalette([s(0, 0, 0, 10, 'background', 0), s(255, 0, 0, 2, 'text', 0.5)]);
    expect(palette).toEqual([
      { hex: '#FF0000', rgb: { r: 255, g: 0, b: 0 }, weight: 1, share: 1, roles: ['text'] },
    ]);
  });

  it('respects the limit and orders roles by weight', () => {
    const samples: ColorSample[] = [];
    for (let i = 0; i < 20; i++) samples.push(s(i * 12, 100, 200 - i * 8, 20 - i));
    // Heavier than the background weight merged into this cluster (20 + neighbors).
    samples.push(s(0, 100, 200, 100, 'text'));
    const palette = aggregatePalette(samples, { limit: 8 });
    expect(palette).toHaveLength(8);
    expect(palette[0]?.roles).toEqual(['text', 'background']);
  });

  it('returns an empty palette for no samples', () => {
    expect(aggregatePalette([])).toEqual([]);
  });
});
