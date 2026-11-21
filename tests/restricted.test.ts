import { describe, expect, it } from 'vitest';
import { checkRestricted, reasonFromInjectionError } from '../src/lib/restricted';

describe('reasonFromInjectionError', () => {
  it('maps Chrome injection errors to friendly reasons', () => {
    expect(reasonFromInjectionError('Frame with ID 0 is showing error page')).toBe('error-page');
    expect(reasonFromInjectionError('The extensions gallery cannot be scripted.')).toBe('web-store');
    expect(reasonFromInjectionError('Cannot access a chrome:// URL')).toBe('browser-page');
    expect(
      reasonFromInjectionError(
        'Cannot access contents of the page. Extension manifest must request permission to access the respective host.',
      ),
    ).toBe('no-access');
    expect(reasonFromInjectionError('Something unexpected')).toBeUndefined();
  });
});

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
