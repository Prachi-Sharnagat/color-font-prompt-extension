/**
 * Place a fixed-position element near an anchor point (usually the click),
 * flipping to the other side and clamping so it stays fully in the viewport.
 */
export function placeNear(el: HTMLElement, x: number, y: number, gap = 16, margin = 12): void {
  const rect = el.getBoundingClientRect();
  let left = x + gap;
  let top = y + gap;
  if (left + rect.width > window.innerWidth - margin) left = x - gap - rect.width;
  if (top + rect.height > window.innerHeight - margin) top = y - gap - rect.height;
  left = Math.min(Math.max(margin, left), Math.max(margin, window.innerWidth - margin - rect.width));
  top = Math.min(Math.max(margin, top), Math.max(margin, window.innerHeight - margin - rect.height));
  el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}
