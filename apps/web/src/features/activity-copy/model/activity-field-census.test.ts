import type { ActivitySummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { CLONE_FIELD_DECISIONS, projectClone, type ClonePlacement } from './clone-projection';

/**
 * **The field census.** The headline risk of this epic is silent: a copy that quietly drops a
 * definition field looks correct on every screen, and the planner discovers it weeks later when the
 * clone schedules differently from the thing it was copied from.
 *
 * The gate is the **type**, not this file: `CLONE_FIELD_DECISIONS` is declared
 * `Record<keyof ActivitySummary, …>`, so a field added to `ActivitySummary` is a **compile error**
 * until somebody classifies it. Verified by adding a fake key to the type's shape and watching
 * `tsc` fail before this test was trusted — a census asserted against a hand-listed array would
 * have protected nothing.
 *
 * What the runtime assertions here add is the part the compiler cannot see: that every decision
 * carries a reason, and that the projection actually sends what the census says it sends.
 */
const PLACEMENT: ClonePlacement = {
  laneIndex: 7,
  parentId: null,
  offsetDays: 0,
  mode: 'EARLY',
  anchorDate: null,
};

function source(): ActivitySummary {
  return {
    id: 'a',
    planId: 'p1',
    code: 'A1010',
    name: 'Excavate',
    description: 'Dig it',
    type: 'TASK',
    durationDays: 3,
    durationMinutes: 1440,
    constraintType: null,
    constraintDate: null,
    secondaryConstraintType: null,
    secondaryConstraintDate: null,
    calendarId: 'cal-1',
    laneIndex: 0,
    scheduleAsLateAsPossible: false,
    expectedFinish: '2026-02-02',
    status: 'IN_PROGRESS',
    percentComplete: 60,
    actualStart: '2026-01-02',
    actualFinish: null,
    remainingDurationDays: 1,
    remainingDurationMinutes: 480,
    suspendDate: '2026-01-05',
    resumeDate: '2026-01-06',
    earlyStart: '2026-01-01',
    earlyFinish: '2026-01-03',
    lateStart: '2026-01-04',
    lateFinish: '2026-01-06',
    totalFloat: 3,
    freeFloat: 1,
    isCritical: true,
    isNearCritical: true,
    constraintViolated: true,
    externalDriven: true,
    loeNoSpan: true,
    resourceDriverMissing: true,
    externalEarlyStart: '2026-01-01T08:00:00Z',
    externalLateFinish: '2026-03-01T17:00:00Z',
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    parentId: 'band-1',
    visualStart: '2026-01-09',
    visualEffectiveStart: '2026-01-09',
    visualEffectiveFinish: '2026-01-11',
    visualConflict: true,
    visualDriftDays: 2,
    levelingPriority: 4,
    leveledStart: '2026-01-12',
    leveledFinish: '2026-01-14',
    levelingDelayDays: 1,
    levelingWindowExceeded: true,
    selfOverAllocated: true,
    percentCompleteType: 'PHYSICAL',
    accrualType: 'END',
    physicalPercentComplete: 40,
    budgetedExpense: 250_000,
    actualExpense: 100_000,
    version: 9,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  };
}

describe('the clone field census', () => {
  it('classifies every field exactly once, with a reason', () => {
    const entries = Object.entries(CLONE_FIELD_DECISIONS);
    // Exactly once is structural — an object literal cannot hold a duplicate key — so what is
    // asserted here is that nothing was classified with an empty reason to get past the compiler.
    for (const [field, decision] of entries) {
      expect(decision.reason.length, `${field} has no reason`).toBeGreaterThan(20);
      expect(['carried', 'transformed', 'withheld']).toContain(decision.disposition);
    }
    // A tripwire on the count itself: the number is not meaningful, but a sudden change means
    // ActivitySummary moved and the reader should look at why.
    expect(entries.length).toBe(59);
  });

  it('sends nothing the census withholds', () => {
    const body = projectClone(source(), {
      name: 'Excavate (copy)',
      placement: PLACEMENT,
    }) as unknown as Record<string, unknown>;
    const withheld = Object.entries(CLONE_FIELD_DECISIONS)
      .filter(([, d]) => d.disposition === 'withheld')
      .map(([field]) => field);
    for (const field of withheld) {
      expect(Object.hasOwn(body, field), `${field} is withheld but was sent`).toBe(false);
    }
  });

  it('withholds every progress and actual field from a source that has them all', () => {
    const body = projectClone(source(), {
      name: 'x',
      placement: PLACEMENT,
    }) as unknown as Record<string, unknown>;
    // Named individually rather than derived, because this is the acceptance criterion a reader
    // came here for: a copy never claims work that did not happen.
    for (const field of [
      'percentComplete',
      'status',
      'actualStart',
      'actualFinish',
      'remainingDurationMinutes',
      'suspendDate',
      'resumeDate',
      'physicalPercentComplete',
      'actualExpense',
      'expectedFinish',
      'externalEarlyStart',
      'externalLateFinish',
      'code',
    ]) {
      expect(Object.hasOwn(body, field), `${field} leaked into the create body`).toBe(false);
    }
  });

  it('carries the definition, in minutes', () => {
    const body = projectClone(source(), { name: 'Excavate (copy)', placement: PLACEMENT });
    expect(body).toMatchObject({
      name: 'Excavate (copy)',
      description: 'Dig it',
      type: 'TASK',
      durationMinutes: 1440,
      durationType: 'FIXED_DURATION_AND_UNITS_TIME',
      percentCompleteType: 'PHYSICAL',
      accrualType: 'END',
      calendarId: 'cal-1',
      levelingPriority: 4,
      budgetedExpense: 250_000,
      laneIndex: 7,
    });
    // durationDays is deliberately absent: it is derived, and sending both lets a rounded value
    // win over the exact one (ADR-0068/ADR-0070).
    expect(Object.hasOwn(body, 'durationDays')).toBe(false);
  });
});

/**
 * The structural claim that makes carrying `budgetedExpense` safe lives where the fact lives —
 * `apps/api/src/common/auth/cost-copy-parity.structural.spec.ts`. The web holds no copy of the role
 * bundles, and asserting a duplicate here would pin the duplicate rather than the permission set:
 * a non-cost-reader receives `budgetedExpense: null`, indistinguishable from "this activity has no
 * budget", so the day the two permissions diverge a copy made by such a caller would silently strip
 * the budget.
 */
