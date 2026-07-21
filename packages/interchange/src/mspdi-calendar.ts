import type { CanonicalCalendarException, CanonicalShift, CanonicalWorkWeek } from './canonical.js';
import { childElements, childText, type MspdiElement } from './mspdi-parser.js';
import type { ReportFinding } from './report.js';

/**
 * Pure parser for a Microsoft Project MSPDI **`<Calendar>`** element's work pattern (ADR-0050, Task 3.3).
 *
 * An MSPDI calendar carries its weekly working pattern and dated exceptions as `<WeekDays><WeekDay>`
 * children:
 *
 * ```xml
 * <Calendar>
 *   <UID>1</UID><Name>Standard</Name>
 *   <WeekDays>
 *     <WeekDay><DayType>1</DayType><DayWorking>0</DayWorking></WeekDay>            <!-- Sunday off -->
 *     <WeekDay><DayType>2</DayType><DayWorking>1</DayWorking>                      <!-- Monday -->
 *       <WorkingTimes>
 *         <WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime>
 *         <WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime>
 *       </WorkingTimes>
 *     </WeekDay>
 *     …
 *     <WeekDay><DayType>0</DayType><DayWorking>0</DayWorking>                      <!-- an exception -->
 *       <TimePeriod><FromDate>2026-01-01T00:00:00</FromDate><ToDate>2026-01-01T23:59:00</ToDate></TimePeriod>
 *     </WeekDay>
 *   </WeekDays>
 * </Calendar>
 * ```
 *
 * We map a **documented subset** — the weekly work windows and the dated exceptions — which is all the
 * SchedulePoint calendar model (weekday shifts + dated exception windows, ADR-0036) can express. `DayType`
 * uses MS Project's numbering `1 = Sunday … 7 = Saturday` (the same as P6); `DayType 0` marks an exception
 * WeekDay carrying a `<TimePeriod>`. Anything else (base-calendar inheritance, recurrence rules,
 * hours-per-day metadata) is **not imported and is reported**, never silently dropped.
 *
 * The parser is deliberately **tolerant + deterministic**: it never throws — it extracts what it can and
 * records what it could not, letting the adapter fall back to a documented default when nothing was read.
 */

/** An empty work week (all seven days non-working). Mutated per-day by the parser. */
function emptyWorkWeek(): CanonicalWorkWeek {
  return {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  };
}

/** MSP `DayType` (1 = Sunday … 7 = Saturday) → the canonical work-week key. */
const MSP_DAY_TO_KEY: Readonly<Record<number, keyof CanonicalWorkWeek>> = {
  1: 'sunday',
  2: 'monday',
  3: 'tuesday',
  4: 'wednesday',
  5: 'thursday',
  6: 'friday',
  7: 'saturday',
};

/** Cap on how many days a single `<TimePeriod>` exception range is expanded to (a hostile-range bound). */
const MAX_EXCEPTION_RANGE_DAYS = 750;
/**
 * Cap on the **total** dated exceptions a single calendar may accumulate across all its `<WeekDay>`
 * blocks. `expandDateRange` already bounds one range, but a hostile file can pack many maximal ranges
 * (or many exception WeekDays) into the upload, amplifying a small payload into millions of exception
 * objects. This ceiling is enforced *before* the array grows, failing closed (truncate + report) exactly
 * like the per-range bound, so the read-only dry-run stays memory-bounded regardless of input.
 */
const MAX_CALENDAR_EXCEPTIONS = 20_000;
const MS_PER_DAY = 86_400_000;

/**
 * Normalise an MSP `HH:MM:SS` (or `HH:MM`) clock token to a canonical `"HH:MM"`, or null if out of range.
 * A `"00:00"` end-of-window is treated as the exclusive end-of-day `"24:00"` by the caller.
 */
function normaliseClock(raw: string): string | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(raw.trim());
  if (match === null) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 24 || minute < 0 || minute > 59) return null;
  if (hour === 24 && minute !== 0) return null;
  return `${String(hour).padStart(2, '0')}:${match[2]}`;
}

/** The `YYYY-MM-DD` prefix of an MSP datetime (`"2026-01-05T08:00:00"` → `"2026-01-05"`), or null. */
function isoDatePrefix(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
  return match === null ? null : `${match[1]}-${match[2]}-${match[3]}`;
}

/**
 * Extract the `<FromTime>`/`<ToTime>` windows of a WeekDay (via its `<WorkingTimes><WorkingTime>` list),
 * in source order. A `ToTime` of `00:00` becomes the exclusive end-of-day `24:00`; malformed or reversed
 * windows are skipped and counted.
 */
function extractShifts(weekDay: MspdiElement): { shifts: CanonicalShift[]; skipped: number } {
  const shifts: CanonicalShift[] = [];
  let skipped = 0;
  for (const workingTimes of childElements(weekDay, 'WorkingTimes')) {
    for (const workingTime of childElements(workingTimes, 'WorkingTime')) {
      const fromRaw = childText(workingTime, 'FromTime');
      const toRaw = childText(workingTime, 'ToTime');
      if (fromRaw === undefined || toRaw === undefined) {
        skipped += 1;
        continue;
      }
      const start = normaliseClock(fromRaw);
      let end = normaliseClock(toRaw);
      // MSP writes a window that runs to the end of the day as `…–00:00`; treat that as `24:00`.
      if (end === '00:00' && start !== null && start !== '00:00') end = '24:00';
      if (start === null || end === null || start >= end) {
        skipped += 1;
        continue;
      }
      shifts.push({ start, end });
    }
  }
  return { shifts, skipped };
}

