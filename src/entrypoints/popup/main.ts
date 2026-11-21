import { browser, type Browser } from 'wxt/browser';
import type { ContentRequest, PaletteResponse, ToolMode } from '../../lib/messages';
import { checkRestricted, reasonFromInjectionError, restrictionMessage } from '../../lib/restricted';
import { renderPalette } from './palette';
import { initRecentColors } from './recent';

// The output path WXT gives the runtime-registered content script.
const CONTENT_SCRIPT_FILE = '/content-scripts/content.js';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Popup markup is missing #${id}`);
  return el as T;
}

const notice = byId<HTMLParagraphElement>('notice');
const pickerBtn = byId<HTMLButtonElement>('btn-picker');
const fontBtn = byId<HTMLButtonElement>('btn-font');
const paletteBtn = byId<HTMLButtonElement>('btn-palette');
const pageButtons = [pickerBtn, fontBtn, paletteBtn];
const paletteSection = byId<HTMLElement>('palette');
const paletteList = byId<HTMLUListElement>('palette-list');
const toastEl = byId<HTMLDivElement>('toast');

let toastTimer: number | undefined;
function showToast(message: string): void {
  toastEl.textContent = message;
  toastEl.classList.add('toast--show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('toast--show'), 1400);
}

initRecentColors({
  list: byId<HTMLUListElement>('recent-list'),
  empty: byId<HTMLParagraphElement>('recent-empty'),
  clearBtn: byId<HTMLButtonElement>('btn-clear'),
  showToast,
});

function showNotice(text: string): void {
  notice.textContent = text;
  notice.hidden = false;
}

function setPageButtonsEnabled(enabled: boolean): void {
  for (const btn of pageButtons) btn.disabled = !enabled;
}

async function getActiveTab(): Promise<Browser.tabs.Tab | undefined> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/**
 * Inject the content script into the active tab (activeTab grant from opening
 * the popup) and send it one request. Shows a friendly notice on failure.
 */
async function sendToPage(request: ContentRequest): Promise<unknown> {
  const tab = await getActiveTab();
  if (tab?.id === undefined) {
    showNotice(restrictionMessage('no-url'));
    return undefined;
  }

  setPageButtonsEnabled(false);
  try {
    await browser.scripting.executeScript({ target: { tabId: tab.id }, files: [CONTENT_SCRIPT_FILE] });
    const response: unknown = await browser.tabs.sendMessage(tab.id, request, { frameId: 0 });
    return response;
  } catch (error) {
    // Pages the URL check can't predict (PDF viewer, error pages, policy-
    // blocked sites) fail here. Never fail silently.
    const message = error instanceof Error ? error.message : String(error);
    showNotice(restrictionMessage(reasonFromInjectionError(message)));
    return undefined;
  } finally {
    setPageButtonsEnabled(true);
  }
}

async function startTool(mode: ToolMode): Promise<void> {
  const response = await sendToPage({ type: 'pt:start', mode });
  // Close so the user can interact with the page right away.
  if (response !== undefined) window.close();
}

async function showPagePalette(): Promise<void> {
  paletteBtn.setAttribute('aria-busy', 'true');
  const response = (await sendToPage({ type: 'pt:palette' })) as PaletteResponse | undefined;
  paletteBtn.removeAttribute('aria-busy');
  if (!response) return;
  if (!response.ok) {
    showNotice('Couldn’t scan this page’s colors.');
    return;
  }
  renderPalette(paletteList, response.colors, showToast);
  paletteSection.hidden = false;
  paletteList.querySelector('button')?.focus();
}

async function init(): Promise<void> {
  pickerBtn.addEventListener('click', () => void startTool('picker'));
  fontBtn.addEventListener('click', () => void startTool('font'));
  paletteBtn.addEventListener('click', () => void showPagePalette());

  const tab = await getActiveTab();
  const fileAccess = await browser.extension.isAllowedFileSchemeAccess();
  const result = checkRestricted(tab?.url, fileAccess);

  if (result.restricted) {
    showNotice(restrictionMessage(result.reason));
    setPageButtonsEnabled(false);
  } else {
    pickerBtn.focus();
  }
}

void init();
