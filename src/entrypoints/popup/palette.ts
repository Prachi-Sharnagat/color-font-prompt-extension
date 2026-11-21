import { copyText } from '../../lib/clipboard';
import type { PaletteSwatch } from '../../lib/messages';

/** Render page-palette results as click-to-copy rows. */
export function renderPalette(
  list: HTMLUListElement,
  colors: readonly PaletteSwatch[],
  showToast: (message: string) => void,
): void {
  if (colors.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'recent__empty';
    empty.textContent = 'No colors found in view.';
    list.replaceChildren(empty);
    return;
  }

  list.replaceChildren(
    ...colors.map(({ hex, share }) => {
      const percent = share >= 0.01 ? `${Math.round(share * 100)}%` : '<1%';

      const chip = document.createElement('span');
      chip.className = 'palette__chip';
      chip.style.background = hex;

      const label = document.createElement('span');
      label.className = 'palette__hex';
      label.textContent = hex;

      const shareEl = document.createElement('span');
      shareEl.className = 'palette__share';
      shareEl.textContent = percent;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'palette__item';
      btn.setAttribute('aria-label', `Copy ${hex}, ${percent} of page color usage`);
      btn.append(chip, label, shareEl);
      btn.addEventListener('click', () => {
        void copyText(hex).then((ok) => showToast(ok ? `Copied ${hex}` : 'Copy failed'));
      });

      const li = document.createElement('li');
      li.append(btn);
      return li;
    }),
  );
}
