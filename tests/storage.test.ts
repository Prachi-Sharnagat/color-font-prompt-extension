import { describe, expect, it, vi } from 'vitest';

// storage.ts imports the WXT browser global; the pure function doesn't use it.
vi.mock('wxt/browser', () => ({ browser: {} }));

const { addToHistory } = await import('../src/lib/storage');

describe('addToHistory', () => {
  it('adds new colors to the front', () => {
    const list = addToHistory([{ hex: '#000000', at: 1 }], '#ffffff', 2);
    expect(list.map((e) => e.hex)).toEqual(['#FFFFFF', '#000000']);
  });

  it('deduplicates case-insensitively, moving the color to the front', () => {
    const start = [
      { hex: '#111111', at: 3 },
      { hex: '#AABBCC', at: 2 },
      { hex: '#222222', at: 1 },
    ];
    const list = addToHistory(start, '#aabbcc', 4);
    expect(list).toEqual([
      { hex: '#AABBCC', at: 4 },
      { hex: '#111111', at: 3 },
      { hex: '#222222', at: 1 },
    ]);
  });

  it('caps the list at the limit', () => {
    let list = addToHistory([], '#000000', 0);
    for (let i = 1; i <= 25; i++) {
      list = addToHistory(list, `#0000${i.toString(16).padStart(2, '0')}`, i);
    }
    expect(list).toHaveLength(20);
    expect(list[0]?.hex).toBe('#000019');
  });
});
