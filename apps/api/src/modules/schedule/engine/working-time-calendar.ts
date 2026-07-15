import { formatCalendarDate, parseCalendarDate } from '../../../common/validation/calendar-date';

/**
 * The engine's **minute-granular** working-time calendar port (ADR-0036, the M1
 * rework of ADR-0023/ADR-0024). The CPM passes work in continuous integer
 * **working-minute** offsets from the data date; this port maps those offsets to
 * and from real instants, and converts a constraint's instant into an offset.
 *
 * It supersedes `WorkingDayCalendar` (working-**day** granularity): the unit
 * shrinks from a day to a minute, the weekly pattern becomes **intraday shift
 * windows**, and dated exceptions become **time-window ranges**. The arithmetic is
 * still closed-form **week-arithmetic + binary search over sorted exceptions** —
 * never a minute-by-minute (or day-by-day) loop — so a recalculation stays within
 * budget over multi-year spans (ADR-0036 §4, §5).
 *
 * Instants are `YYYY-MM-DDTHH:MM` local strings (no seconds, no timezone — the
 * fixture's site-local convention); a bare `YYYY-MM-DD` is read as `T00:00`.
 * Minutes are minutes-from-local-midnight in `[0, 1440]` (1440 = 24:00; a
 * midnight-crossing night shift is two adjacent-day windows, never a wrap).
 */
export interface WorkingTimeCalendar {
  /**
   * The instant `minutes` working-minutes from `from` (negative walks backward).
   * Zero returns `from` normalised. Inverse of {@link workingTimeBetween}:
   * `addWorkingTime(from, workingTimeBetween(from, to)) === to` for any working `to`.
   */
  addWorkingTime(from: string, minutes: number): string;

  /**
   * The signed number of working-minutes from `from` to `to` — how many
   * {@link addWorkingTime} steps carry `from` to `to`. Positive when `to` is later.
   */
  workingTimeBetween(from: string, to: string): number;
}

/** One `[startMinute, endMinute)` working window within a day; `0 ≤ start < end ≤ 1440`. */
export interface ShiftWindow {
  startMinute: number;
  endMinute: number;
}

/**
 * A dated override whose windows **replace** the weekly pattern across an inclusive
 * date range (ADR-0036 §2). Zero windows = a holiday / non-work block; a non-empty
 * list = worked overtime or a window-only working period.
 */
export interface TimeException {
  /** Inclusive `YYYY-MM-DD` range start. */
  startDate: string;
  /** Inclusive `YYYY-MM-DD` range end (`= startDate` for a single day). */
  endDate: string;
  windows: readonly ShiftWindow[];
}

/**
 * A weekly pattern: for each weekday (Monday = 0 … Sunday = 6) a list of working
 * windows. An empty list is a non-working weekday; an all-empty week is a valid
 * **window-only** calendar whose working time comes solely from positive exceptions.
 */
export type WeeklyPattern = readonly (readonly ShiftWindow[])[];

const MINUTES_PER_DAY = 1440;
/** Hard cap on the binary-search span: no calendar has working time this far out (ADR-0036 §5). */
const HORIZON_DAYS = 366 * 200; // ~200 years — the N11/N16 "no working time in horizon" backstop.

/** Minutes-from-epoch of a `YYYY-MM-DDTHH:MM` (or bare `YYYY-MM-DD`) instant. */
function toAbsMinutes(instant: string): number {
  const datePart = instant.slice(0, 10);
  const timePart = instant.length > 10 ? instant.slice(11) : '00:00';
  const dayMs = parseCalendarDate(datePart).getTime();
  const [h, m] = timePart.split(':');
  const minuteOfDay = Number(h) * 60 + Number(m);
  return Math.round(dayMs / 60000) + minuteOfDay;
}

/** `YYYY-MM-DDTHH:MM` for a minutes-from-epoch value (drops `T00:00` to a bare date). */
function fromAbsMinutes(abs: number): string {
  const dayIndex = Math.floor(abs / MINUTES_PER_DAY);
  const minuteOfDay = abs - dayIndex * MINUTES_PER_DAY;
  const date = formatCalendarDate(new Date(dayIndex * MINUTES_PER_DAY * 60000));
  if (minuteOfDay === 0) return date;
  const h = String(Math.floor(minuteOfDay / 60)).padStart(2, '0');
  const m = String(minuteOfDay % 60).padStart(2, '0');
  return `${date}T${h}:${m}`;
}

