import { browser, type Browser } from 'wxt/browser';
import type { ContentRequest, ToolMode } from '../../lib/messages';
import { checkRestricted, restrictionMessage } from '../../lib/restricted';
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
const toolButtons = [pickerBtn, fontBtn];
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

function setToolsEnabled(enabled: boolean): void {
  for (const btn of toolButtons) btn.disabled = !enabled;
}

async function getActiveTab(): Promise<Browser.tabs.Tab | undefined> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function startTool(mode: ToolMode): Promise<void> {
  const tab = await getActiveTab();
  if (tab?.id === undefined) {
    showNotice(restrictionMessage('no-url'));
    return;
  }

  setToolsEnabled(false);
  try {
    // activeTab grants access because the user opened the popup on this tab.
    await browser.scripting.executeScript({
      target: { tabId: tab.id },
      files: [CONTENT_SCRIPT_FILE],
    });
    const request: ContentRequest = { type: 'pt:start', mode };
    await browser.tabs.sendMessage(tab.id, request, { frameId: 0 });
    // Close so the user can interact with the page right away.
    window.close();
  } catch {
    // Pages our URL check can't predict (PDF viewer, error pages, policy-blocked
    // sites) fail here. Show a friendly message instead of failing silently.
    showNotice(restrictionMessage(undefined));
    setToolsEnabled(true);
  }
}

async function init(): Promise<void> {
  const tab = await getActiveTab();
  const fileAccess = await browser.extension.isAllowedFileSchemeAccess();
  const result = checkRestricted(tab?.url, fileAccess);

  if (result.restricted) {
    showNotice(restrictionMessage(result.reason));
    setToolsEnabled(false);
  } else {
    pickerBtn.focus();
  }

  pickerBtn.addEventListener('click', () => void startTool('picker'));
  fontBtn.addEventListener('click', () => void startTool('font'));
}

void init();
