/**
 * Copy text to the clipboard. Tries the async Clipboard API first; some sites
 * block it via Permissions-Policy or it fails without document focus, so we
 * fall back to execCommand('copy') on a hidden textarea (allowed for
 * extensions with the clipboardWrite permission).
 *
 * @param container Where to put the temporary textarea (e.g. our shadow root),
 *                  so the page never sees it.
 */
export async function copyText(text: string, container: ParentNode = document.body): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return legacyCopy(text, container);
  }
}

function legacyCopy(text: string, container: ParentNode): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
  const previousFocus = document.activeElement;
  container.append(textarea);
  try {
    textarea.select();
    // execCommand is deprecated but remains the only synchronous fallback.
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
    if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
  }
}
