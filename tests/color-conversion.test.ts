import { describe, expect, it } from 'vitest';
import {
  allFormats,
  clampRgb,
  hexToRgb,
  hslToRgb,
  oklchToRgb,
  rgbToHex,
  rgbToHsl,
  rgbToOklch,
  type RGB,
} from '../src/lib/color-conversion';

/** Deterministic sample of the sRGB cube, including edges. */
function sampleColors(): RGB[] {
  const steps = [0, 1, 17, 51, 102, 128, 170, 204, 238, 254, 255];
  const out: RGB[] = [];
  for (const r of steps) for (const g of steps) for (const b of steps) out.push({ r, g, b });
  return out;
}

describe('HEX', () => {
  it('formats uppercase 6-digit hex', () => {
    expect(rgbToHex({ r: 255, g: 0, b: 128 })).toBe('#FF0080');
    expect(rgbToHex({ r: 0, g: 0, b: 0 })).toBe('#000000');
  });

  it('adds an alpha byte only when alpha < 1', () => {
    expect(rgbToHex({ r: 255, g: 255, b: 255 }, 0.5)).toBe('#FFFFFF80');
    expect(rgbToHex({ r: 255, g: 255, b: 255 }, 1)).toBe('#FFFFFF');
  });

  it('parses 3, 4, 6 and 8 digit hex', () => {
    expect(hexToRgb('#f00')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(hexToRgb('f008')).toEqual({ r: 255, g: 0, b: 0, a: 0.533 });
    expect(hexToRgb('#1A2b3C')).toEqual({ r: 26, g: 43, b: 60, a: 1 });
    expect(hexToRgb('#00000000')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it('rejects invalid hex', () => {
    expect(hexToRgb('#12')).toBeNull();
    expect(hexToRgb('#zzzzzz')).toBeNull();
    expect(hexToRgb('')).toBeNull();
  });

  it('round-trips every sample through hex', () => {
    for (const c of sampleColors()) {
      const parsed = hexToRgb(rgbToHex(c));
      expect(parsed).toEqual({ ...c, a: 1 });
    }
  });
});

describe('HSL', () => {
  it('converts known values', () => {
    expect(rgbToHsl({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 100, l: 50 });
    expect(rgbToHsl({ r: 0, g: 255, b: 0 })).toEqual({ h: 120, s: 100, l: 50 });
    expect(rgbToHsl({ r: 0, g: 0, b: 255 })).toEqual({ h: 240, s: 100, l: 50 });
    const gray = rgbToHsl({ r: 128, g: 128, b: 128 });
    expect(gray.h).toBe(0);
    expect(gray.s).toBe(0);
    expect(gray.l).toBeCloseTo(50.196, 2);
  });

  it('handles hue wraparound', () => {
    expect(clampRgb(hslToRgb({ h: 360, s: 100, l: 50 }))).toEqual({ r: 255, g: 0, b: 0 });
    expect(clampRgb(hslToRgb({ h: -120, s: 100, l: 50 }))).toEqual({ r: 0, g: 0, b: 255 });
  });

  it('round-trips every sample exactly (unrounded)', () => {
    for (const c of sampleColors()) {
      expect(clampRgb(hslToRgb(rgbToHsl(c)))).toEqual(c);
    }
  });
});

describe('OKLCH', () => {
  it('matches reference values (CSS Color 4)', () => {
    const red = rgbToOklch({ r: 255, g: 0, b: 0 });
    expect(red.l).toBeCloseTo(0.62796, 4);
    expect(red.c).toBeCloseTo(0.25768, 4);
    expect(red.h).toBeCloseTo(29.234, 2);

    const white = rgbToOklch({ r: 255, g: 255, b: 255 });
    expect(white.l).toBeCloseTo(1, 4);
    expect(white.c).toBeLessThan(1e-4);

    const black = rgbToOklch({ r: 0, g: 0, b: 0 });
    expect(black.l).toBeCloseTo(0, 6);
  });

  it('treats grays as achromatic (hue 0)', () => {
    expect(rgbToOklch({ r: 119, g: 119, b: 119 }).h).toBe(0);
  });

  it('round-trips every sample within 0.5 of a channel', () => {
    for (const c of sampleColors()) {
      const back = oklchToRgb(rgbToOklch(c));
      expect(Math.abs(back.r - c.r)).toBeLessThan(0.5);
      expect(Math.abs(back.g - c.g)).toBeLessThan(0.5);
      expect(Math.abs(back.b - c.b)).toBeLessThan(0.5);
      expect(clampRgb(back)).toEqual(c);
    }
  });
});

describe('allFormats', () => {
  it('produces display strings', () => {
    expect(allFormats({ r: 255, g: 0, b: 0 })).toEqual({
      hex: '#FF0000',
      rgb: 'rgb(255, 0, 0)',
      hsl: 'hsl(0, 100%, 50%)',
      oklch: 'oklch(62.8% 0.258 29.2)',
    });
  });

  it('includes alpha when translucent', () => {
    const f = allFormats({ r: 0, g: 0, b: 0 }, 0.5);
    expect(f.hex).toBe('#00000080');
    expect(f.rgb).toBe('rgb(0 0 0 / 0.5)');
    expect(f.hsl).toBe('hsl(0 0% 0% / 0.5)');
    expect(f.oklch).toBe('oklch(0% 0 0 / 0.5)');
  });
});
