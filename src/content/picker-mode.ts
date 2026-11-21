import { hexToRgb, rgbToHex, type RGB } from '../lib/color-conversion';
import { copyText } from '../lib/clipboard';
import { forwardWheel } from '../lib/dom';
import { saveRecentColor } from '../lib/storage';
import { showColorCard, type ColorCard } from '../ui/color-card';
import { h } from '../ui/dom-helpers';
import { mountMagnifier } from '../ui/magnifier';
import { createToaster } from '../ui/toast';
import { hitBelowLayer, listenKeyboardPointer } from './pointer';
import { captureViewport, sampleAt, type PixelSource } from './screen-capture';
import type { ModeDefinition } from './types';

/** Chrome allows at most 2 captureVisibleTab calls per second. */
const MIN_CAPTURE_INTERVAL_MS = 600;
/** Wait for scrolling/resizing to settle before re-capturing. */
const RECAPTURE_DEBOUNCE_MS = 250;

// The EyeDropper API is not in TypeScript's DOM lib yet.
interface EyeDropperInstance {
  open(options?: { signal?: AbortSignal }): Promise<{ sRGBHex: string }>;
}
type EyeDropperConstructor = new () => EyeDropperInstance;

function getEyeDropper(): EyeDropperConstructor | undefined {
  return (window as Window & { EyeDropper?: EyeDropperConstructor }).EyeDropper;
}

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => window.requestAnimationFrame(() => resolve()));

/** EyeDropper may return a hex string or an rgb() string depending on version. */
function parseEyeDropperColor(value: string): RGB | null {
  const hex = hexToRgb(value);
  if (hex) return hex;
  const match = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(value);
  return match ? { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) } : null;
}

