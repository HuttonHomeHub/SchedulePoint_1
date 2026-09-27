import type { ActivityType } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { computeSchedule } from './compute';
import { clampExternalBackwardFinish } from './constraints';
import { formatExternalInstant } from './instants';
import type { EngineActivity } from './types';
import {
  absMinutesToInstant,
  allMinutesWorkCalendar,
  buildWorkingTimeCalendar,
  instantToAbsMinutes,
  type WorkingTimeCalendar,
} from './working-time-calendar';

/**
 * **The timed backward branch and the one formatter (#385 M1-T3, spec D7).** A timed external late
 * finish (`YYYY-MM-DDTHH:MM`) is the bound itself, for every activity type. Before M1 the task branch
 * threw (spec E11, as corrected by M0-T3) and the milestone branches read it as an instant; after M1
 * every type reads it the same way. `formatExternalInstant` is the only thing that writes such a
 * value, and it always keeps the time, because `absMinutesToInstant` drops `T00:00` (spec E12).
 *
 * No persisted column can produce a timed value, so these cases are the only coverage the branch
 * has until M2's derivation calls it.
 */

const DAY = 1440;
const DATA_DATE_ABS = instantToAbsMinutes('2026-01-05');
const FAR_LATE_FINISH = instantToAbsMinutes('2026-06-01');
const EIGHT_HOUR = buildWorkingTimeCalendar(
  Array.from({ length: 7 }, (_, w) => (w < 5 ? [{ startMinute: 480, endMinute: 960 }] : [])),
  [],
);
const CALENDARS: readonly [string, WorkingTimeCalendar][] = [
  ['24-hour', allMinutesWorkCalendar],
  ['eight-hour', EIGHT_HOUR],
];
/** A task with duration, a finish milestone, and two zero-duration shapes. */
const SHAPES: readonly [string, ActivityType, number][] = [
  ['a task', 'TASK', 3 * DAY],
  ['a finish milestone', 'FINISH_MILESTONE', 0],
  ['a zero-duration task', 'TASK', 0],
  ['a start milestone', 'START_MILESTONE', 0],
];
/** Midnight (the E12 case) and mid-day, on a Wednesday and on the end boundary of a shift. */
const INSTANTS = ['2026-01-14T00:00', '2026-01-14T11:30', '2026-01-14T16:00'];

function activity(type: ActivityType, durationMinutes: number, external: string): EngineActivity {
  return { id: 'X', type, durationMinutes, externalLateFinish: external };
}

describe('clampExternalBackwardFinish reads a timed value as the instant itself', () => {
  for (const [calName, cal] of CALENDARS) {
    for (const [shape, type, duration] of SHAPES) {
      it(`${shape} on the ${calName} calendar, at midnight and mid-day`, () => {
        for (const external of INSTANTS) {
          expect(
            clampExternalBackwardFinish(
              activity(type, duration, external),
              FAR_LATE_FINISH,
              cal,
              DATA_DATE_ABS,
              false,
            ),
            external,
          ).toBe(instantToAbsMinutes(external));
        }
      });
    }
  }

  it('still composes by min: a looser timed value leaves the logic bound in charge', () => {
    const logic = instantToAbsMinutes('2026-01-14T00:00');
    expect(
      clampExternalBackwardFinish(
        activity('TASK', 3 * DAY, '2026-01-20T08:00'),
        logic,
        EIGHT_HOUR,
        DATA_DATE_ABS,
        false,
      ),
    ).toBe(logic);
  });

  it('is dropped with every other external bound when ignoreExternal is on', () => {
    expect(
      clampExternalBackwardFinish(
        activity('TASK', 3 * DAY, '2026-01-06T08:00'),
        FAR_LATE_FINISH,
        EIGHT_HOUR,
        DATA_DATE_ABS,
        true,
      ),
    ).toBe(FAR_LATE_FINISH);
  });

  it('leaves the bare-date branch as it was: a bare date means the end of that working day', () => {
    // Wednesday on the eight-hour calendar ends at 16:00, not at the next midnight.
    expect(
      clampExternalBackwardFinish(
        activity('TASK', 3 * DAY, '2026-01-14'),
        FAR_LATE_FINISH,
        EIGHT_HOUR,
        DATA_DATE_ABS,
        false,
      ),
    ).toBe(instantToAbsMinutes('2026-01-14T16:00'));
  });
});

describe('a timed late finish reaches computeSchedule and is honoured', () => {
  it('on a 24-hour calendar, a mid-day bound becomes the late finish, with the float it implies', () => {
    // 3-day task from 2026-01-05 00:00 finishes 2026-01-08 00:00; a bound at 2026-01-07T12:00 is
    // 12 hours tighter than that, so the late finish is the bound and total float is -720.
    const out = computeSchedule([activity('TASK', 3 * DAY, '2026-01-07T12:00')], [], {
      dataDate: '2026-01-05',
      calendar: allMinutesWorkCalendar,
    });
    const x = out.results[0]!;
    expect(x.lateFinishOffset).toBe(2.5 * DAY);
    expect(x.totalFloat).toBe(-720);
    expect(x.externalDriven).toBe(true);
  });

  it('on an eight-hour calendar, a bound at a shift end becomes the late finish', () => {
    // 3 working days (1,440 minutes) from Mon 08:00 finish Wed 16:00; a bound at Tue 16:00 is one
    // working day tighter.
    const out = computeSchedule([activity('TASK', 3 * 480, '2026-01-06T16:00')], [], {
      dataDate: '2026-01-05',
      calendar: EIGHT_HOUR,
    });
    const x = out.results[0]!;
    expect(x.lateFinishOffset).toBe(2 * 480);
    expect(x.totalFloat).toBe(-480);
  });
});

describe('formatExternalInstant', () => {
  it('keeps T00:00 at midnight, where absMinutesToInstant drops it', () => {
    const midnight = instantToAbsMinutes('2026-01-10T00:00');
    expect(absMinutesToInstant(midnight)).toBe('2026-01-10');
    expect(formatExternalInstant(midnight)).toBe('2026-01-10T00:00');
  });

  it('writes the time of day it is given', () => {
    expect(formatExternalInstant(instantToAbsMinutes('2026-01-10T08:05'))).toBe('2026-01-10T08:05');
  });

  it('always writes sixteen characters and round-trips every minute of two days', () => {
    const start = instantToAbsMinutes('2026-03-28');
    for (let abs = start; abs < start + 2 * DAY; abs += 1) {
      const text = formatExternalInstant(abs);
      expect(text).toHaveLength(16);
      expect(instantToAbsMinutes(text)).toBe(abs);
    }
  });
});
