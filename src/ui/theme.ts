/**
 * Base stylesheet for everything rendered inside our Shadow DOM.
 * `:host` rules with !important win over any page rule, because inner shadow
 * contexts take precedence for important declarations.
 */
export const BASE_CSS = /* css */ `
:host {
  all: initial !important;
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  max-width: none !important;
  max-height: none !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  background: transparent !important;
  overflow: visible !important;
  z-index: 2147483647 !important;
  pointer-events: none !important;
  display: block !important;
  color-scheme: light dark;
}

.pt-layer {
  --pt-bg: #ffffff;
  --pt-fg: #18181b;
  --pt-muted: #71717a;
  --pt-border: rgba(0, 0, 0, 0.12);
  --pt-hover: rgba(0, 0, 0, 0.06);
  --pt-accent: #2563eb;
  --pt-shadow: 0 8px 28px rgba(0, 0, 0, 0.18), 0 1px 3px rgba(0, 0, 0, 0.12);
  --pt-focus: 0 0 0 2px var(--pt-bg), 0 0 0 4px var(--pt-accent);

  position: fixed;
  inset: 0;
  pointer-events: none;
  font: 13px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--pt-fg);
  -webkit-font-smoothing: antialiased;
  text-align: left;
  letter-spacing: normal;
  text-transform: none;
}

@media (prefers-color-scheme: dark) {
  .pt-layer {
    --pt-bg: #1f1f23;
    --pt-fg: #f4f4f5;
    --pt-muted: #a1a1aa;
    --pt-border: rgba(255, 255, 255, 0.14);
    --pt-hover: rgba(255, 255, 255, 0.08);
    --pt-accent: #60a5fa;
    --pt-shadow: 0 8px 28px rgba(0, 0, 0, 0.5), 0 1px 3px rgba(0, 0, 0, 0.4);
  }
}

*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }

/* While a screenshot is taken, hide every visible piece of UI. The capture
   layer is transparent, so it stays active and keeps swallowing clicks. */
.pt-layer.pt-capturing > :not(.pt-capture) { visibility: hidden !important; }

.pt-text-btn {
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--pt-border);
  font-weight: 500;
}
.pt-text-btn:hover { background: var(--pt-hover); }

button {
  font: inherit;
  color: inherit;
  background: none;
  border: 0;
  margin: 0;
  padding: 0;
  cursor: pointer;
}
button:focus { outline: none; }
button:focus-visible { box-shadow: var(--pt-focus); }

/* Full-screen layer that swallows page interaction (used by the picker). */
.pt-capture {
  position: fixed;
  inset: 0;
  pointer-events: auto;
  cursor: crosshair;
  background: transparent;
}

/* Floating toolbar */
.pt-toolbar {
  position: fixed;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 6px 6px 12px;
  background: var(--pt-bg);
  border: 1px solid var(--pt-border);
  border-radius: 999px;
  box-shadow: var(--pt-shadow);
  pointer-events: auto;
  white-space: nowrap;
  user-select: none;
  cursor: default;
}
.pt-toolbar__title { font-weight: 600; }
.pt-toolbar__hint { color: var(--pt-muted); }
.pt-toolbar__actions:empty { display: none; }
.pt-kbd {
  display: inline-block;
  padding: 0 5px;
  border: 1px solid var(--pt-border);
  border-radius: 4px;
  font-size: 11px;
  line-height: 16px;
}
.pt-icon-btn {
  display: inline-grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 999px;
}
.pt-icon-btn:hover { background: var(--pt-hover); }
.pt-icon-btn svg { width: 14px; height: 14px; }

@media (prefers-reduced-motion: no-preference) {
  .pt-toolbar { animation: pt-fade-in 120ms ease-out; }
}
@keyframes pt-fade-in {
  from { opacity: 0; transform: translate(-50%, -4px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}
`;
