import { deepElementFromPoint, type HitResult } from '../lib/dom';
import type { Disposer } from '../lib/disposer';
import type { ShadowUI } from '../ui/shadow-host';

export interface Point {
  x: number;
  y: number;
}

/**
 * Hit-test the page underneath our transparent capture layer. The layer is made
 * click-through for the duration of the call. Returns null over our own UI.
 */
export function hitBelowLayer(layer: HTMLElement, ui: ShadowUI, x: number, y: number): HitResult | null {
  layer.style.pointerEvents = 'none';
  try {
    const hit = deepElementFromPoint(x, y);
    return hit && hit.element !== ui.host ? hit : null;
  } finally {
    layer.style.pointerEvents = '';
  }
}

export interface KeyboardPointerOptions {
  /** Skip handling (e.g. while a card is open and has focus). */
  isPaused: () => boolean;
  getPointer: () => Point | null;
  setPointer: (point: Point) => void;
  /** Enter / Space at the current point. */
  onActivate: (point: Point) => void;
}

/**
 * Keyboard access for point-based tools: arrow keys move a virtual pointer
 * (Shift = 10px), Enter or Space activates it.
 */
export function listenKeyboardPointer(ui: ShadowUI, disposer: Disposer, opts: KeyboardPointerOptions): void {
  disposer.listen(
    window,
    'keydown',
    (e) => {
      if (opts.isPaused() || e.composedPath().includes(ui.host)) return;
      const step = e.shiftKey ? 10 : 1;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const move = moves[e.key];
      const current = opts.getPointer();
      if (move) {
        e.preventDefault();
        e.stopPropagation();
        const base = current ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        opts.setPointer({
          x: Math.min(window.innerWidth - 1, Math.max(0, base.x + move[0])),
          y: Math.min(window.innerHeight - 1, Math.max(0, base.y + move[1])),
        });
      } else if ((e.key === 'Enter' || e.key === ' ') && current) {
        e.preventDefault();
        e.stopPropagation();
        opts.onActivate(current);
      }
    },
    { capture: true },
  );
}
