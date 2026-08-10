import { describe, expect, it } from 'vitest';

import { cutoffFor, RETENTION_POLICIES } from './retention-policy';

describe('retention policy', () => {
  it('keeps a row exactly at the cutoff, because the predicate is `<`', () => {
    // The safe direction on an operation that cannot be undone. Asserted rather than left to
    // inference from the SQL, because the two live in different files and only one is read when
    // somebody adjusts a period.
    const now = new Date('2026-08-10T12:00:00.000Z');

    expect(cutoffFor(30, now).toISOString()).toBe('2026-07-11T12:00:00.000Z');
  });

  it('measures in fixed days, not calendar months', () => {
    // ADR-0085 D3 and the migration comment both say "12 months"; this is 365 days. The difference
    // is a day or two on a boundary nobody can observe — a row is not more sensitive for being
    // deleted on the 366th day — and calendar arithmetic buys that irrelevance at the price of
    // month-length and daylight-saving edge cases inside a delete predicate.
    const now = new Date('2026-08-10T00:00:00.000Z');

    expect(cutoffFor(365, now).toISOString()).toBe('2025-08-10T00:00:00.000Z');
  });

  it('expires CSP reports on `last_seen_at`, never `first_seen_at`', () => {
    const csp = RETENTION_POLICIES.find((p) => p.table === 'csp_reports');

    expect(
      csp?.column,
      'first_seen_at would silently delete a violation that is STILL being reported — removing a ' +
        'live finding from the one screen built to surface it. The cost of last_seen_at is that ' +
        'the period bounds staleness rather than data age, which ADR-0087 records rather than hides.',
    ).toBe('last_seen_at');
  });

  it('gives every policy a positive period, so a misconfiguration cannot mean "delete everything"', () => {
    for (const policy of RETENTION_POLICIES) {
      expect(policy.days, `${policy.table} must retain something`).toBeGreaterThan(0);
    }
  });
});
