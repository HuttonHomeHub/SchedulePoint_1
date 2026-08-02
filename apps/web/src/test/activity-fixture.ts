import type { ActivitySummary } from '@repo/types';

/**
 * A complete, valid {@link ActivitySummary} for tests, overridable field by field.
 *
 * `ActivitySummary` has grown past fifty fields across a dozen ADRs, and hand-rolling one per spec
 * file means every new engine column breaks unrelated tests. Building from one base keeps a test
 * about the three fields it actually cares about.
 *
 * Lives under `src/test/` so it is excluded from coverage — it is scaffolding, not shipped code.
 */
export function anActivity(overrides: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    id: 'a1',
    planId: 'p1',
    code: 'A100',
    name: 'Excavate',
    description: null,
    type: 'TASK',
    durationDays: 5,
    durationMinutes: 2400,
    constraintType: null,
    constraintDate: null,
    secondaryConstraintType: null,
    secondaryConstraintDate: null,
    calendarId: null,
    laneIndex: 0,
    scheduleAsLateAsPossible: false,
    expectedFinish: null,
    status: 'NOT_STARTED',
    percentComplete: 0,
    actualStart: null,
    actualFinish: null,
    remainingDurationDays: null,
    remainingDurationMinutes: null,
    suspendDate: null,
    resumeDate: null,
    earlyStart: '2026-02-02',
    earlyFinish: '2026-02-06',
    lateStart: null,
    lateFinish: null,
    totalFloat: null,
    freeFloat: null,
    isCritical: false,
    isNearCritical: false,
    constraintViolated: false,
    externalDriven: false,
    loeNoSpan: false,
    resourceDriverMissing: false,
    externalEarlyStart: null,
    externalLateFinish: null,
    durationType: 'FIXED_UNITS',
    parentId: null,
    visualStart: null,
    visualEffectiveStart: null,
    visualEffectiveFinish: null,
    visualConflict: false,
    visualDriftDays: null,
    levelingPriority: null,
    leveledStart: null,
    leveledFinish: null,
    levelingDelayDays: null,
    levelingWindowExceeded: false,
    selfOverAllocated: false,
    percentCompleteType: 'DURATION',
    accrualType: 'START',
    physicalPercentComplete: null,
    budgetedExpense: null,
    actualExpense: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}
