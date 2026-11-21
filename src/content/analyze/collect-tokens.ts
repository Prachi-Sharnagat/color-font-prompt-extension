/**
 * Sample computed styles across the whole page for design-token extraction.
 */
import { rgbToHex } from '../../lib/color-conversion';
import { effectiveBackground, getStyle, resolveCssColor } from '../../lib/dom';
import { collectColorSamples } from '../../lib/extract/colors';
import { parseFontFamilyList } from '../../lib/extract/typography';
import type { TokenSamples } from '../../lib/analyze/tokens';
import { HOST_TAG } from '../../ui/shadow-host';
import { forEachRule } from './stylesheets';
import { ownTextLength, pxValue, walkRendered } from './walk';

export function collectTokenSamples(doc: Document = document, maxElements = 6000): TokenSamples {
  const samples: TokenSamples = {
    fontSizes: [],
    lineHeights: [],
    fontFamilies: [],
    fontWeights: [],
    spacings: [],
    radii: [],
    shadows: [],
    colors: [],
    mediaQueries: [],
  };
  if (!doc.body) return samples;

  for (const el of walkRendered(doc.body, maxElements)) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    const style = getStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;

    const textLength = ownTextLength(el);
    if (textLength > 0) {
      const size = pxValue(style.fontSize);
      const weight = Math.min(200, textLength); // one huge paragraph shouldn't dominate
      if (size > 0) {
        samples.fontSizes.push({ value: size, weight });
        const lh = pxValue(style.lineHeight);
        if (lh > 0) samples.lineHeights.push({ value: lh / size, weight });
      }
      const family = parseFontFamilyList(style.fontFamily)[0];
      if (family) samples.fontFamilies.push({ family, weight });
      samples.fontWeights.push({ value: Number.parseFloat(style.fontWeight) || 400, weight });
    }

    for (const prop of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginBottom'] as const) {
      const v = pxValue(style[prop]);
      if (v > 0) samples.spacings.push(v);
    }
    if (style.display.includes('flex') || style.display.includes('grid')) {
      const rg = pxValue(style.rowGap);
      const cg = pxValue(style.columnGap);
      if (rg > 0) samples.spacings.push(rg);
      if (cg > 0 && cg !== rg) samples.spacings.push(cg);
    }

    const radius = style.borderTopLeftRadius;
    const r = pxValue(radius);
    if (r > 0) samples.radii.push(radius.endsWith('%') && r >= 50 ? 9999 : r);
    if (style.boxShadow && style.boxShadow !== 'none') samples.shadows.push(style.boxShadow);
  }

  samples.colors = collectColorSamples(doc, resolveCssColor, {
    viewportOnly: false,
    maxElements,
    timeBudgetMs: 300,
    skipTags: [HOST_TAG],
  });

  samples.pageBackground = rgbToHex(effectiveBackground(doc.body).color);

  forEachRule(doc, (rule) => {
    if ('conditionText' in rule && rule.constructor.name === 'CSSMediaRule') {
      samples.mediaQueries.push((rule as CSSMediaRule).conditionText);
    }
  });

  return samples;
}
