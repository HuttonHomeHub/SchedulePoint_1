import type { DependencyType } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { planLevellingApplication, type LevellingApplicationInput } from './apply-levelling';
import { computeSchedule } from './compute';
import { levelSchedule } from './level';
import type {
  EngineActivity,
  EngineAssignment,
  EngineEdge,
  EngineResource,
  EngineResult,
} from './types';
import {
  allMinutesWorkCalendar,
  buildWorkingTimeCalendar,
  type WorkingTimeCalendar,
} from './working-time-calendar';

/**
 * **`docs/specs/apply-levelled-dates/`: the proving cases for `planLevellingApplication`** (spec §2).
 *
 * P1-P7 were written red in M0, as `it.fails` against a stub that threw, and M1 flipped them to plain
 * `it` by replacing the stub with the real import; none of their assertions changed. P8 was added in
 * M1 for the one thing M0 found that they do not cover: a target that would be a non-working date.
 *
 * **A case that is red only because the function is missing proves nothing** (ADR-0110). Each case
 * therefore asserts the behaviour FIRST (what the plan looks like after the rows are written, solved
 * by the engine itself) and the rows second, and is paired with a plain `it` precondition that shows
 * the fixture tells the right answer from the wrong one. `m0-measurement.md` records each case run
 * against the deliberately wrong implementation it names, and the assertion that failed.
 *
 * The rows carry no `version`, `constraintType` or `constraintDate`: those come from the stored
 * activity, which is the service's to attach (spec §4.6 step 7), and the engine never sees a version.
 *
 * The data date is Monday 2026-01-05 throughout. Cases on the 24/7 calendar use one day = 1440
 * minutes; the working-week calendar is Monday-Friday 08:00-16:00, one day = 480.
 */
const DATA_DATE = '2026-01-05';

const DAY = 1440;
const WEEK_DAY = 480;
const CAL24 = allMinutesWorkCalendar;
const workWeek = (startMinute: number, endMinute: number): WorkingTimeCalendar =>
  buildWorkingTimeCalendar(
    Array.from({ length: 7 }, (_, d) => (d < 5 ? [{ startMinute, endMinute }] : [])),
    [],
  );
const CAL_0800_1600 = workWeek(480, 960);
const CAL_1000_1800 = workWeek(600, 1080);

const task = (
  id: string,
  durationMinutes: number,
  overrides: Partial<EngineActivity> = {},
): EngineActivity => ({ id, durationMinutes, type: 'TASK', ...overrides });

const fs = (predecessorId: string, successorId: string): EngineEdge => ({
  id: `${predecessorId}-${successorId}`,
  predecessorId,
  successorId,
  type: 'FS' satisfies DependencyType,
  lagMinutes: 0,
});

const on = (activityId: string, resourceId: string): EngineAssignment => ({
  activityId,
  resourceId,
  unitsPerHour: 1,
});

const CRANE: EngineResource = { id: 'CRANE', capacity: 1 };
const PUMP: EngineResource = { id: 'PUMP', capacity: 1 };

interface Scenario {
  activities: EngineActivity[];
  edges: EngineEdge[];
  assignments: EngineAssignment[];
  resources: EngineResource[];
  calendar: WorkingTimeCalendar;
}

/** The plan as a recalculation leaves it: network pass, then levelling from where bars are drawn. */
function solve(s: Scenario, activities: readonly EngineActivity[] = s.activities) {
  const output = computeSchedule(activities, s.edges, {
    dataDate: DATA_DATE,
    calendar: s.calendar,
  });
  const leveled = levelSchedule(activities, output, s.assignments, s.resources, {
    levelWithinFloatOnly: false,
    dataDate: DATA_DATE,
    planCalendar: s.calendar,
    anchor: 'PLACED',
  });
  return {
    leveled,
    byId: new Map<string, EngineResult>(leveled.results.map((r) => [r.activityId, r])),
  };
}

const input = (s: Scenario): LevellingApplicationInput => ({
  activities: s.activities,
  edges: s.edges,
  assignments: s.assignments,
  resources: s.resources,
  options: { dataDate: DATA_DATE, planCalendar: s.calendar, levelWithinFloatOnly: false },
});

