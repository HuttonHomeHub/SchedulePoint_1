import type { ActivityType } from '@repo/types';
import { describe, expect, it } from 'vitest';

import {
  finishDateInstant,
  finishMilestoneDateInstant,
  rollBackwardToWorking,
  rollForwardToWorking,
  startDateInstant,
} from './instants';
import {
  allMinutesWorkCalendar,
  buildWorkingTimeCalendar,
  fullDayWeek,
  instantToAbsMinutes,
  type WorkingTimeCalendar,
} from './working-time-calendar';

/**
 * **The two date readers (#385 M1-T2, spec D3).** `startDateInstant` and `finishDateInstant` were
 * lifted out of `constraints.ts` (`resolvePair` and `clampExternalBackwardFinish`) so the engine and
 * the cross-plan derivation read a date one way. The golden suites passing unedited is the proof the
 * lift changed nothing in the engine; this file pins the readers themselves, and the one property the
 * plan named as a risk: whether the finish reader's anchor matters.
 */

const EIGHT_HOUR = buildWorkingTimeCalendar(
  Array.from({ length: 7 }, (_, w) => (w < 5 ? [{ startMinute: 480, endMinute: 960 }] : [])),
  [],
);
const STANDARD = buildWorkingTimeCalendar(fullDayWeek([0, 1, 2, 3, 4]), []);
const CALENDARS: readonly [string, WorkingTimeCalendar][] = [
  ['24-hour', allMinutesWorkCalendar],
  ['Standard (full-day Mon–Fri)', STANDARD],
  ['eight-hour (Mon–Fri 08:00–16:00)', EIGHT_HOUR],
];
/** Mon 2026-01-05 to Sun 2026-01-11: every weekday and both weekend days. */
const DATES = [
  '2026-01-05',
  '2026-01-06',
  '2026-01-07',
  '2026-01-08',
  '2026-01-09',
  '2026-01-10',
  '2026-01-11',
];
const TYPES: readonly ActivityType[] = [
  'TASK',
  'START_MILESTONE',
  'FINISH_MILESTONE',
  'LEVEL_OF_EFFORT',
];
const DATA_DATE_ABS = instantToAbsMinutes('2025-12-29');
const DAY = 1440;

/** The day after `date` at 00:00, spelled out here rather than imported, as the old code did it. */
function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

describe('the readers return what the inline expressions they replaced returned', () => {
  // The pre-M1 `resolvePair` body, restated as the oracle for the lift.
  function oldPair(
    cal: WorkingTimeCalendar,
    date: string,
    type: ActivityType,
    duration: number,
  ): { startAbs: number; finishAbs: number } {
    if (type === 'FINISH_MILESTONE') {
      const at = finishMilestoneDateInstant(cal, date);
      return { startAbs: at, finishAbs: at };
    }
    const startAbs = rollForwardToWorking(cal, instantToAbsMinutes(date));
    const finishAbs =
      duration === 0
        ? startAbs
        : rollBackwardToWorking(cal, DATA_DATE_ABS, instantToAbsMinutes(nextDay(date)));
    return { startAbs, finishAbs };
  }

  for (const [name, cal] of CALENDARS) {
    it(`on the ${name} calendar`, () => {
      for (const date of DATES) {
        for (const type of TYPES) {
          for (const duration of [0, 480, 5 * DAY]) {
            const old = oldPair(cal, date, type, duration);
            expect(startDateInstant(cal, date, type), `${date} ${type} ${duration}`).toBe(
              old.startAbs,
            );
            expect(
              finishDateInstant(cal, DATA_DATE_ABS, date, type, duration),
              `${date} ${type} ${duration}`,
            ).toBe(old.finishAbs);
          }
        }
      }
    });
  }
});

/**
 * **The anchor question M1-T2 named as its risk.** `finishDateInstant` passes its anchor to
 * `rollBackwardToWorking`, and the cross-plan derivation will call it with a remote plan's anchor.
 * The plan's property was "for any anchor at or before the target, the result does not depend on
 * the anchor". **That is false as stated**, and the second case below shows it. What is true is
 * narrower: the result does not depend on an anchor at or before the RESULT (the last working end
 * boundary at or before the day's end). M2-T4 loads the remote data date, which is the anchor the
 * engine itself used, so the derivation reads what the engine read either way.
 */
describe("the finish reader's anchor", () => {
  it('does not change the result for any anchor at or before the result', () => {
    for (const [name, cal] of CALENDARS) {
      for (const date of DATES) {
        const far = instantToAbsMinutes('2025-06-02');
        const answer = finishDateInstant(cal, far, date, 'TASK', 5 * DAY);
        // Every hour from three weeks before the answer up to the answer itself.
        for (let anchor = answer - 21 * DAY; anchor <= answer; anchor += 60) {
          expect(
            finishDateInstant(cal, anchor, date, 'TASK', 5 * DAY),
            `${name} ${date} anchor ${anchor - answer} min from the answer`,
          ).toBe(answer);
        }
      }
    }
  });

  it('returns the anchor itself when the anchor sits after the answer and before the day ends', () => {
    // Wednesday on the eight-hour calendar: the answer is Wed 16:00, the day ends Thu 00:00.
    const far = instantToAbsMinutes('2025-06-02');
    const answer = finishDateInstant(EIGHT_HOUR, far, '2026-01-07', 'TASK', DAY);
    expect(answer).toBe(instantToAbsMinutes('2026-01-07T16:00'));
    const lateAnchor = instantToAbsMinutes('2026-01-07T17:00');
    expect(finishDateInstant(EIGHT_HOUR, lateAnchor, '2026-01-07', 'TASK', DAY)).toBe(lateAnchor);

    // A Saturday: the answer is Fri 16:00; an anchor on Saturday is returned as it is.
    const saturday = instantToAbsMinutes('2026-01-10');
    expect(finishDateInstant(EIGHT_HOUR, far, '2026-01-10', 'TASK', DAY)).toBe(
      instantToAbsMinutes('2026-01-09T16:00'),
    );
    expect(finishDateInstant(EIGHT_HOUR, saturday, '2026-01-10', 'TASK', DAY)).toBe(saturday);
  });
});
