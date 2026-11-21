/**
 * Typed message contracts shared by popup, background and content script.
 * Every message carries a `pt:` prefix so we never react to other extensions'
 * or the page's messages by accident.
 */

export type ToolMode = 'picker' | 'font';

/** Messages handled by the content script. */
export type ContentRequest =
  | { type: 'pt:ping' }
  | { type: 'pt:start'; mode: ToolMode }
  | { type: 'pt:stop' }
  | { type: 'pt:palette' };

export interface ContentStatus {
  ok: true;
  activeMode: ToolMode | null;
}

export interface PaletteSwatch {
  hex: string;
  /** Fraction of usage, 0–1. */
  share: number;
}

export type PaletteResponse = { ok: true; colors: PaletteSwatch[] } | { ok: false; error: string };

export function isContentRequest(value: unknown): value is ContentRequest {
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as { type?: unknown }).type;
  if (type === 'pt:ping' || type === 'pt:stop' || type === 'pt:palette') return true;
  if (type === 'pt:start') {
    const mode = (value as { mode?: unknown }).mode;
    return mode === 'picker' || mode === 'font';
  }
  return false;
}

/** Messages handled by the background service worker. */
export type BackgroundRequest = { type: 'pt:capture' };

export type CaptureResponse = { ok: true; dataUrl: string } | { ok: false; error: string };

export function isBackgroundRequest(value: unknown): value is BackgroundRequest {
  return (
    typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'pt:capture'
  );
}
