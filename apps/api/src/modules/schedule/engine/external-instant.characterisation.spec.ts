import { describe, expect, it } from 'vitest';

import { clampExternalBackwardFinish, clampExternalForwardStart } from './constraints';
import type { EngineActivity } from './types';
import {
  absMinutesToInstant,
  allMinutesWorkCalendar,
  instantToAbsMinutes,
} from './working-time-calendar';

/**
 * **Engine-port probes for #385, characterising today** (`docs/specs/cross-plan-day-boundary/`,
 * plan M0-T3). The cross-plan fix will hand the engine's external-date seam a TIMED value
 * (`YYYY-MM-DDTHH:MM`), so two spec claims about what that seam does with one today are pinned
 * here as they actually behave. Both are green on today's code and both describe a defect.
 *
 * The calendar is 24/7 so every day boundary is a midnight, which is where E12 bites.
 */

const DATA_DATE_ABS = instantToAbsMinutes('2026-01-05');
/** A logic bound far enough out that the external value is the tighter/later one. */
const FAR_LATE_FINISH = instantToAbsMinutes('2026-06-01');

function activity(fields: Partial<EngineActivity> & Pick<EngineActivity, 'type'>): EngineActivity {
  return { id: 'X', durationMinutes: 0, ...fields };
}

/**
 * **E11 — M1-T3 INVERTS THIS.** The backward clamp cannot read a timed late finish on an activity
 * with duration. That branch builds `nextCalendarDay(value)`, which parses the value by splitting on
 * `-`, so `2026-01-10T08:00` yields a day of `Number('10T08:00')`, which is `NaN`.
 *
 * The spec (E11) says the clamp then "returns `NaN`". **It does not: it throws.** `nextCalendarDay`
 * formats the invalid date with `toISOString()`, and an invalid `Date` makes that throw a
 * `RangeError` before any arithmetic runs. So today a timed value reaching this branch would fail
 * the whole recalculation loudly rather than corrupt one date silently. M1-T3's timed branch reads a
 * value longer than ten characters as the instant itself for every type, which removes the call.
 *
 * The two other branches already accept an instant, as E11 says, and are pinned as the contrast.
 */
describe('E11: the backward external clamp and a timed value (today)', () => {
  it('throws a RangeError for a task (an activity with duration)', () => {
    const task = activity({
      type: 'TASK',
      durationMinutes: 3 * 1440,
      externalLateFinish: '2026-01-10T08:00',
    });
    const clamp = () =>
      clampExternalBackwardFinish(
        task,
        FAR_LATE_FINISH,
        allMinutesWorkCalendar,
        DATA_DATE_ABS,
        false,
      );
    // `toISOString()` on an invalid Date: the error comes from the formatter, not from arithmetic.
    expect(clamp).toThrow(RangeError);
    expect(clamp).toThrow('Invalid time value');
  });

  it('reads the same value as an instant for a finish milestone and a zero-duration activity', () => {
    const at = instantToAbsMinutes('2026-01-10T08:00');
    for (const type of ['FINISH_MILESTONE', 'START_MILESTONE'] as const) {
      const milestone = activity({ type, externalLateFinish: '2026-01-10T08:00' });
      expect(
        clampExternalBackwardFinish(
          milestone,
          FAR_LATE_FINISH,
          allMinutesWorkCalendar,
          DATA_DATE_ABS,
          false,
        ),
        type,
      ).toBe(at);
    }
  });
});

/**
 * **E12 — M1-T3 INVERTS THIS.** A midnight instant written by the engine's own formatter is read one
 * day late by a finish milestone. `absMinutesToInstant` drops `T00:00`, so the instant for the start
 * of `2026-01-10` comes back as the bare date `2026-01-10`, and a finish milestone reads a bare date
 * as the END of that day (ADR-0155) — the start of `2026-01-11`. M1-T3's `formatExternalInstant`
 * always writes the time, including `T00:00`, so a formatted instant is never mistaken for a date.
 *
 * On a 24-hour or full-day calendar every day boundary is a midnight, so this is the common case
 * there, not an edge (spec E12).
 */
describe('E12: a formatted midnight instant and a finish milestone (today)', () => {
  const midnight = instantToAbsMinutes('2026-01-10T00:00');

  it('the formatter drops T00:00, so a midnight instant becomes a bare date', () => {
    expect(absMinutesToInstant(midnight)).toBe('2026-01-10');
  });

  it('a finish milestone reads that string one day late, forward and backward', () => {
    const external = absMinutesToInstant(midnight);
    const milestone = activity({
      type: 'FINISH_MILESTONE',
      externalEarlyStart: external,
      externalLateFinish: external,
    });
    const oneDayLate = midnight + 1440;
    expect(
      clampExternalForwardStart(
        milestone,
        DATA_DATE_ABS,
        allMinutesWorkCalendar,
        DATA_DATE_ABS,
        false,
      ),
    ).toBe(oneDayLate);
    expect(
      clampExternalBackwardFinish(
        milestone,
        FAR_LATE_FINISH,
        allMinutesWorkCalendar,
        DATA_DATE_ABS,
        false,
      ),
    ).toBe(oneDayLate);
  });

  it('a mid-day instant keeps its time, so only the midnight case is misread', () => {
    const midday = instantToAbsMinutes('2026-01-10T08:00');
    const milestone = activity({
      type: 'FINISH_MILESTONE',
      externalEarlyStart: absMinutesToInstant(midday),
    });
    expect(absMinutesToInstant(midday)).toBe('2026-01-10T08:00');
    expect(
      clampExternalForwardStart(
        milestone,
        DATA_DATE_ABS,
        allMinutesWorkCalendar,
        DATA_DATE_ABS,
        false,
      ),
    ).toBe(midday);
  });
});
