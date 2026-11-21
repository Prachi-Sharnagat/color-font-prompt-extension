/**
 * Visit every readable CSS rule in the document (nested @media/@supports/
 * @layer/@container and @import included). Cross-origin sheets throw on
 * access; they are counted, not read.
 */
export function forEachRule(doc: Document, visit: (rule: CSSRule) => void): { inaccessible: number } {
  let inaccessible = 0;
  const seen = new Set<CSSStyleSheet>();

  const walkRules = (rules: CSSRuleList): void => {
    for (const rule of Array.from(rules)) {
      try {
        visit(rule);
      } catch {
        // A single odd rule must not stop the walk.
      }
      if ('styleSheet' in rule && (rule as CSSImportRule).styleSheet) {
        walkSheet((rule as CSSImportRule).styleSheet!);
      } else if ('cssRules' in rule && rule.constructor.name !== 'CSSKeyframesRule') {
        walkRules((rule as CSSGroupingRule).cssRules);
      }
    }
  };

  const walkSheet = (sheet: CSSStyleSheet): void => {
    if (seen.has(sheet)) return;
    seen.add(sheet);
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      inaccessible++;
      return;
    }
    walkRules(rules);
  };

  for (const sheet of Array.from(doc.styleSheets)) walkSheet(sheet);
  for (const sheet of doc.adoptedStyleSheets ?? []) walkSheet(sheet);
  return { inaccessible };
}

/** Declarations of a style rule as a plain object. */
export function declarationsOf(style: CSSStyleDeclaration): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < style.length; i++) {
    const prop = style.item(i);
    out[prop] = style.getPropertyValue(prop).trim();
  }
  return out;
}
