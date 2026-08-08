import type { ResourceAssignmentSummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { ASSIGNMENT_FIELD_DECISIONS, projectAssignment } from './assignment-projection';

/**
 * **The assignment census** (`docs/specs/activity-copy-paste/` M4-T1).
 *
 * The gate is the **type** — `ASSIGNMENT_FIELD_DECISIONS` is
 * `Record<keyof ResourceAssignmentSummary, …>`, so a field added there is a compile error until
 * somebody classifies it. What is asserted here is what the compiler cannot see: that the projection
 * sends exactly what the census says, and that the two cost fields stay out.
 */
function assignment(over: Partial<ResourceAssignmentSummary> = {}): ResourceAssignmentSummary {
  return {
    id: 'as-1',
    activityId: 'a-1',
    resourceId: 'r-1',
    budgetedUnits: 40,
    unitsPerHour: 1.5,
    isDriving: true,
    curveType: 'BELL',
    lagMinutes: 480,
    actualUnits: 12,
    budgetedCost: 250_000,
    actualCost: 90_000,
    version: 3,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
    ...over,
  };
}

describe('ASSIGNMENT_FIELD_DECISIONS', () => {
  it('gives every field a reason, not just a disposition', () => {
    for (const [field, decision] of Object.entries(ASSIGNMENT_FIELD_DECISIONS)) {
      expect(decision.reason.length, field).toBeGreaterThan(20);
    }
  });

  it('sends exactly the fields the census marks carried or transformed', () => {
    // The census and the projection are two statements of one decision. If they drift, an
    // assignment silently loses a field and every screen that lists it still looks right.
    const expected = Object.entries(ASSIGNMENT_FIELD_DECISIONS)
      .filter(([, d]) => d.disposition !== 'withheld')
      .map(([field]) => field)
      .sort();
    expect(Object.keys(projectAssignment(assignment())).sort()).toEqual(expected);
  });
});

describe('projectAssignment', () => {
  it('carries the whole commitment — who, how much, how fast, shaped how, joining when', () => {
    expect(projectAssignment(assignment())).toEqual({
      resourceId: 'r-1',
      budgetedUnits: 40,
      unitsPerHour: 1.5,
      isDriving: true,
      curveType: 'BELL',
      lagMinutes: 480,
    });
  });

  it('carries no history — actual units and both cost fields stay out', () => {
    const body = projectAssignment(assignment());
    for (const field of ['actualUnits', 'actualCost', 'budgetedCost']) {
      expect(body, field).not.toHaveProperty(field);
    }
  });

  it('withholds budgetedCost even though it is a budget, because the client cannot read it honestly', () => {
    // EV4a returns `null` both when it is unset AND when the caller lacks `cost:read`. Sending
    // whatever we were handed would make the copy's budget depend on who pressed the button —
    // 0 for a Contributor, the real figure for a Planner. Unset, the server derives the same
    // answer for everybody from budgetedUnits × costPerUnit.
    const asPlanner = projectAssignment(assignment({ budgetedCost: 250_000 }));
    const asContributor = projectAssignment(assignment({ budgetedCost: null }));
    expect(asPlanner).toEqual(asContributor);
  });

  it('omits unitsPerHour rather than sending null, because NULL is what makes the triad inert', () => {
    // ADR-0040: a null rate means "no triad". `0` would mean a zero rate, which is an N20 reject.
    const body = projectAssignment(assignment({ unitsPerHour: null }));
    expect(body).not.toHaveProperty('unitsPerHour');
  });

  it('preserves isDriving in both states, so exactly-one-driver survives the copy', () => {
    // The source already satisfies the invariant, so a faithful copy does — but only if the flag is
    // carried per assignment rather than defaulted. Defaulting would make every copied assignment a
    // driver and 422 the second one.
    expect(projectAssignment(assignment({ isDriving: true })).isDriving).toBe(true);
    expect(projectAssignment(assignment({ isDriving: false })).isDriving).toBe(false);
  });

  it('carries a zero lag as a zero, not as an absence', () => {
    // 0 is the overwhelmingly common value and the DTO's default, so omitting it would be
    // indistinguishable — until the default ever changes, at which point every copy silently moves.
    expect(projectAssignment(assignment({ lagMinutes: 0 })).lagMinutes).toBe(0);
  });
});
