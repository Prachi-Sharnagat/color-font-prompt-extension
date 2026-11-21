import { browser } from 'wxt/browser';

/** A picked color in the recent-colors history. */
export interface ColorEntry {
  /** Uppercase `#RRGGBB`. */
  hex: string;
  /** Epoch milliseconds when it was (last) picked. */
  at: number;
}

export const HISTORY_KEY = 'pt:recentColors';
export const HISTORY_LIMIT = 20;

/**
 * Pure: put `hex` at the front, drop any older duplicate, cap at `limit`.
 */
export function addToHistory(
  list: readonly ColorEntry[],
  hex: string,
  now: number,
  limit = HISTORY_LIMIT,
): ColorEntry[] {
  const normalized = hex.toUpperCase();
  return [{ hex: normalized, at: now }, ...list.filter((e) => e.hex !== normalized)].slice(0, limit);
}

function isColorEntry(value: unknown): value is ColorEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { hex?: unknown; at?: unknown };
  return typeof v.hex === 'string' && /^#[0-9A-F]{6}$/.test(v.hex) && typeof v.at === 'number';
}

/** Validate whatever is in storage; corrupt data yields an empty list. */
function parseHistory(raw: unknown): ColorEntry[] {
  return Array.isArray(raw) ? raw.filter(isColorEntry).slice(0, HISTORY_LIMIT) : [];
}

export async function getRecentColors(): Promise<ColorEntry[]> {
  const result = await browser.storage.local.get(HISTORY_KEY);
  return parseHistory(result[HISTORY_KEY]);
}

export async function saveRecentColor(hex: string): Promise<ColorEntry[]> {
  const next = addToHistory(await getRecentColors(), hex, Date.now());
  await browser.storage.local.set({ [HISTORY_KEY]: next });
  return next;
}

export async function clearRecentColors(): Promise<void> {
  await browser.storage.local.remove(HISTORY_KEY);
}

/** Subscribe to history changes from any context. Returns an unsubscribe fn. */
export function onRecentColorsChanged(callback: (colors: ColorEntry[]) => void): () => void {
  const listener = (
    changes: Record<string, { newValue?: unknown }>,
    areaName: string,
  ): void => {
    if (areaName !== 'local') return;
    const change = changes[HISTORY_KEY];
    if (change) callback(parseHistory(change.newValue));
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
