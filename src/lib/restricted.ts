/**
 * Detects pages where Chrome does not let extensions inject scripts.
 * Pure function so it can be unit-tested; `fileAccessAllowed` comes from
 * `chrome.extension.isAllowedFileSchemeAccess()`.
 */

export type RestrictionReason =
  | 'no-url'
  | 'browser-page'
  | 'web-store'
  | 'file-no-access'
  | 'pdf'
  | 'unsupported-scheme'
  | 'error-page'
  | 'no-access';

export interface RestrictionResult {
  restricted: boolean;
  reason?: RestrictionReason;
}

const BROWSER_SCHEMES = [
  'chrome:',
  'chrome-extension:',
  'chrome-untrusted:',
  'chrome-search:',
  'devtools:',
  'edge:',
  'brave:',
  'opera:',
  'vivaldi:',
  'about:',
  'view-source:',
];

const WEB_STORE_HOSTS: Array<{ host: string; pathPrefix: string }> = [
  { host: 'chromewebstore.google.com', pathPrefix: '/' },
  { host: 'chrome.google.com', pathPrefix: '/webstore' },
  { host: 'microsoftedge.microsoft.com', pathPrefix: '/addons' },
];

export function checkRestricted(
  rawUrl: string | undefined,
  fileAccessAllowed: boolean,
): RestrictionResult {
  if (!rawUrl) return { restricted: true, reason: 'no-url' };

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { restricted: true, reason: 'no-url' };
  }

  if (BROWSER_SCHEMES.includes(url.protocol)) {
    return { restricted: true, reason: 'browser-page' };
  }

  if (url.protocol === 'file:') {
    if (!fileAccessAllowed) return { restricted: true, reason: 'file-no-access' };
    if (url.pathname.toLowerCase().endsWith('.pdf')) return { restricted: true, reason: 'pdf' };
    return { restricted: false };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { restricted: true, reason: 'unsupported-scheme' };
  }

  for (const store of WEB_STORE_HOSTS) {
    if (url.hostname === store.host && url.pathname.startsWith(store.pathPrefix)) {
      return { restricted: true, reason: 'web-store' };
    }
  }

  // Chrome's built-in PDF viewer cannot be scripted. We can only guess from the URL
  // here; anything we miss is caught when injection fails.
  if (url.pathname.toLowerCase().endsWith('.pdf')) {
    return { restricted: true, reason: 'pdf' };
  }

  return { restricted: false };
}

/**
 * Map a chrome.scripting.executeScript error to a reason, for pages the URL
 * check can't predict (error pages, policy-blocked hosts, lost activeTab grant).
 */
export function reasonFromInjectionError(message: string): RestrictionReason | undefined {
  const m = message.toLowerCase();
  if (m.includes('error page')) return 'error-page';
  if (m.includes('gallery') || m.includes('webstore')) return 'web-store';
  if (m.includes('chrome://') || m.includes('chrome-extension://') || m.includes('extensions gallery')) {
    return 'browser-page';
  }
  if (m.includes('file://') || m.includes('file url')) return 'file-no-access';
  if (m.includes('cannot access') || m.includes('permission')) return 'no-access';
  return undefined;
}

export function restrictionMessage(reason: RestrictionReason | undefined): string {
  switch (reason) {
    case 'error-page':
      return 'This page didn’t load. Reload it, then try again.';
    case 'no-access':
      return 'PickType lost access to this page (it may have navigated, or your organization blocks extensions here). Close this popup and click the PickType icon again.';
    case 'browser-page':
      return 'Chrome doesn’t allow extensions on its built-in pages. Open a regular website to use PickType.';
    case 'web-store':
      return 'Extensions can’t run on the Chrome Web Store. Try another site.';
    case 'file-no-access':
      return 'To use PickType on local files, open chrome://extensions, click Details on PickType and turn on “Allow access to file URLs”.';
    case 'pdf':
      return 'PickType can’t run inside Chrome’s PDF viewer.';
    case 'unsupported-scheme':
    case 'no-url':
    default:
      return 'PickType can’t run on this page. Try a regular website.';
  }
}
