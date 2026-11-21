import { describe, expect, it } from 'vitest';
import { isStableClass, isStableId } from '../../src/lib/analyze/selectors';

describe('isStableClass', () => {
  it('accepts meaningful class names', () => {
    for (const name of ['hero', 'card', 'btn-primary', 'btnPrimary', 'nav__link', 'pricing-card--featured', 'flex', 'px-4']) {
      expect(isStableClass(name), name).toBe(true);
    }
  });

  it('rejects build-hashed and generated classes', () => {
    for (const name of ['css-1q2w3e4', 'sc-bdVaJa', 'jsx-123456', 'svelte-xyz123', '_3xk9q', 'Button_root__a1B2c', 'aB3dE9', 'item-20240101']) {
      expect(isStableClass(name), name).toBe(false);
    }
  });

  it('rejects state classes and tailwind variants', () => {
    for (const name of ['is-active', 'active', 'aos-animate', 'md:flex', 'w-[30px]', 'w-1/2']) {
      expect(isStableClass(name), name).toBe(false);
    }
  });
});

describe('isStableId', () => {
  it('accepts readable ids', () => {
    expect(isStableId('pricing')).toBe(true);
    expect(isStableId('main-content')).toBe(true);
  });

  it('rejects generated ids', () => {
    for (const id of [':r1:', 'radix-12', 'react-select-3-input', 'headlessui-menu-button-1', 'x1234', '1abc']) {
      expect(isStableId(id), id).toBe(false);
    }
  });
});
