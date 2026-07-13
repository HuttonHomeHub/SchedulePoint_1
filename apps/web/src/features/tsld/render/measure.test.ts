import { describe, expect, it, vi } from 'vitest';

import { createMeasureCache } from './measure';

describe('createMeasureCache', () => {
  it('measures a string once and serves the cached width thereafter', () => {
    const cache = createMeasureCache();
    const measureText = vi.fn((s: string) => s.length * 7);

    expect(cache.measure('abc', measureText)).toBe(21);
    expect(cache.measure('abc', measureText)).toBe(21);
    expect(cache.measure('abc', measureText)).toBe(21);
    expect(measureText).toHaveBeenCalledTimes(1); // measured once, then memoised

    expect(cache.measure('de', measureText)).toBe(14);
    expect(measureText).toHaveBeenCalledTimes(2);
    expect(cache.size).toBe(2);
  });

  it('caches a zero width (a real measurement, not a miss)', () => {
    const cache = createMeasureCache();
    const measureText = vi.fn(() => 0);
    expect(cache.measure('', measureText)).toBe(0);
    expect(cache.measure('', measureText)).toBe(0);
    expect(measureText).toHaveBeenCalledTimes(1);
  });
});