/** The scenario with `rows` written as placements: what pressing Apply and recalculating leaves. */
function settle(s: Scenario, rows: readonly { activityId: string; visualStart: string }[]) {
  const target = new Map(rows.map((r) => [r.activityId, r.visualStart]));
  return solve(
    s,
    s.activities.map((a) =>
      target.has(a.id) ? { ...a, visualStart: target.get(a.id) ?? null } : a,
    ),
  );
}

const conflictsOf = (byId: ReadonlyMap<string, EngineResult>): string[] =>
  [...byId.values()]
    .filter((r) => r.visualConflictReason === 'EARLIER_THAN_LOGIC')
    .map((r) => r.activityId)
    .sort();

const delayedIdsOf = (byId: ReadonlyMap<string, EngineResult>): string[] =>
  [...byId.values()]
    .filter((r) => (r.levelingDelay ?? 0) > 0)
    .map((r) => r.activityId)
    .sort();

// ── P1: whole days ─────────────────────────────────────────────────────────────────────────────────

/** Two 3-day lifts on one crane, no logic. B waits for A: Mon-Wed, then Thu. */
const p1: Scenario = {
  activities: [
    task('A', 3 * WEEK_DAY, { levelingPriority: 1 }),
    task('B', 3 * WEEK_DAY, { levelingPriority: 2 }),
  ],
  edges: [],
  assignments: [on('A', 'CRANE'), on('B', 'CRANE')],
  resources: [CRANE],
  calendar: CAL_0800_1600,
};

describe('planLevellingApplication — P1: whole days', () => {
  it('precondition: B is levelled to Thursday 8 January, a day start, and only B is delayed', () => {
    const { byId } = solve(p1);
    expect(byId.get('B')!.leveledStart).toBe('2026-01-08');
    expect(byId.get('B')!.levelingDelay).toBe(3 * WEEK_DAY);
    expect(delayedIdsOf(byId)).toEqual(['B']);
  });

  it('writes the levelled date for the delayed lift and nothing else', () => {
    const plan = planLevellingApplication(input(p1));
    expect(plan.rows).toEqual([{ activityId: 'B', visualStart: '2026-01-08' }]);
    expect(plan.roundedToNextDay).toEqual([]);
    expect(plan.remainingAfterApply).toBe(0);
  });
});

// ── P2: a part-day levelled start (SC-2) ───────────────────────────────────────────────────────────

/** A 4-hour lift then a 1-day lift on one crane: the second is freed at 12:00 on Monday. */
const p2: Scenario = {
  activities: [
    task('X', WEEK_DAY / 2, { levelingPriority: 1 }),
    task('Y', WEEK_DAY, { levelingPriority: 2 }),
  ],
  edges: [],
  assignments: [on('X', 'CRANE'), on('Y', 'CRANE')],
  resources: [CRANE],
  calendar: CAL_0800_1600,
};

describe('planLevellingApplication — P2: the resource frees part-way through a day', () => {
  // The fixture's whole point: the ghost's DATE is Monday, but Monday's placement is 08:00, four hours
  // before the crane is free. Copying the date puts the clash back; only Tuesday clears it.
  it('precondition: Y is levelled to 12:00 Monday; its ghost date leaves the clash, Tuesday clears it', () => {
    const { byId } = solve(p2);
    const y = byId.get('Y')!;
    expect(y.leveledStart).toBe('2026-01-05');
    expect(y.leveledStartOffset).toBe(WEEK_DAY / 2);
    expect(y.levelingDelay).toBe(WEEK_DAY / 2);
    expect(
      settle(p2, [{ activityId: 'Y', visualStart: '2026-01-05' }]).byId.get('Y')!.levelingDelay,
    ).toBe(WEEK_DAY / 2);
    expect(
      settle(p2, [{ activityId: 'Y', visualStart: '2026-01-06' }]).byId.get('Y')!.levelingDelay,
    ).toBe(0);
  });

  it('rounds Y forward to Tuesday, leaving no clash', () => {
    const plan = planLevellingApplication(input(p2));
    // Behaviour first: the engine, run on the rows, finds nothing left to level.
    expect(delayedIdsOf(settle(p2, plan.rows).byId)).toEqual([]);
    expect(plan.rows).toEqual([{ activityId: 'Y', visualStart: '2026-01-06' }]);
    expect(plan.roundedToNextDay).toEqual(['Y']);
    expect(plan.remainingAfterApply).toBe(0);
  });
});

// ── P3 and P4: a follower levelling delayed less than its predecessor (SC-3) ───────────────────────

