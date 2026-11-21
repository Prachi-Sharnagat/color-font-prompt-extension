import { formatRatio } from '../lib/contrast';
import { describeWeight, formatPx } from '../lib/extract/typography';
import type { TextElementReport } from '../lib/extract/text-element';
import { googleFontsUrl } from '../lib/google-fonts';
import { h, icon, ICON_CLOSE } from './dom-helpers';
import { placeNear } from './position';
import type { ShadowUI } from './shadow-host';

const FONT_CARD_CSS = /* css */ `
.pt-fcard {
  position: fixed;
  left: 0;
  top: 0;
  width: 316px;
  max-height: calc(100vh - 24px);
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--pt-bg);
  border: 1px solid var(--pt-border);
  border-radius: 12px;
  box-shadow: var(--pt-shadow);
  pointer-events: auto;
  cursor: default;
}
.pt-fcard__head {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 12px 10px 12px 14px;
  border-bottom: 1px solid var(--pt-border);
}
.pt-fcard__sample {
  font-size: 30px;
  line-height: 1;
  min-width: 44px;
  text-align: center;
}
.pt-fcard__family {
  font-weight: 650;
  font-size: 15px;
  overflow-wrap: anywhere;
}
.pt-fcard__el {
  color: var(--pt-muted);
  font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.pt-fcard__section { padding: 10px 14px; }
.pt-fcard__section + .pt-fcard__section { border-top: 1px solid var(--pt-border); }
.pt-fcard__h {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--pt-muted);
}
.pt-fcard__dl {
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 4px 10px;
  margin: 0;
}
.pt-fcard__dl dt { color: var(--pt-muted); }
.pt-fcard__dl dd { margin: 0; overflow-wrap: anywhere; }
.pt-mono { font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.pt-fcard__note {
  margin: 4px 0 0;
  color: var(--pt-muted);
  font-size: 12px;
}
.pt-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  vertical-align: 1px;
  border: 1px solid var(--pt-border);
}
.pt-badge--high { color: #15803d; border-color: currentColor; }
.pt-badge--medium { color: #b45309; border-color: currentColor; }
.pt-badge--low { color: var(--pt-muted); }
@media (prefers-color-scheme: dark) {
  .pt-badge--high { color: #4ade80; }
  .pt-badge--medium { color: #fbbf24; }
}
.pt-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  color: var(--pt-accent);
  text-decoration: none;
  font-weight: 500;
  border-radius: 4px;
}
.pt-link:hover { text-decoration: underline; }
.pt-link svg { width: 12px; height: 12px; }
.pt-link:focus-visible { outline: none; box-shadow: var(--pt-focus); }
.pt-chip {
  display: inline-block;
  width: 14px;
  height: 14px;
  margin-right: 6px;
  border-radius: 4px;
  border: 1px solid var(--pt-border);
  vertical-align: -2px;
}
.pt-ratio {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 8px 0;
}
.pt-ratio__value { font-size: 22px; font-weight: 700; }
.pt-ratio__preview {
  margin-left: auto;
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid var(--pt-border);
  font-weight: 600;
}
.pt-wcag {
  display: grid;
  grid-template-columns: auto 1fr 1fr;
  gap: 4px 8px;
  align-items: center;
  font-size: 12px;
}
.pt-wcag__col { color: var(--pt-muted); font-weight: 600; }
.pt-wcag__col--active { color: var(--pt-fg); }
.pt-pass, .pt-fail {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
}
.pt-pass { color: #15803d; }
.pt-fail { color: #b91c1c; }
@media (prefers-color-scheme: dark) {
  .pt-pass { color: #4ade80; }
  .pt-fail { color: #f87171; }
}
`;

const ICON_EXTERNAL = ['M14 4h6v6', 'M20 4 10 14', 'M18 14v6H4V6h6'] as const;

const stylesAdded = new WeakSet<ShadowUI>();

export interface FontCardOptions {
  report: TextElementReport;
  x: number;
  y: number;
  onClose: () => void;
}

export interface FontCard {
  el: HTMLDivElement;
  destroy(): void;
}

function row(term: string, ...value: Array<Node | string>): HTMLElement[] {
  return [h('dt', { text: term }), h('dd', {}, value)];
}

function passFail(pass: boolean): HTMLElement {
  return h('span', { class: pass ? 'pt-pass' : 'pt-fail', text: pass ? '✓ Pass' : '✗ Fail' });
}

