import { describe, expect, it } from 'vitest';

import { computeSchedule } from './compute';
import {
  CROSS_DATA_DATE,
  crossCalendarNetwork,
  link,
  middle,
  WEEKDAY_CAL,
  WEEKDAY_MINUTES,
  WEEKEND_CAL,
} from './compute.cross-calendar.fixture';
import { offsetFromDataDate } from './instants';
import type { EngineActivity, EngineEdge, EngineResult } from './types';
import {
  absMinutesToInstant,
  allMinutesWorkCalendar,
  instantToAbsMinutes,
} from './working-time-calendar';

/**
 * **The four instants a result reports** (ADR-0212 D1, `docs/TECH_DEBT.md` #565): where the bar is
 * drawn starts and ends, and the late start and finish, as absolute instants on the engine's axis.
 * They are the instants the stored `visualEffective*` and `late*` dates are dated from, so a plan can
 * keep them beside those dates and a cross-plan link can read them instead of a day.
 *
 * Two kinds of case: the pairing with the plan-frame offsets the result already reports (an offset is
 * the same instant projected onto the plan calendar, so the two cannot disagree), and the values a
 * date cannot carry, pinned to the minute for each zero-span type on two calendars, a placed task and a
 * progressed one.
 */
const DAY = 1440;
const day = (iso: string): number => instantToAbsMinutes(iso);

function solveOn(
  activities: readonly EngineActivity[],
  edges: readonly EngineEdge[],
  dataDate: string,
  calendar = allMinutesWorkCalendar,
): Map<string, EngineResult> {
  const out = computeSchedule(activities, edges, { dataDate, calendar });
  return new Map(out.results.map((r) => [r.activityId, r]));
}

const crossRun = (m: EngineActivity, longer = false): Map<string, EngineResult> => {
  const { activities, edges } = crossCalendarNetwork(m);
  const all = longer
    ? [...activities, { id: 'L', type: 'TASK' as const, durationMinutes: 60 * WEEKDAY_MINUTES }]
    : activities;
  return solveOn(all, edges, CROSS_DATA_DATE, WEEKDAY_CAL);
};

const instantOf = (abs: number): string => absMinutesToInstant(abs);

