import { describe, expect, it } from 'vitest';
import { parseCssColor } from '../src/lib/color-parse';
import { describeWeight, parseFontFamilyList, readTypography } from '../src/lib/extract/typography';
import { familiesFromGoogleFontsHref, googleFontsUrl, isGoogleFont } from '../src/lib/google-fonts';

describe('parseCssColor', () => {
  it('parses computed rgb/rgba forms', () => {
    expect(parseCssColor('rgb(255, 0, 128)')).toEqual({ r: 255, g: 0, b: 128, a: 1 });
    expect(parseCssColor('rgba(0, 0, 0, 0.5)')).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
    expect(parseCssColor('rgb(10 20 30 / 25%)')).toEqual({ r: 10, g: 20, b: 30, a: 0.25 });
    expect(parseCssColor('rgba(0, 0, 0, 0)')?.a).toBe(0);
  });

  it('parses transparent, hex and hsl', () => {
    expect(parseCssColor('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(parseCssColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseCssColor('hsl(120, 100%, 50%)')).toEqual({ r: 0, g: 255, b: 0, a: 1 });
  });

  it('parses color(srgb) and oklch/oklab', () => {
    expect(parseCssColor('color(srgb 1 0 0)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseCssColor('color(srgb 0 0 1 / 0.5)')).toEqual({ r: 0, g: 0, b: 255, a: 0.5 });
    expect(parseCssColor('oklch(0.628 0.2577 29.23)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseCssColor('oklch(100% 0 0)')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseCssColor('oklab(0 0 0)')).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });

  it('returns null for forms it cannot convert', () => {
    expect(parseCssColor('lab(50 20 30)')).toBeNull();
    expect(parseCssColor('color(display-p3 1 0 0)')).toBeNull();
    expect(parseCssColor('red')).toBeNull();
    expect(parseCssColor('')).toBeNull();
  });
});

describe('parseFontFamilyList', () => {
  it('splits and unquotes', () => {
    expect(parseFontFamilyList(`"Open Sans", 'Helvetica Neue', Arial, sans-serif`)).toEqual([
      'Open Sans',
      'Helvetica Neue',
      'Arial',
      'sans-serif',
    ]);
  });

  it('keeps commas inside quotes and handles escapes', () => {
    expect(parseFontFamilyList(`"Weird, Font", Foo\\ Bar`)).toEqual(['Weird, Font', 'Foo Bar']);
  });

  it('normalizes whitespace and drops empties', () => {
    expect(parseFontFamilyList('  Times   New Roman ,, serif ')).toEqual(['Times New Roman', 'serif']);
  });
});

describe('readTypography', () => {
  it('reads computed style values', () => {
    const values: Record<string, string> = {
      'font-family': '"Inter", system-ui, sans-serif',
      'font-size': '15.5px',
      'font-weight': '600',
      'font-style': 'italic',
      'line-height': '24px',
      'letter-spacing': 'normal',
      color: 'rgb(17, 24, 39)',
      'text-transform': 'uppercase',
    };
    const info = readTypography({ getPropertyValue: (p) => values[p] ?? '' });
    expect(info.primaryFamily).toBe('Inter');
    expect(info.familyStack).toEqual(['Inter', 'system-ui', 'sans-serif']);
    expect(info.fontSizePx).toBe(15.5);
    expect(info.fontWeight).toBe(600);
    expect(info.fontStyle).toBe('italic');
    expect(info.lineHeight).toEqual({ raw: '24px', px: 24 });
    expect(info.letterSpacing).toEqual({ raw: 'normal', px: null });
    expect(info.textTransform).toBe('uppercase');
  });
});

describe('describeWeight', () => {
  it('names standard and variable weights', () => {
    expect(describeWeight(400)).toBe('400 · Regular');
    expect(describeWeight(650)).toBe('650 · Semibold');
    expect(describeWeight(900)).toBe('900 · Black');
  });
});

describe('google fonts helpers', () => {
  it('builds specimen URLs', () => {
    expect(googleFontsUrl('Open Sans')).toBe('https://fonts.google.com/specimen/Open+Sans');
  });

  it('parses CSS2 and legacy stylesheet URLs', () => {
    expect(
      familiesFromGoogleFontsHref('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;700&family=Lato&display=swap'),
    ).toEqual(['Open Sans', 'Lato']);
    expect(familiesFromGoogleFontsHref('https://fonts.googleapis.com/css?family=Roboto:400,700|Fira+Code')).toEqual([
      'Roboto',
      'Fira Code',
    ]);
    expect(familiesFromGoogleFontsHref('https://example.com/css?family=Roboto')).toEqual([]);
  });

  it('recognizes catalog families case-insensitively', () => {
    expect(isGoogleFont('Roboto', new Set())).toBe(true);
    expect(isGoogleFont('open sans', new Set())).toBe(true);
    expect(isGoogleFont('Arial', new Set())).toBe(false);
    expect(isGoogleFont('My Brand', new Set(['my brand']))).toBe(true);
  });
});
