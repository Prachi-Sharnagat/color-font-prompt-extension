import { isLight, rgbToHex } from '../lib/color-conversion';
import type { Disposer } from '../lib/disposer';
import { pixelAt, toDevicePixel, type PixelSource } from '../content/screen-capture';
import { h } from './dom-helpers';
import type { ShadowUI } from './shadow-host';

const GRID = 9; // pixels per side (odd, so there is a center pixel)
const CELL = 14; // CSS px per magnified pixel
const SIZE = GRID * CELL; // loupe diameter
const OFFSET = 24; // distance from cursor

const MAGNIFIER_CSS = /* css */ `
.pt-loupe {
  position: fixed;
  left: 0;
  top: 0;
  pointer-events: none;
  will-change: transform;
}
.pt-loupe__lens {
  display: block;
  width: ${SIZE}px;
  height: ${SIZE}px;
  border-radius: 50%;
  background: #808080;
  box-shadow: 0 0 0 3px #ffffff, 0 0 0 4px rgba(0, 0, 0, 0.35), var(--pt-shadow);
}
.pt-loupe__label {
  display: flex;
  align-items: center;
  gap: 6px;
  width: max-content;
  margin: 10px auto 0;
  padding: 3px 10px 3px 4px;
  border-radius: 999px;
  background: var(--pt-bg);
  border: 1px solid var(--pt-border);
  box-shadow: var(--pt-shadow);
  font: 600 12px/18px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.pt-loupe__chip {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1px solid var(--pt-border);
}
`;

export interface Magnifier {
  /** Draw the loupe for a CSS-pixel position. Returns the center color hex. */
  render(src: PixelSource, clientX: number, clientY: number): string | null;
  hide(): void;
}

export function mountMagnifier(ui: ShadowUI, disposer: Disposer): Magnifier {
  ui.addStyles(MAGNIFIER_CSS);

  const dpr = window.devicePixelRatio || 1;
  const lens = h('canvas', { class: 'pt-loupe__lens' });
  lens.width = Math.round(SIZE * dpr);
  lens.height = Math.round(SIZE * dpr);
  const chip = h('span', { class: 'pt-loupe__chip' });
  const hexText = h('span', { text: '' });
  const label = h('div', { class: 'pt-loupe__label' }, [chip, hexText]);
  const root = h('div', { class: 'pt-loupe', attrs: { 'aria-hidden': 'true', hidden: '' } }, [lens, label]);

  ui.layer.append(root);
  disposer.node(root);

  const ctx = lens.getContext('2d');
  ctx?.scale(dpr, dpr);

  return {
    render(src, clientX, clientY) {
      if (!ctx) return null;
      const center = toDevicePixel(src, clientX, clientY);
      const half = Math.floor(GRID / 2);

      ctx.save();
      ctx.beginPath();
      ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
      ctx.clip();

      for (let row = 0; row < GRID; row++) {
        for (let col = 0; col < GRID; col++) {
          const color = pixelAt(src, center.x + col - half, center.y + row - half);
          ctx.fillStyle = color ? `rgb(${color.r} ${color.g} ${color.b})` : '#808080';
          ctx.fillRect(col * CELL, row * CELL, CELL, CELL);
        }
      }

      // Faint grid lines.
      ctx.strokeStyle = 'rgba(128, 128, 128, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < GRID; i++) {
        ctx.moveTo(i * CELL + 0.5, 0);
        ctx.lineTo(i * CELL + 0.5, SIZE);
        ctx.moveTo(0, i * CELL + 0.5);
        ctx.lineTo(SIZE, i * CELL + 0.5);
      }
      ctx.stroke();
      ctx.restore();

      const centerColor = pixelAt(src, center.x, center.y);
      // Outline the center pixel in a color that contrasts with it.
      const outline = centerColor && isLight(centerColor) ? '#000000' : '#ffffff';
      ctx.strokeStyle = outline;
      ctx.lineWidth = 2;
      ctx.strokeRect(half * CELL + 1, half * CELL + 1, CELL - 2, CELL - 2);

      const hex = centerColor ? rgbToHex(centerColor) : null;
      hexText.textContent = hex ?? '—';
      chip.style.background = hex ?? 'transparent';

      // Place bottom-right of the cursor, flipping near viewport edges.
      const totalHeight = SIZE + 40;
      let x = clientX + OFFSET;
      let y = clientY + OFFSET;
      if (x + SIZE > window.innerWidth - 4) x = clientX - OFFSET - SIZE;
      if (y + totalHeight > window.innerHeight - 4) y = clientY - OFFSET - totalHeight;
      root.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      root.hidden = false;

      return hex;
    },
    hide() {
      root.hidden = true;
    },
  };
}
