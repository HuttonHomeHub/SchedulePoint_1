import { describe, expect, it } from 'vitest';

import { UNSUPPORTED_SENTENCE, unsupportedReason } from './support';

const full = (): Window =>
  ({
    sessionStorage: { setItem: () => undefined, removeItem: () => undefined },
    PerformanceObserver: class {},
    performance: { getEntriesByType: () => [], setResourceTimingBufferSize: () => undefined },
  }) as unknown as Window;

describe('unsupportedReason', () => {
  it('accepts a browser with storage and resource timing', () => {
    expect(unsupportedReason(full())).toBeNull();
  });

  it('refuses a storage that throws on use, as a blocked one does', () => {
    const win = full();
    (win as unknown as { sessionStorage: unknown }).sessionStorage = {
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => undefined,
    };
    expect(unsupportedReason(win)).toBe(UNSUPPORTED_SENTENCE);
  });

  it.each(['PerformanceObserver', 'getEntriesByType', 'setResourceTimingBufferSize'])(
    'refuses a browser without %s',
    (missing) => {
      const win = full() as unknown as Record<string, Record<string, unknown>>;
      if (missing === 'PerformanceObserver') delete win.PerformanceObserver;
      else delete win.performance?.[missing];
      expect(unsupportedReason(win as unknown as Window)).toBe(UNSUPPORTED_SENTENCE);
    },
  );

  it('names a browser the reader can switch to, in plain words', () => {
    expect(UNSUPPORTED_SENTENCE).toMatch(/Chrome or Edge/);
  });
});
