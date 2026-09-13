import { describe, expect, it } from 'vitest';

import { createQueryClient } from './query-client';

import { ApiFetchError } from '@/lib/api/client';

/**
 * The seam, not the rule. `retryable-status.test.ts` proves the rule; these prove the query client
 * actually asks it — `docs/TECH_DEBT.md` #314 was never a wrong rule, it was a correct rule in one
 * file and a contradicting one in another, so an extraction that nothing consumes fixes nothing.
 */
function retryPredicate(): (failureCount: number, error: Error) => boolean {
  const retry = createQueryClient().getDefaultOptions().queries?.retry;
  if (typeof retry !== 'function') throw new Error('expected a retry predicate');
  return retry;
}

const apiError = (status: number): ApiFetchError =>
  new ApiFetchError(status, { code: 'X', message: 'x' });

describe('query client retry default', () => {
  it('retries a 429 — the defect #314 was raised on', () => {
    expect(retryPredicate()(0, apiError(429))).toBe(true);
  });

  it('retries 408 and 425', () => {
    expect(retryPredicate()(0, apiError(408))).toBe(true);
    expect(retryPredicate()(0, apiError(425))).toBe(true);
  });

  it.each([400, 401, 403, 404, 422])('still refuses to retry %i', (status) => {
    expect(retryPredicate()(0, apiError(status))).toBe(false);
  });

  it('still retries a 5xx and a status-less rejection', () => {
    expect(retryPredicate()(0, apiError(503))).toBe(true);
    expect(retryPredicate()(0, new Error('network'))).toBe(true);
  });

  it('still stops after two attempts, so a retryable status cannot loop', () => {
    expect(retryPredicate()(1, apiError(429))).toBe(true);
    expect(retryPredicate()(2, apiError(429))).toBe(false);
  });

  it('never retries a mutation, because re-sending one may succeed twice', () => {
    expect(createQueryClient().getDefaultOptions().mutations?.retry).toBe(false);
  });
});
