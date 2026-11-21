/**
 * Collect raw CSS motion data: running animations (Web Animations API),
 * declared CSS animations from computed styles, element transitions and
 * :hover/:focus/:active rules from readable stylesheets.
 */
import { getStyle } from '../../lib/dom';
import { groupSelector, stableSelector } from '../../lib/analyze/selectors';
import { splitStateSelector, type Keyframe, type RawMotion, type RawStateRule } from '../../lib/analyze/css-motion';
import { declarationsOf, forEachRule } from './stylesheets';
import { walkRendered } from './walk';

const MAX_FRAMES = 12;
const MAX_PROPS = 12;
const META_KEYS = new Set(['offset', 'computedOffset', 'easing', 'composite']);

const truncate = (s: string, n = 160): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function framesFromKeyframeEffect(effect: KeyframeEffect): Keyframe[] {
  return effect
    .getKeyframes()
    .slice(0, MAX_FRAMES)
    .map((k) => {
      const props: Record<string, string> = {};
      for (const [key, value] of Object.entries(k)) {
        if (META_KEYS.has(key) || value === undefined || value === null) continue;
        if (Object.keys(props).length >= MAX_PROPS) break;
        props[key] = truncate(String(value));
      }
      const offset = typeof k.offset === 'number' ? k.offset : typeof k.computedOffset === 'number' ? k.computedOffset : null;
      const frame: Keyframe = { offset, props };
      if (typeof k.easing === 'string' && k.easing !== 'linear') frame.easing = k.easing;
      return frame;
    });
}

function framesFromRule(rule: CSSKeyframesRule): Keyframe[] {
  const frames: Keyframe[] = [];
  for (const child of Array.from(rule.cssRules).slice(0, MAX_FRAMES)) {
    const kf = child as CSSKeyframeRule;
    const props: Record<string, string> = {};
    for (const [prop, value] of Object.entries(declarationsOf(kf.style)).slice(0, MAX_PROPS)) props[prop] = truncate(value);
    for (const key of kf.keyText.split(',')) {
      const text = key.trim();
      const offset = text === 'from' ? 0 : text === 'to' ? 1 : Number.parseFloat(text) / 100;
      frames.push({ offset: Number.isFinite(offset) ? offset : null, props });
    }
  }
  return frames.sort((a, b) => (a.offset ?? 0) - (b.offset ?? 0));
}

function timeMs(value: string): number {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return 0;
  return value.trim().endsWith('ms') ? n : n * 1000;
}

const listAt = (list: string[], i: number): string => list[i % Math.max(1, list.length)] ?? '';

