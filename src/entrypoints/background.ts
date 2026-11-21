import { defineBackground } from 'wxt/utils/define-background';

/**
 * MV3 service worker. It can be shut down at any time, so it must never hold
 * state in memory: everything persistent lives in chrome.storage.local.
 *
 * Phase A: nothing to do yet. Phase B adds the captureVisibleTab handler.
 */
export default defineBackground(() => {
  // Intentionally empty for Phase A.
});
