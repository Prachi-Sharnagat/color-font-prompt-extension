import type { Disposer } from '../lib/disposer';
import { h } from './dom-helpers';
import type { ShadowUI } from './shadow-host';

const HIGHLIGHT_CSS = /* css */ `
.pt-highlight {
  position: fixed;
  left: 0;
  top: 0;
  pointer-events: none;
  border: 2px solid var(--pt-accent);
  border-radius: 3px;
  background: color-mix(in srgb, var(--pt-accent) 10%, transparent);
  will-change: transform, width, height;
}
.pt-highlight__tag {
  position: absolute;
  left: -2px;
  bottom: calc(100% + 4px);
  padding: 2px 7px;
  border-radius: 4px;
  background: var(--pt-accent);
  color: #ffffff;
  font: 600 11px/16px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  white-space: nowrap;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pt-highlight__tag--below { bottom: auto; top: calc(100% + 4px); }
@media (prefers-color-scheme: dark) {
  .pt-highlight__tag { color: #0b1220; }
}
`;

export interface HighlightBox {
  show(rect: { left: number; top: number; width: number; height: number }, label: string): void;
  hide(): void;
}

export function mountHighlight(ui: ShadowUI, disposer: Disposer): HighlightBox {
  ui.addStyles(HIGHLIGHT_CSS);
  const tag = h('span', { class: 'pt-highlight__tag' });
  const box = h('div', { class: 'pt-highlight', attrs: { 'aria-hidden': 'true', hidden: '' } }, [tag]);
  ui.layer.append(box);
  disposer.node(box);

  return {
    show(rect, label) {
      box.style.transform = `translate(${Math.round(rect.left)}px, ${Math.round(rect.top)}px)`;
      box.style.width = `${Math.max(0, Math.round(rect.width))}px`;
      box.style.height = `${Math.max(0, Math.round(rect.height))}px`;
      tag.textContent = label;
      // Put the tag below the box when there's no room above.
      tag.classList.toggle('pt-highlight__tag--below', rect.top < 28);
      box.hidden = false;
    },
    hide() {
      box.hidden = true;
    },
  };
}