/** Every `YYYY-MM-DD` date in the inclusive `[from, to]` range, bounded; pure UTC arithmetic (no clock). */
function expandDateRange(from: string, to: string): { dates: string[]; truncated: boolean } {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return { dates: [from], truncated: false };
  }
  const dates: string[] = [];
  let truncated = false;
  for (let ms = start; ms <= end; ms += MS_PER_DAY) {
    if (dates.length >= MAX_EXCEPTION_RANGE_DAYS) {
      truncated = true;
      break;
    }
    const date = new Date(ms);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${day}`);
  }
  return { dates, truncated };
}

/** The result of parsing one calendar's `<WeekDays>`. */
export interface MspdiCalendarParseResult {
  readonly workWeek: CanonicalWorkWeek;
  readonly exceptions: CanonicalCalendarException[];
  /** Whether any working window at all was recovered (drives the adapter's fallback decision). */
  readonly hasWorkingTime: boolean;
  /** Non-fatal notes (skipped windows, unparseable / truncated exception ranges) for the report. */
  readonly findings: ReportFinding[];
}

/**
 * Parse an MSPDI `<Calendar>` element into a canonical work week + dated exceptions. Never throws: a
 * calendar with no readable working time yields an empty week (`hasWorkingTime === false`) and the adapter
 * substitutes a documented default. `calendarRef` is echoed into findings for traceability.
 */
export function parseMspdiCalendar(
  calendar: MspdiElement,
  calendarRef: string,
): MspdiCalendarParseResult {
  const workWeek = emptyWorkWeek();
  const exceptions: CanonicalCalendarException[] = [];
  const findings: ReportFinding[] = [];
  let skippedWindows = 0;
  let truncatedRanges = 0;
  let exceptionsCapped = false;

  for (const weekDaysContainer of childElements(calendar, 'WeekDays')) {
    for (const weekDay of childElements(weekDaysContainer, 'WeekDay')) {
      const dayType = Number(childText(weekDay, 'DayType'));
      const working = childText(weekDay, 'DayWorking') === '1';
      const timePeriods = childElements(weekDay, 'TimePeriod');

      // An exception WeekDay (DayType 0, or one carrying a <TimePeriod>) → dated exception(s).
      if (dayType === 0 || timePeriods.length > 0) {
        const period = timePeriods[0];
        const from = isoDatePrefix(
          period === undefined ? undefined : childText(period, 'FromDate'),
        );
        if (from === null) continue; // an exception with no readable date is not expressible.
        const to =
          isoDatePrefix(period === undefined ? undefined : childText(period, 'ToDate')) ?? from;
        const { shifts, skipped } = extractShifts(weekDay);
        skippedWindows += skipped;
        const { dates, truncated } = expandDateRange(from, to);
        if (truncated) truncatedRanges += 1;
        for (const date of dates) {
          // Fail closed on the total ceiling before growing the array — a hostile file can pack many
          // maximal ranges, so bound the whole calendar, not just each range.
          if (exceptions.length >= MAX_CALENDAR_EXCEPTIONS) {
            exceptionsCapped = true;
            break;
          }
          exceptions.push({ date, working: working && shifts.length > 0, shifts });
        }
        if (exceptionsCapped) break;
        continue;
      }

      // A base-week day (DayType 1..7).
      const key = MSP_DAY_TO_KEY[dayType];
      if (key === undefined || !working) continue;
      const { shifts, skipped } = extractShifts(weekDay);
      skippedWindows += skipped;
      if (shifts.length > 0) workWeek[key] = [...workWeek[key], ...shifts];
    }
    if (exceptionsCapped) break;
  }

  if (exceptionsCapped) {
    findings.push({
      kind: 'drop',
      entity: 'calendar',
      sourceRef: calendarRef,
      detail: `calendar exceptions were capped at ${MAX_CALENDAR_EXCEPTIONS}; further dated exceptions were dropped`,
      reason: 'the calendar exceeds the supported number of dated exceptions (ADR-0050)',
    });
  }
  if (skippedWindows > 0) {
    findings.push({
      kind: 'approximation',
      entity: 'calendar',
      sourceRef: calendarRef,
      detail: `${skippedWindows} calendar work window(s) had an unreadable or reversed time and were skipped`,
      reason: 'malformed MSPDI working-time window (ADR-0050)',
    });
  }
  if (truncatedRanges > 0) {
    findings.push({
      kind: 'drop',
      entity: 'calendar',
      sourceRef: calendarRef,
      detail: `${truncatedRanges} calendar exception range(s) longer than ${MAX_EXCEPTION_RANGE_DAYS} days were truncated`,
      reason: 'an exception range exceeds the supported length (ADR-0050)',
    });
  }

  const hasWorkingTime =
    exceptions.some((exception) => exception.working) ||
    (Object.keys(workWeek) as Array<keyof CanonicalWorkWeek>).some(
      (day) => workWeek[day].length > 0,
    );

  return { workWeek, exceptions, hasWorkingTime, findings };
}
