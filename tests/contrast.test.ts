import { describe, expect, it } from 'vitest';
import {
  compositeOver,
  contrastRatio,
  evaluateContrast,
  formatRatio,
  isLargeText,
  relativeLuminance,
} from '../src/lib/contrast';

const black = { r: 0, g: 0, b: 0 };
const white = { r: 255, g: 255, b: 255 };

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance(black)).toBe(0);
    expect(relativeLuminance(white)).toBeCloseTo(1, 10);
  });

  it('weights green highest', () => {
    expect(relativeLuminance({ r: 0, g: 255, b: 0 })).toBeCloseTo(0.7152, 4);
    expect(relativeLuminance({ r: 255, g: 0, b: 0 })).toBeCloseTo(0.2126, 4);
    expect(relativeLuminance({ r: 0, g: 0, b: 255 })).toBeCloseTo(0.0722, 4);
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for identical colors', () => {
    expect(contrastRatio(black, white)).toBeCloseTo(21, 10);
    expect(contrastRatio(white, white)).toBe(1);
  });

  it('is symmetric', () => {
    const a = { r: 37, g: 99, b: 235 };
    expect(contrastRatio(a, white)).toBe(contrastRatio(white, a));
  });

  it('matches known reference values', () => {
    // #777777 on white is the classic "just fails AA" gray: 4.48:1.
    expect(contrastRatio({ r: 119, g: 119, b: 119 }, white)).toBeCloseTo(4.478, 2);
    // #767676 on white is the lightest gray that passes AA: 4.54:1.
    expect(contrastRatio({ r: 118, g: 118, b: 118 }, white)).toBeCloseTo(4.542, 2);
    // Pure red on white: 4.00:1.
    expect(contrastRatio({ r: 255, g: 0, b: 0 }, white)).toBeCloseTo(3.998, 2);
  });
});

describe('evaluateContrast', () => {
  it('applies WCAG thresholds', () => {
    expect(evaluateContrast(4.5)).toEqual({ ratio: 4.5, aa: { normal: true, large: true }, aaa: { normal: false, large: true } });
    expect(evaluateContrast(3)).toEqual({ ratio: 3, aa: { normal: false, large: true }, aaa: { normal: false, large: false } });
    expect(evaluateContrast(7).aaa.normal).toBe(true);
    expect(evaluateContrast(2.99).aa.large).toBe(false);
  });
});

describe('isLargeText', () => {
  it('uses 24px, or 18.66px when bold', () => {
    expect(isLargeText(24, 400)).toBe(true);
    expect(isLargeText(23.9, 400)).toBe(false);
    expect(isLargeText(18.67, 700)).toBe(true);
    expect(isLargeText(18.67, 600)).toBe(false);
    expect(isLargeText(16, 900)).toBe(false);
  });
});

describe('compositeOver', () => {
  it('blends by alpha', () => {
    expect(compositeOver({ ...black, a: 0.5 }, white)).toEqual({ r: 127.5, g: 127.5, b: 127.5 });
    expect(compositeOver({ ...black, a: 0 }, white)).toEqual(white);
    expect(compositeOver({ ...black, a: 1 }, white)).toEqual(black);
  });
});

describe('formatRatio', () => {
  it('truncates instead of rounding up', () => {
    expect(formatRatio(4.499)).toBe('4.49:1');
    expect(formatRatio(21)).toBe('21.00:1');
  });
});
