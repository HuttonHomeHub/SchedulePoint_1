import { describe, expect, it } from 'vitest';

import { RETRYABLE_4XX, isRetryableStatus, readErrorStatus } from './retryable-status';

/**
 * The rule `docs/TECH_DEBT.md` #314 exists about. Each case names the defect it guards rather than
 * restating the implementation: the whole point of the row is that two files answered this
 * differently, so the assertions worth having are the ones a blanket "4xx is permanent" rule fails.
 */
describe('isRetryableStatus', () => {
  it('retries 429 — the one 4xx that means "come back in a moment"', () => {
    // RED against `status >= 400 && status < 500 → false`, which is what query-client.ts shipped.
    expect(isRetryableStatus(429)).toBe(true);
  });

  it('retries 408 and 425, which are about timing rather than content', () => {
    expect(isRetryableStatus(408)).toBe(true);
    expect(isRetryableStatus(425)).toBe(true);
  });

  it.each([400, 401, 403, 404, 409, 422])(
    'does not retry %i — the server refuses this body',
    (s) => {
      expect(isRetryableStatus(s)).toBe(false);
    },
  );

  it('retries when there is no status at all (dropped socket, offline)', () => {
    expect(isRetryableStatus(null)).toBe(true);
  });

  it('retries 5xx', () => {
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
  });

  it('retries a status outside 4xx/5xx rather than asserting it away', () => {
    // Cannot normally reach here (a 2xx does not throw, a 3xx is followed). Treated as retryable
    // deliberately: an unrecognised failure is one nobody has reasoned about.
    expect(isRetryableStatus(302)).toBe(true);
  });

  it('exposes exactly the three retryable 4xx, so a fourth cannot arrive unnoticed', () => {
    expect([...RETRYABLE_4XX].sort((a, b) => a - b)).toEqual([408, 425, 429]);
  });
});

describe('readErrorStatus', () => {
  it('reads a numeric status structurally, not via instanceof', () => {
    expect(readErrorStatus({ status: 429 })).toBe(429);
  });

  it.each([[new Error('network')], [null], [undefined], ['429'], [{ status: '429' }]])(
    'returns null when there is no numeric status (%s)',
    (thrown) => {
      expect(readErrorStatus(thrown)).toBeNull();
    },
  );
});