/**
 * Q (crane, 3 days, first) holds the crane, so P (crane, 3 days, FS to S) is pushed three days. S is on
 * the pump behind R (4 days), so it is pushed one day only. Levelling reads no links (A5), so S's ghost
 * (Thursday) starts before P's levelled finish (Sunday 11 January).
 */
const followerBase = (s: EngineActivity): Scenario => ({
  activities: [
    task('Q', 3 * DAY, { levelingPriority: 1 }),
    task('P', 3 * DAY, { levelingPriority: 2 }),
    task('R', 4 * DAY, { levelingPriority: 1 }),
    s,
  ],
  edges: [fs('P', 'S')],
  assignments: [on('Q', 'CRANE'), on('P', 'CRANE'), on('R', 'PUMP'), on('S', 'PUMP')],
  resources: [CRANE, PUMP],
  calendar: CAL24,
});
const p3 = followerBase(task('S', 2 * DAY, { levelingPriority: 2 }));
const p4 = followerBase(task('S', 2 * DAY, { levelingPriority: 2, visualStart: '2026-01-08' }));

describe('planLevellingApplication — P3: an unplaced follower levelled less than its predecessor', () => {
  it('precondition: S starts before P finishes in the overlay, and writing every ghost is a conflict', () => {
    const { byId } = solve(p3);
    expect(byId.get('P')!.leveledStartOffset).toBe(3 * DAY);
    expect(byId.get('P')!.leveledFinishOffset).toBe(6 * DAY);
    expect(byId.get('S')!.leveledStartOffset).toBe(4 * DAY);
    expect(byId.get('S')!.leveledStart).not.toBe(byId.get('S')!.visualEffectiveStart);
    const everyGhost = [
      { activityId: 'P', visualStart: byId.get('P')!.leveledStart! },
      { activityId: 'S', visualStart: byId.get('S')!.leveledStart! },
    ];
    expect(conflictsOf(settle(p3, everyGhost).byId)).toEqual(['S']);
    expect(conflictsOf(settle(p3, [everyGhost[0]!]).byId)).toEqual([]);
  });

  it('writes P only, drops S to logic, and plants no earlier-than-logic conflict', () => {
    const plan = planLevellingApplication(input(p3));
    expect(conflictsOf(settle(p3, plan.rows).byId)).toEqual([]);
    expect(plan.rows).toEqual([{ activityId: 'P', visualStart: '2026-01-08' }]);
    expect(plan.leftToLogic).toEqual(['S']);
    expect(plan.conflictingPlaced).toEqual([]);
    expect(plan.remainingAfterApply).toBe(0);
  });
});

describe('planLevellingApplication — P4: a hand-placed follower', () => {
  it('precondition: S is hand-placed on 8 January and its ghost is a day later', () => {
    const { byId } = solve(p4);
    expect(byId.get('S')!.visualEffectiveStart).toBe('2026-01-08');
    expect(byId.get('S')!.leveledStart).toBe('2026-01-09');
  });

  it('keeps S where it was placed and names it as now conflicting', () => {
    const plan = planLevellingApplication(input(p4));
    expect(plan.rows).toEqual([{ activityId: 'P', visualStart: '2026-01-08' }]);
    expect(plan.conflictingPlaced).toEqual(['S']);
    expect(plan.leftToLogic).toEqual([]);
    // S keeps its own placement, which P's move has now made earlier than logic allows: the dialog
    // names it, and it is the one conflict the apply is allowed to leave (US-3).
    expect(conflictsOf(settle(p4, plan.rows).byId)).toEqual(['S']);
  });
});

// ── P5: a participant levelling did not move ───────────────────────────────────────────────────────

/** A and B clash on the crane (B is delayed); C uses a pump nobody else wants, so it takes part and moves 0. */
const p5: Scenario = {
  activities: [
    task('A', 3 * WEEK_DAY, { levelingPriority: 1 }),
    task('B', 3 * WEEK_DAY, { levelingPriority: 2 }),
    task('C', 2 * WEEK_DAY),
  ],
  edges: [],
  assignments: [on('A', 'CRANE'), on('B', 'CRANE'), on('C', 'PUMP')],
  resources: [CRANE, PUMP],
  calendar: CAL_0800_1600,
};

