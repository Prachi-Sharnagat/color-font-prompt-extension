import type { Disposer } from '../lib/disposer';
import { h, icon, ICON_CLOSE } from './dom-helpers';
import type { ShadowUI } from './shadow-host';

export interface ToolbarOptions {
  title: string;
  hint: string;
  onClose: () => void;
}

export interface Toolbar {
  el: HTMLDivElement;
  /** Slot for mode-specific controls (e.g. the EyeDropper fallback button). */
  actions: HTMLSpanElement;
}

export function mountToolbar(ui: ShadowUI, disposer: Disposer, opts: ToolbarOptions): Toolbar {
  const closeBtn = h('button', {
    class: 'pt-icon-btn',
    attrs: { type: 'button', 'aria-label': 'Exit (Escape)', title: 'Exit (Esc)' },
  });
  closeBtn.append(icon(ICON_CLOSE));
  disposer.listen(closeBtn, 'click', (e) => {
    e.stopPropagation();
    opts.onClose();
  });

  const actions = h('span', { class: 'pt-toolbar__actions' });

  const el = h('div', { class: 'pt-toolbar', attrs: { role: 'toolbar', 'aria-label': 'PickType' } }, [
    h('span', { class: 'pt-toolbar__title', text: opts.title }),
    h('span', { class: 'pt-toolbar__hint' }, [
      opts.hint,
      ' · ',
      h('span', { class: 'pt-kbd', text: 'Esc' }),
      ' to exit',
    ]),
    actions,
    closeBtn,
  ]);

  ui.layer.append(el);
  disposer.node(el);
  return { el, actions };
}
