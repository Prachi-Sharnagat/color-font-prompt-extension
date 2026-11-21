/**
 * Stable CSS selector generation for analysis output. "Stable" means the
 * selector avoids build-hashed class names and framework-generated ids, so a
 * coding model (or the user) can read it as a meaningful hook.
 */

const HASHED_CLASS_PATTERNS: readonly RegExp[] = [
  /^css-[a-z0-9]{4,}$/i, // emotion
  /^sc-[a-z0-9]+$/i, // styled-components
  /^jsx-\d+$/, // styled-jsx
  /^svelte-[a-z0-9]+$/i,
  /^_[a-z0-9]{5,}$/i, // generic hashes
  /^[A-Za-z]+_[A-Za-z0-9]+__[A-Za-z0-9-]{5}$/, // CSS modules (Name_local__hash)
  /^(?=[A-Za-z0-9]*\d)(?=[A-Za-z0-9]*[A-Z])[A-Za-z0-9]{5,10}$/, // hashed atoms like "aB3dE9"
  /\d{4,}/, // long digit runs
];

/** Classes describing transient state: unhelpful as structural hooks. */
const STATE_CLASS = /^(is|has|js|aos)-|^(active|open|visible|hidden|show|selected|current|animated|in-view|loaded)$/i;

export function isStableClass(name: string): boolean {
  if (name.length < 2 || name.length > 40) return false;
  // Tailwind variants/arbitrary values (md:flex, w-[30px], w-1/2) are noisy.
  if (!/^[A-Za-z_-][\w-]*$/.test(name)) return false;
  if (STATE_CLASS.test(name)) return false;
  return !HASHED_CLASS_PATTERNS.some((re) => re.test(name));
}

export function isStableId(id: string): boolean {
  if (!/^[A-Za-z][\w-]{0,39}$/.test(id)) return false;
  if (/\d{3,}/.test(id)) return false;
  return !/^(radix|headlessui|react|ember|mui|rc|downshift|aria|uid|id)[-_]/i.test(id);
}

/** Tag plus up to `maxClasses` stable classes, e.g. `div.card.card--featured`. */
export function groupSelector(el: Element, maxClasses = 2): string {
  const tag = el.tagName.toLowerCase();
  const classes = Array.from(el.classList).filter(isStableClass).slice(0, maxClasses);
  return tag + classes.map((c) => `.${c}`).join('');
}

function nthOfType(el: Element): number {
  let n = 1;
  for (let sib = el.previousElementSibling; sib; sib = sib.previousElementSibling) {
    if (sib.tagName === el.tagName) n++;
  }
  return n;
}

/**
 * Shortest readable selector (up to `maxDepth` levels) that uniquely matches
 * `el` within its root (document or shadow root). Falls back to the deepest
 * attempt if uniqueness can't be reached.
 */
export function stableSelector(el: Element, maxDepth = 4): string {
  const root = el.getRootNode() as Document | ShadowRoot;
  const parts: string[] = [];
  let node: Element | null = el;

  for (let depth = 0; node && depth < maxDepth; depth++) {
    if (node.id && isStableId(node.id)) {
      parts.unshift(`#${node.id}`);
    } else {
      let part = groupSelector(node);
      const parent: Element | null = node.parentElement;
      if (parent) {
        const sameGroup = Array.from(parent.children).filter(
          (c) => c !== node && c.tagName === node!.tagName && groupSelector(c) === part,
        );
        if (sameGroup.length > 0) part += `:nth-of-type(${nthOfType(node)})`;
      }
      parts.unshift(part);
    }

    const selector = parts.join(' > ');
    try {
      if (root.querySelectorAll(selector).length === 1) return selector;
    } catch {
      // Unusual class/id characters: keep climbing.
    }
    if (parts[0]?.startsWith('#')) return selector;
    node = node.parentElement;
  }
  return parts.join(' > ');
}