describe('planLevellingApplication — P5: a participant levelling did not move', () => {
  it('precondition: A, B and C all take part in levelling, and only B is delayed', () => {
    const { byId } = solve(p5);
    expect(['A', 'B', 'C'].every((id) => byId.get(id)!.leveledStart !== null)).toBe(true);
    expect(delayedIdsOf(byId)).toEqual(['B']);
  });

  it('writes B only: writing A or C would turn an unplaced bar into a placed one', () => {
    const plan = planLevellingApplication(input(p5));
    expect(plan.rows.map((r) => r.activityId)).toEqual(['B']);
  });
});

// ── P6: an activity on its own calendar ────────────────────────────────────────────────────────────

/**
 * The plan works 08:00-16:00; Y's own calendar works 10:00-18:00. X holds the crane for 600 working
 * minutes of the plan's calendar (all of Monday and until 10:00 on Tuesday), so Y is freed at exactly
 * 10:00 on Tuesday, which is the first working minute of Y's Tuesday. Tuesday is the answer; rounding
 * on the plan's calendar (first minute 08:00, which is before 10:00) says Wednesday, a day late.
 *
 * The spec's own example was a calendar starting at 06:00 against the plan's 08:00. M0 searched 76
 * fixtures of that kind for one where reconstructing the instant from `leveledStartOffset` on the plan
 * calendar gives a different date from the engine's own answer, and found none (m0-measurement.md),
 * so this case discriminates the other way round: rounding on the wrong calendar.
 */
const p6: Scenario = {
  activities: [
    task('X', 600, { levelingPriority: 1 }),
    task('Y', WEEK_DAY, { levelingPriority: 2, calendar: CAL_1000_1800 }),
  ],
  edges: [],
  assignments: [on('X', 'CRANE'), on('Y', 'CRANE')],
  resources: [CRANE],
  calendar: CAL_0800_1600,
};

describe('planLevellingApplication — P6: an activity on its own calendar', () => {
  it('precondition: Tuesday is the earliest date that clears the clash; Monday does not, Wednesday is late', () => {
    const delayOn = (date: string) =>
      settle(p6, [{ activityId: 'Y', visualStart: date }]).byId.get('Y')!.levelingDelay;
    expect(solve(p6).byId.get('Y')!.leveledStart).toBe('2026-01-06');
    expect(delayOn('2026-01-05')).toBeGreaterThan(0);
    expect(delayOn('2026-01-06')).toBe(0);
    expect(delayOn('2026-01-07')).toBe(0);
  });

  it('lands Y on Tuesday, derived on its own calendar, not a day later', () => {
    const plan = planLevellingApplication(input(p6));
    expect(delayedIdsOf(settle(p6, plan.rows).byId)).toEqual([]);
    expect(plan.rows).toEqual([{ activityId: 'Y', visualStart: '2026-01-06' }]);
    expect(plan.roundedToNextDay).toEqual([]);
  });
});

// ── P7: idempotence ────────────────────────────────────────────────────────────────────────────────

describe('planLevellingApplication — P7: applying twice is applying once', () => {
  it('after P1 is applied nothing is left to level and a second preview has no rows', () => {
    const first = planLevellingApplication(input(p1));
    const settled = settle(p1, first.rows);
    expect(settled.leveled.summary.leveledActivityCount).toBe(0);
    const placed: Scenario = {
      ...p1,
      activities: p1.activities.map((a) => {
        const row = first.rows.find((r) => r.activityId === a.id);
        return row ? { ...a, visualStart: row.visualStart } : a;
      }),
    };
    expect(planLevellingApplication(input(placed)).rows).toEqual([]);
  });
});

// ── P8: a part-day start on a Friday must not be stored as the weekend ─────────────────────────────

/**
 * X holds the crane until 12:00 on Friday 9 January, so Y is freed part-way through Friday. The next
 * day start is Monday 12 January. The smallest DATE whose placement is at or after 12:00 Friday is
 * Saturday the 10th (Pass 2 draws it on Monday), which clears the clash and is not a working day.
 * The product owner asked for "the next working day": the stored date is the Monday.
 */
const p8: Scenario = {
  activities: [
    task('X', 4 * WEEK_DAY + WEEK_DAY / 2, { levelingPriority: 1 }),
    task('Y', WEEK_DAY, { levelingPriority: 2 }),
  ],
  edges: [],
  assignments: [on('X', 'CRANE'), on('Y', 'CRANE')],
  resources: [CRANE],
  calendar: CAL_0800_1600,
};

