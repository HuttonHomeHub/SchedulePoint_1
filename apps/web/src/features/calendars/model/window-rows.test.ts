import { MINUTES_PER_CALENDAR_DAY } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { blankRow, rowsToWindows, splitAcrossMidnight, windowsToRows } from './window-rows';
import { WINDOW_PROBLEM } from './window-rules';

describe('windowsToRows', () => {
  it('renders stored minutes as the text a planner types', () => {
    expect(
      windowsToRows([
        { startMinute: 480, endMinute: 720 },
        { startMinute: 1200, endMinute: MINUTES_PER_CALENDAR_DAY },
      ]),
    ).toEqual([
      { start: '08:00', end: '12:00' },
      // 1440 is 24:00, never 00:00 — the storage contract, visible in the field.
      { start: '20:00', end: '24:00' },
    ]);
  });
});

describe('rowsToWindows', () => {
  it('parses a well-formed day', () => {
    const result = rowsToWindows([
      { start: '06:00', end: '14:00' },
      { start: '14:00', end: '22:00' },
    ]);
    expect(result).toEqual({
      ok: true,
      windows: [
        { startMinute: 360, endMinute: 840 },
        { startMinute: 840, endMinute: 1320 },
      ],
    });
  });

  it('round-trips through windowsToRows', () => {
    const windows = [
      { startMinute: 420, endMinute: 660 },
      { startMinute: 900, endMinute: 1140 },
    ];
    expect(rowsToWindows(windowsToRows(windows))).toEqual({ ok: true, windows });
  });

  it('reports a row that does not parse, keyed to that row', () => {
    const result = rowsToWindows([
      { start: '08:00', end: '17:00' },
      { start: '8am', end: '17:00' },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.map((problem) => problem.index)).toEqual([1]);
  });

  it('short-circuits the ordering rules while a row is unparseable', () => {
    // Rows 0 and 2 overlap, but row 1 does not parse — reporting the overlap here would send the
    // planner to fix hours that may be right once the broken row is typed out.
    const result = rowsToWindows([
      { start: '08:00', end: '17:00' },
      { start: '', end: '12:00' },
      { start: '10:00', end: '14:00' },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.map((problem) => problem.index)).toEqual([1]);
    expect(result.problems.map((problem) => problem.message)).not.toContain(WINDOW_PROBLEM.OVERLAP);
  });

  it('applies the ordering rules once every row parses', () => {
    const result = rowsToWindows([
      { start: '08:00', end: '12:00' },
      { start: '10:00', end: '14:00' },
    ]);
    expect(result).toEqual({
      ok: false,
      problems: [
        { index: 0, message: WINDOW_PROBLEM.OVERLAPPED },
        { index: 1, message: WINDOW_PROBLEM.OVERLAP },
      ],
    });
  });

  it('is ok for a day with no rows — a weekday that is simply not worked', () => {
    expect(rowsToWindows([])).toEqual({ ok: true, windows: [] });
  });
});

describe('blankRow', () => {
  it('seeds the working day most planners start from', () => {
    expect(blankRow()).toEqual({ start: '08:00', end: '17:00' });
  });
});

describe('splitAcrossMidnight', () => {
  it('returns the two adjacent-day windows a night shift really is', () => {
    expect(splitAcrossMidnight('20:00', '06:00')).toEqual({
      today: { start: '20:00', end: '24:00' },
      nextDay: { start: '00:00', end: '06:00' },
    });
  });

  it('produces two rows that each parse and are each in bounds', () => {
    const { today, nextDay } = splitAcrossMidnight('22:30', '05:45');
    expect(rowsToWindows([today])).toEqual({
      ok: true,
      windows: [{ startMinute: 1350, endMinute: MINUTES_PER_CALENDAR_DAY }],
    });
    expect(rowsToWindows([nextDay])).toEqual({
      ok: true,
      windows: [{ startMinute: 0, endMinute: 345 }],
    });
  });
});
