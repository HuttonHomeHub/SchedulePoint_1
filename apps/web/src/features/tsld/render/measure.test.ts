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

  it('clear() drops every entry so the next sight re-measures (#173 font-load bust)', () => {
    const cache = createMeasureCache();
    // Two-phase measurer standing in for the fallback face vs. the loaded face: the same string
    // gets a DIFFERENT width after clear(), which is exactly the poisoning clear() exists to fix.
    let width = 21;
    const measureText = vi.fn(() => width);

    expect(cache.measure('abc', measureText)).toBe(21);
    expect(cache.size).toBe(1);

    cache.clear();
    expect(cache.size).toBe(0);

    width = 30;
    expect(cache.measure('abc', measureText)).toBe(30); // re-measured, not served stale
    expect(measureText).toHaveBeenCalledTimes(2);
  });
});
