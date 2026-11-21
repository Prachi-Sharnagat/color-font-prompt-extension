import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { getActiveMode, startMode, stopMode } from '../content/session';
import { isContentRequest, type ContentStatus } from '../lib/messages';

/**
 * Injected on demand by the popup via chrome.scripting.executeScript (activeTab).
 * `registration: 'runtime'` with no `matches` keeps it out of the manifest and
 * adds no host permissions.
 */
export default defineContentScript({
  registration: 'runtime',
  main() {
    // The popup injects on every button click. The isolated world persists
    // between injections, so register the message listener only once.
    const flagged = globalThis as typeof globalThis & { __pickTypeLoaded?: boolean };
    if (flagged.__pickTypeLoaded) return;
    flagged.__pickTypeLoaded = true;

    browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      if (!isContentRequest(message)) return false;

      switch (message.type) {
        case 'pt:start':
          startMode(message.mode);
          break;
        case 'pt:stop':
          stopMode();
          break;
        case 'pt:ping':
          break;
      }
      const status: ContentStatus = { ok: true, activeMode: getActiveMode() };
      sendResponse(status);
      return false;
    });
  },
});
