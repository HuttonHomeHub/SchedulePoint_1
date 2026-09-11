import { describe, expect, it } from 'vitest';

import { describeStoreFailure } from './store-failure';

import { ApiFetchError } from '@/lib/api/client';

/**
 * `docs/TECH_DEBT.md` #269 — the panel said one sentence for every failed write and offered a
 * Retry that some failures structurally cannot use.
 *
 * The cases below are the DECISION that row says had to be made, pinned so the next reader changes
 * it deliberately rather than by widening a condition.
 */
const err = (status: number) => new ApiFetchError(status, { code: 'X', message: 'no' });

describe('describeStoreFailure', () => {
  it('offers a retry when the request never reached an answer', () => {
    const f = describeStoreFailure(new TypeError('Failed to fetch'));
    expect(f.status).toBeNull();
    expect(f.retryable).toBe(true);
    expect(f.retryBlockedReason).toBeNull();
  });

  it('offers a retry on a 5xx — the server failed, not the body', () => {
    expect(describeStoreFailure(err(500)).retryable).toBe(true);
    expect(describeStoreFailure(err(503)).retryable).toBe(true);
  });

  it('WITHHOLDS the retry on a 422, and says why', () => {
    // The live case: every `revision-diff` reading was answered `422 … property frames should not
    // exist` for the whole life of that scenario, and the panel reported it in the same words it
    // uses for a dropped socket. The diagnosis came from a journey reading the response body.
    const f = describeStoreFailure(err(422));
    expect(f.retryable).toBe(false);
    expect(f.retryBlockedReason).toMatch(/same reading/i);
    expect(f.summary).toContain('422');
    // The operator is told this is worth reporting: a 422 here is a client/server disagreement,
    // not something they did.
    expect(f.summary).toMatch(/defect worth reporting/i);
  });

  it('withholds it on the other refusing 4xx too', () => {
    for (const s of [400, 401, 403, 404, 409, 413]) {
      expect(describeStoreFailure(err(s)).retryable, `status ${String(s)}`).toBe(false);
    }
  });

  it('KEEPS the retry on 429 — the one 4xx worth retrying', () => {
    // The trap #269 names in as many words: a blanket "4xx cannot be retried" gets this wrong, and
    // a rate limit is exactly when an operator should wait and press the button again.
    const f = describeStoreFailure(err(429));
    expect(f.retryable).toBe(true);
    expect(f.retryBlockedReason).toBeNull();
    expect(f.summary).toMatch(/rate limit/i);
  });

  it('keeps it on the timing 4xx', () => {
    expect(describeStoreFailure(err(408)).retryable).toBe(true);
    expect(describeStoreFailure(err(425)).retryable).toBe(true);
  });

  it('always produces a summary, whatever it was handed', () => {
    // A reason is never absent: the original defect was silence about WHY, so a shape nobody
    // anticipated must still say something rather than fall through to the old one-sentence copy.
    for (const e of [undefined, null, 'a string', {}, err(418)]) {
      expect(describeStoreFailure(e).summary.length).toBeGreaterThan(0);
    }
  });

  it('never states a blocked reason beside a retryable failure', () => {
    // ADR-0082: a reason beside a live control is a refusal that is not happening. Pinned as an
    // invariant over every branch rather than asserted case by case.
    for (const e of [new TypeError('x'), err(500), err(429), err(408), err(422), err(404)]) {
      const f = describeStoreFailure(e);
      expect(f.retryable === (f.retryBlockedReason === null)).toBe(true);
    }
  });
});
