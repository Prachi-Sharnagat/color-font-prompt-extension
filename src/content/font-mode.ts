import type { ModeDefinition } from './types';

/**
 * Font detector mode.
 * Phase A: only blocks page clicks so links don't navigate while inspecting.
 * Hover highlight and the font card come in Phase C.
 */
export const fontMode: ModeDefinition = {
  id: 'font',
  title: 'Font detector',
  hint: 'Click text to inspect',
  start({ ui, disposer }) {
    const isOurs = (event: Event): boolean => event.composedPath().includes(ui.host);

    const block = (event: Event): void => {
      if (isOurs(event)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    // Capture phase on window runs before any page handler.
    disposer.listen(window, 'click', block, { capture: true });
    disposer.listen(window, 'auxclick', block, { capture: true });
    disposer.listen(window, 'mousedown', block, { capture: true });
  },
};
