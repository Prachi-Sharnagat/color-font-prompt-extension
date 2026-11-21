import { Disposer } from '../lib/disposer';
import type { ToolMode } from '../lib/messages';
import { mountShadowHost } from '../ui/shadow-host';
import { mountToolbar } from '../ui/toolbar';
import { fontMode } from './font-mode';
import { pickerMode } from './picker-mode';
import type { ModeDefinition } from './types';

const MODES: Record<ToolMode, ModeDefinition> = {
  picker: pickerMode,
  font: fontMode,
};

interface ActiveSession {
  mode: ToolMode;
  disposer: Disposer;
}

let active: ActiveSession | null = null;

export function getActiveMode(): ToolMode | null {
  return active?.mode ?? null;
}

/** Start a mode, stopping any mode that is already running. */
export function startMode(mode: ToolMode): void {
  stopMode();

  const definition = MODES[mode];
  const disposer = new Disposer();
  const session: ActiveSession = { mode, disposer };
  active = session;

  const exit = (): void => {
    // Only stop if this session is still the active one.
    if (active === session) stopMode();
  };

  // If keyboard focus is inside an iframe, key events (Escape!) go to that
  // frame. Pull focus back to the top document.
  const focused = document.activeElement;
  if (focused instanceof HTMLElement && (focused.tagName === 'IFRAME' || focused.tagName === 'FRAME')) {
    focused.blur();
  }

  try {
    const ui = mountShadowHost(disposer);
    const toolbar = mountToolbar(ui, disposer, {
      title: definition.title,
      hint: definition.hint,
      onClose: exit,
    });

    // Escape always exits. Capture phase on window so the page can't swallow it,
    // and we stop it so the page's own Escape handlers don't also fire.
    disposer.listen(
      window,
      'keydown',
      (event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopImmediatePropagation();
        exit();
      },
      { capture: true },
    );

    // Leaving the page (navigation, bfcache) ends the session.
    disposer.listen(window, 'pagehide', exit);

    definition.start({ ui, toolbar, disposer, exit });
  } catch (error) {
    // Never leave half-mounted UI behind.
    exit();
    throw error;
  }
}

/** Stop the current mode and remove every injected element and listener. */
export function stopMode(): void {
  if (!active) return;
  const { disposer } = active;
  active = null;
  disposer.dispose();
}
