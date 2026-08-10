import { describe, expect, it } from 'vitest';

import {
  ageInWholeDays,
  cutoffFor,
  isRetentionOverdue,
  RETENTION_POLICIES,
} from './retention-policy';

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

describe('the console s derived answer (ADR-0087 M3)', () => {
  const now = new Date('2026-08-10T12:00:00.000Z');
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  it('reports an age in whole days, because a person reads it', () => {
    expect(ageInWholeDays(daysAgo(3.9), now)).toBe(3);
  });

  it('never reports a negative age for a row written in the future', () => {
    // Clock skew between the API and Postgres is real, and "-1 days old" on an operations panel
    // reads as a broken screen rather than as a clock difference of no consequence.
    expect(ageInWholeDays(new Date(now.getTime() + 60_000), now)).toBe(0);
  });

  it('is NOT overdue for an empty table', () => {
    // The healthiest state a table can be in must not light the panel s one alarm.
    expect(
      isRetentionOverdue({ oldestAt: null, now, retentionDays: 30, intervalMinutes: 60 }),
    ).toBe(false);
  });

  it('is not overdue inside the period', () => {
    expect(
      isRetentionOverdue({ oldestAt: daysAgo(29), now, retentionDays: 30, intervalMinutes: 60 }),
    ).toBe(false);
  });

  it('grants exactly one sweep interval of grace past the period', () => {
    // A row reaching its period between two ticks is expected and is not a fault.
    const justInside = new Date(now.getTime() - (30 * 24 * 60 + 59) * 60 * 1000);
    const justOutside = new Date(now.getTime() - (30 * 24 * 60 + 61) * 60 * 1000);

    expect(
      isRetentionOverdue({ oldestAt: justInside, now, retentionDays: 30, intervalMinutes: 60 }),
    ).toBe(false);
    expect(
      isRetentionOverdue({ oldestAt: justOutside, now, retentionDays: 30, intervalMinutes: 60 }),
    ).toBe(true);
  });

  it('measures the grace in real time, not in whole days', () => {
    // The defect this shape exists to avoid: comparing a FLOORED day count against
    // `retentionDays + intervalDays` rounds a one-hour grace away entirely, so every table would
    // read as overdue for an hour out of every day and the word would stop meaning anything.
    const oneHourPast = new Date(now.getTime() - (30 * 24 + 1) * 60 * 60 * 1000);

    expect(Math.floor(ageInWholeDays(oneHourPast, now))).toBe(30);
    expect(
      isRetentionOverdue({ oldestAt: oneHourPast, now, retentionDays: 30, intervalMinutes: 120 }),
    ).toBe(false);
  });

  it('is overdue well past the period, whatever the interval', () => {
    expect(
      isRetentionOverdue({ oldestAt: daysAgo(400), now, retentionDays: 30, intervalMinutes: 1440 }),
    ).toBe(true);
  });
});
