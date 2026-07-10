import { formatCalendarDate, parseCalendarDate } from '../../../common/validation/calendar-date';

const MILLIS_PER_DAY = 86_400_000;

/**
 * The engine's seam onto the working-day calendar (ADR-0023). The CPM passes
 * work in continuous working-day **offsets** from the data date; this port maps
 * those offsets to and from real calendar days, and converts a constraint's
 * calendar date into an offset. Keeping the surface to just add/between means the
 * M5 Calendars slice can supply a real calendar (weekends, holidays, per-activity
 * calendars) with **no change to the engine**.
 *
 * All dates are strict `YYYY-MM-DD` calendar days (no time, no timezone).
 */
export interface WorkingDayCalendar {
  /**
   * The calendar day `n` working days from `date` (negative `n` walks backward).
   * Zero returns `date`. Inverse of {@link workingDaysBetween}:
   * `addWorkingDays(from, workingDaysBetween(from, to)) === to`.
   */
  addWorkingDays(date: string, n: number): string;

  /**
   * The signed number of working days from `from` to `to` — how many
   * {@link addWorkingDays} steps carry `from` to `to`. Positive when `to` is
   * later, negative when earlier, zero when equal.
   */
  workingDaysBetween(from: string, to: string): number;
}

/**
 * The trivial calendar where **every calendar day is a working day**, so a
 * working-day offset maps 1:1 onto a calendar-day offset. This is the MVP
 * implementation (M6); the real M5 calendar replaces it behind the same port
 * without touching the engine.
 */
export const allDaysWorkCalendar: WorkingDayCalendar = {
  addWorkingDays(date: string, n: number): string {
    const d = parseCalendarDate(date);
    d.setUTCDate(d.getUTCDate() + n);
    return formatCalendarDate(d);
  },

  workingDaysBetween(from: string, to: string): number {
    const millis = parseCalendarDate(to).getTime() - parseCalendarDate(from).getTime();
    return Math.round(millis / MILLIS_PER_DAY);
  },
};

/** All seven weekday bits set — a calendar that works every day (`allDaysWorkCalendar`). */
export const ALL_WEEKDAYS = 0b1111111;
/** Monday–Friday (bit 0 = Monday … bit 6 = Sunday). The seeded "Standard" pattern. */
export const STANDARD_WEEKDAYS = 0b0011111;

/**
 * A dated override of a day's default working status (M5). `isWorking: false` is a
 * holiday (a normally-working weekday made non-working); `isWorking: true` is a
 * working exception (a normally-non-working day, e.g. a worked Saturday, made
 * working). `date` is a strict `YYYY-MM-DD` calendar day.
 */
export interface CalendarException {
  date: string;
  isWorking: boolean;
}

/** Whole days between two `YYYY-MM-DD` days (UTC, exact — dates have no DST). */
function daysBetween(from: string, to: string): number {
  return Math.round(
    (parseCalendarDate(to).getTime() - parseCalendarDate(from).getTime()) / MILLIS_PER_DAY,
  );
}

/** Add `n` whole days to a `YYYY-MM-DD` day. */
function addDays(date: string, n: number): string {
  const d = parseCalendarDate(date);
  d.setUTCDate(d.getUTCDate() + n);
  return formatCalendarDate(d);
}

/** Weekday with Monday = 0 … Sunday = 6 (JS `getUTCDay` is Sunday = 0). */
function weekdayMonday0(date: string): number {
  return (parseCalendarDate(date).getUTCDay() + 6) % 7;
}

/**
 * Build a real working-day calendar (ADR-0024) from a **weekly pattern** and a
 * **sorted** list of dated exceptions, honouring the same `WorkingDayCalendar`
 * port the CPM engine already consumes (ADR-0023 §5) — so the engine's pass code
 * is unchanged.
 *
 * `workingWeekdays` is a 7-bit mask (bit `w` set ⇒ weekday `w` is worked, Monday =
 * bit 0). It must be non-zero (a pattern with no working weekday would make
 * `addWorkingDays` non-terminating — mirrored by the `working_weekdays > 0` DB
 * CHECK), otherwise this throws.
 *
 * The maths is **O(1) week arithmetic + O(log H)** binary search over the sorted
 * exceptions — never a day-by-day scan — so a recalculation stays within the M6
 * performance budget even over multi-year spans. `addWorkingDays` is defined as a
 * monotonic binary search over the single trusted counting primitive
 * (`countWorkingDays`), which keeps the off-by-one surface to one place.
 */
