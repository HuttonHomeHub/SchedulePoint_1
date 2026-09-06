import { describe, expect, it } from 'vitest';

import { buildRevisionGhosts } from './revision-ghosts';
import type { RevisionRow } from './revision-delta';

/**
 * The builder is a pure function over two arrays, so every branch is reachable from a literal.
 *
 * Its load-bearing cases are the two REFUSALS: an unchanged bar contributes nothing (the overlay
 * paints the difference, not the plan), and an activity whose old lane was never recorded is
 * COUNTED rather than drawn somewhere plausible — a guessed position is a false statement about
 * where the work was, and a diagram has no "showing N of M" in which to notice a missing row.
 */
const row = (o: Partial<RevisionRow> & { activityId: string }): RevisionRow => ({
  code: null,
  name: o.activityId,
  type: 'TASK',
  durationMinutes: 480,
  isCritical: false,
  totalFloatDays: 0,
  earlyStart: '2026-01-05',
  earlyFinish: '2026-01-09',
  laneIndex: 0,
  parentId: null,
  calendarId: null,
  constraintType: null,
  constraintDate: null,
  secondaryConstraintType: null,
  secondaryConstraintDate: null,
  percentComplete: 0,
  actualStart: null,
  actualFinish: null,
  ...o,
});

describe('the revision ghost builder', () => {
  it('draws NOTHING for an unchanged bar', () => {
    // The whole point of CQ-2. A ghost behind every bar is a picture of the plan, not of what
    // happened to it — and an outline under its own live bar is invisible and paid for per frame.
    const a = [row({ activityId: 'a' })];
    expect(buildRevisionGhosts(a, [row({ activityId: 'a' })]).ghosts).toEqual([]);
  });

  it('draws a bar that moved in TIME, and one that moved only in LANE', () => {
    const moved = buildRevisionGhosts(
      [row({ activityId: 't' }), row({ activityId: 'l', laneIndex: 2 })],
      [
        row({ activityId: 't', earlyStart: '2026-02-05', earlyFinish: '2026-02-09' }),
        row({ activityId: 'l', laneIndex: 7 }),
      ],
    );
    expect(moved.ghosts.map((g) => g.activityId).sort()).toEqual(['l', 't']);
    // The ghost carries the OLD lane, which is where the bar was.
    expect(moved.ghosts.find((g) => g.activityId === 'l')?.laneIndex).toBe(2);
  });

  it('marks removed work as removed, and draws it in its frozen lane', () => {
    const { ghosts } = buildRevisionGhosts([row({ activityId: 'gone', laneIndex: 5 })], []);
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0]?.removed).toBe(true);
    // Not a guess and not a reserved band: the lane is recorded (ADR-0126), so it is where it was.
    expect(ghosts[0]?.laneIndex).toBe(5);
  });

  it('does NOT ghost an activity that is only in the NEW side', () => {
    // Added work has no old geometry. There is nothing behind it, which is the honest picture.
    expect(buildRevisionGhosts([], [row({ activityId: 'new' })]).ghosts).toEqual([]);
  });

  it('COUNTS a moved activity whose old lane was never recorded, and draws nothing', () => {
    // A pre-ADR-0126 baseline. Drawing it in lane 0 would say the work was in the top row.
    const result = buildRevisionGhosts(
      [row({ activityId: 'a', laneIndex: null })],
      [row({ activityId: 'a', earlyStart: '2026-03-05' })],
    );
    expect(result.ghosts).toEqual([]);
    expect(result.undrawable).toBe(1);
  });

  it('does NOT count an unscheduled old side as undrawable', () => {
    // Nothing was lost by a missing column — the plan was never calculated, which the completion
    // half already reports. Counting it would attribute an absent capture to an absent schedule.
    const result = buildRevisionGhosts(
      [row({ activityId: 'a', earlyStart: null, earlyFinish: null })],
      [row({ activityId: 'a' })],
    );
    expect(result.ghosts).toEqual([]);
    expect(result.undrawable).toBe(0);
  });

  it('excludes a WBS summary, whose dates are a rollup nobody moved', () => {
    const result = buildRevisionGhosts(
      [row({ activityId: 'phase', type: 'WBS_SUMMARY' })],
      [row({ activityId: 'phase', type: 'WBS_SUMMARY', earlyStart: '2026-05-05' })],
    );
    expect(result.ghosts).toEqual([]);
  });

  it('draws both milestone types as milestones', () => {
    for (const type of ['START_MILESTONE', 'FINISH_MILESTONE'] as const) {
      const { ghosts } = buildRevisionGhosts([row({ activityId: 'm', type })], []);
      expect(ghosts[0]?.isMilestone).toBe(true);
    }
    expect(buildRevisionGhosts([row({ activityId: 't' })], []).ghosts[0]?.isMilestone).toBe(false);
  });
});
