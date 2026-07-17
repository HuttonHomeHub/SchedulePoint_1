import type { ActivitySummary, DependencySummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { toRenderActivities, toRenderEdges } from './to-render-model';

function activity(overrides: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    id: 'a1',
    planId: 'p1',
    code: null,
    name: 'Excavate',
    description: null,
    type: 'TASK',
    durationDays: 3,
    constraintType: null,
    constraintDate: null,
    secondaryConstraintType: null,
    secondaryConstraintDate: null,
    calendarId: null,
    laneIndex: 2,
    scheduleAsLateAsPossible: false,
    expectedFinish: null,
    status: 'NOT_STARTED',
    percentComplete: 0,
    actualStart: null,
    actualFinish: null,
    remainingDurationDays: null,
    suspendDate: null,
    resumeDate: null,
    earlyStart: '2026-01-01',
    earlyFinish: '2026-01-03',
    lateStart: '2026-01-01',
    lateFinish: '2026-01-03',
    totalFloat: 0,
    freeFloat: null,
    isCritical: true,
    isNearCritical: false,
    constraintViolated: false,
    loeNoSpan: false,
    resourceDriverMissing: false,
    parentId: null,
    visualStart: null,
    visualEffectiveStart: null,
    visualEffectiveFinish: null,
    visualConflict: false,
    visualDriftDays: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('toRenderActivities', () => {
  it('copies the geometry + criticality fields the render model needs', () => {
    expect(toRenderActivities([activity()])[0]).toMatchObject({
      id: 'a1',
      type: 'TASK',
      laneIndex: 2,
      earlyStart: '2026-01-01',
      earlyFinish: '2026-01-03',
      isCritical: true,
      isNearCritical: false,
      // The render model carries only the engine-owned conflict cue, not the source dates.
      visualConflict: false,
      visualDriftDays: null,
    });
  });

  it('flags both bars of a same-lane time overlap, and neither when they clear each other', () => {
    const overlapping = toRenderActivities([
      activity({ id: 'a', laneIndex: 0, earlyStart: '2026-01-01', earlyFinish: '2026-01-10' }),
      activity({ id: 'b', laneIndex: 0, earlyStart: '2026-01-05', earlyFinish: '2026-01-15' }),
    ]);
    expect(overlapping.map((r) => r.laneOverlap)).toEqual([true, true]);

    const clear = toRenderActivities([
      activity({ id: 'a', laneIndex: 0, earlyStart: '2026-01-01', earlyFinish: '2026-01-10' }),
      activity({ id: 'b', laneIndex: 1, earlyStart: '2026-01-05', earlyFinish: '2026-01-15' }),
    ]);
    expect(clear.map((r) => r.laneOverlap)).toEqual([false, false]);
  });

  it('pre-builds the on-canvas label (code + name + duration) at the seam', () => {
    expect(
      toRenderActivities([activity({ code: 'A1020', name: 'Erect steel', durationDays: 5 })])[0]!
        .label,
    ).toBe('A1020 Erect steel · 5d');
  });

  it('derives the constraint anchor from the kind — only when type AND date are both present', () => {
    // Start-anchored kind → 'start'.
    expect(
      toRenderActivities([activity({ constraintType: 'SNET', constraintDate: '2026-02-01' })])[0]!
        .constraint,
    ).toBe('start');
    // Finish-anchored kind → 'finish'.
    expect(
      toRenderActivities([activity({ constraintType: 'FNLT', constraintDate: '2026-02-01' })])[0]!
        .constraint,
    ).toBe('finish');
    // A parked kind still resolves to its edge (it's shown honestly, and still pins).
    expect(
      toRenderActivities([
        activity({ constraintType: 'MANDATORY_FINISH', constraintDate: '2026-02-01' }),
      ])[0]!.constraint,
    ).toBe('finish');
    // The paired-null rule: a type with no date (or vice versa) is not an active constraint.
    expect(toRenderActivities([activity()])[0]!.constraint).toBeNull();
    expect(
      toRenderActivities([activity({ constraintType: 'SNET', constraintDate: null })])[0]!
        .constraint,
    ).toBeNull();
    expect(
      toRenderActivities([activity({ constraintType: null, constraintDate: '2026-02-01' })])[0]!
        .constraint,
    ).toBeNull();
  });
});

describe('toRenderEdges', () => {
  it('maps predecessor/successor ids, type and the driving flag', () => {
    const dep = {
      id: 'd1',
      planId: 'p1',
      predecessor: { id: 'a1', code: null, name: 'A' },
      successor: { id: 'a2', code: null, name: 'B' },
      type: 'SS',
      lagDays: 0,
      isDriving: true,
      version: 1,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    } as DependencySummary;
    expect(toRenderEdges([dep])[0]).toEqual({
      predecessorId: 'a1',
      successorId: 'a2',
      type: 'SS',
      isDriving: true,
    });
  });
});
