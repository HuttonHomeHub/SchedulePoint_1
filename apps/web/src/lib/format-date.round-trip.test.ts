import { describe, expect, it } from 'vitest';

import { formatCalendarDate, parseCalendarDate } from './format-date';

/**
 * **The pair, asserted as a pair** (ADR-0134 D5).
 *
 * `parseCalendarDate` exists to be `formatCalendarDate`'s inverse. That is a claim about two
 * functions together, and neither one's own tests can make it: a formatter test proves what it
 * prints, a parser test proves what it accepts, and both pass perfectly while the pair is broken.
 * The round trip is the only assertion that fails when they drift.
 *
 * It matters here rather than in the abstract because a Gantt cell is **seeded from the formatter's
 * output** (`GanttPanel.tsx:1701` passes the rendered text), so a planner who opens a date cell and
 * presses Enter without typing is round-tripping. If that refuses, the product refuses the value it
 * just showed them.
 */
describe('formatCalendarDate ↔ parseCalendarDate', () => {
  /** Ends of months, leap day, year boundaries, single-digit day — where a formatter differs. */
  const DAYS = [
    '2026-01-01',
    '2026-01-09',
    '2026-01-31',
    '2026-02-28',
    '2024-02-29',
    '2026-03-01',
    '2026-06-30',
    '2026-09-11',
    '2026-12-31',
    '2027-12-01',
  ];

  it.each(DAYS)('round-trips %s through what the cell displays', (iso) => {
    expect(parseCalendarDate(formatCalendarDate(iso))).toBe(iso);
  });

  it('round-trips every day of a whole year, not only the interesting ones', () => {
    // A sweep, because the cases above are the ones I thought of. Verified red by making the
    // parser's month lookup case-sensitive.
    for (let day = new Date(Date.UTC(2026, 0, 1)); day.getUTCFullYear() === 2026;) {
      const iso = day.toISOString().slice(0, 10);
      expect(parseCalendarDate(formatCalendarDate(iso)), iso).toBe(iso);
      day = new Date(day.getTime() + 86_400_000);
    }
  });
});

describe('parseCalendarDate', () => {
  it('accepts the wire format a planner may type directly', () => {
    expect(parseCalendarDate('2026-03-05')).toBe('2026-03-05');
  });

  it('accepts a missing leading zero and any month casing', () => {
    expect(parseCalendarDate('5 mar 2026')).toBe('2026-03-05');
    expect(parseCalendarDate('05 MAR 2026')).toBe('2026-03-05');
  });

  it.each([
    ['an all-numeric date, because it means two different things', '05/03/2026'],
    ['a two-digit year', '05 Mar 26'],
    ['a month that does not exist', '05 Mzr 2026'],
    ['a day that does not exist', '31 Feb 2026'],
    ['a day that does not exist, in the wire format', '2026-02-31'],
    ['empty text', '   '],
    ['prose', 'next Tuesday'],
  ])('refuses %s', (_why, text) => {
    expect(parseCalendarDate(text)).toBeNull();
  });

  it('refuses a rolled-over day rather than accepting a plausible different one', () => {
    // `Date.UTC` rolls 31 Feb forward to 3 March. Accepting that would turn a typo into a real
    // date three days away, in a field that moves a schedule — the worst available outcome, and
    // the reason `isRealDay` compares the components back out.
    expect(parseCalendarDate('2026-02-30')).toBeNull();
    expect(parseCalendarDate('2026-04-31')).toBeNull();
  });
});
