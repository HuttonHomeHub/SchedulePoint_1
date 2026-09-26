import type { ActivityType, DependencyType } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { computeSchedule } from './compute';
import { finishMilestoneDisplayIndex } from './instants';
import type { EngineActivity, EngineEdge, EngineResult } from './types';
import {
  allMinutesWorkCalendar,
  buildWorkingTimeCalendar,
  fullDayWeek,
  type WeeklyPattern,
  type WorkingTimeCalendar,
} from './working-time-calendar';

type EngineOutput = ReturnType<typeof computeSchedule>;

/**
 * **What date a zero-duration `TASK` reads, pinned before anything is built on it**
 * (`docs/specs/zero-duration-task/` M0-T2; spec E3, E17, E34). The engine is not changed here; these
 * cases characterise it so the epic's later milestones rest on runs rather than readings.
 *
 * - **(a)/(b) Decision 1a.** A zero-duration task reached by `FS` from a task ending Friday and one
 *   reached by `SS` from a task starting Monday sit at the SAME instant and get identical offsets,
 *   floats and dates. Applying the finish-milestone reading rule (`finishMilestoneDisplayIndex`) to
 *   that instant gives Friday, so the rule would date the SS-reached task a day before the work it is
 *   tied to starts — the reason decision 1 keeps the task on its own rule. At the data date the rule's
 *   floor keeps it on the data date.
 * - **(c) E17.** For each of the five stored date fields a `TASK` at date D and a `FINISH_MILESTONE`
 *   at D−1 (the previous CALENDAR day) produce the same instants: the same offsets and floats for the
 *   converted activity, and the same results for every other activity. A `START_MILESTONE` at D is the
 *   same as the `TASK` at D, dates included. This is the identity the epic's D3 re-expression rests on.
 * - **(d) E34.** A `FINISH_MILESTONE` at the previous WORKING day (Friday, for a Monday D) gives the
 *   same instant too. So no instant comparison can tell a calendar-day shift from a working-day one;
 *   that discrimination is left to FC-3's stored-value cases, and this case records why.
 *
 * **Why four calendars suffice.** The working-time port (`WorkingTimeCalendar`) branches on whether a
 * minute is working, never on WHY it is not: a weekend, a gap between shifts and a dated exception all
 * reach the same `rollForwardToWorking` path. The four cover the three shapes — whole non-working days
 * (Mon–Fri), an intraday gap (an 08:00–16:00 shift), no gap at all (24-hour) — and the fourth,
 * Mon–Fri with Monday 12 Jan a dated non-working exception, is there to SHOW the exception reaching
 * that path rather than to assert it: at D = Mon 12 on that calendar both sides roll through the
 * exception to Tuesday.
 *
 * **Every case proves its field reached the engine.** Two sides that both ignored the field would
 * compare equal for the wrong reason, so each case also asserts that the `TASK` with the field differs
 * from the `TASK` without it, and, where D−1 is a working day, that the `TASK` at D differs from the
 * `TASK` at D−1. Verified red by swapping D−1 for D on the finish-milestone side (recorded in
 * `docs/specs/zero-duration-task/m0-measurement.md`): 55 of the 60 (c) cases go red. The five that
 * stay green are the exception calendar at D = Mon 12, where D is itself non-working, so the start of
 * D and the end of D roll forward to the same Tuesday minute and the two readings coincide.
 *
 * Plan: data date Monday 5 Jan 2026. A (3 working days) → Z (zero duration, the subject) → B (1 day);
 * C (20 days, unlinked) carries the project finish and gives Z float, so the two backward bounds bind.
 */
const DATA_DATE = '2026-01-05';

type DateField =
  | 'visualStart'
  | 'constraintDate'
  | 'secondaryConstraintDate'
  | 'externalEarlyStart'
  | 'externalLateFinish';

/** Each field set so that it BINDS in the scenario below (forward bounds later than logic, backward earlier). */
const FIELDS: ReadonlyArray<{ field: DateField; set: (d: string) => Partial<EngineActivity> }> = [
  { field: 'visualStart', set: (d) => ({ visualStart: d }) },
  { field: 'constraintDate', set: (d) => ({ constraintType: 'SNET', constraintDate: d }) },
  {
    field: 'secondaryConstraintDate',
    set: (d) => ({ secondaryConstraintType: 'FNLT', secondaryConstraintDate: d }),
  },
  { field: 'externalEarlyStart', set: (d) => ({ externalEarlyStart: d }) },
  { field: 'externalLateFinish', set: (d) => ({ externalLateFinish: d }) },
];

const shiftWeek: WeeklyPattern = Array.from({ length: 7 }, (_, w) =>
  w < 5 ? [{ startMinute: 8 * 60, endMinute: 16 * 60 }] : [],
);

