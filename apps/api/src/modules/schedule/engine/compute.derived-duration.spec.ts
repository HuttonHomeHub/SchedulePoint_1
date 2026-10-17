import type { ActivityType, DependencyType } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { computeSchedule } from './compute';
import type { EngineActivity, EngineEdge } from './types';
import {
  allMinutesWorkCalendar,
  buildWorkingTimeCalendar,
  fullDayWeek,
  type WorkingTimeCalendar,
} from './working-time-calendar';

/**
 * The derived duration of a `WBS_SUMMARY` and a `LEVEL_OF_EFFORT` (ADR-0197): the working minutes their
 * derived span covers on their own calendar. A NEW file rather than an addition to `compute.spec.ts` or
 * `compute.wbs.spec.ts` — the golden suites are not edited (the parity argument is the last block here).
 * `DATA_DATE = 2026-01-05` (Mon) on a Mon–Fri plan calendar.
 */
const DATA_DATE = '2026-01-05';
const DAY = 1440;
const FIVE_DAY: WorkingTimeCalendar = buildWorkingTimeCalendar(fullDayWeek([0, 1, 2, 3, 4]), []);
/** 08:00–16:00 Mon–Fri — an eight-hour day, so a span need not be a whole number of 1,440s. */
const OFFICE_HOURS: WorkingTimeCalendar = buildWorkingTimeCalendar(
  Array.from({ length: 7 }, (_, d) => (d < 5 ? [{ startMinute: 480, endMinute: 960 }] : [])),
  [],
);
const MON_THU: WorkingTimeCalendar = buildWorkingTimeCalendar(fullDayWeek([0, 1, 2, 3]), []);

function act(
  id: string,
  durationMinutes: number,
  parentId?: string,
  extra: Partial<EngineActivity> = {},
  type: ActivityType = 'TASK',
): EngineActivity {
  return { id, durationMinutes, type, ...(parentId ? { parentId } : {}), ...extra };
}

const summary = (id: string, parentId?: string, extra: Partial<EngineActivity> = {}) =>
  act(id, 0, parentId, extra, 'WBS_SUMMARY');
const loe = (id: string) => act(id, 0, undefined, {}, 'LEVEL_OF_EFFORT');

function edge(predecessorId: string, successorId: string, type: DependencyType = 'FS'): EngineEdge {
  return {
    id: `${predecessorId}-${successorId}-${type}`,
    predecessorId,
    successorId,
    type,
    lagMinutes: 0,
  };
}

function run(
  activities: readonly EngineActivity[],
  edges: readonly EngineEdge[] = [],
  calendar: WorkingTimeCalendar = FIVE_DAY,
) {
  const out = computeSchedule(activities, edges, { dataDate: DATA_DATE, calendar });
  return new Map(out.results.map((r) => [r.activityId, r]));
}

describe('derived duration — WBS summary', () => {
  it('counts whole working days across the branch on a Mon–Fri calendar', () => {
    // A is Mon–Tue, B follows on Wed–Fri: the summary spans five working days.
    const r = run([act('A', 2 * DAY, 'S'), act('B', 3 * DAY, 'S'), summary('S')], [edge('A', 'B')]);
    expect(r.get('S')!.derivedDurationMinutes).toBe(5 * DAY);
  });

  it('counts a sub-day span in minutes on an eight-hour calendar', () => {
    // 720 min = a day and a half of 480-minute days: not a whole number of days.
    const r = run([act('A', 720, 'S'), summary('S')], [], OFFICE_HOURS);
    expect(r.get('S')!.derivedDurationMinutes).toBe(720);
  });

  it('counts a seven-day child on the summary calendar, not the child calendar', () => {
    // The child works through the weekend; the summary rolls onto Mon–Fri, so the weekend is not counted.
    const r = run([act('A', 7 * DAY, 'S', { calendar: allMinutesWorkCalendar }), summary('S')]);
    expect(r.get('S')!.derivedDurationMinutes).toBe(5 * DAY);
  });

  it('counts on the summary own calendar when it has one', () => {
    // The plan works Mon–Fri; the summary's Mon–Thu calendar rolls the Friday-end finish back to Thursday.
    const r = run([act('A', 5 * DAY, 'S'), summary('S', undefined, { calendar: MON_THU })]);
    expect(r.get('S')!.derivedDurationMinutes).toBe(4 * DAY);
  });

  it('states each nested summary its own span, not the sum of its children', () => {
    const r = run(
      [act('A', 2 * DAY, 'I'), summary('I', 'O'), act('B', 3 * DAY, 'O'), summary('O')],
      [edge('A', 'B')],
    );
    expect(r.get('I')!.derivedDurationMinutes).toBe(2 * DAY);
    expect(r.get('O')!.derivedDurationMinutes).toBe(5 * DAY);
  });

  it('is absent for an empty summary', () => {
    const r = run([summary('S'), act('A', DAY)]);
    expect('derivedDurationMinutes' in r.get('S')!).toBe(false);
  });

  it('is a real zero for a summary of milestones only', () => {
    const r = run([act('M', 0, 'S', {}, 'START_MILESTONE'), summary('S')]);
    expect(r.get('S')!.derivedDurationMinutes).toBe(0);
  });
});

describe('derived duration — level of effort', () => {
  const network = [act('A', 2 * DAY), act('B', 3 * DAY), loe('H')];

  it('counts the SS-predecessor start to FF-successor finish span', () => {
    const r = run(network, [edge('A', 'B'), edge('A', 'H', 'SS'), edge('H', 'B', 'FF')]);
    expect(r.get('H')!.loeNoSpan).toBe(false);
    expect(r.get('H')!.derivedDurationMinutes).toBe(5 * DAY);
  });

  it('is absent when the LOE has no resolvable span, never the fallback zero', () => {
    const r = run(network, [edge('A', 'H', 'SS')]);
    expect(r.get('H')!.loeNoSpan).toBe(true);
    expect('derivedDurationMinutes' in r.get('H')!).toBe(false);
  });
});

describe('derived duration — types it must not touch', () => {
  it('is absent on a task and a milestone', () => {
    const r = run([act('T', 2 * DAY), act('M', 0, undefined, {}, 'FINISH_MILESTONE')]);
    expect('derivedDurationMinutes' in r.get('T')!).toBe(false);
    expect('derivedDurationMinutes' in r.get('M')!).toBe(false);
  });

  it('leaves a plan with neither type byte-identical: no result carries the key', () => {
    const r = run([act('A', 2 * DAY), act('B', 3 * DAY)], [edge('A', 'B')]);
    for (const result of r.values()) {
      expect(Object.keys(result)).not.toContain('derivedDurationMinutes');
    }
  });
});

describe('derived duration — agrees with the drawn span', () => {
  /** Inclusive working days between two ISO dates on Mon–Fri — the length the bar is drawn. */
  const weekdaysInclusive = (from: string, to: string): number => {
    let n = 0;
    for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`);) {
      const dow = d.getUTCDay();
      if (dow !== 0 && dow !== 6) n += 1;
      d = new Date(d.getTime() + 86_400_000);
    }
    return n;
  };

  it('equals the drawn length in working days for an unplaced summary and LOE', () => {
    const r = run(
      [act('A', 2 * DAY, 'S'), act('B', 3 * DAY, 'S'), summary('S'), loe('H')],
      [edge('A', 'B'), edge('A', 'H', 'SS'), edge('H', 'B', 'FF')],
    );
    for (const id of ['S', 'H']) {
      const x = r.get(id)!;
      expect(x.derivedDurationMinutes! / DAY).toBe(weekdaysInclusive(x.earlyStart, x.earlyFinish));
    }
  });
});