describe('planLevellingApplication — P8: the stored date is a working day', () => {
  it('precondition: Y is freed at 12:00 Friday; Saturday and Monday both clear it, Friday does not', () => {
    const delayOn = (date: string) =>
      settle(p8, [{ activityId: 'Y', visualStart: date }]).byId.get('Y')!.levelingDelay;
    const y = solve(p8).byId.get('Y')!;
    expect(y.leveledStart).toBe('2026-01-09');
    expect(y.leveledStartOffset).toBe(4 * WEEK_DAY + WEEK_DAY / 2);
    expect(delayOn('2026-01-09')).toBeGreaterThan(0);
    expect(delayOn('2026-01-10')).toBe(0);
    expect(delayOn('2026-01-12')).toBe(0);
  });

  it('stores Monday 12 January, not the Saturday that would be drawn there', () => {
    const plan = planLevellingApplication(input(p8));
    expect(delayedIdsOf(settle(p8, plan.rows).byId)).toEqual([]);
    expect(plan.rows).toEqual([{ activityId: 'Y', visualStart: '2026-01-12' }]);
    expect(plan.roundedToNextDay).toEqual(['Y']);
    expect(plan.remainingAfterApply).toBe(0);
  });
});

// ── P9 and P10: what a kept move does to the bars around it ────────────────────────────────────────

/**
 * Q holds the crane for three days, so P (FS to S) is moved to Thursday 8 January and finishes on the
 * 11th. S has no resource, so levelling never moves it and it is not a candidate; it was hand-placed
 * on the 8th, which was fine while P finished on the 8th and is earlier than logic once P moves.
 */
const p9: Scenario = {
  activities: [
    task('Q', 3 * DAY, { levelingPriority: 1 }),
    task('P', 3 * DAY, { levelingPriority: 2 }),
    task('S', 2 * DAY, { visualStart: '2026-01-08' }),
  ],
  edges: [fs('P', 'S')],
  assignments: [on('Q', 'CRANE'), on('P', 'CRANE')],
  resources: [CRANE],
  calendar: CAL24,
};

/** B moves to Thursday 8 January and finishes on the 10th, past an FNLT of the 9th it met before. */
const p10: Scenario = {
  activities: [
    task('A', 3 * DAY, { levelingPriority: 1 }),
    task('B', 3 * DAY, {
      levelingPriority: 2,
      constraintType: 'FNLT',
      constraintDate: '2026-01-09',
    }),
  ],
  edges: [],
  assignments: [on('A', 'CRANE'), on('B', 'CRANE')],
  resources: [CRANE],
  calendar: CAL24,
};

describe('planLevellingApplication — P9: a placed bar a kept move pushes past its own placement', () => {
  it('precondition: S is fine today and is earlier than logic once P is on the 8th', () => {
    expect(conflictsOf(solve(p9).byId)).toEqual([]);
    expect(conflictsOf(settle(p9, [{ activityId: 'P', visualStart: '2026-01-08' }]).byId)).toEqual([
      'S',
    ]);
  });

  it('writes P, and names S, which is not a candidate, as now conflicting', () => {
    const plan = planLevellingApplication(input(p9));
    expect(plan.rows).toEqual([{ activityId: 'P', visualStart: '2026-01-08' }]);
    expect(plan.conflictingPlaced).toEqual(['S']);
    expect(plan.leftToLogic).toEqual([]);
    expect(conflictsOf(settle(p9, plan.rows).byId)).toEqual(['S']);
  });
});

describe('planLevellingApplication — P10: a bound the move newly breaches', () => {
  it('precondition: B meets its FNLT today and breaches it on the 8th', () => {
    const reasonOf = (s: ReturnType<typeof solve>) => s.byId.get('B')!.visualConflictReason;
    expect(reasonOf(solve(p10))).toBeNull();
    expect(reasonOf(settle(p10, [{ activityId: 'B', visualStart: '2026-01-08' }]))).toBe(
      'LATER_THAN_BOUND',
    );
  });

  it('writes B, which the levelling requires, and counts the bound it introduces', () => {
    const plan = planLevellingApplication(input(p10));
    expect(plan.rows).toEqual([{ activityId: 'B', visualStart: '2026-01-08' }]);
    expect(plan.laterThanBoundIntroduced).toBe(1);
    expect(plan.leftToLogic).toEqual([]);
    expect(plan.conflictingPlaced).toEqual([]);
  });
});
