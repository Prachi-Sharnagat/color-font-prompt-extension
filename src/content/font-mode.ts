import { forwardWheel, getStyle, type HitResult } from '../lib/dom';
import { elementLabel, elementText, inspectTextElement } from '../lib/extract/text-element';
import { formatPx, parseFontFamilyList } from '../lib/extract/typography';
import { h } from '../ui/dom-helpers';
import { showFontCard, type FontCard } from '../ui/font-card';
import { mountHighlight } from '../ui/highlight';
import { createToaster } from '../ui/toast';
import { hitBelowLayer, listenKeyboardPointer, type Point } from './pointer';
import type { ModeDefinition } from './types';

const INSPECT_CSS = /* css */ `
.pt-capture--inspect { cursor: default; }
`;

/** Short hover label, e.g. "h1 · Inter · 32px". Cheap enough for every move. */
function hoverLabel(hit: HitResult): string {
  if (hit.crossOriginFrame) return 'Cross-origin frame (can’t inspect)';
  const style = getStyle(hit.element);
  const family = parseFontFamilyList(style.fontFamily)[0] ?? '';
  const size = Number.parseFloat(style.fontSize);
  return [hit.element.tagName.toLowerCase(), family, Number.isFinite(size) ? formatPx(size) : '']
    .filter(Boolean)
    .join(' · ');
}

export const fontMode: ModeDefinition = {
  id: 'font',
  title: 'Font detector',
  hint: 'Click text to inspect',
  start({ ui, disposer }) {
    ui.addStyles(INSPECT_CSS);

    // Transparent layer: blocks page clicks/hover side effects. We hit-test
    // underneath it, which also lets us see into same-origin iframes.
    const layer = h('div', { class: 'pt-capture pt-capture--inspect', attrs: { 'aria-hidden': 'true' } });
    ui.layer.prepend(layer);
    disposer.node(layer);

    const toast = createToaster(ui, disposer);
    const highlight = mountHighlight(ui, disposer);

    let pointer: Point | null = null;
    let card: FontCard | null = null;
    let rafId = 0;

    disposer.add(() => {
      window.cancelAnimationFrame(rafId);
      card?.destroy();
      card = null;
    });

    const update = (): void => {
      rafId = 0;
      const hit = pointer ? hitBelowLayer(layer, ui, pointer.x, pointer.y) : null;
      if (!hit) {
        highlight.hide();
        return;
      }
      const rect = hit.element.getBoundingClientRect();
      highlight.show(
        {
          left: rect.left + hit.frameOffset.x,
          top: rect.top + hit.frameOffset.y,
          width: rect.width,
          height: rect.height,
        },
        hoverLabel(hit),
      );
    };

    const queueUpdate = (): void => {
      if (rafId === 0) rafId = window.requestAnimationFrame(update);
    };

    const closeCard = (): void => {
      card?.destroy();
      card = null;
    };

    const inspectAt = (point: Point): void => {
      const hit = hitBelowLayer(layer, ui, point.x, point.y);
      if (!hit) return;
      if (hit.crossOriginFrame) {
        toast('This frame is from another site, so PickType can’t inspect it.');
        return;
      }
      if (!elementText(hit.element)) {
        toast('No text here. Point at some text.');
        return;
      }
      let report;
      try {
        report = inspectTextElement(hit.element);
      } catch {
        toast(`Couldn’t read styles for <${elementLabel(hit.element)}>.`);
        return;
      }
      closeCard();
      card = showFontCard(ui, { report, x: point.x, y: point.y, onClose: closeCard });
    };

    disposer.listen(layer, 'pointermove', (e) => {
      pointer = { x: e.clientX, y: e.clientY };
      queueUpdate();
    });
    disposer.listen(layer, 'pointerleave', () => {
      pointer = null;
      queueUpdate();
    });
    disposer.listen(layer, 'click', (e) => {
      e.preventDefault();
      // Clicking other text while a card is open inspects that text directly.
      inspectAt({ x: e.clientX, y: e.clientY });
    });
    disposer.listen(
      layer,
      'wheel',
      (e) => forwardWheel(e, hitBelowLayer(layer, ui, e.clientX, e.clientY)?.element ?? null),
      { passive: false },
    );

    // Element positions change on scroll/resize; keep the outline attached.
    disposer.listen(window, 'scroll', queueUpdate, { capture: true, passive: true });
    disposer.listen(window, 'resize', queueUpdate, { passive: true });

    listenKeyboardPointer(ui, disposer, {
      isPaused: () => false,
      getPointer: () => pointer,
      setPointer: (p) => {
        pointer = p;
        queueUpdate();
      },
      onActivate: inspectAt,
    });
  },
};
