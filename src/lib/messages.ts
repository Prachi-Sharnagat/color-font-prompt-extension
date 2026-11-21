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
  | { type: 'pt:stop' };

export interface ContentStatus {
  ok: true;
  activeMode: ToolMode | null;
}

export function isContentRequest(value: unknown): value is ContentRequest {
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as { type?: unknown }).type;
  if (type === 'pt:ping' || type === 'pt:stop') return true;
  if (type === 'pt:start') {
    const mode = (value as { mode?: unknown }).mode;
    return mode === 'picker' || mode === 'font';
  }
  return false;
}
