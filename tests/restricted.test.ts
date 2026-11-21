import { describe, expect, it } from 'vitest';
import { checkRestricted } from '../src/lib/restricted';

describe('checkRestricted', () => {
  it('allows regular websites', () => {
    expect(checkRestricted('https://example.com/', false)).toEqual({ restricted: false });
    expect(checkRestricted('http://localhost:3000/app', false)).toEqual({ restricted: false });
  });

  it('blocks browser-internal pages', () => {
    for (const url of ['chrome://extensions', 'about:blank', 'chrome-extension://abc/popup.html', 'view-source:https://a.com', 'edge://settings']) {
      expect(checkRestricted(url, true)).toEqual({ restricted: true, reason: 'browser-page' });
    }
  });

  it('blocks the Chrome Web Store', () => {
    expect(checkRestricted('https://chromewebstore.google.com/detail/x', false).reason).toBe('web-store');
    expect(checkRestricted('https://chrome.google.com/webstore/detail/x', false).reason).toBe('web-store');
    expect(checkRestricted('https://chrome.google.com/other', false).restricted).toBe(false);
  });

  it('handles file:// based on file access permission', () => {
    expect(checkRestricted('file:///C:/a.html', false).reason).toBe('file-no-access');
    expect(checkRestricted('file:///C:/a.html', true).restricted).toBe(false);
  });

  it('flags likely PDF viewer pages', () => {
    expect(checkRestricted('https://example.com/doc.PDF', false).reason).toBe('pdf');
  });

  it('treats missing or invalid URLs as restricted', () => {
    expect(checkRestricted(undefined, false).reason).toBe('no-url');
    expect(checkRestricted('not a url', false).reason).toBe('no-url');
    expect(checkRestricted('data:text/html,hi', false).reason).toBe('unsupported-scheme');
  });
});
