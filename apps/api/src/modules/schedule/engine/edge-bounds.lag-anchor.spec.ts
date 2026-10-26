import { describe, expect, it } from 'vitest';

import { backwardUpperBound, forwardLowerBound } from './edge-bounds';
import { rollBackwardToWorking, rollForwardToWorking } from './instants';
import type { EngineEdge } from './types';
import {
  absMinutesToInstant,
  allMinutesWorkCalendar,
  buildWorkingTimeCalendar,
  fullDayWeek,
  instantToAbsMinutes,
  type WorkingTimeCalendar,
} from './working-time-calendar';

/**
 * **A lag on a milestone's own calendar gives the same instant from the kept anchor and the rolled
 * one** (#539 M2-T2; `docs/specs/milestone-cross-calendar/` §4.4).
 *
 * D1 stops snapping a zero-span activity onto its own calendar, so a link out of it is measured from
 * the instant its logic gives (`X`, which may sit in the calendar's non-working time) instead of from
 * that instant rolled onto its calendar (`R`). The spec's argument that this changes nothing when the
 * lag is walked on the milestone's own calendar is that no working minute lies between `X` and `R`.
 * That is an argument; this is the measurement, over every hour of a fortnight, for positive,
 * negative and zero lags, on a 5-day calendar, a 24-hour one, a night shift whose windows cross
 * midnight and a calendar with a holiday exception.
 *
 * A zero lag returns the anchor itself, so there the two bounds differ by the roll and agree once the
 * successor rolls onto the same calendar, which is what the passes do. Every other lag agrees raw.
 */
const FIVE_DAY_8_16: WorkingTimeCalendar = buildWorkingTimeCalendar(
  fullDayWeek([0, 1, 2, 3, 4]).map((day) =>
    day.length === 0 ? [] : [{ startMinute: 480, endMinute: 960 }],
  ),
  [],
);
/** Mon–Sat 22:00 to 06:00: the window crosses midnight as two adjacent-day windows (ADR-0036). */
const NIGHT_SHIFT: WorkingTimeCalendar = buildWorkingTimeCalendar(
  [
    [
      { startMinute: 0, endMinute: 360 },
      { startMinute: 1320, endMinute: 1440 },
    ],
    [
      { startMinute: 0, endMinute: 360 },
      { startMinute: 1320, endMinute: 1440 },
    ],
    [
      { startMinute: 0, endMinute: 360 },
      { startMinute: 1320, endMinute: 1440 },
    ],
    [
      { startMinute: 0, endMinute: 360 },
      { startMinute: 1320, endMinute: 1440 },
    ],
    [
      { startMinute: 0, endMinute: 360 },
      { startMinute: 1320, endMinute: 1440 },
    ],
    [{ startMinute: 0, endMinute: 360 }],
    [],
  ],
  [],
);
const WITH_HOLIDAY: WorkingTimeCalendar = buildWorkingTimeCalendar(
  fullDayWeek([0, 1, 2, 3, 4]).map((day) =>
    day.length === 0 ? [] : [{ startMinute: 480, endMinute: 960 }],
  ),
  [{ startDate: '2027-06-16', endDate: '2027-06-17', windows: [] }],
);

const CALENDARS: readonly [string, WorkingTimeCalendar][] = [
  ['5-day 08:00-16:00', FIVE_DAY_8_16],
  ['24-hour', allMinutesWorkCalendar],
  ['night shift across midnight', NIGHT_SHIFT],
  ['5-day with a holiday', WITH_HOLIDAY],
];
const LAGS = [-3000, -1440, -480, -60, -1, 0, 1, 60, 480, 1440, 3000];
/** Monday 2027-06-14 00:00 for two weeks, every hour on the half hour so window edges are hit too. */
const START = instantToAbsMinutes('2027-06-14T00:00');
const ANCHORS = Array.from({ length: 14 * 24 * 2 }, (_, i) => START + i * 30);

function fsEdge(lagMinutes: number, lagCalendar: WorkingTimeCalendar): EngineEdge {
  return { id: 'e', predecessorId: 'P', successorId: 'S', type: 'FS', lagMinutes, lagCalendar };
}

describe('a lag on the milestone’s own calendar is anchor-independent (#539 M2-T2)', () => {
  describe.each(CALENDARS)('%s', (_name, cal) => {
    it('forward: a link from the kept instant lands where the one from the rolled instant does', () => {
      for (const lag of LAGS) {
        for (const x of ANCHORS) {
          const rolled = rollForwardToWorking(cal, x);
          const fromKept = forwardLowerBound(fsEdge(lag, cal), x, x, cal, 0, cal);
          const fromRolled = forwardLowerBound(fsEdge(lag, cal), rolled, rolled, cal, 0, cal);
          // The successor rolls its start onto the same calendar (the passes' `rollForwardToWorking`).
          const context = `lag ${lag} from ${absMinutesToInstant(x)}`;
          expect(rollForwardToWorking(cal, fromKept), context).toBe(
            rollForwardToWorking(cal, fromRolled),
          );
          if (lag !== 0) expect(fromKept, context).toBe(fromRolled);
        }
      }
    });

    it('backward: a link from the kept instant lands where the one from the rolled-back instant does', () => {
      const dataDate = START;
      for (const lag of LAGS) {
        for (const x of ANCHORS) {
          const rolled = rollBackwardToWorking(cal, dataDate, x);
          const fromKept = backwardUpperBound(fsEdge(lag, cal), x, x, cal, 0, cal);
          const fromRolled = backwardUpperBound(fsEdge(lag, cal), rolled, rolled, cal, 0, cal);
          const context = `lag ${lag} from ${absMinutesToInstant(x)}`;
          expect(rollBackwardToWorking(cal, dataDate, fromKept), context).toBe(
            rollBackwardToWorking(cal, dataDate, fromRolled),
          );
          if (lag !== 0) expect(fromKept, context).toBe(fromRolled);
        }
      }
    });
  });
});
