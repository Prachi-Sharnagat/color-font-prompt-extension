import type { Disposer } from '../lib/disposer';
import { h } from './dom-helpers';
import type { ShadowUI } from './shadow-host';

const TOAST_CSS = /* css */ `
.pt-toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  padding: 8px 14px;
  border-radius: 999px;
  background: var(--pt-fg);
  color: var(--pt-bg);
  font-weight: 500;
  box-shadow: var(--pt-shadow);
  pointer-events: none;
  opacity: 0;
  transition: opacity 120ms ease-out;
}
.pt-toast.pt-toast--show { opacity: 1; }
@media (prefers-reduced-motion: reduce) { .pt-toast { transition: none; } }
`;

export type ShowToast = (message: string) => void;

/** One reusable toast element; announced to screen readers via role=status. */
export function createToaster(ui: ShadowUI, disposer: Disposer): ShowToast {
  ui.addStyles(TOAST_CSS);
  const el = h('div', { class: 'pt-toast', attrs: { role: 'status', 'aria-live': 'polite' } });
  ui.layer.append(el);
  disposer.node(el);

  let timer: number | undefined;
  disposer.add(() => window.clearTimeout(timer));

  return (message: string) => {
    el.textContent = message;
    el.classList.add('pt-toast--show');
    window.clearTimeout(timer);
    timer = window.setTimeout(() => el.classList.remove('pt-toast--show'), 1600);
  };
}