export function collectMotion(doc: Document = document): RawMotion {
  const raw: RawMotion = { running: [], declared: [], stateRules: [], transitions: [], inaccessibleSheets: 0 };

  // ---- stylesheets: @keyframes and state rules
  const keyframesByName = new Map<string, Keyframe[]>();
  const stateRules: CSSStyleRule[] = [];
  const { inaccessible } = forEachRule(doc, (rule) => {
    const type = rule.constructor.name;
    if (type === 'CSSKeyframesRule') {
      const kr = rule as CSSKeyframesRule;
      if (!keyframesByName.has(kr.name)) keyframesByName.set(kr.name, framesFromRule(kr));
    } else if (type === 'CSSStyleRule' && stateRules.length < 300) {
      const sr = rule as CSSStyleRule;
      if (/:(hover|focus|focus-visible|focus-within|active)\b/.test(sr.selectorText)) stateRules.push(sr);
    }
  });
  raw.inaccessibleSheets = inaccessible;

  for (const rule of stateRules) {
    const entry: RawStateRule = { selectorText: rule.selectorText, declarations: declarationsOf(rule.style), matches: 0 };
    const first = splitStateSelector(rule.selectorText)[0];
    if (first) {
      try {
        const matches = doc.querySelectorAll(first.base);
        entry.matches = matches.length;
        const el = matches[0];
        if (el) {
          const s = getStyle(el);
          entry.transition = {
            property: s.transitionProperty,
            duration: s.transitionDuration,
            timingFunction: s.transitionTimingFunction,
            delay: s.transitionDelay,
          };
        }
      } catch {
        // Selector not valid for querySelectorAll (e.g. pseudo-elements).
      }
    }
    raw.stateRules.push(entry);
  }

  // ---- running animations
  let running: Animation[] = [];
  try {
    running = doc.getAnimations();
  } catch {
    running = [];
  }
  for (const anim of running.slice(0, 300)) {
    const effect = anim.effect;
    if (!(effect instanceof KeyframeEffect) || !effect.target) continue;
    const timing = effect.getTiming();
    const type = 'animationName' in anim ? 'CSSAnimation' : 'transitionProperty' in anim ? 'CSSTransition' : 'Animation';
    const name =
      type === 'CSSAnimation'
        ? (anim as CSSAnimation).animationName
        : type === 'CSSTransition'
          ? (anim as CSSTransition).transitionProperty
          : anim.id || '';
    const duration = timing.duration;
    // A CSS animation's timing function lives on its keyframes, so the
    // effect timing reports "linear". Read the authored one from computed style.
    let easing = timing.easing ?? 'linear';
    if (type === 'CSSAnimation') {
      const s = getStyle(effect.target);
      const index = s.animationName.split(',').map((n) => n.trim()).indexOf(name);
      const authored = s.animationTimingFunction.split(/,(?![^(]*\))/)[Math.max(0, index)]?.trim();
      if (authored) easing = authored;
    }
    raw.running.push({
      type,
      name,
      selector: stableSelector(effect.target),
      group: groupSelector(effect.target),
      keyframes: framesFromKeyframeEffect(effect),
      duration: typeof duration === 'number' ? duration : String(duration ?? 'auto'),
      delay: timing.delay ?? 0,
      iterations: timing.iterations === Infinity ? 'infinite' : (timing.iterations ?? 1),
      easing,
      direction: timing.direction ?? 'normal',
      fill: timing.fill ?? 'none',
      pseudoElement: effect.pseudoElement,
    });
  }

  // ---- computed styles: declared animations and transitions
  if (doc.body) {
    for (const el of walkRendered(doc.body, 6000)) {
      const style = getStyle(el);
      if (style.animationName && style.animationName !== 'none' && raw.declared.length < 300) {
        const names = style.animationName.split(',').map((s) => s.trim());
        const durations = style.animationDuration.split(',');
        const delays = style.animationDelay.split(',');
        const iterations = style.animationIterationCount.split(',');
        const easings = style.animationTimingFunction.split(/,(?![^(]*\))/);
        const directions = style.animationDirection.split(',');
        const fills = style.animationFillMode.split(',');
        names.forEach((name, i) => {
          if (name === 'none') return;
          const iter = listAt(iterations, i).trim();
          raw.declared.push({
            type: 'CSSAnimation',
            name,
            selector: stableSelector(el),
            group: groupSelector(el),
            keyframes: keyframesByName.get(name) ?? [],
            duration: timeMs(listAt(durations, i)),
            delay: timeMs(listAt(delays, i)),
            iterations: iter === 'infinite' ? 'infinite' : Number.parseFloat(iter) || 1,
            easing: listAt(easings, i).trim(),
            direction: listAt(directions, i).trim(),
            fill: listAt(fills, i).trim(),
          });
        });
      }
      if (raw.transitions.length < 400 && /[1-9]/.test(style.transitionDuration)) {
        raw.transitions.push({
          group: groupSelector(el),
          selector: stableSelector(el),
          property: style.transitionProperty,
          duration: style.transitionDuration,
          timingFunction: style.transitionTimingFunction,
          delay: style.transitionDelay,
        });
      }
    }
  }

  return raw;
}