const CALENDARS: ReadonlyArray<{ name: string; cal: WorkingTimeCalendar; day: number }> = [
  {
    name: 'Mon–Fri full days',
    cal: buildWorkingTimeCalendar(fullDayWeek([0, 1, 2, 3, 4]), []),
    day: 1440,
  },
  { name: 'Mon–Fri 08:00–16:00 shift', cal: buildWorkingTimeCalendar(shiftWeek, []), day: 480 },
  { name: '24-hour', cal: allMinutesWorkCalendar, day: 1440 },
  {
    name: 'Mon–Fri with Monday 12 Jan a non-working exception',
    cal: buildWorkingTimeCalendar(fullDayWeek([0, 1, 2, 3, 4]), [
      { startDate: '2026-01-12', endDate: '2026-01-12', windows: [] },
    ]),
    day: 1440,
  },
];

/** D: a Monday (the exception day on the fourth calendar), a Wednesday, and a Monday a week later. */
const DATES = ['2026-01-12', '2026-01-14', '2026-01-19'] as const;

/** The previous calendar day — never the previous working day (E34). */
function previousCalendarDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function act(
  id: string,
  durationMinutes: number,
  type: ActivityType = 'TASK',
  extra: Partial<EngineActivity> = {},
): EngineActivity {
  return { id, durationMinutes, type, ...extra };
}

function edge(p: string, s: string, type: DependencyType = 'FS'): EngineEdge {
  return { id: `${p}-${s}`, predecessorId: p, successorId: s, type, lagMinutes: 0 };
}

function scenario(
  cal: WorkingTimeCalendar,
  day: number,
  zType: ActivityType,
  zExtra: Partial<EngineActivity>,
): EngineOutput {
  return computeSchedule(
    [act('A', 3 * day), act('Z', 0, zType, zExtra), act('B', 1 * day), act('C', 20 * day)],
    [edge('A', 'Z'), edge('Z', 'B')],
    { dataDate: DATA_DATE, calendar: cal },
  );
}

const byId = (out: EngineOutput, id: string): EngineResult =>
  out.results.find((r) => r.activityId === id)!;

/** What "the same instant" means for the converted activity: every offset and float, none of its dates. */
function instantsOf(r: EngineResult) {
  return {
    earlyStartOffset: r.earlyStartOffset,
    earlyFinishOffset: r.earlyFinishOffset,
    lateStartOffset: r.lateStartOffset,
    lateFinishOffset: r.lateFinishOffset,
    totalFloat: r.totalFloat,
    freeFloat: r.freeFloat,
    isCritical: r.isCritical,
    isNearCritical: r.isNearCritical,
    visualDriftMinutes: r.visualDriftMinutes,
    remainingFloatMinutes: r.remainingFloatMinutes,
    visualConflictReason: r.visualConflictReason,
  };
}

/** Everything about the schedule except the converted activity's own reported dates. */
function everythingButZDates(out: EngineOutput) {
  return {
    z: instantsOf(byId(out, 'Z')),
    others: out.results.filter((r) => r.activityId !== 'Z'),
    edges: out.edges,
  };
}

describe('(a) an FS-reached and an SS-reached zero-duration task at the same instant are identical (E3)', () => {
  const FIVE_DAY = CALENDARS[0]!.cal;
  const DAY = 1440;

  it('gets identical offsets, floats and dates', () => {
    // A (5 days) ends Friday 9 Jan; B (FS after A) starts Monday 12 Jan. `Zfs` is FS after A,
    // `Zss` is SS after B: an FS bound is A's exclusive finish, an SS bound is B's start, and both
    // are rolled forward to Monday 00:00. Both are open ends, so their late side is the same too.
    const out = computeSchedule(
      [act('A', 5 * DAY), act('B', 2 * DAY), act('Zfs', 0), act('Zss', 0)],
      [edge('A', 'B'), edge('A', 'Zfs'), edge('B', 'Zss', 'SS')],
      { dataDate: DATA_DATE, calendar: FIVE_DAY },
    );
    const { activityId: _fs, ...zfs } = byId(out, 'Zfs');
    const { activityId: _ss, ...zss } = byId(out, 'Zss');
    expect(zss).toEqual(zfs);
    expect(zss.earlyStart).toBe('2026-01-12');
    // The discriminating fact: the two really are reached by different logic.
    expect(out.edges.find((e) => e.edgeId === 'B-Zss')).toBeDefined();
    expect(out.edges.find((e) => e.edgeId === 'A-Zfs')).toBeDefined();
  });
});

