/**
 * What makes two calendars interchangeable for an import (ADR-0208 D1): a copy of the file's
 * calendar would be indistinguishable from the stored one, differing only in its name.
 *
 * The identity covers the standard working day (`hoursPerDayMinutes`), the weekly shift set, and the
 * active exceptions with their windows AND labels. The engine reads only shifts and exceptions
 * (`plan-calendar.ts`) and `hoursPerDayMinutes` decides how a typed day-count is stored (ADR-0068);
 * labels are read by neither, but they are included anyway, because a label-only difference makes a
 * copy and a copy is the direction a wrong answer is cheap in.
 *
 * Pure, so the same function reads a stored candidate and the batch input the importer would write:
 * comparing against what would be WRITTEN, not what was parsed, is what makes "identical" mean "a
 * copy would have been the same".
 */

export interface IdentityWindow {
  readonly startMinute: number;
  readonly endMinute: number;
}

export interface IdentityShift extends IdentityWindow {
  readonly weekday: number;
}

export interface IdentityException {
  /** Inclusive first day. */
  readonly startDate: Date;
  /** Inclusive last day; equal to `startDate` for a single day. */
  readonly endDate: Date;
  readonly label: string | null;
  readonly windows: readonly IdentityWindow[];
}

export interface CalendarIdentityInput {
  readonly hoursPerDayMinutes: number;
  readonly shifts: readonly IdentityShift[];
  readonly exceptions: readonly IdentityException[];
}

const day = (date: Date): string => date.toISOString().slice(0, 10);

const byNumbers = (a: readonly number[], b: readonly number[]): number => {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const delta = (a[i] ?? 0) - (b[i] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
};

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const windowTuples = (windows: readonly IdentityWindow[]): [number, number][] =>
  windows
    .map((w): [number, number] => [w.startMinute, w.endMinute])
    .sort((a, b) => byNumbers(a, b));

/**
 * A canonical string for a calendar's identity. Equal strings mean identical calendars; row order
 * never matters. A multi-day range and the same days stored singly differ on purpose — the stored
 * rows differ, and a miss costs only today's behaviour.
 */
export function calendarIdentityKey(input: CalendarIdentityInput): string {
  const shifts = input.shifts
    .map((s): [number, number, number] => [s.weekday, s.startMinute, s.endMinute])
    .sort((a, b) => byNumbers(a, b));
  const exceptions = input.exceptions
    .map((e) => ({
      s: day(e.startDate),
      e: day(e.endDate),
      l: e.label,
      w: windowTuples(e.windows),
    }))
    .sort((a, b) => compareText(a.s, b.s) || compareText(a.e, b.e));
  return JSON.stringify({ h: input.hoursPerDayMinutes, s: shifts, x: exceptions });
}
