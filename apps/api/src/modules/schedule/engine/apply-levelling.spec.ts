import type { DependencyType } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { planLevellingApplication, type LevellingApplicationInput } from './apply-levelling';
import { computeSchedule, type ComputeOptions } from './compute';
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
  /** The rest of the plan's network options, as the service passes them (`options.compute`). */
  compute?: Partial<ComputeOptions>;
}

/** The plan as a recalculation leaves it: network pass, then levelling from where bars are drawn. */
function solve(s: Scenario, activities: readonly EngineActivity[] = s.activities) {
  const output = computeSchedule(activities, s.edges, {
    ...s.compute,
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
  options: {
    dataDate: DATA_DATE,
    planCalendar: s.calendar,
    levelWithinFloatOnly: false,
    ...(s.compute ? { compute: s.compute } : {}),
  },
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

// ── M1 test hardening ──────────────────────────────────────────────────────────────────────────────
// Added after a test-engineer review of M0+M1. `m0-measurement.md` ("M1 test hardening") records, for
// each case below, the wrong implementation it was run against and the assertion that failed.

// ── P11: what is left clashing once the dropped candidate is not written ───────────────────────────

/**
 * P3's chain plus a third lift on the pump. R holds the pump for four days, S (FS after P) is levelled
 * to day 4 and T to day 6. P moves to day 3 and finishes on day 6, so S's ghost is earlier than its
 * logic and is dropped. Without S's ghost S runs at day 6 on logic, takes the pump from day 6 to 8 and
 * pushes T, which was written at day 6, back again: one lift is still levelled after the apply.
 *
 * Reusing the solve that had every ghost written gets this wrong: S's written ghost is what frees T.
 */
const p11: Scenario = {
  activities: [
    task('Q', 3 * DAY, { levelingPriority: 1 }),
    task('P', 3 * DAY, { levelingPriority: 2 }),
    task('R', 4 * DAY, { levelingPriority: 1 }),
    task('S', 2 * DAY, { levelingPriority: 2 }),
    task('T', 2 * DAY, { levelingPriority: 3 }),
  ],
  edges: [fs('P', 'S')],
  assignments: [
    on('Q', 'CRANE'),
    on('P', 'CRANE'),
    on('R', 'PUMP'),
    on('S', 'PUMP'),
    on('T', 'PUMP'),
  ],
  resources: [CRANE, PUMP],
  calendar: CAL24,
};

describe('planLevellingApplication — P11: a clash the dropped candidate leaves behind', () => {
  it('precondition: every ghost written looks settled; only the kept ghosts written leaves T levelled', () => {
    const { byId } = solve(p11);
    expect(delayedIdsOf(byId)).toEqual(['P', 'S', 'T']);
    const ghost = (id: string) => ({ activityId: id, visualStart: byId.get(id)!.leveledStart! });
    const everyGhost = settle(p11, [ghost('P'), ghost('S'), ghost('T')]);
    expect(everyGhost.leveled.summary.leveledActivityCount).toBe(0);
    const keptOnly = settle(p11, [ghost('P'), ghost('T')]);
    expect(keptOnly.leveled.summary.leveledActivityCount).toBe(1);
    expect(delayedIdsOf(keptOnly.byId)).toEqual(['T']);
  });

  it('drops S, writes P and T, and reports the one lift still levelled, solved without S', () => {
    const plan = planLevellingApplication(input(p11));
    expect(plan.rows).toEqual([
      { activityId: 'P', visualStart: '2026-01-08' },
      { activityId: 'T', visualStart: '2026-01-11' },
    ]);
    expect(plan.leftToLogic).toEqual(['S']);
    // The plan as it would stand, asked of the engine rather than of the function under test.
    const settled = settle(p11, plan.rows);
    expect(plan.remainingAfterApply).toBe(settled.leveled.summary.leveledActivityCount);
    expect(plan.remainingAfterApply).toBe(1);
    expect(delayedIdsOf(settled.byId)).toEqual(['T']);
    expect(plan.after.filter((r) => (r.levelingDelay ?? 0) > 0).map((r) => r.activityId)).toEqual([
      'T',
    ]);
    // S was dropped, not placed, so it is not a conflict the apply leaves behind.
    expect(plan.conflictingPlaced).toEqual([]);
  });
});

// ── P12: a milestone on a levelled chain ───────────────────────────────────────────────────────────

/**
 * A and B clash on the crane (B is delayed). M is a finish milestone assigned to the crane after B: it
 * is never moved by levelling, so it cannot be a candidate and no row may name it.
 */
const p12: Scenario = {
  activities: [
    task('A', 3 * DAY, { levelingPriority: 1 }),
    task('B', 3 * DAY, { levelingPriority: 2 }),
    task('M', 0, { type: 'FINISH_MILESTONE' }),
  ],
  edges: [fs('B', 'M')],
  assignments: [on('A', 'CRANE'), on('B', 'CRANE'), on('M', 'CRANE')],
  resources: [CRANE],
  calendar: CAL24,
};

describe('planLevellingApplication — P12: a milestone never yields a row', () => {
  it('precondition: B is delayed and the milestone takes part in levelling without moving', () => {
    const { byId } = solve(p12);
    expect(delayedIdsOf(byId)).toEqual(['B']);
    expect(byId.get('M')!.leveledStart).not.toBeNull();
    expect(byId.get('M')!.levelingDelay).toBe(0);
  });

  it('writes B only', () => {
    const plan = planLevellingApplication(input(p12));
    expect(plan.rows).toEqual([{ activityId: 'B', visualStart: '2026-01-08' }]);
    expect(plan.items.map((i) => i.activityId)).toEqual(['B']);
  });
});

// ── P13: a started activity ────────────────────────────────────────────────────────────────────────

/**
 * B has the higher priority, but A started on the data date and keeps the crane (levelling never moves
 * a progressed activity), so B waits for it. Without the actual, A would be the one pushed.
 */
const p13Activities = (aStarted: boolean): EngineActivity[] => [
  task('A', 3 * DAY, { levelingPriority: 2, ...(aStarted ? { actualStart: DATA_DATE } : {}) }),
  task('B', 3 * DAY, { levelingPriority: 1 }),
];
const p13: Scenario = {
  activities: p13Activities(true),
  edges: [],
  assignments: [on('A', 'CRANE'), on('B', 'CRANE')],
  resources: [CRANE],
  calendar: CAL24,
};

describe('planLevellingApplication — P13: a started activity is the anchor, not a row', () => {
  it('precondition: started, A holds the crane and B is delayed; not started, A is the delayed one', () => {
    expect(delayedIdsOf(solve(p13).byId)).toEqual(['B']);
    expect(delayedIdsOf(solve({ ...p13, activities: p13Activities(false) }).byId)).toEqual(['A']);
  });

  it('writes B behind A, and never writes A', () => {
    const plan = planLevellingApplication(input(p13));
    expect(delayedIdsOf(settle(p13, plan.rows).byId)).toEqual([]);
    expect(plan.rows).toEqual([{ activityId: 'B', visualStart: '2026-01-08' }]);
  });
});

// ── P14: the plan's network options reach the solve ────────────────────────────────────────────────

/**
 * P3's chain, with S carrying an external early start on 9 January (day 4). With the external bound
 * applied S is drawn on day 4, which the pump is already free for: S is not levelled and not a
 * candidate. Ignoring external relationships, the option a recalculation passes through `compute`,
 * draws S on day 3 where R holds the pump, so S is levelled to day 4 and P's move then makes that
 * earlier than its logic. One plan, two answers: the options must reach every solve the preview runs.
 *
 * (An external bound cannot make a target earlier than logic directly: it raises the drawn start the
 * levelling delays from, so a target is never below it.)
 */
const p14: Scenario = followerBase(
  task('S', 2 * DAY, { levelingPriority: 2, externalEarlyStart: '2026-01-09' }),
);
const p14Ignoring: Scenario = { ...p14, compute: { ignoreExternalRelationships: true } };

describe("planLevellingApplication — P14: the plan's compute options reach the solve", () => {
  it('precondition: external bound applied, S is not levelled; ignored, S is levelled and conflicts', () => {
    expect(delayedIdsOf(solve(p14).byId)).toEqual(['P']);
    const ignoring = solve(p14Ignoring).byId;
    expect(delayedIdsOf(ignoring)).toEqual(['P', 'S']);
    const everyGhost = ['P', 'S'].map((id) => ({
      activityId: id,
      visualStart: ignoring.get(id)!.leveledStart!,
    }));
    expect(conflictsOf(settle(p14Ignoring, everyGhost).byId)).toEqual(['S']);
  });

  it('applies the external bound by default: S is neither a row nor left to logic', () => {
    const plan = planLevellingApplication(input(p14));
    expect(plan.rows).toEqual([{ activityId: 'P', visualStart: '2026-01-08' }]);
    expect(plan.leftToLogic).toEqual([]);
  });

  it('honours ignore-external: S becomes a candidate, is earlier than its logic, and is reported', () => {
    const plan = planLevellingApplication(input(p14Ignoring));
    expect(conflictsOf(settle(p14Ignoring, plan.rows).byId)).toEqual([]);
    expect(plan.rows).toEqual([{ activityId: 'P', visualStart: '2026-01-08' }]);
    expect(plan.leftToLogic).toEqual(['S']);
  });
});

// ── P15 and P16: calendars that are not the simple case ────────────────────────────────────────────

/** The crane works 10:00-18:00, the plan and both lifts 08:00-16:00. X frees it part-way through Monday. */
const p15: Scenario = {
  activities: [
    task('X', WEEK_DAY / 2, { levelingPriority: 1 }),
    task('Y', WEEK_DAY, { levelingPriority: 2 }),
  ],
  edges: [],
  assignments: [on('X', 'CRANE'), on('Y', 'CRANE')],
  resources: [{ ...CRANE, calendar: CAL_1000_1800 }],
  calendar: CAL_0800_1600,
};

describe("planLevellingApplication — P15: a resource calendar that differs from the activity's", () => {
  it('precondition: Y is levelled, and the date its ghost falls on does not clear the clash', () => {
    const y = solve(p15).byId.get('Y')!;
    expect(y.levelingDelay).toBeGreaterThan(0);
    const onGhostDate = settle(p15, [{ activityId: 'Y', visualStart: y.leveledStart! }]);
    expect(onGhostDate.byId.get('Y')!.levelingDelay).toBeGreaterThan(0);
  });

  it('writes a date that settles to no delay', () => {
    const plan = planLevellingApplication(input(p15));
    expect(delayedIdsOf(settle(p15, plan.rows).byId)).toEqual([]);
    expect(plan.rows.map((r) => r.activityId)).toEqual(['Y']);
    expect(plan.remainingAfterApply).toBe(0);
  });
});

/**
 * P8's Friday, with Monday 12 and Tuesday 13 January a holiday: the next working day is Wednesday the
 * 14th, so the jump over a non-working stretch crosses more than a weekend.
 */
const CAL_HOLIDAY = buildWorkingTimeCalendar(
  Array.from({ length: 7 }, (_, d) => (d < 5 ? [{ startMinute: 480, endMinute: 960 }] : [])),
  [{ startDate: '2026-01-12', endDate: '2026-01-13', windows: [] }],
);
const p16: Scenario = { ...p8, calendar: CAL_HOLIDAY };

describe('planLevellingApplication — P16: a multi-day holiday after a part-day start', () => {
  it('precondition: Y is freed at 12:00 Friday; the Saturday clears it but is drawn on Wednesday', () => {
    const settledOn = (date: string) =>
      settle(p16, [{ activityId: 'Y', visualStart: date }]).byId.get('Y')!;
    expect(solve(p16).byId.get('Y')!.leveledStart).toBe('2026-01-09');
    expect(settledOn('2026-01-09').levelingDelay).toBeGreaterThan(0);
    expect(settledOn('2026-01-10').levelingDelay).toBe(0);
    expect(settledOn('2026-01-10').visualEffectiveStart).toBe('2026-01-14');
    expect(settledOn('2026-01-14').levelingDelay).toBe(0);
  });

  it('stores Wednesday 14 January, the first working day after the holiday', () => {
    const plan = planLevellingApplication(input(p16));
    expect(delayedIdsOf(settle(p16, plan.rows).byId)).toEqual([]);
    expect(plan.rows).toEqual([{ activityId: 'Y', visualStart: '2026-01-14' }]);
    expect(plan.roundedToNextDay).toEqual(['Y']);
  });
});

// ── P17: a bound the activity already breached ─────────────────────────────────────────────────────

/** B is hand-placed on the 6th, which finishes past its FNLT of the 7th, and still does once it moves. */
const p17: Scenario = {
  ...p10,
  activities: [
    task('A', 3 * DAY, { levelingPriority: 1 }),
    task('B', 3 * DAY, {
      levelingPriority: 2,
      constraintType: 'FNLT',
      constraintDate: '2026-01-07',
      visualStart: '2026-01-06',
    }),
  ],
};

describe('planLevellingApplication — P17: a bound already breached is not introduced', () => {
  it('precondition: B breaches its bound before the apply and after it', () => {
    const reasonOf = (s: ReturnType<typeof solve>) => s.byId.get('B')!.visualConflictReason;
    expect(reasonOf(solve(p17))).toBe('LATER_THAN_BOUND');
    expect(reasonOf(settle(p17, [{ activityId: 'B', visualStart: '2026-01-08' }]))).toBe(
      'LATER_THAN_BOUND',
    );
  });

  it('writes B and counts no bound as newly breached', () => {
    const plan = planLevellingApplication(input(p17));
    expect(plan.rows).toEqual([{ activityId: 'B', visualStart: '2026-01-08' }]);
    expect(plan.laterThanBoundIntroduced).toBe(0);
  });
});

// ── P18: the order of the input is not the order of the answer ─────────────────────────────────────

/**
 * Two resources, each with a clash that levels to the same day, and a third lift that levels later: B
 * and D share a target date, so their order is decided by id alone. D is linked SS to B, so the engine
 * hands D over before B: only the id tie-break puts B first, and the input order cannot.
 */
const p18: Scenario = {
  activities: [
    task('A', 3 * DAY, { levelingPriority: 1 }),
    task('B', 3 * DAY, { levelingPriority: 2 }),
    task('C', 3 * DAY, { levelingPriority: 1 }),
    task('D', 3 * DAY, { levelingPriority: 2 }),
    task('E', 3 * DAY, { levelingPriority: 3 }),
  ],
  edges: [{ id: 'D-B', predecessorId: 'D', successorId: 'B', type: 'SS', lagMinutes: 0 }],
  assignments: [
    on('A', 'CRANE'),
    on('B', 'CRANE'),
    on('E', 'CRANE'),
    on('C', 'PUMP'),
    on('D', 'PUMP'),
  ],
  resources: [CRANE, PUMP],
  calendar: CAL24,
};

describe('planLevellingApplication — P18: row order does not depend on the input order', () => {
  it('precondition: B and D level to the same day, E to a later one, and D is solved before B', () => {
    const { byId, leveled } = solve(p18);
    const solvedOrder = leveled.results.map((r) => r.activityId);
    expect(solvedOrder.indexOf('D')).toBeLessThan(solvedOrder.indexOf('B'));
    expect(byId.get('B')!.leveledStart).toBe(byId.get('D')!.leveledStart);
    expect(byId.get('E')!.leveledStart! > byId.get('B')!.leveledStart!).toBe(true);
  });

  it('returns the same rows whichever way round the plan is handed over', () => {
    const forward = planLevellingApplication(input(p18));
    expect(forward.rows.map((r) => r.activityId)).toEqual(['B', 'D', 'E']);
    const reversed = planLevellingApplication({
      ...input(p18),
      activities: [...p18.activities].reverse(),
      edges: [...p18.edges].reverse(),
      assignments: [...p18.assignments].reverse(),
      resources: [...p18.resources].reverse(),
    });
    expect(reversed.rows).toEqual(forward.rows);
    expect(reversed.items).toEqual(forward.items);
  });
});

// ── P19: the preview is not capped ─────────────────────────────────────────────────────────────────

/**
 * The placements write accepts at most 2,000 rows (`update-placements.dto.ts`), but the preview's job is
 * to say what levelling wants, so it never truncates: 2,001 delayed lifts give 2,001 rows. One crane per
 * pair keeps the solve cheap.
 */
const PAIRS = 2001;
const p19: Scenario = {
  activities: Array.from({ length: PAIRS }, (_, i) => [
    task(`a${i}`, DAY, { levelingPriority: 1 }),
    task(`b${i}`, DAY, { levelingPriority: 2 }),
  ]).flat(),
  edges: [],
  assignments: Array.from({ length: PAIRS }, (_, i) => [
    on(`a${i}`, `R${i}`),
    on(`b${i}`, `R${i}`),
  ]).flat(),
  resources: Array.from({ length: PAIRS }, (_, i) => ({ id: `R${i}`, capacity: 1 })),
  calendar: CAL24,
};

describe('planLevellingApplication — P19: every candidate is returned', () => {
  it('returns one row per delayed lift past the 2,000-row write cap', () => {
    const plan = planLevellingApplication(input(p19));
    expect(plan.rows).toHaveLength(PAIRS);
    expect(plan.items).toHaveLength(PAIRS);
    expect(new Set(plan.rows.map((r) => r.visualStart))).toEqual(new Set(['2026-01-06']));
    expect(plan.remainingAfterApply).toBe(0);
  }, 60_000);
});