describe('(b) the rejected rule would misdate the SS-reached task (E3, decision 1a)', () => {
  const FIVE_DAY = CALENDARS[0]!.cal;
  const DAY = 1440;

  it('applying finishMilestoneDisplayIndex to its offset gives Friday, the day before B starts', () => {
    const out = computeSchedule(
      [act('A', 5 * DAY), act('B', 2 * DAY), act('Zss', 0), act('Mss', 0, 'FINISH_MILESTONE')],
      [edge('A', 'B'), edge('B', 'Zss', 'SS'), edge('B', 'Mss', 'SS')],
      { dataDate: DATA_DATE, calendar: FIVE_DAY },
    );
    const a = byId(out, 'A');
    const b = byId(out, 'B');
    const zss = byId(out, 'Zss');

    // The task reads the day its instant opens, which is the day B starts.
    expect(b.earlyStart).toBe('2026-01-12');
    expect(zss.earlyStart).toBe('2026-01-12');
    // The finish-milestone rule reads the minute before the instant. That minute is A's last one
    // (A's inclusive finish index), which the engine itself reports as Friday 9 Jan.
    expect(finishMilestoneDisplayIndex(zss.earlyStartOffset)).toBe(a.earlyFinishOffset - 1);
    expect(a.earlyFinish).toBe('2026-01-09');
    // And through the engine's own conversion: a finish milestone at that same SS-reached instant
    // is reported on Friday — a day before the work it is tied to by logic starts.
    expect(byId(out, 'Mss').earlyStart).toBe('2026-01-09');
  });

  it('at the data date the floor holds: the rule keeps it on the data date', () => {
    const out = computeSchedule(
      [act('D0', 2 * DAY), act('Z0', 0), act('M0', 0, 'FINISH_MILESTONE')],
      [edge('D0', 'Z0', 'SS'), edge('D0', 'M0', 'SS')],
      { dataDate: DATA_DATE, calendar: FIVE_DAY },
    );
    const z0 = byId(out, 'Z0');
    expect(z0.earlyStartOffset).toBe(0);
    expect(finishMilestoneDisplayIndex(z0.earlyStartOffset)).toBe(0);
    expect(z0.earlyStart).toBe(DATA_DATE);
    expect(byId(out, 'M0').earlyStart).toBe(DATA_DATE);
  });
});

describe('(c) a TASK at D and a FINISH_MILESTONE at D−1 (calendar day) give the same instants (E17)', () => {
  for (const { name, cal, day } of CALENDARS) {
    for (const { field, set } of FIELDS) {
      for (const d of DATES) {
        const dMinus1 = previousCalendarDay(d);

        it(`${name} · ${field} · D = ${d}`, () => {
          const task = scenario(cal, day, 'TASK', set(d));
          const finish = scenario(cal, day, 'FINISH_MILESTONE', set(dMinus1));
          const start = scenario(cal, day, 'START_MILESTONE', set(d));
          const bare = scenario(cal, day, 'TASK', {});

          // The field reached the engine and binds: without it, the task's instants differ.
          expect(instantsOf(byId(task, 'Z'))).not.toEqual(instantsOf(byId(bare, 'Z')));
          // And where D−1 is a working day, D and D−1 are distinguishable on the task itself — so
          // the equality below is not two readings that both ignore the day.
          // Asked of the calendar rather than hard-coded: on the 24-hour calendar Sunday works.
          if (cal.workingTimeBetween(dMinus1, d) > 0) {
            const taskAtDMinus1 = scenario(cal, day, 'TASK', set(dMinus1));
            expect(instantsOf(byId(taskAtDMinus1, 'Z'))).not.toEqual(instantsOf(byId(task, 'Z')));
          }

          // FINISH_MILESTONE at D−1: the same instants, and every other activity unchanged.
          expect(everythingButZDates(finish)).toEqual(everythingButZDates(task));
          // START_MILESTONE at D: the same convention as the task, so identical, its dates included.
          expect(byId(start, 'Z')).toEqual(byId(task, 'Z'));
          expect(everythingButZDates(start)).toEqual(everythingButZDates(task));
        });
      }
    }
  }
});

describe('(d) a FINISH_MILESTONE at the previous WORKING day gives the same instant too (E34)', () => {
  // Pinned deliberately, as a limitation of the instant rather than a feature of the rule. Monday
  // 19 Jan's previous working day is Friday 16; the end of Friday is Saturday 00:00, which rolls
  // forward over the weekend to Monday 00:00 — the same instant as the task at Monday and as the
  // finish milestone at Sunday 18. So a working-day shift keeps every instant, and no comparison of
  // instants can tell it from the calendar-day shift D3 specifies. The two differ only in the value
  // STORED after conversion (Sunday, not Friday) and in a round trip from a date stored on a
  // non-working day; FC-3's cases in M2 and M4 carry that discrimination.
  const { cal, day } = CALENDARS[0]!;

  for (const { field, set } of FIELDS) {
    it(`Mon–Fri full days · ${field} · D = Monday 19 Jan, finish milestone at Friday 16 Jan`, () => {
      const task = scenario(cal, day, 'TASK', set('2026-01-19'));
      const calendarDayShift = scenario(cal, day, 'FINISH_MILESTONE', set('2026-01-18'));
      const workingDayShift = scenario(cal, day, 'FINISH_MILESTONE', set('2026-01-16'));

      expect(everythingButZDates(calendarDayShift)).toEqual(everythingButZDates(task));
      expect(everythingButZDates(workingDayShift)).toEqual(everythingButZDates(task));
    });
  }
});