/** Weekday (Monday = 0 … Sunday = 6) of an epoch day index (epoch 1970-01-01 = Thursday = 3). */
function weekdayOfDay(dayIndex: number): number {
  return (((dayIndex + 3) % 7) + 7) % 7;
}

/** Working minutes of a set of windows clipped to `[lo, hi)` minutes-of-day. */
function windowMinutesClipped(windows: readonly ShiftWindow[], lo: number, hi: number): number {
  let total = 0;
  for (const w of windows) {
    const start = Math.max(w.startMinute, lo);
    const end = Math.min(w.endMinute, hi);
    if (end > start) total += end - start;
  }
  return total;
}

/**
 * Build a minute-granular working-time calendar from a weekly shift pattern and a
 * list of time-window exceptions (ADR-0036 §2, §4). The maths is week arithmetic +
 * binary search over sorted exceptions, never a per-minute scan.
 *
 * Throws if the calendar has **no working time within the horizon** (an all-empty
 * week with no positive exception) — the minute-granular replacement for the old
 * "mask must be non-zero" guard and the N11 hang test (ADR-0036 §5).
 */
export function buildWorkingTimeCalendar(
  weekly: WeeklyPattern,
  exceptions: readonly TimeException[],
): WorkingTimeCalendar {
  if (weekly.length !== 7) throw new Error('A weekly pattern must have exactly 7 weekdays.');
  validateWindows(weekly);

  const weekdayMinutes = weekly.map((wins) =>
    wins.reduce((s, w) => s + (w.endMinute - w.startMinute), 0),
  );
  const minutesPerWeek = weekdayMinutes.reduce((s, m) => s + m, 0);

  // Exceptions sorted by start date, as epoch day-index ranges, for binary-search range queries.
  const sorted = [...exceptions]
    .map((e) => {
      validateWindows([e.windows]);
      return {
        startDay: Math.floor(toAbsMinutes(e.startDate) / MINUTES_PER_DAY),
        endDay: Math.floor(toAbsMinutes(e.endDate) / MINUTES_PER_DAY),
        windows: e.windows,
        minutes: e.windows.reduce((s, w) => s + (w.endMinute - w.startMinute), 0),
      };
    })
    .sort((a, b) => a.startDay - b.startDay);

  const hasPositiveException = sorted.some((e) => e.minutes > 0);
  if (minutesPerWeek === 0 && !hasPositiveException) {
    throw new Error('A working-time calendar must have at least one working minute.');
  }

  // Per-exception full adjustment (exception minutes − the weekday pattern's minutes, summed over
  // the exception's whole day range) and a prefix sum of those. Because active exception ranges are
  // NON-OVERLAPPING (the DB `ex_calendar_exceptions_no_overlap` EXCLUDE guarantees it), `startDay`
  // and `endDay` are both monotonic in `sorted`, so a whole-day-span adjustment is an O(log E) range
  // query (two binary searches + a prefix diff, boundary exceptions clipped) instead of a scan over
  // every exception on the plan span — the ADR-0036 §5 "never a per-exception loop" contract. The
  // one-time build cost is O(total exception days), which the single-day API shape keeps at O(E).
  const excCumDelta = new Array<number>(sorted.length + 1);
  excCumDelta[0] = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    const e = sorted[i]!;
    let full = 0;
    for (let d = e.startDay; d <= e.endDay; d += 1) {
      full += e.minutes - weekdayMinutes[weekdayOfDay(d)]!;
    }
    excCumDelta[i + 1] = excCumDelta[i]! + full;
  }

  /** The effective windows for a given epoch day: the covering exception's, else the weekday pattern. */
  const windowsForDay = (dayIndex: number): readonly ShiftWindow[] => {
    // Binary search the last exception whose startDay ≤ dayIndex. Ranges are non-overlapping among
    // active rows, so that single candidate is the ONLY one that can cover the day — no back-scan.
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sorted[mid]!.startDay <= dayIndex) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) {
      const e = sorted[lo - 1]!;
      if (e.startDay <= dayIndex && dayIndex <= e.endDay) return e.windows;
    }
    return weekly[weekdayOfDay(dayIndex)]!;
  };

  /** Working minutes of one epoch day clipped to `[lo, hi)` minutes-of-day. */
  const dayWorkingMinutes = (dayIndex: number, lo = 0, hi = MINUTES_PER_DAY): number =>
    windowMinutesClipped(windowsForDay(dayIndex), lo, hi);

  /** Working minutes in the half-open absolute range `[fromAbs, toAbs)` (fromAbs ≤ toAbs). */
  const countWorking = (fromAbs: number, toAbs: number): number => {
    if (toAbs <= fromAbs) return 0;
    const firstDay = Math.floor(fromAbs / MINUTES_PER_DAY);
    const lastDay = Math.floor((toAbs - 1) / MINUTES_PER_DAY);

    // Single partial day.
    if (firstDay === lastDay) {
      return dayWorkingMinutes(
        firstDay,
        fromAbs - firstDay * MINUTES_PER_DAY,
        toAbs - firstDay * MINUTES_PER_DAY,
      );
    }

    // Leading + trailing partial days.
    let total = dayWorkingMinutes(firstDay, fromAbs - firstDay * MINUTES_PER_DAY, MINUTES_PER_DAY);
    total += dayWorkingMinutes(lastDay, 0, toAbs - lastDay * MINUTES_PER_DAY);

    // Whole days strictly between firstDay and lastDay via week arithmetic.
    const wholeStart = firstDay + 1;
    const wholeEnd = lastDay; // exclusive
    const wholeCount = wholeEnd - wholeStart;
    if (wholeCount > 0) {
      const fullWeeks = Math.floor(wholeCount / 7);
      total += fullWeeks * minutesPerWeek;
      const remainderStart = wholeStart + fullWeeks * 7;
      for (let d = remainderStart; d < wholeEnd; d += 1) total += weekdayMinutes[weekdayOfDay(d)]!;
      // Exception adjustment over the whole-day span: replace pattern minutes with exception minutes.
      total += exceptionAdjustment(wholeStart, wholeEnd);
    }
    return total;
  };

  /** Clipped (exception − weekday-pattern) minutes of one exception over the whole-day span `[startDay, endDay)`. */
  const clippedExceptionDelta = (
    e: (typeof sorted)[number],
    startDay: number,
    endDay: number,
  ): number => {
    let delta = 0;
    const last = Math.min(e.endDay, endDay - 1);
    for (let d = Math.max(e.startDay, startDay); d <= last; d += 1) {
      delta += e.minutes - weekdayMinutes[weekdayOfDay(d)]!;
    }
    return delta;
  };

  /**
   * Net (exception − weekday-pattern) whole-day minutes over epoch-day span `[startDay, endDay)`,
   * in **O(log E)**: binary-search the exception index range that overlaps the span, sum the fully
   * contained interior exceptions with the prefix sum, and clip only the (at most two) boundary
   * exceptions by hand. Interior exceptions are guaranteed fully contained because active ranges are
   * non-overlapping and sorted (only the first/last overlapping range can straddle a span edge).
   */
  const exceptionAdjustment = (startDay: number, endDay: number): number => {
    if (endDay <= startDay || sorted.length === 0) return 0;
    // i0 = first exception reaching into the span (endDay ≥ startDay); i1 = first past it (startDay ≥ endDay).
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sorted[mid]!.endDay < startDay) lo = mid + 1;
      else hi = mid;
    }
    const i0 = lo;
    lo = 0;
    hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sorted[mid]!.startDay < endDay) lo = mid + 1;
      else hi = mid;
    }
    const i1 = lo;
    if (i0 >= i1) return 0;
    if (i0 === i1 - 1) return clippedExceptionDelta(sorted[i0]!, startDay, endDay);
    // Interior [i0+1, i1-1) is fully contained → O(1) prefix diff; the two ends are clipped.
    return (
      excCumDelta[i1 - 1]! -
      excCumDelta[i0 + 1]! +
      clippedExceptionDelta(sorted[i0]!, startDay, endDay) +
      clippedExceptionDelta(sorted[i1 - 1]!, startDay, endDay)
    );
  };

  return {
    workingTimeBetween(from: string, to: string): number {
      const a = toAbsMinutes(from);
      const b = toAbsMinutes(to);
      if (a === b) return 0;
      return a < b ? countWorking(a, b) : -countWorking(b, a);
    },

    addWorkingTime(from: string, minutes: number): string {
      const fromAbs = toAbsMinutes(from);
      if (minutes === 0) return fromAbsMinutes(fromAbs);
      const weekSpan = 7 * MINUTES_PER_DAY;
      const seed = (Math.ceil(Math.abs(minutes) / Math.max(1, minutesPerWeek || 1)) + 2) * weekSpan;
      if (minutes > 0) {
        // Smallest instant `t` with countWorking(fromAbs, t) ≥ minutes. Monotonic in `t`.
        let lo = fromAbs + 1;
        let hi = fromAbs + seed;
        let guard = 0;
        while (countWorking(fromAbs, hi) < minutes) {
          hi += weekSpan * (1 + guard);
          if (++guard > HORIZON_DAYS / 7) {
            throw new Error(
              'addWorkingTime exceeded the working-time horizon (no reachable minute).',
            );
          }
        }
        while (lo < hi) {
          const mid = lo + Math.floor((hi - lo) / 2);
          if (countWorking(fromAbs, mid) >= minutes) hi = mid;
          else lo = mid + 1;
        }
        return fromAbsMinutes(lo);
      }
      // Largest instant `t` with countWorking(t, fromAbs) ≥ need — the need-th working minute back.
      const need = -minutes;
      let hi = fromAbs - 1;
      let lo = fromAbs - seed;
      let guard = 0;
      while (countWorking(lo, fromAbs) < need) {
        lo -= weekSpan * (1 + guard);
        if (++guard > HORIZON_DAYS / 7) {
          throw new Error(
            'addWorkingTime exceeded the working-time horizon (no reachable minute).',
          );
        }
      }
      while (lo < hi) {
        const mid = lo + Math.ceil((hi - lo) / 2);
        if (countWorking(mid, fromAbs) >= need) lo = mid;
        else hi = mid - 1;
      }
      return fromAbsMinutes(lo);
    },
  };
}

