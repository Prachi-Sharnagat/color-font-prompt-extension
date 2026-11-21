import { copyText } from '../../lib/clipboard';
import {
  clearRecentColors,
  getRecentColors,
  onRecentColorsChanged,
  type ColorEntry,
} from '../../lib/storage';

interface RecentColorsElements {
  list: HTMLUListElement;
  empty: HTMLElement;
  clearBtn: HTMLButtonElement;
  showToast: (message: string) => void;
}

/** Render the recent-colors grid and keep it in sync with storage. */
export function initRecentColors(els: RecentColorsElements): void {
  const render = (colors: ColorEntry[]): void => {
    els.list.replaceChildren(
      ...colors.map((entry) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'swatch';
        btn.style.background = entry.hex;
        btn.title = `${entry.hex} (click to copy)`;
        btn.setAttribute('aria-label', `Copy ${entry.hex}`);
        btn.addEventListener('click', () => {
          void copyText(entry.hex).then((ok) => els.showToast(ok ? `Copied ${entry.hex}` : 'Copy failed'));
        });
        const li = document.createElement('li');
        li.append(btn);
        return li;
      }),
    );
    const hasColors = colors.length > 0;
    els.empty.hidden = hasColors;
    els.list.hidden = !hasColors;
    els.clearBtn.hidden = !hasColors;
  };

  els.clearBtn.addEventListener('click', () => {
    void clearRecentColors().then(() => els.showToast('Cleared recent colors'));
  });

  onRecentColorsChanged(render);
  getRecentColors()
    .then(render)
    .catch(() => render([]));
}
