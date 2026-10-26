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

/**
 * The cheap shape of a calendar: counts, totals and the date span. Two calendars with a different
 * aggregate cannot have the same identity, so the candidate read compares THIS in SQL and loads
 * content only for the survivors (ADR-0208 D2; T1.6 measured 700 ms to load every lineage variant's
 * exceptions through the ORM at 50 variants of 300). The aggregate only ever rules a candidate OUT;
 * equality is still decided by {@link calendarIdentityKey}.
 */
export interface IdentityAggregate {
  readonly hoursPerDayMinutes: number;
  readonly shiftCount: number;
  readonly shiftMinutes: number;
  readonly exceptionCount: number;
  readonly windowCount: number;
  /** Earliest exception start, `YYYY-MM-DD`; null with no exceptions. */
  readonly firstDate: string | null;
  /** Latest exception end, `YYYY-MM-DD`; null with no exceptions. */
  readonly lastDate: string | null;
}

export function identityAggregate(input: CalendarIdentityInput): IdentityAggregate {
  const starts = input.exceptions.map((e) => day(e.startDate)).sort(compareText);
  const ends = input.exceptions.map((e) => day(e.endDate)).sort(compareText);
  return {
    hoursPerDayMinutes: input.hoursPerDayMinutes,
    shiftCount: input.shifts.length,
    shiftMinutes: input.shifts.reduce((sum, s) => sum + (s.endMinute - s.startMinute), 0),
    exceptionCount: input.exceptions.length,
    windowCount: input.exceptions.reduce((sum, e) => sum + e.windows.length, 0),
    firstDate: starts[0] ?? null,
    lastDate: ends[ends.length - 1] ?? null,
  };
}

export const sameAggregate = (a: IdentityAggregate, b: IdentityAggregate): boolean =>
  a.hoursPerDayMinutes === b.hoursPerDayMinutes &&
  a.shiftCount === b.shiftCount &&
  a.shiftMinutes === b.shiftMinutes &&
  a.exceptionCount === b.exceptionCount &&
  a.windowCount === b.windowCount &&
  a.firstDate === b.firstDate &&
  a.lastDate === b.lastDate;

/** Flat stored rows (one read per table) as the candidate content read returns them. */
export interface FlatCalendarRows {
  readonly shifts: readonly (IdentityShift & { readonly calendarId: string })[];
  readonly exceptions: readonly {
    readonly id: string;
    readonly calendarId: string;
    readonly startDate: Date;
    readonly endDate: Date;
    readonly label: string | null;
  }[];
  readonly windows: readonly (IdentityWindow & { readonly calendarExceptionId: string })[];
}

/**
 * The identity key of each calendar in `hoursById` from flat rows, grouped once. Every key goes
 * through {@link calendarIdentityKey}, so equality means exactly what it means for an ORM-shaped
 * calendar; only the grouping is new.
 */
export function identityKeysFromFlatRows(
  hoursById: ReadonlyMap<string, number>,
  rows: FlatCalendarRows,
): Map<string, string> {
  const windowsByException = new Map<string, IdentityWindow[]>();
  for (const w of rows.windows) {
    const list = windowsByException.get(w.calendarExceptionId) ?? [];
    list.push(w);
    windowsByException.set(w.calendarExceptionId, list);
  }
  const shiftsByCalendar = new Map<string, IdentityShift[]>();
  for (const s of rows.shifts) {
    const list = shiftsByCalendar.get(s.calendarId) ?? [];
    list.push(s);
    shiftsByCalendar.set(s.calendarId, list);
  }
  const exceptionsByCalendar = new Map<string, IdentityException[]>();
  for (const e of rows.exceptions) {
    const list = exceptionsByCalendar.get(e.calendarId) ?? [];
    list.push({
      startDate: e.startDate,
      endDate: e.endDate,
      label: e.label,
      windows: windowsByException.get(e.id) ?? [],
    });
    exceptionsByCalendar.set(e.calendarId, list);
  }
  const keys = new Map<string, string>();
  for (const [id, hoursPerDayMinutes] of hoursById) {
    keys.set(
      id,
      calendarIdentityKey({
        hoursPerDayMinutes,
        shifts: shiftsByCalendar.get(id) ?? [],
        exceptions: exceptionsByCalendar.get(id) ?? [],
      }),
    );
  }
  return keys;
}
