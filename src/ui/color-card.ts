import { allFormats, isLight, type ColorFormats, type RGB } from '../lib/color-conversion';
import { h, icon, ICON_CLOSE } from './dom-helpers';
import type { ShadowUI } from './shadow-host';

const ICON_COPY = ['M8 8h12v12H8z', 'M16 8V4H4v12h4'] as const;

const CARD_CSS = /* css */ `
.pt-card {
  position: fixed;
  left: 0;
  top: 0;
  width: 272px;
  background: var(--pt-bg);
  border: 1px solid var(--pt-border);
  border-radius: 12px;
  box-shadow: var(--pt-shadow);
  pointer-events: auto;
  overflow: hidden;
  cursor: default;
}
.pt-card__swatch {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  height: 72px;
  padding: 10px 10px 10px 14px;
}
.pt-card__swatch-hex {
  align-self: flex-end;
  font: 600 16px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.pt-card__swatch .pt-icon-btn:hover { background: rgba(127, 127, 127, 0.25); }
.pt-card__rows {
  list-style: none;
  margin: 0;
  padding: 6px;
}
.pt-card__row {
  display: grid;
  grid-template-columns: 52px 1fr auto;
  align-items: center;
  gap: 6px;
  padding: 2px 4px 2px 8px;
  border-radius: 8px;
}
.pt-card__row:hover { background: var(--pt-hover); }
.pt-card__label {
  color: var(--pt-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.pt-card__value {
  font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  user-select: text;
  overflow-wrap: anywhere;
}
.pt-card__hint {
  margin: 0;
  padding: 0 14px 10px;
  color: var(--pt-muted);
  font-size: 11px;
}
`;

export interface ColorCardOptions {
  rgb: RGB;
  /** Anchor point in CSS pixels (usually the click position). */
  x: number;
  y: number;
  onCopy: (label: string, value: string) => void;
  onClose: () => void;
}

export interface ColorCard {
  el: HTMLDivElement;
  destroy(): void;
}

// Styles are added once per shadow root (a new root is created per session).
const stylesAdded = new WeakSet<ShadowUI>();

export function showColorCard(ui: ShadowUI, opts: ColorCardOptions): ColorCard {
  if (!stylesAdded.has(ui)) {
    ui.addStyles(CARD_CSS);
    stylesAdded.add(ui);
  }

  const formats: ColorFormats = allFormats(opts.rgb);
  const rows: Array<[string, string]> = [
    ['HEX', formats.hex],
    ['RGB', formats.rgb],
    ['HSL', formats.hsl],
    ['OKLCH', formats.oklch],
  ];

  const closeBtn = h('button', {
    class: 'pt-icon-btn',
    attrs: { type: 'button', 'aria-label': 'Close color card', title: 'Close' },
  });
  closeBtn.append(icon(ICON_CLOSE));
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    opts.onClose();
  });

  const swatch = h('div', { class: 'pt-card__swatch' }, [
    h('span', { class: 'pt-card__swatch-hex', text: formats.hex }),
    closeBtn,
  ]);
  swatch.style.background = formats.hex;
  swatch.style.color = isLight(opts.rgb) ? '#111111' : '#ffffff';

  const copyButtons: HTMLButtonElement[] = [];
  const list = h(
    'ul',
    { class: 'pt-card__rows' },
    rows.map(([label, value]) => {
      const btn = h('button', {
        class: 'pt-icon-btn',
        attrs: { type: 'button', 'aria-label': `Copy ${label} value ${value}`, title: `Copy ${label}` },
      });
      btn.append(icon(ICON_COPY));
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        opts.onCopy(label, value);
      });
      copyButtons.push(btn);
      return h('li', { class: 'pt-card__row' }, [
        h('span', { class: 'pt-card__label', text: label }),
        h('span', { class: 'pt-card__value', text: value }),
        btn,
      ]);
    }),
  );

  const el = h(
    'div',
    { class: 'pt-card', attrs: { role: 'dialog', 'aria-label': `Picked color ${formats.hex}` } },
    [swatch, list, h('p', { class: 'pt-card__hint', text: 'Click anywhere to pick another · Esc to exit' })],
  );
  // Keep clicks inside the card from reaching the capture layer.
  el.addEventListener('click', (e) => e.stopPropagation());

  ui.layer.append(el);

  // Position near the anchor, kept fully inside the viewport.
  const rect = el.getBoundingClientRect();
  const margin = 12;
  let left = opts.x + 16;
  let top = opts.y + 16;
  if (left + rect.width > window.innerWidth - margin) left = opts.x - 16 - rect.width;
  if (top + rect.height > window.innerHeight - margin) top = opts.y - 16 - rect.height;
  left = Math.max(margin, left);
  top = Math.max(margin, top);
  el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;

  copyButtons[0]?.focus({ preventScroll: true });

  return {
    el,
    destroy() {
      el.remove();
    },
  };
}
