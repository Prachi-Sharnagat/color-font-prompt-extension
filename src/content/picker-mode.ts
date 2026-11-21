import { h } from '../ui/dom-helpers';
import type { ModeDefinition } from './types';

/**
 * Color picker mode.
 * Phase A: only installs the full-screen capture layer (crosshair cursor and
 * blocks page clicks). Sampling, magnifier and color card come in Phase B.
 */
export const pickerMode: ModeDefinition = {
  id: 'picker',
  title: 'Color picker',
  hint: 'Click to pick',
  start({ ui, disposer }) {
    const capture = h('div', { class: 'pt-capture', attrs: { 'aria-hidden': 'true' } });
    // Insert behind the toolbar so the toolbar stays clickable.
    ui.layer.prepend(capture);
    disposer.node(capture);
  },
};
