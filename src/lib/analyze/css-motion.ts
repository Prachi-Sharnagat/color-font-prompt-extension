/**
 * CSS motion analysis (pure). The collector gathers raw data from
 * document.getAnimations(), computed animation/transition styles and
 * :hover/:focus rules; this module normalizes, de-duplicates and caps it.
 */

export type Keyframe = { offset: number | null; easing?: string; props: Record<string, string> };

export interface RawAnimation {
  /** 'CSSAnimation' | 'CSSTransition' | 'Animation' (WAAPI, e.g. JS libraries). */
  type: string;
  name: string;
  selector: string;
  /** Group selector (tag + stable classes) used for de-duplication. */
  group: string;
  keyframes: Keyframe[];
  duration: number | string; // ms or 'auto'
  delay: number;
  iterations: number | 'infinite';
  easing: string;
  direction: string;
  fill: string;
  pseudoElement?: string | null;
}

export interface RawStateRule {
  selectorText: string;
  /** Declarations from the rule (already filtered to motion-relevant props by the collector or not). */
  declarations: Record<string, string>;
  /** Computed transition lists of the first element matching the base selector. */
  transition?: { property: string; duration: string; timingFunction: string; delay: string };
  matches: number;
}

export interface RawTransitionElement {
  group: string;
  selector: string;
  property: string;
  duration: string;
  timingFunction: string;
  delay: string;
}

export interface RawMotion {
  running: RawAnimation[];
  declared: RawAnimation[];
  stateRules: RawStateRule[];
  transitions: RawTransitionElement[];
  inaccessibleSheets: number;
}

export interface TransitionEntry {
  property: string;
  durationMs: number;
  easing: string;
  delayMs: number;
}

export interface MotionAnimation extends Omit<RawAnimation, 'group'> {
  count: number;
  /** Distinct delays (ms) across merged elements: a stagger hint when > 1. */
  delays?: number[];
}

export interface MotionInteraction {
  selector: string;
  state: string;
  changes: Record<string, string>;
  transition: TransitionEntry[];
  matches: number;
}

export interface MotionTransitionGroup {
  selector: string;
  count: number;
  transition: TransitionEntry[];
}

export interface MotionReport {
  animations: MotionAnimation[];
  interactions: MotionInteraction[];
  transitions: MotionTransitionGroup[];
  notes: string[];
}

/** Properties worth describing for motion/interaction states. */
export const MOTION_PROPS = new Set([
  'transform',
  'translate',
  'rotate',
  'scale',
  'opacity',
  'color',
  'background-color',
  'background',
  'background-position',
  'background-size',
  'border-color',
  'box-shadow',
  'filter',
  'backdrop-filter',
  'clip-path',
  'width',
  'height',
  'max-height',
  'letter-spacing',
  'text-decoration-color',
  'outline',
  'outline-color',
  'outline-offset',
  'stroke-dashoffset',
  'offset-distance',
  'visibility',
]);

const STATE_PSEUDOS = [':hover', ':focus-visible', ':focus-within', ':focus', ':active'] as const;

// ------------------------------------------------------------------ parsing

/** "0.3s, 200ms" → [300, 200]. */
export function parseTimeList(value: string): number[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const n = Number.parseFloat(part);
      if (!Number.isFinite(n)) return 0;
      return part.endsWith('ms') ? n : n * 1000;
    });
}

/** Split a list on top-level commas (ignores commas inside parentheses). */
export function splitTopLevel(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of value) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/**
 * Combine computed transition-* lists into entries. Per CSS, shorter lists
 * repeat to the length of transition-property. Zero-duration entries drop.
 */
export function combineTransitionLists(property: string, duration: string, timingFunction: string, delay: string): TransitionEntry[] {
  const props = splitTopLevel(property);
  const durations = parseTimeList(duration);
  const easings = splitTopLevel(timingFunction);
  const delays = parseTimeList(delay);
  if (props.length === 0 || durations.length === 0) return [];
  return props
    .map((prop, i) => ({
      property: prop,
      durationMs: durations[i % durations.length] ?? 0,
      easing: easings[i % Math.max(1, easings.length)] ?? 'ease',
      delayMs: delays[i % Math.max(1, delays.length)] ?? 0,
    }))
    .filter((t) => t.durationMs > 0 && t.property !== 'none');
}

/**
 * ".btn:hover, .card:focus-visible .title" →
 * [{ base: ".btn", state: ":hover" }, { base: ".card .title", state: ":focus-visible" }]
 * Selectors without a state pseudo-class are omitted.
 */
export function splitStateSelector(selectorText: string): Array<{ base: string; state: string }> {
  const out: Array<{ base: string; state: string }> = [];
  for (const sel of splitTopLevel(selectorText)) {
    const state = STATE_PSEUDOS.find((p) => sel.includes(p));
    if (!state) continue;
    let base = sel;
    for (const p of STATE_PSEUDOS) base = base.split(p).join('');
    base = base.replace(/\s+/g, ' ').trim();
    out.push({ base: base || '*', state });
  }
  return out;
}

