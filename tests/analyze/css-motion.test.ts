import { describe, expect, it } from 'vitest';
import {
  combineTransitionLists,
  commonSelector,
  normalizeMotion,
  parseTimeList,
  pickMotionDeclarations,
  splitStateSelector,
  splitTopLevel,
  summarizeMotion,
  type RawAnimation,
  type RawMotion,
} from '../../src/lib/analyze/css-motion';

const anim = (partial: Partial<RawAnimation> = {}): RawAnimation => ({
  type: 'CSSAnimation',
  name: 'float',
  selector: 'div.blob:nth-of-type(1)',
  group: 'div.blob',
  keyframes: [
    { offset: 0, props: { transform: 'translateY(0px)' } },
    { offset: 1, props: { transform: 'translateY(-12px)' } },
  ],
  duration: 3000,
  delay: 0,
  iterations: 'infinite',
  easing: 'ease-in-out',
  direction: 'alternate',
  fill: 'none',
  ...partial,
});

const empty = (): RawMotion => ({ running: [], declared: [], stateRules: [], transitions: [], inaccessibleSheets: 0 });

describe('parsing helpers', () => {
  it('parses time lists', () => {
    expect(parseTimeList('0.3s, 200ms, 0s')).toEqual([300, 200, 0]);
    expect(parseTimeList('')).toEqual([]);
  });

  it('splits on top-level commas only', () => {
    expect(splitTopLevel('transform, cubic-bezier(0.4, 0, 0.2, 1), opacity')).toEqual([
      'transform',
      'cubic-bezier(0.4, 0, 0.2, 1)',
      'opacity',
    ]);
  });

  it('combines transition lists, repeating shorter lists', () => {
    expect(combineTransitionLists('transform, opacity, color', '0.3s', 'cubic-bezier(0.4, 0, 0.2, 1), ease', '0s, 50ms')).toEqual([
      { property: 'transform', durationMs: 300, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', delayMs: 0 },
      { property: 'opacity', durationMs: 300, easing: 'ease', delayMs: 50 },
      { property: 'color', durationMs: 300, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', delayMs: 0 },
    ]);
    expect(combineTransitionLists('all', '0s', 'ease', '0s')).toEqual([]);
  });

  it('splits state selectors', () => {
    expect(splitStateSelector('.btn:hover, .card:focus-visible .title, .plain')).toEqual([
      { base: '.btn', state: ':hover' },
      { base: '.card .title', state: ':focus-visible' },
    ]);
    expect(splitStateSelector('a:not(.x):hover')).toEqual([{ base: 'a:not(.x)', state: ':hover' }]);
  });

  it('keeps only motion-relevant declarations', () => {
    expect(pickMotionDeclarations({ transform: 'scale(1.05)', 'font-family': 'Inter', '--lift': '4px', cursor: 'pointer' })).toEqual({
      transform: 'scale(1.05)',
      '--lift': '4px',
    });
  });
});

describe('normalizeMotion', () => {
  it('dedupes identical animations and uses the group selector', () => {
    const raw = empty();
    raw.running = [anim(), anim({ selector: 'div.blob:nth-of-type(2)' }), anim({ selector: 'div.blob:nth-of-type(3)' })];
    const report = normalizeMotion(raw);
    expect(report.animations).toHaveLength(1);
    expect(report.animations[0]).toMatchObject({ selector: 'div.blob', count: 3, name: 'float', iterations: 'infinite' });
  });

  it('merges a staggered animation and keeps its delays', () => {
    const raw = empty();
    raw.running = [
      anim({ name: 'fade-up', selector: 'div.eyebrow', group: 'div.eyebrow.reveal', delay: 0 }),
      anim({ name: 'fade-up', selector: 'h1', group: 'h1.reveal.reveal-2', delay: 150 }),
      anim({ name: 'fade-up', selector: 'p', group: 'p.reveal.reveal-2', delay: 150 }),
    ];
    const [merged] = normalizeMotion(raw).animations;
    expect(merged).toMatchObject({ selector: '.reveal', count: 3, delay: 0, delays: [0, 150] });
  });

  it('finds a common selector', () => {
    expect(commonSelector(['span.blob', 'span.blob'])).toBe('span.blob');
    expect(commonSelector(['div.a.x', 'h1.x.y'])).toBe('.x');
    expect(commonSelector(['div.a', 'h1.b', 'p.c'])).toBe('div.a (+2 other selectors)');
  });

  it('merges declared animations without duplicating running ones', () => {
    const raw = empty();
    raw.running = [anim()];
    raw.declared = [anim(), anim({ name: 'fade-in', selector: 'h1.title', group: 'h1.title', iterations: 1, duration: 600 })];
    const report = normalizeMotion(raw);
    expect(report.animations.map((a) => a.name).sort()).toEqual(['fade-in', 'float']);
  });

  it('skips momentary CSS transitions and notes JS-driven animations', () => {
    const raw = empty();
    raw.running = [anim({ type: 'CSSTransition', name: 'opacity' }), anim({ type: 'Animation', name: '' })];
    const report = normalizeMotion(raw);
    expect(report.animations.map((a) => a.type)).toEqual(['Animation']);
    expect(report.notes[0]).toContain('JavaScript');
  });

  it('builds interactions from state rules with their transitions', () => {
    const raw = empty();
    raw.stateRules = [
      {
        selectorText: '.card:hover',
        declarations: { transform: 'translateY(-4px)', 'box-shadow': '0 12px 24px rgba(0,0,0,.15)', cursor: 'pointer' },
        transition: { property: 'transform, box-shadow', duration: '0.25s', timingFunction: 'ease-out', delay: '0s' },
        matches: 6,
      },
      { selectorText: '.link:hover', declarations: { cursor: 'pointer' }, matches: 20 },
    ];
    const report = normalizeMotion(raw);
    expect(report.interactions).toEqual([
      {
        selector: '.card',
        state: ':hover',
        changes: { transform: 'translateY(-4px)', 'box-shadow': '0 12px 24px rgba(0,0,0,.15)' },
        transition: [
          { property: 'transform', durationMs: 250, easing: 'ease-out', delayMs: 0 },
          { property: 'box-shadow', durationMs: 250, easing: 'ease-out', delayMs: 0 },
        ],
        matches: 6,
      },
    ]);
  });

  it('groups element transitions and notes unreadable stylesheets', () => {
    const raw = empty();
    const t = { group: 'a.btn', selector: 'a.btn:nth-of-type(1)', property: 'background-color', duration: '0.2s', timingFunction: 'ease', delay: '0s' };
    raw.transitions = [t, { ...t, selector: 'a.btn:nth-of-type(2)' }, { ...t, duration: '0s' }];
    raw.inaccessibleSheets = 2;
    const report = normalizeMotion(raw);
    expect(report.transitions).toEqual([
      { selector: 'a.btn', count: 2, transition: [{ property: 'background-color', durationMs: 200, easing: 'ease', delayMs: 0 }] },
    ]);
    expect(report.notes.some((n) => n.includes('2 stylesheet'))).toBe(true);
    expect(summarizeMotion(report)).toBe('0 animations, 0 hover/focus states, 1 transition group');
  });
});