describe('EngineResult reports the instants its stored dates are dated from', () => {
  const MIDDLES: readonly [string, () => EngineActivity][] = [
    ['a finish milestone', () => middle('FINISH_MILESTONE')],
    ['a finish milestone on the weekend calendar', () => middle('FINISH_MILESTONE', WEEKEND_CAL)],
    ['a start milestone', () => middle('START_MILESTONE')],
    ['a start milestone on the weekend calendar', () => middle('START_MILESTONE', WEEKEND_CAL)],
    ['a zero-duration task', () => middle('TASK')],
    ['a zero-duration task on the weekend calendar', () => middle('TASK', WEEKEND_CAL)],
  ];

  for (const [name, build] of MIDDLES) {
    for (const longer of [false, true]) {
      it(`${name}${longer ? ' (longer plan)' : ''}: each instant is the offset's instant, for every activity`, () => {
        const dataDateAbs = day(CROSS_DATA_DATE);
        for (const r of crossRun(build(), longer).values()) {
          const offset = (abs: number) => offsetFromDataDate(WEEKDAY_CAL, dataDateAbs, abs);
          expect(offset(r.placedStartInstant), `${r.activityId} placed start`).toBe(
            r.placedStartOffset,
          );
          expect(offset(r.placedFinishInstant), `${r.activityId} placed finish`).toBe(
            r.placedFinishOffset,
          );
          expect(offset(r.lateStartInstant), `${r.activityId} late start`).toBe(r.lateStartOffset);
          expect(offset(r.lateFinishInstant), `${r.activityId} late finish`).toBe(
            r.lateFinishOffset,
          );
        }
      });
    }
  }

  it('a task: its instants are its working boundaries, and its dates are those instants’ days', () => {
    const a = crossRun(middle('FINISH_MILESTONE')).get('A')!;
    expect(instantOf(a.placedStartInstant)).toBe('2027-06-14T08:00');
    expect(instantOf(a.placedFinishInstant)).toBe('2027-06-18T16:00');
    expect(a.visualEffectiveStart).toBe('2027-06-14');
    // The finish date is the last occupied minute's day, one minute before the exclusive boundary.
    expect(absMinutesToInstant(a.placedFinishInstant - 1).slice(0, 10)).toBe(
      a.visualEffectiveFinish,
    );
  });

  it('a start milestone on the weekend calendar keeps the instant the weekend work ended, where its date says Saturday', () => {
    const m = crossRun(middle('START_MILESTONE', WEEKEND_CAL)).get('M')!;
    // Sunday 19:00 is the end of W's last shift: a point on no working day of the plan calendar, and
    // the one a successor on that calendar rolls to Monday 08:00 (a day, which cannot say that).
    expect(instantOf(m.placedStartInstant)).toBe('2027-06-27T19:00');
    expect(instantOf(m.placedFinishInstant)).toBe('2027-06-27T19:00');
    // The witness for #565: the date is the day its next working minute opens, which is not that instant.
    expect(m.visualEffectiveStart).toBe('2027-07-03');
  });

  it('a start milestone pinned SNET Saturday keeps a different instant under the same date', () => {
    const pinned = crossRun(
      middle('START_MILESTONE', WEEKEND_CAL, {
        constraintType: 'SNET',
        constraintDate: '2027-07-03',
      }),
    ).get('M')!;
    expect(pinned.visualEffectiveStart).toBe('2027-07-03');
    expect(instantOf(pinned.placedStartInstant)).toBe('2027-07-03T07:00');
  });

  it('a zero-duration task on the weekend calendar reports the same instants as the start milestone', () => {
    const task = crossRun(middle('TASK', WEEKEND_CAL)).get('M')!;
    const milestone = crossRun(middle('START_MILESTONE', WEEKEND_CAL)).get('M')!;
    expect(task.placedStartInstant).toBe(milestone.placedStartInstant);
    expect(task.placedFinishInstant).toBe(milestone.placedFinishInstant);
  });

  it('a finish milestone: its late instant is where the work after it begins, its date a day earlier', () => {
    const driven = crossRun(middle('FINISH_MILESTONE'), true).get('M')!;
    const constrained = crossRun(
      middle('FINISH_MILESTONE', undefined, {
        constraintType: 'FNLT',
        constraintDate: '2027-07-02',
      }),
      true,
    ).get('M')!;
    expect(driven.lateFinish).toBe('2027-07-02');
    expect(constrained.lateFinish).toBe('2027-07-02');
    expect(instantOf(driven.lateFinishInstant)).toBe('2027-07-05T08:00');
    expect(instantOf(constrained.lateFinishInstant)).toBe('2027-07-03');
  });

  it('a placed task: the instants are where it is drawn, not where logic would put it', () => {
    const r = solveOn(
      [
        { id: 'A', type: 'TASK', durationMinutes: 2 * DAY, visualStart: '2026-01-04' },
        { id: 'B', type: 'TASK', durationMinutes: DAY },
      ],
      [link('A', 'B')],
      '2026-01-01',
    );
    const a = r.get('A')!;
    expect(a.placedStartInstant).toBe(day('2026-01-04'));
    expect(a.placedFinishInstant).toBe(day('2026-01-06'));
    // Logic would start it on the data date; the placement is later, so the two instants differ.
    expect(a.placedStartOffset).toBe(3 * DAY);
    expect(a.earlyStartOffset).toBe(0);
    expect(a.visualEffectiveStart).toBe('2026-01-04');
  });

  it('an in-progress task: the instants are the ones its successors are measured from', () => {
    const r = solveOn(
      [
        {
          id: 'A',
          type: 'TASK',
          durationMinutes: 4 * DAY,
          actualStart: '2026-01-01',
          remainingMinutes: DAY,
        },
        { id: 'B', type: 'TASK', durationMinutes: DAY },
      ],
      [link('A', 'B')],
      '2026-01-03',
    );
    const a = r.get('A')!;
    expect(a.placedFinishInstant).toBe(a.passOnFinishInstant);
    expect(a.placedFinishInstant).toBe(day('2026-01-04'));
    expect(r.get('B')!.placedStartInstant).toBe(a.placedFinishInstant);
  });

  it('a complete task: the instants are its actuals', () => {
    const r = solveOn(
      [
        {
          id: 'A',
          type: 'TASK',
          durationMinutes: 2 * DAY,
          actualStart: '2026-01-01',
          actualFinish: '2026-01-02',
        },
        { id: 'B', type: 'TASK', durationMinutes: DAY },
      ],
      [link('A', 'B')],
      '2026-01-03',
    );
    const a = r.get('A')!;
    expect(a.placedStartInstant).toBe(day('2026-01-01'));
    expect(a.placedFinishInstant).toBe(a.passOnFinishInstant);
    expect(absMinutesToInstant(a.placedFinishInstant - 1).slice(0, 10)).toBe(
      a.visualEffectiveFinish,
    );
  });
});
