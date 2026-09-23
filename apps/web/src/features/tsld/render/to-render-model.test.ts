import type { ActivitySummary, DependencySummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { toRenderActivities, toRenderEdges } from './to-render-model';

function activity(overrides: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    drivingResourceCalendarId: null,
    id: 'a1',
    planId: 'p1',
    code: null,
    name: 'Excavate',
    description: null,
    type: 'TASK',
    durationDays: 3,
    durationMinutes: 1440,
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
    remainingDurationMinutes: null,
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
    externalDriven: false,
    loeNoSpan: false,
    resourceDriverMissing: false,
    externalEarlyStart: null,
    externalLateFinish: null,
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    parentId: null,
    visualStart: null,
    visualEffectiveStart: null,
    visualEffectiveFinish: null,
    visualConflict: false,
    visualConflictReason: null,
    visualDriftDays: null,
    remainingFloat: null,
    levelingPriority: null,
    leveledStart: null,
    leveledFinish: null,
    levelingDelayDays: null,
    levelingWindowExceeded: false,
    selfOverAllocated: false,
    percentCompleteType: 'DURATION',
    accrualType: 'UNIFORM',
    physicalPercentComplete: null,
    budgetedExpense: null,
    actualExpense: null,
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
      visualConflictReason: null,
      visualDriftDays: null,
    });
  });

  it('carries the conflict REASON across the seam, on the same gate as the boolean', () => {
    /**
     * The painter needs the reason to decide which EDGE it marks (`LATER_THAN_BOUND` is a breach of
     * the placed finish), and it had only the boolean until the M-J gate pass — so both reasons drew
     * their triangle at the start. A render model that carried one without the other would force
     * that guess back on the painter, which is why the seam is asserted here rather than only in
     * `paint.test.ts`: neither suite crosses the other's defect.
     *
     * The gate is the boolean's own, for the boolean's own reason: on the Late overlay the bar is
     * not drawn where it was placed, so a conflict cue about that placement would name a breach the
     * picture is not showing.
     */
    const conflicted = activity({
      visualStart: '2026-01-09',
      visualEffectiveStart: '2026-01-09',
      visualEffectiveFinish: '2026-01-11',
      visualConflict: true,
      visualConflictReason: 'LATER_THAN_BOUND',
    });
    expect(toRenderActivities([conflicted], 'visual')[0]?.visualConflictReason).toBe(
      'LATER_THAN_BOUND',
    );
    expect(toRenderActivities([conflicted], 'late')[0]?.visualConflictReason).toBeNull();
    expect(toRenderActivities([conflicted], 'early')[0]?.visualConflictReason).toBeNull();
  });

  /**
   * **The window's right edge, and the half of `docs/TECH_DEBT.md` #348 that lives HERE.**
   *
   * `feasible-window.test.ts` asserts what the geometry does with the number it is handed; this
   * asserts which number it is handed, and they are different defects. The mutation sweep found
   * that out the useful way round: swapping this projection back to `totalFloat` — the shipped
   * defect, verbatim — passed every geometry and painter case, because neither crosses this seam.
   */
  describe("the window's datum is the basis the bar is drawn on", () => {
    const placed = () =>
      activity({
        visualStart: '2026-01-09',
        visualEffectiveStart: '2026-01-09',
        visualEffectiveFinish: '2026-01-11',
        totalFloat: 10,
        visualDriftDays: 8,
        remainingFloat: 2,
      });

    it('uses remainingFloat on the placed basis — never totalFloat', () => {
      // From a PLACED finish the room left is `T − d`. Using `totalFloat` here overshoots the late
      // finish by exactly the drift, which is #348 on every Visual plan with a placement.
      expect(toRenderActivities([placed()], 'visual')[0]?.remainingFloat).toBe(2);
    });

    it('uses totalFloat on the early basis, which is not the same number', () => {
      // The mirror, and it is a correctness case rather than symmetry for its own sake: a plan
      // switched back to Early mode while still holding placements — which the product permits —
      // draws its bars at the EARLY dates, where the room left IS the whole total float. Handing
      // it `remainingFloat` there would draw a window short by the drift.
      expect(toRenderActivities([placed()], 'early')[0]?.remainingFloat).toBe(10);
    });

    it('carries a null through rather than substituting a number for it', () => {
      // Null means the plan has never been calculated, and the window's answer to that is to draw
      // nothing. A `?? 0` here would bracket every bar on an uncalculated plan at zero width.
      const uncalculated = activity({ totalFloat: null, remainingFloat: null });
      expect(toRenderActivities([uncalculated], 'visual')[0]?.remainingFloat).toBeNull();
      expect(toRenderActivities([uncalculated], 'early')[0]?.remainingFloat).toBeNull();
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

  it('pre-builds the name row (code + name, no duration) and carries the duration beside it', () => {
    // The duration left the name at NetPoint-layout M1 for the centre item under the bar; it is
    // carried as the working-day figure, never re-derived from the drawn span.
    const [row] = toRenderActivities([
      activity({ code: 'A1020', name: 'Erect steel', durationDays: 5 }),
    ]);
    expect(row!.label).toBe('A1020 Erect steel');
    expect(row!.durationDays).toBe(5);
  });

  it('threads percentComplete through — the in-bar progress fill (ADR-0052 M4) reads the same value the row reports', () => {
    expect(toRenderActivities([activity({ percentComplete: 40 })])[0]!.percentComplete).toBe(40);
    expect(toRenderActivities([activity()])[0]!.percentComplete).toBe(0);
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
  it('maps ids, type, the driving flag, and the lag + its calendar (ADR-0052 anchor inputs)', () => {
    const dep = {
      id: 'd1',
      planId: 'p1',
      predecessor: { id: 'a1', code: null, name: 'A' },
      successor: { id: 'a2', code: null, name: 'B' },
      type: 'SS',
      lagDays: 3,
      lagMinutes: 1440,
      lagCalendar: 'TWENTY_FOUR_HOUR',
      isDriving: true,
      version: 1,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    } as DependencySummary;
    expect(toRenderEdges([dep])[0]).toEqual({
      // The dependency id rides along for the lag-anchor grab zone (ADR-0052 M3).
      id: 'd1',
      predecessorId: 'a1',
      successorId: 'a2',
      type: 'SS',
      isDriving: true,
      lagDays: 3,
      lagCalendar: 'TWENTY_FOUR_HOUR',
    });
  });
});
