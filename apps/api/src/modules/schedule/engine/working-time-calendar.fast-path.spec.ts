import { describe, expect, it } from 'vitest';

import { formatCalendarDate, parseCalendarDate } from '../../../common/validation/calendar-date';

import { absMinutesToInstant, instantToAbsMinutes } from './working-time-calendar';

/** The two conversions as they were before M2.5 (`Date` construction and string splitting), frozen. */
function referenceToAbs(instant: string): number {
  const datePart = instant.slice(0, 10);
  const timePart = instant.length > 10 ? instant.slice(11) : '00:00';
  const dayMs = parseCalendarDate(datePart).getTime();
  const [h, m] = timePart.split(':');
  return Math.round(dayMs / 60000) + (Number(h) * 60 + Number(m));
}

function referenceFromAbs(abs: number): string {
  const dayIndex = Math.floor(abs / 1440);
  const minuteOfDay = abs - dayIndex * 1440;
  const date = formatCalendarDate(new Date(dayIndex * 1440 * 60000));
  if (minuteOfDay === 0) return date;
  const h = String(Math.floor(minuteOfDay / 60)).padStart(2, '0');
  const m = String(minuteOfDay % 60).padStart(2, '0');
  return `${date}T${h}:${m}`;
}

describe('instant <-> minutes-from-epoch: the arithmetic path agrees with the Date path', () => {
  it('reads and writes every day from 1950 to 2150, at three times of day', () => {
    const first = Math.floor(referenceToAbs('1950-01-01') / 1440);
    const last = Math.floor(referenceToAbs('2150-12-31') / 1440);
    for (let day = first; day <= last; day += 1) {
      for (const minute of [0, 1, 1439]) {
        const abs = day * 1440 + minute;
        const text = referenceFromAbs(abs);
        expect(absMinutesToInstant(abs)).toBe(text);
        expect(instantToAbsMinutes(text)).toBe(abs);
      }
    }
  }, 30_000);

  it('agrees across the whole four-digit-year range and at its edges', () => {
    const first = Math.floor(referenceToAbs('1000-01-01') / 1440);
    const last = Math.floor(referenceToAbs('9999-12-31') / 1440);
    const days = new Set<number>([first, first + 1, last - 1, last, first - 1, last + 1]);
    for (let day = first; day <= last; day += 997) days.add(day);
    for (const day of days) {
      const abs = day * 1440 + 725;
      expect(absMinutesToInstant(abs)).toBe(referenceFromAbs(abs));
      expect(instantToAbsMinutes(referenceFromAbs(abs))).toBe(
        referenceToAbs(referenceFromAbs(abs)),
      );
    }
  });

  it('falls back to the Date reading for anything the arithmetic does not own', () => {
    for (const instant of [
      '2026-02-30', // impossible day: Date.UTC rolls it into March
      '2026-02-30T08:00',
      '2025-02-29',
      '2024-02-29', // a real leap day
      '1900-02-29', // not a leap year
      '2000-02-29', // a leap year
      '0099-01-01', // two-digit years are remapped by Date.UTC
      '2026-13-01',
      '2026-00-10',
      '2026-01-00',
      '2026-01-01T24:00',
      '2026-01-01T7:00',
      '2026-1-01',
      '2026-01-01T08',
      '2026-01-01Tab:cd',
      'abcd-ef-gh',
      '',
    ]) {
      const expected = referenceToAbs(instant);
      const actual = instantToAbsMinutes(instant);
      expect(Object.is(actual, expected) || (Number.isNaN(actual) && Number.isNaN(expected))).toBe(
        true,
      );
    }
  });
});
