import type { CanonicalCalendarException, CanonicalShift, CanonicalWorkWeek } from './canonical.js';
import type { ReportFinding } from './report.js';

/**
 * Pure parser for Primavera P6's proprietary **`clndr_data`** work-pattern string (ADR-0050, Task 1.3).
 *
 * A P6 CALENDAR row carries its weekly working pattern and dated holidays/exceptions in a single
 * nested-parenthesis blob, e.g.
 *
 * ```
 * (0||CalendarData()(
 *   (0||DaysOfWeek()(
 *     (0||1()())                                         // day 1 (Sunday) — non-working
 *     (0||2()( (0||0(s|08:00|f|12:00)(s|13:00|f|17:00)) ))  // day 2 (Monday) — split shift
 *     …
 *   ))
 *   (0||Exceptions()(
 *     (0||d|44927()())                                   // holiday (no windows)
 *     (0||d|44928(s|08:00|f|12:00))                       // worked exception
 *   ))
 * ))
 * ```
 *
 * We parse a **pragmatic, documented subset** — the weekly work windows and the dated exceptions — which
 * is all the SchedulePoint calendar model (weekday shifts + dated exception windows, ADR-0036) can
 * express. Anything else P6 stores (hours-per-day/-week, calendar type/inheritance, resource-calendar
 * links) is **not imported and is reported**, never silently dropped. Days-of-week use P6's numbering
 * `1 = Sunday … 7 = Saturday`; exception dates are Excel/OLE serial day-numbers (base 1899-12-30).
 *
 * The parser is deliberately **tolerant + deterministic**: it never throws on a malformed blob — it
 * extracts what it can, records what it could not, and lets the adapter fall back to a sane default.
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

/** P6 day number (1 = Sunday … 7 = Saturday) → the canonical work-week key. */
const P6_DAY_TO_KEY: Readonly<Record<number, keyof CanonicalWorkWeek>> = {
  1: 'sunday',
  2: 'monday',
  3: 'tuesday',
  4: 'wednesday',
  5: 'thursday',
  6: 'friday',
  7: 'saturday',
};

/** The Excel/OLE serial-date epoch P6 counts exception dates from (1899-12-30). */
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;

/** Normalise a P6 `H:MM`/`HH:MM` clock token to a canonical `"HH:MM"`, or null if out of range. */
function normaliseClock(raw: string): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (match === null) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  // 24:00 is a valid exclusive end-of-day; minutes are 0–59; hours 0–24.
  if (hour < 0 || hour > 24 || minute < 0 || minute > 59) return null;
  if (hour === 24 && minute !== 0) return null;
  return `${String(hour).padStart(2, '0')}:${match[2]}`;
}

/**
 * Extract `s|HH:MM|f|HH:MM` shift windows from a slice of `clndr_data`, in source order.
 * Malformed or reversed windows are skipped and counted (returned in `skipped`).
 */
function extractShifts(slice: string): { shifts: CanonicalShift[]; skipped: number } {
  const shifts: CanonicalShift[] = [];
  let skipped = 0;
  const re = /s\|([^|)]+)\|f\|([^|)]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(slice)) !== null) {
    const start = normaliseClock(m[1] ?? '');
    const end = normaliseClock(m[2] ?? '');
    if (start === null || end === null || start >= end) {
      skipped += 1;
      continue;
    }
    shifts.push({ start, end });
  }
  return { shifts, skipped };
}