/** The trivial calendar where every minute is a working minute (24 h, 7 days) — the null-calendar path. */
export const allMinutesWorkCalendar: WorkingTimeCalendar = buildWorkingTimeCalendar(
  Array.from({ length: 7 }, () => [{ startMinute: 0, endMinute: MINUTES_PER_DAY }]),
  [],
);

/** Validate that every window is in-bounds, ordered, and non-overlapping within its day. */
function validateWindows(days: readonly (readonly ShiftWindow[])[]): void {
  for (const wins of days) {
    let prevEnd = -1;
    for (const w of wins) {
      if (w.startMinute < 0 || w.endMinute > MINUTES_PER_DAY) {
        throw new Error(`Shift window out of [0,1440] bounds: ${w.startMinute}–${w.endMinute}.`);
      }
      if (w.startMinute >= w.endMinute) {
        throw new Error(`Shift window must have start < end: ${w.startMinute}–${w.endMinute}.`);
      }
      if (w.startMinute < prevEnd) {
        throw new Error('Shift windows within a day must be sorted and non-overlapping.');
      }
      prevEnd = w.endMinute;
    }
  }
}

/** Monday–Friday, 24 h/day — the minute-granular analogue of `STANDARD_WEEKDAYS` for tests/migration. */
export function fullDayWeek(workingWeekdays: readonly number[]): WeeklyPattern {
  const set = new Set(workingWeekdays);
  return Array.from({ length: 7 }, (_, w) =>
    set.has(w) ? [{ startMinute: 0, endMinute: MINUTES_PER_DAY }] : [],
  );
}