/** Keep only motion-relevant declarations, with values capped in length. */
export function pickMotionDeclarations(declarations: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [prop, value] of Object.entries(declarations)) {
    if (MOTION_PROPS.has(prop) || prop.startsWith('--')) out[prop] = value.length > 160 ? `${value.slice(0, 157)}…` : value;
  }
  return out;
}

// ------------------------------------------------------------------ normalize

/** Delay and target are excluded: the same animation staggered across elements merges. */
function animationKey(a: RawAnimation): string {
  return JSON.stringify([a.type, a.name, a.keyframes, a.duration, a.iterations, a.easing, a.direction]);
}

/**
 * Shared selector for a set of group selectors: identical → that selector;
 * otherwise the classes they all share (".reveal"); otherwise the first + count.
 */
export function commonSelector(groups: string[]): string {
  const unique = [...new Set(groups.filter(Boolean))];
  if (unique.length <= 1) return unique[0] ?? '';
  const classSets = unique.map((g) => new Set(g.split('.').slice(1)));
  const shared = [...(classSets[0] ?? [])].filter((c) => classSets.every((set) => set.has(c)));
  if (shared.length > 0) return `.${shared.join('.')}`;
  return `${unique[0]} (+${unique.length - 1} other selector${unique.length > 2 ? 's' : ''})`;
}

/** Merge identical animations; repeated ones are described by a shared selector. */
function dedupeAnimations(list: RawAnimation[]): MotionAnimation[] {
  const groups = new Map<string, RawAnimation[]>();
  for (const a of list) {
    const key = animationKey(a);
    const members = groups.get(key);
    if (members) members.push(a);
    else groups.set(key, [a]);
  }
  return [...groups.values()].map((members) => {
    const first = members[0]!;
    const { group: _group, ...rest } = first;
    if (members.length === 1) return { ...rest, count: 1 };
    const delays = [...new Set(members.map((m) => m.delay))].sort((a, b) => a - b);
    return {
      ...rest,
      selector: commonSelector(members.map((m) => m.group)) || first.selector,
      count: members.length,
      delay: delays[0] ?? 0,
      ...(delays.length > 1 ? { delays } : {}),
    };
  });
}

export interface NormalizeOptions {
  maxAnimations?: number;
  maxInteractions?: number;
  maxTransitions?: number;
}

export function normalizeMotion(raw: RawMotion, options: NormalizeOptions = {}): MotionReport {
  const { maxAnimations = 40, maxInteractions = 40, maxTransitions = 30 } = options;
  const notes: string[] = [];

  // Running animations are authoritative; declared ones fill in what has
  // already finished or not started. Skip declared duplicates of running ones.
  const runningNames = new Set(raw.running.map((a) => `${a.selector}|${a.name}`));
  const declared = raw.declared.filter((a) => !runningNames.has(`${a.selector}|${a.name}`));
  // Running CSS transitions are momentary; describe them via transitions below.
  const all = [...raw.running.filter((a) => a.type !== 'CSSTransition'), ...declared];
  const animations = dedupeAnimations(all)
    .sort((a, b) => b.count - a.count)
    .slice(0, maxAnimations);
  if (raw.running.some((a) => a.type === 'Animation')) {
    notes.push('Some animations are created from JavaScript (Web Animations API), e.g. by Framer Motion or Motion One.');
  }

  const interactions: MotionInteraction[] = [];
  for (const rule of raw.stateRules) {
    const changes = pickMotionDeclarations(rule.declarations);
    if (Object.keys(changes).length === 0) continue;
    const transition = rule.transition
      ? combineTransitionLists(rule.transition.property, rule.transition.duration, rule.transition.timingFunction, rule.transition.delay)
      : [];
    for (const { base, state } of splitStateSelector(rule.selectorText)) {
      interactions.push({ selector: base, state, changes, transition, matches: rule.matches });
    }
  }
  interactions.sort((a, b) => b.matches - a.matches);

  const transitionGroups = new Map<string, MotionTransitionGroup>();
  for (const t of raw.transitions) {
    const entries = combineTransitionLists(t.property, t.duration, t.timingFunction, t.delay);
    if (entries.length === 0) continue;
    const key = `${t.group}|${JSON.stringify(entries)}`;
    const existing = transitionGroups.get(key);
    if (existing) existing.count++;
    else transitionGroups.set(key, { selector: t.group || t.selector, count: 1, transition: entries });
  }

  if (raw.inaccessibleSheets > 0) {
    notes.push(
      `${raw.inaccessibleSheets} stylesheet(s) are cross-origin and can't be read, so some :hover/:focus rules and @keyframes may be missing.`,
    );
  }

  return {
    animations,
    interactions: interactions.slice(0, maxInteractions),
    transitions: [...transitionGroups.values()].sort((a, b) => b.count - a.count).slice(0, maxTransitions),
    notes,
  };
}

/** Short summary for progress UI, e.g. "5 animations, 12 hover/focus states". */
export function summarizeMotion(report: MotionReport): string {
  const parts = [
    `${report.animations.length} animation${report.animations.length === 1 ? '' : 's'}`,
    `${report.interactions.length} hover/focus state${report.interactions.length === 1 ? '' : 's'}`,
    `${report.transitions.length} transition group${report.transitions.length === 1 ? '' : 's'}`,
  ];
  return parts.join(', ');
}
