import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { getActiveMode, startMode, stopMode } from '../content/session';
import { resolveCssColor } from '../lib/dom';
import { extractPagePalette } from '../lib/extract/colors';
import { isContentRequest, type ContentRequest, type ContentStatus, type PaletteResponse } from '../lib/messages';
import { HOST_TAG } from '../ui/shadow-host';

type Teardown = () => void;
type FlaggedGlobal = typeof globalThis & { __pickTypeTeardown?: Teardown };

function handlePalette(): PaletteResponse {
  try {
    const colors = extractPagePalette(document, resolveCssColor, { limit: 10, skipTags: [HOST_TAG] });
    return { ok: true, colors: colors.map((c) => ({ hex: c.hex, share: c.share })) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function handle(message: ContentRequest): ContentStatus | PaletteResponse {
  switch (message.type) {
    case 'pt:start':
      startMode(message.mode);
      break;
    case 'pt:stop':
      stopMode();
      break;
    case 'pt:palette':
      return handlePalette();
    case 'pt:ping':
      break;
  }
  return { ok: true, activeMode: getActiveMode() };
}

/**
 * Injected on demand by the popup via chrome.scripting.executeScript (activeTab).
 * `registration: 'runtime'` with no `matches` keeps it out of the manifest and
 * adds no host permissions.
 */
export default defineContentScript({
  registration: 'runtime',
  main() {
    // The popup injects on every click. The isolated world (and its globals) can
    // outlive an extension reload, leaving a previous copy whose listener is
    // dead. Always tear the previous copy down and register fresh, so exactly
    // one live listener exists.
    const global = globalThis as FlaggedGlobal;
    try {
      global.__pickTypeTeardown?.();
    } catch {
      // The old copy's extension context may be invalidated; its DOM cleanup
      // already ran or will be redone by mountShadowHost.
    }

    const listener = (message: unknown, _sender: unknown, sendResponse: (response: unknown) => void): false => {
      if (!isContentRequest(message)) return false;
      sendResponse(handle(message));
      return false;
    };
    browser.runtime.onMessage.addListener(listener);

    global.__pickTypeTeardown = () => {
      stopMode();
      browser.runtime.onMessage.removeListener(listener);
    };
  },
});
