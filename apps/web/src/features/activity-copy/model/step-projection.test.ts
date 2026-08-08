import type { ActivityStep } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { projectSteps, STEP_FIELD_DECISIONS } from './step-projection';

/**
 * **The step census and the zeroing** (`docs/specs/activity-copy-paste/` M4-T2).
 *
 * The assertion that matters most is that `percentComplete` is zeroed. Steps roll up to PHYSICAL
 * %-complete and **win over** the manual field (ADR-0044 N27), which the activity census already
 * withholds — so carrying the percents would let progress into a brand-new copy through the back
 * door the create DTO closes, and it would earn value (ADR-0042) with nothing on the activity
 * itself to explain the number.
 */
function step(over: Partial<ActivityStep> & { seq: number; name: string }): ActivityStep {
  return {
    id: `s-${String(over.seq)}`,
    activityId: 'a-1',
    weight: 1,
    percentComplete: 0,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

describe('STEP_FIELD_DECISIONS', () => {
  it('gives every field a reason', () => {
    for (const [field, decision] of Object.entries(STEP_FIELD_DECISIONS)) {
      expect(decision.reason.length, field).toBeGreaterThan(20);
    }
  });

  it('sends exactly the fields the census marks carried or transformed', () => {
    const expected = Object.entries(STEP_FIELD_DECISIONS)
      .filter(([, d]) => d.disposition !== 'withheld')
      .map(([field]) => field)
      .sort();
    const projected = projectSteps([step({ seq: 1, name: 'Set out' })]);
    expect(Object.keys(projected?.[0] ?? {}).sort()).toEqual(expected);
  });
});

describe('projectSteps', () => {
  it('zeroes every percentComplete, however far along the source is', () => {
    const projected = projectSteps([
      step({ seq: 1, name: 'Set out', weight: 2, percentComplete: 100 }),
      step({ seq: 2, name: 'Dig', weight: 5, percentComplete: 60 }),
      step({ seq: 3, name: 'Backfill', weight: 3, percentComplete: 5 }),
    ]);
    expect(projected?.map((s) => s.percentComplete)).toEqual([0, 0, 0]);
  });

  it('carries the weights, because all-zero weights silently fall back to the manual field', () => {
    const projected = projectSteps([
      step({ seq: 1, name: 'Set out', weight: 2, percentComplete: 100 }),
      step({ seq: 2, name: 'Dig', weight: 5, percentComplete: 60 }),
    ]);
    expect(projected?.map((s) => s.weight)).toEqual([2, 5]);
  });

  it('orders by seq rather than trusting the input order', () => {
    // The server assigns `seq` from list position, so an out-of-order list would silently renumber
    // the breakdown — a copy whose steps mean something different from the source's.
    const projected = projectSteps([
      step({ seq: 3, name: 'Backfill' }),
      step({ seq: 1, name: 'Set out' }),
      step({ seq: 2, name: 'Dig' }),
    ]);
    expect(projected?.map((s) => s.name)).toEqual(['Set out', 'Dig', 'Backfill']);
  });

  it('returns null for an activity with no steps, so the caller can skip the request', () => {
    // Not an empty array: a PUT with `steps: []` is a write and a `version` bump on an activity
    // that has no steps either way, and it is pen-gated (ADR-0060 M0) — so it can fail a paste for
    // no reason at all.
    expect(projectSteps([])).toBeNull();
  });

  it('does not mutate the source list while sorting', () => {
    const source = [step({ seq: 2, name: 'Dig' }), step({ seq: 1, name: 'Set out' })];
    projectSteps(source);
    expect(source.map((s) => s.name)).toEqual(['Dig', 'Set out']);
  });
});
