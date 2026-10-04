import { expect, test } from '../e2e-support/test';

import { countWaves } from './waves';

/**
 * The wave counter, verified against the defect it names (ADR-0110): it must tell a serialised
 * import chain from a parallel burst, or P3 passes over exactly the regression it exists to catch.
 * Pure; no browser, so these run in milliseconds beside the journey.
 */
test.describe('countWaves', () => {
  const at = (name: string, startTime: number, responseEnd: number) => ({
    name,
    startTime,
    responseEnd,
  });

  test('refuses nothing and counts nothing for an empty timeline', () => {
    expect(countWaves([])).toBe(0);
  });

  test('a parallel burst is one wave, however many requests', () => {
    expect(countWaves([at('a', 0, 100), at('b', 1, 120), at('c', 2, 90), at('d', 3, 110)])).toBe(1);
  });

  test('a serialised chain is as deep as it is long', () => {
    // Each import is only discovered when the previous response has finished: the shape P3 fails.
    expect(countWaves([at('a', 0, 100), at('b', 100, 200), at('c', 200, 300)])).toBe(3);
  });

  test('a burst followed by one more fetch is two waves', () => {
    expect(countWaves([at('a', 0, 100), at('b', 1, 90), at('c', 101, 150)])).toBe(2);
  });
});