export function buildWorkingDayCalendar(
  workingWeekdays: number,
  exceptions: readonly CalendarException[],
): WorkingDayCalendar {
  const mask = workingWeekdays & ALL_WEEKDAYS;
  if (mask === 0) {
    throw new Error('A working-day calendar must have at least one working weekday.');
  }

  // Exceptions sorted by date for range (binary-search) queries. Defensive sort:
  // the caller passes DB-sorted rows, but a local copy costs O(H) once and removes
  // an ordering assumption.
  const sorted = [...exceptions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const isWorkingWeekday = (date: string): boolean => ((mask >> weekdayMonday0(date)) & 1) === 1;

  // Working WEEKDAYS (ignoring exceptions) in the half-open day range [start, end).
  const workingWeekdaysInRange = (start: string, end: string): number => {
    const total = daysBetween(start, end);
    if (total <= 0) return 0;
    const firstWeekday = weekdayMonday0(start);
    let count = 0;
    for (let w = 0; w < 7; w += 1) {
      if (((mask >> w) & 1) === 0) continue;
      const offset = (w - firstWeekday + 7) % 7;
      if (offset < total) count += Math.floor((total - offset - 1) / 7) + 1;
    }
    return count;
  };

  // Net exception adjustment over [start, end): each exception flips its day's
  // default, so it contributes (actual − weekday-default) ∈ {−1, 0, +1}.
  const exceptionAdjustmentInRange = (start: string, end: string): number => {
    let delta = 0;
    for (let i = lowerBound(sorted, start); i < sorted.length && sorted[i]!.date < end; i += 1) {
      const exception = sorted[i]!;
      const actual = exception.isWorking ? 1 : 0;
      const weekdayDefault = isWorkingWeekday(exception.date) ? 1 : 0;
      delta += actual - weekdayDefault;
    }
    return delta;
  };

  // Working days in the half-open range [start, end) (start ≤ end); the core primitive.
  const countWorkingDays = (start: string, end: string): number =>
    workingWeekdaysInRange(start, end) + exceptionAdjustmentInRange(start, end);

  return {
    workingDaysBetween(from: string, to: string): number {
      if (to === from) return 0;
      // Signed working-day steps: `+` counts working days in (from, to];
      // `−` counts working days in [to, from). Inverse of addWorkingDays.
      return to > from
        ? countWorkingDays(addDays(from, 1), addDays(to, 1))
        : -countWorkingDays(to, from);
    },

    addWorkingDays(date: string, n: number): string {
      if (n === 0) return date;
      if (n > 0) {
        // The n-th working day strictly after `date`: the smallest `to` with
        // `workingDaysBetween(date, to) ≥ n`. workingDaysBetween is monotonic in
        // `to`, so binary-search it. `mask > 0` bounds the search: within
        // k working weeks there are ≥ k working weekdays, so a span of
        // (n + |exceptions| + 2) weeks is guaranteed to contain ≥ n working days.
        let lo = addDays(date, 1);
        let hi = addDays(date, (n + sorted.length + 2) * 7);
        while (lo < hi) {
          const mid = addDays(lo, Math.floor(daysBetween(lo, hi) / 2));
          if (countWorkingDays(addDays(date, 1), addDays(mid, 1)) >= n) hi = mid;
          else lo = addDays(mid, 1);
        }
        return lo;
      }
      // The |n|-th working day strictly before `date`: the largest `to` with
      // `workingDaysBetween(date, to) ≤ n`, i.e. countWorkingDays([to, date)) ≥ |n|.
      const need = -n;
      let lo = addDays(date, -(need + sorted.length + 2) * 7);
      let hi = addDays(date, -1);
      while (lo < hi) {
        // Upper-mid so the search converges toward the largest qualifying date.
        const mid = addDays(lo, Math.ceil(daysBetween(lo, hi) / 2));
        if (countWorkingDays(mid, date) >= need) lo = mid;
        else hi = addDays(mid, -1);
      }
      return lo;
    },
  };
}

/** First index `i` in the sorted exception array with `arr[i].date >= date`. */
function lowerBound(arr: readonly CalendarException[], date: string): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid]!.date < date) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
