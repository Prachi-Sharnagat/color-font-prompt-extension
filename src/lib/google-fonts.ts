import { GOOGLE_FONT_FAMILIES } from './data/google-fonts';

/** fonts.google.com specimen page for a family. */
export function googleFontsUrl(family: string): string {
  return `https://fonts.google.com/specimen/${encodeURIComponent(family).replace(/%20/g, '+')}`;
}

/**
 * Family names requested by a Google Fonts stylesheet URL. Handles the CSS2
 * API (`family=Open+Sans:wght@400;700&family=Lato`) and the legacy API
 * (`family=Open+Sans:400,700|Lato`).
 */
export function familiesFromGoogleFontsHref(href: string): string[] {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return [];
  }
  if (url.hostname !== 'fonts.googleapis.com') return [];
  return url.searchParams
    .getAll('family')
    .flatMap((value) => value.split('|'))
    .map((entry) => (entry.split(':')[0] ?? '').replace(/\+/g, ' ').trim())
    .filter((name) => name.length > 0);
}

/**
 * A family counts as a Google Font if the page loads it from Google Fonts, or
 * if it's in the bundled Google Fonts catalog (self-hosted copies).
 */
export function isGoogleFont(family: string, pageGoogleFamilies: ReadonlySet<string>): boolean {
  const key = family.toLowerCase();
  return pageGoogleFamilies.has(key) || GOOGLE_FONT_FAMILIES.has(key);
}