export const pickerMode: ModeDefinition = {
  id: 'picker',
  title: 'Color picker',
  hint: 'Click to pick',
  start({ ui, toolbar, disposer }) {
    // Transparent full-screen layer: crosshair cursor, swallows page clicks.
    const captureLayer = h('div', { class: 'pt-capture', attrs: { 'aria-hidden': 'true' } });
    ui.layer.prepend(captureLayer);
    disposer.node(captureLayer);

    const toast = createToaster(ui, disposer);
    const loupe = mountMagnifier(ui, disposer);

    let pixels: PixelSource | null = null;
    let pointer: { x: number; y: number } | null = null;
    let card: ColorCard | null = null;

    let capturing = false;
    let captureQueued = false;
    let lastCaptureAt = 0;
    let rafId = 0;
    let debounceTimer = 0;
    let throttleTimer = 0;
    let fallbackShown = false;
    let eyeDropperAbort: AbortController | null = null;

    disposer.add(() => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(debounceTimer);
      window.clearTimeout(throttleTimer);
      eyeDropperAbort?.abort();
      card?.destroy();
      card = null;
      pixels = null;
    });

    // ------------------------------------------------------------ rendering

    const render = (): void => {
      rafId = 0;
      if (!pixels || !pointer || card) {
        loupe.hide();
        return;
      }
      loupe.render(pixels, pointer.x, pointer.y);
    };

    const queueRender = (): void => {
      if (rafId === 0) rafId = window.requestAnimationFrame(render);
    };

    // ------------------------------------------------------------ capture

    const showFallback = (): void => {
      if (fallbackShown) return;
      fallbackShown = true;
      const EyeDropperApi = getEyeDropper();
      if (!EyeDropperApi) {
        toast('Couldn’t read this page’s pixels.');
        return;
      }
      const btn = h('button', {
        class: 'pt-text-btn',
        text: 'Use EyeDropper',
        attrs: { type: 'button' },
      });
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        void pickWithEyeDropper(EyeDropperApi);
      });
      toolbar.actions.append(btn);
      toast('Screenshot unavailable. Use the EyeDropper button.');
    };

    const capture = async (): Promise<void> => {
      if (disposer.isDisposed) return;
      if (capturing) {
        captureQueued = true;
        return;
      }
      const wait = lastCaptureAt + MIN_CAPTURE_INTERVAL_MS - Date.now();
      if (wait > 0) {
        window.clearTimeout(throttleTimer);
        throttleTimer = window.setTimeout(() => void capture(), wait);
        return;
      }

      capturing = true;
      lastCaptureAt = Date.now();
      ui.setHidden(true);
      try {
        // Two frames guarantee the hidden state has been painted.
        await nextFrame();
        await nextFrame();
        if (disposer.isDisposed) return;
        const result = await captureViewport();
        if (disposer.isDisposed) return;
        pixels = result;
      } catch (error) {
        if (disposer.isDisposed) return;
        const message = error instanceof Error ? error.message : '';
        if (/quota|per second/i.test(message)) {
          captureQueued = true; // Rate-limited: just try again shortly.
        } else {
          showFallback();
        }
      } finally {
        capturing = false;
        if (!disposer.isDisposed) {
          ui.setHidden(false);
          queueRender();
          if (captureQueued) {
            captureQueued = false;
            void capture();
          }
        }
      }
    };

    const onViewportChange = (): void => {
      // The old screenshot no longer matches what's on screen.
      pixels = null;
      queueRender();
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => void capture(), RECAPTURE_DEBOUNCE_MS);
    };

    // ------------------------------------------------------------ picking

    const closeCard = (): void => {
      card?.destroy();
      card = null;
      queueRender();
    };

    const openCard = (rgb: RGB, x: number, y: number): void => {
      closeCard();
      loupe.hide();
      saveRecentColor(rgbToHex(rgb)).catch(() => {
        // Storage can fail if the extension was reloaded; picking still works.
      });
      card = showColorCard(ui, {
        rgb,
        x,
        y,
        onCopy: (label, value) => {
          void copyText(value, ui.root).then((ok) => {
            toast(ok ? `Copied ${label}: ${value}` : 'Copy failed. Select the value and copy manually.');
          });
        },
        onClose: closeCard,
      });
    };

    const pickAt = (x: number, y: number): void => {
      if (!pixels) {
        toast(fallbackShown ? 'Use the EyeDropper button to pick.' : 'Getting the page ready…');
        return;
      }
      const rgb = sampleAt(pixels, x, y);
      if (rgb) openCard(rgb, x, y);
    };

    const pickWithEyeDropper = async (EyeDropperApi: EyeDropperConstructor): Promise<void> => {
      closeCard();
      eyeDropperAbort?.abort();
      const controller = new AbortController();
      eyeDropperAbort = controller;
      try {
        const result = await new EyeDropperApi().open({ signal: controller.signal });
        if (disposer.isDisposed) return;
        const rgb = parseEyeDropperColor(result.sRGBHex);
        const at = pointer ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        if (rgb) openCard(rgb, at.x, at.y);
      } catch {
        // User cancelled (Escape) or the session ended.
      } finally {
        if (eyeDropperAbort === controller) eyeDropperAbort = null;
      }
    };

    // ------------------------------------------------------------ events

    disposer.listen(captureLayer, 'pointermove', (e) => {
      pointer = { x: e.clientX, y: e.clientY };
      queueRender();
    });
    disposer.listen(captureLayer, 'pointerleave', () => {
      pointer = null;
      queueRender();
    });
    disposer.listen(captureLayer, 'click', (e) => {
      e.preventDefault();
      if (card) {
        closeCard();
        return;
      }
      pickAt(e.clientX, e.clientY);
    });

    // Inner scroll containers don't receive wheel events through our layer.
    disposer.listen(
      captureLayer,
      'wheel',
      (e) => forwardWheel(e, hitBelowLayer(captureLayer, ui, e.clientX, e.clientY)?.element ?? null),
      { passive: false },
    );

    // Keyboard: arrows nudge the sample point (Shift = 10px), Enter/Space picks.
    listenKeyboardPointer(ui, disposer, {
      isPaused: () => card !== null,
      getPointer: () => pointer,
      setPointer: (p) => {
        pointer = p;
        queueRender();
      },
      onActivate: (p) => pickAt(p.x, p.y),
    });

    // Capture phase catches scrolling of any inner scroll container too.
    disposer.listen(window, 'scroll', onViewportChange, { capture: true, passive: true });
    disposer.listen(window, 'resize', onViewportChange, { passive: true });

    void capture();
  },
};
