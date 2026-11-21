import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { isBackgroundRequest, type CaptureResponse } from '../lib/messages';

/**
 * MV3 service worker. It can be shut down at any time, so it never holds state
 * in memory: each request is self-contained and persistent data lives in
 * chrome.storage.local. Listeners are registered synchronously at top level so
 * a message wakes the worker and is handled.
 */
export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (!isBackgroundRequest(message)) return false;
    // Only accept requests from our own content scripts running in a tab.
    if (sender.id !== browser.runtime.id || !sender.tab) return false;

    const windowId = sender.tab.windowId;
    browser.tabs
      .captureVisibleTab(windowId, { format: 'png' })
      .then((dataUrl) => {
        const response: CaptureResponse = { ok: true, dataUrl };
        sendResponse(response);
      })
      .catch((error: unknown) => {
        const response: CaptureResponse = {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
        sendResponse(response);
      });

    // Keep the message channel open for the async response.
    return true;
  });
});
