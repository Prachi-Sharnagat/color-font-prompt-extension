import type { Disposer } from '../lib/disposer';
import { BASE_CSS } from './theme';

export const HOST_TAG = 'picktype-root';

export interface ShadowUI {
  host: HTMLElement;
  root: ShadowRoot;
  /** Container for all visible UI; carries the theme variables. */
  layer: HTMLDivElement;
  /** Add extra CSS (per component) into the shadow root. */
  addStyles(css: string): void;
  /**
   * Temporarily hide all visible UI while taking a screenshot. The transparent
   * capture layer stays active so clicks never fall through to the page.
   */
  setHidden(hidden: boolean): void;
}

/**
 * Mount a single closed shadow root on <html>. Site CSS can't reach in and our
 * CSS can't leak out. The host is removed by the disposer.
 */
export function mountShadowHost(disposer: Disposer): ShadowUI {
  // Defensive: remove any stale host (e.g. left behind by a reloaded extension).
  document.querySelectorAll(HOST_TAG).forEach((el) => el.remove());

  const host = document.createElement(HOST_TAG);
  // Inline !important beats page stylesheets even if they target our tag.
  host.style.setProperty('all', 'initial', 'important');
  host.style.setProperty('position', 'fixed', 'important');
  host.style.setProperty('inset', '0', 'important');
  host.style.setProperty('z-index', '2147483647', 'important');
  host.style.setProperty('pointer-events', 'none', 'important');

  const root = host.attachShadow({ mode: 'closed' });

  const sheets: CSSStyleSheet[] = [];
  const addStyles = (css: string): void => {
    // Constructable stylesheets are not subject to the page's style-src CSP,
    // unlike <style> elements, so they keep working on strict-CSP sites.
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      sheets.push(sheet);
      root.adoptedStyleSheets = [...sheets];
    } catch {
      const style = document.createElement('style');
      style.textContent = css;
      root.prepend(style);
    }
  };
  addStyles(BASE_CSS);

  const layer = document.createElement('div');
  layer.className = 'pt-layer';
  root.append(layer);

  disposer.node(host);
  document.documentElement.append(host);

  // Promote to the top layer so we render above the page's open <dialog>s,
  // popovers and fullscreen elements. Not fatal if unsupported.
  if (typeof host.showPopover === 'function') {
    try {
      host.setAttribute('popover', 'manual');
      host.showPopover();
    } catch {
      host.removeAttribute('popover');
    }
  }

  return {
    host,
    root,
    layer,
    addStyles,
    setHidden(hidden: boolean) {
      layer.classList.toggle('pt-capturing', hidden);
    },
  };
}
