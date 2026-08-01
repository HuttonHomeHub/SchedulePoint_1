import { MINUTES_PER_CALENDAR_DAY, type CalendarWindow } from '@repo/types';
import { describe, expect, it } from 'vitest';

import {
  EMPTY_HOURS_MESSAGE,
  exceptionKindOf,
  exceptionRowsOf,
  toExceptionHours,
} from './exception-hours';

const window = (startMinute: number, endMinute: number): CalendarWindow => ({
  startMinute,
  endMinute,
});

/** A stored exception, in the two fields the classifier reads. */
const stored = (isWorking: boolean, windows: CalendarWindow[] = []) => ({ isWorking, windows });

describe('exceptionKindOf', () => {
  it('reads a non-working exception as a holiday, whatever windows it carries', () => {
    expect(exceptionKindOf(stored(false))).toBe('holiday');
    // A non-working day with windows should not exist, but "isWorking: false" is the answer.
    expect(exceptionKindOf(stored(false, [window(480, 960)]))).toBe('holiday');
  });

  it('reads a single full-day window back as the shorthand that wrote it', () => {
    expect(exceptionKindOf(stored(true, [window(0, MINUTES_PER_CALENDAR_DAY)]))).toBe('allDay');
  });

  it('reads real hours as hours', () => {
    expect(exceptionKindOf(stored(true, [window(480, 720)]))).toBe('hours');
    // Two windows that happen to span the day are still hours — a split day is not "all day".
    expect(
      exceptionKindOf(stored(true, [window(0, 720), window(720, MINUTES_PER_CALENDAR_DAY)])),
    ).toBe('hours');
  });
});

describe('exceptionRowsOf', () => {
  it('gives editable rows only for an exception carrying specific hours', () => {
    expect(exceptionRowsOf(stored(true, [window(480, 720), window(780, 1020)]))).toEqual([
      { start: '08:00', end: '12:00' },
      { start: '13:00', end: '17:00' },
    ]);
  });

  it('gives no rows for a holiday or a whole worked day', () => {
    expect(exceptionRowsOf(stored(false))).toEqual([]);
    // The point of the allDay round trip: opening a worked Saturday must NOT show 00:00–24:00.
    expect(exceptionRowsOf(stored(true, [window(0, MINUTES_PER_CALENDAR_DAY)]))).toEqual([]);
  });
});

describe('toExceptionHours', () => {
  it('sends the isWorking shorthand for the two whole-day choices', () => {
    expect(toExceptionHours('holiday', [])).toEqual({ ok: true, hours: { isWorking: false } });
    expect(toExceptionHours('allDay', [])).toEqual({ ok: true, hours: { isWorking: true } });
  });

  it('ignores any rows left behind when the choice is not "hours"', () => {
    expect(toExceptionHours('holiday', [{ start: '08:00', end: '17:00' }])).toEqual({
      ok: true,
      hours: { isWorking: false },
    });
  });

  it('parses rows into windows', () => {
    expect(toExceptionHours('hours', [{ start: '08:00', end: '12:00' }])).toEqual({
      ok: true,
      hours: { windows: [window(480, 720)] },
    });
  });

  it('refuses "specific hours" with no hours, as a whole-field message', () => {
    const result = toExceptionHours('hours', []);
    expect(result).toEqual({ ok: false, problems: [], message: EMPTY_HOURS_MESSAGE });
  });

  it('passes row-keyed problems straight through', () => {
    const result = toExceptionHours('hours', [
      { start: '08:00', end: '12:00' },
      { start: '10:00', end: '14:00' },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Both halves of the overlapping pair are flagged, so either can be corrected.
    expect(result.problems.map((problem) => problem.index)).toEqual([0, 1]);
    expect(result.message).toBeUndefined();
  });

  it('reports a row that does not parse rather than one that overlaps', () => {
    const result = toExceptionHours('hours', [{ start: 'lunchtime', end: '12:00' }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]?.index).toBe(0);
  });
});