function chip(hex: string): HTMLElement {
  const el = h('span', { class: 'pt-chip', attrs: { 'aria-hidden': 'true' } });
  el.style.background = hex;
  return el;
}

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function showFontCard(ui: ShadowUI, opts: FontCardOptions): FontCard {
  if (!stylesAdded.has(ui)) {
    ui.addStyles(FONT_CARD_CSS);
    stylesAdded.add(ui);
  }
  const { report } = opts;
  const t = report.typography;

  // ---- header
  const sample = h('span', { class: 'pt-fcard__sample', text: 'Aa', attrs: { 'aria-hidden': 'true' } });
  // Render the sample in the page's own font stack (our shadow root shares document fonts).
  sample.style.fontFamily = t.familyRaw;
  sample.style.fontWeight = String(t.fontWeight);
  sample.style.fontStyle = t.fontStyle;

  const closeBtn = h('button', {
    class: 'pt-icon-btn',
    attrs: { type: 'button', 'aria-label': 'Close font card', title: 'Close' },
  });
  closeBtn.append(icon(ICON_CLOSE));
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    opts.onClose();
  });

  const head = h('div', { class: 'pt-fcard__head' }, [
    sample,
    h('div', {}, [
      h('div', { class: 'pt-fcard__family', text: t.primaryFamily || 'Unknown' }),
      h('div', { class: 'pt-fcard__el', text: `<${report.label}>` }),
    ]),
    closeBtn,
  ]);

  // ---- font section
  const confidence = report.rendered.confidence;
  const renderedValue = h('span', {}, [
    report.rendered.family,
    h('span', {
      class: `pt-badge pt-badge--${confidence}`,
      text: `${capitalize(confidence)} confidence`,
    }),
  ]);

  const fontSection = h('section', { class: 'pt-fcard__section', attrs: { 'aria-label': 'Font' } }, [
    h('h3', { class: 'pt-fcard__h', text: 'Font' }),
    h('dl', { class: 'pt-fcard__dl' }, [
      ...row('Family', t.primaryFamily || '—'),
      ...row('Full stack', h('span', { class: 'pt-mono', text: t.familyStack.join(', ') || '—' })),
      ...row('Likely rendered', renderedValue),
    ]),
    h('p', { class: 'pt-fcard__note', text: report.rendered.note }),
  ]);

  if (report.googleFamily) {
    const link = h('a', {
      class: 'pt-link',
      text: `${report.googleFamily} on Google Fonts`,
      attrs: {
        href: googleFontsUrl(report.googleFamily),
        target: '_blank',
        rel: 'noopener noreferrer',
      },
    });
    link.append(icon(ICON_EXTERNAL));
    fontSection.append(link);
  }

  // ---- metrics section
  const lineHeight =
    t.lineHeight.px !== null
      ? `${formatPx(t.lineHeight.px)} · ${Math.round((t.lineHeight.px / t.fontSizePx) * 100) / 100}×`
      : t.lineHeight.raw;
  const letterSpacing = t.letterSpacing.px !== null ? formatPx(t.letterSpacing.px) : t.letterSpacing.raw;

  const metricsSection = h('section', { class: 'pt-fcard__section', attrs: { 'aria-label': 'Metrics' } }, [
    h('h3', { class: 'pt-fcard__h', text: 'Metrics' }),
    h('dl', { class: 'pt-fcard__dl' }, [
      ...row('Size', formatPx(t.fontSizePx)),
      ...row('Weight', describeWeight(t.fontWeight)),
      ...row('Style', t.fontStyle),
      ...row('Line height', lineHeight),
      ...row('Letter spacing', letterSpacing),
      ...row('Transform', t.textTransform),
      ...row('Text color', chip(report.textHex), h('span', { class: 'pt-mono', text: report.textHex })),
    ]),
  ]);

  // ---- contrast section
  const c = report.contrast;
  const preview = h('span', { class: 'pt-ratio__preview', text: 'Aa', attrs: { 'aria-hidden': 'true' } });
  preview.style.color = report.textHex;
  preview.style.background = report.backgroundHex;

  const normalCls = `pt-wcag__col${report.isLargeText ? '' : ' pt-wcag__col--active'}`;
  const largeCls = `pt-wcag__col${report.isLargeText ? ' pt-wcag__col--active' : ''}`;

  const contrastSection = h('section', { class: 'pt-fcard__section', attrs: { 'aria-label': 'Contrast' } }, [
    h('h3', { class: 'pt-fcard__h', text: 'Contrast (WCAG 2)' }),
    h('dl', { class: 'pt-fcard__dl' }, [
      ...row('Background', chip(report.backgroundHex), h('span', { class: 'pt-mono', text: report.backgroundHex })),
    ]),
    h('div', { class: 'pt-ratio' }, [
      h('span', { class: 'pt-ratio__value', text: formatRatio(c.ratio) }),
      h('span', { class: 'pt-fcard__note', text: 'contrast ratio' }),
      preview,
    ]),
    h('div', { class: 'pt-wcag', attrs: { role: 'table', 'aria-label': 'WCAG results' } }, [
      h('span', { attrs: { role: 'columnheader' } }),
      h('span', { class: normalCls, text: 'Normal text', attrs: { role: 'columnheader' } }),
      h('span', { class: largeCls, text: 'Large text', attrs: { role: 'columnheader' } }),
      h('span', { class: 'pt-wcag__col', text: 'AA', attrs: { role: 'rowheader' } }),
      passFail(c.aa.normal),
      passFail(c.aa.large),
      h('span', { class: 'pt-wcag__col', text: 'AAA', attrs: { role: 'rowheader' } }),
      passFail(c.aaa.normal),
      passFail(c.aaa.large),
    ]),
    h('p', {
      class: 'pt-fcard__note',
      text: `This text counts as ${report.isLargeText ? 'large' : 'normal'} text (large = 24px+, or 18.66px+ bold).`,
    }),
    ...report.background.reasons.map((reason) => h('p', { class: 'pt-fcard__note', text: `⚠ ${reason}` })),
  ]);

  const el = h(
    'div',
    {
      class: 'pt-fcard',
      attrs: { role: 'dialog', 'aria-label': `Font details: ${t.primaryFamily}` },
    },
    [head, fontSection, metricsSection, contrastSection],
  );
  el.addEventListener('click', (e) => e.stopPropagation());
  // Scrolling inside the card must not scroll the page (or trigger our wheel forwarding).
  el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });

  ui.layer.append(el);
  placeNear(el, opts.x, opts.y);
  closeBtn.focus({ preventScroll: true });

  return {
    el,
    destroy() {
      el.remove();
    },
  };
}