/** Convert an Excel/OLE serial day-number to a `YYYY-MM-DD` string (UTC arithmetic; pure, no clock). */
function serialToIsoDate(serial: number): string | null {
  if (!Number.isFinite(serial)) return null;
  const date = new Date(EXCEL_EPOCH_MS + Math.trunc(serial) * MS_PER_DAY);
  const year = date.getUTCFullYear();
  if (year < 1000 || year > 9999) return null;
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** The result of parsing one calendar's `clndr_data`. */
export interface ClndrDataParseResult {
  readonly workWeek: CanonicalWorkWeek;
  readonly exceptions: CanonicalCalendarException[];
  /** Whether any working window at all was recovered (drives the adapter's fallback decision). */
  readonly hasWorkingTime: boolean;
  /** Non-fatal notes (skipped windows, unparseable exception dates) for the report. */
  readonly findings: ReportFinding[];
}

/**
 * Parse a P6 `clndr_data` blob into a canonical work week + dated exceptions. Never throws: a blob it
 * cannot read at all yields an empty week (`hasWorkingTime === false`) and the adapter substitutes a
 * documented default. `calendarRef` is echoed into findings for traceability.
 */
export function parseClndrData(
  clndrData: string | undefined,
  calendarRef: string,
): ClndrDataParseResult {
  const workWeek = emptyWorkWeek();
  const exceptions: CanonicalCalendarException[] = [];
  const findings: ReportFinding[] = [];

  if (clndrData === undefined || clndrData.trim() === '') {
    return { workWeek, exceptions, hasWorkingTime: false, findings };
  }

  // Split the blob into a DaysOfWeek region and an Exceptions region by their marker labels. Either may
  // be absent; the substring bounds degrade gracefully (a missing marker → an empty region).
  const dowMarker = clndrData.indexOf('DaysOfWeek');
  const excMarker = clndrData.indexOf('Exceptions');
  const dowEnd = excMarker > dowMarker ? excMarker : clndrData.length;
  const dowRegion = dowMarker === -1 ? '' : clndrData.slice(dowMarker, dowEnd);
  const excRegion = excMarker === -1 ? '' : clndrData.slice(excMarker);

  // --- Weekly pattern -------------------------------------------------------------------------------
  // Locate each `(0||N()(` day header (N = 1..7) and slice to the next day header (or region end),
  // then harvest that day's shift windows. Order-based + deterministic.
  const dayHeader = /\(0\|\|([1-7])\(\)\(/g;
  const dayStarts: Array<{ day: number; index: number }> = [];
  let dm: RegExpExecArray | null;
  while ((dm = dayHeader.exec(dowRegion)) !== null) {
    dayStarts.push({ day: Number(dm[1]), index: dm.index });
  }
  let skippedWindows = 0;
  for (let i = 0; i < dayStarts.length; i += 1) {
    const here = dayStarts[i];
    if (here === undefined) continue;
    const next = dayStarts[i + 1];
    const slice = dowRegion.slice(here.index, next === undefined ? undefined : next.index);
    const { shifts, skipped } = extractShifts(slice);
    skippedWindows += skipped;
    const key = P6_DAY_TO_KEY[here.day];
    if (key !== undefined && shifts.length > 0) {
      // A day may legitimately appear once; if P6 repeats it, later windows append (still deterministic).
      workWeek[key] = [...workWeek[key], ...shifts];
    }
  }

  // --- Dated exceptions -----------------------------------------------------------------------------
  // Each exception is `(0||d|SERIAL … )`; slice from one `d|` to the next and harvest its windows.
  const excHeader = /d\|(\d+)/g;
  const excStarts: Array<{ serial: number; index: number }> = [];
  let em: RegExpExecArray | null;
  while ((em = excHeader.exec(excRegion)) !== null) {
    excStarts.push({ serial: Number(em[1]), index: em.index });
  }
  let unparseableDates = 0;
  for (let i = 0; i < excStarts.length; i += 1) {
    const here = excStarts[i];
    if (here === undefined) continue;
    const next = excStarts[i + 1];
    const slice = excRegion.slice(here.index, next === undefined ? undefined : next.index);
    const date = serialToIsoDate(here.serial);
    if (date === null) {
      unparseableDates += 1;
      continue;
    }
    const { shifts, skipped } = extractShifts(slice);
    skippedWindows += skipped;
    exceptions.push({ date, working: shifts.length > 0, shifts });
  }

  if (skippedWindows > 0) {
    findings.push({
      kind: 'approximation',
      entity: 'calendar',
      sourceRef: calendarRef,
      detail: `${skippedWindows} calendar work window(s) had an unreadable or reversed time and were skipped`,
      reason: 'malformed clndr_data time window (ADR-0050)',
    });
  }
  if (unparseableDates > 0) {
    findings.push({
      kind: 'drop',
      entity: 'calendar',
      sourceRef: calendarRef,
      detail: `${unparseableDates} calendar exception(s) had an unreadable date and were not imported`,
      reason: 'malformed clndr_data exception date (ADR-0050)',
    });
  }

  const hasWorkingTime =
    exceptions.some((e) => e.working) ||
    (Object.keys(workWeek) as Array<keyof CanonicalWorkWeek>).some((k) => workWeek[k].length > 0);

  return { workWeek, exceptions, hasWorkingTime, findings };
}

/**
 * A documented fallback week when a calendar's `clndr_data` is absent/unreadable: Monday–Friday, a
 * single shift from 08:00 for `hoursPerDay` hours (clamped to 1–24; default 8 ⇒ 08:00–16:00). Saturdays
 * and Sundays are non-working. The adapter reports the substitution so it is never silent.
 */
export function fallbackWorkWeek(hoursPerDay: number | undefined): CanonicalWorkWeek {
  const hours = Math.min(24, Math.max(1, Math.round(hoursPerDay ?? 8)));
  const endHour = Math.min(24, 8 + hours);
  const end = `${String(endHour).padStart(2, '0')}:00`;
  const shift: CanonicalShift = { start: '08:00', end };
  const week = emptyWorkWeek();
  week.monday = [shift];
  week.tuesday = [shift];
  week.wednesday = [shift];
  week.thursday = [shift];
  week.friday = [shift];
  return week;
}
