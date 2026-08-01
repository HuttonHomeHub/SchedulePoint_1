import { MINUTES_PER_CALENDAR_DAY } from '@repo/types';
import type { CalendarExceptionSummary, CalendarWindow } from '@repo/types';

import { rowsToWindows, windowsToRows, type TimeRow } from './window-rows';
import type { WindowProblem } from './window-rules';

/**
 * What a dated exception does to its day, as a planner chooses it (ADR-0067 §3).
 *
 * Three options rather than the storage's two-valued `isWorking`, because "works" splits into two
 * genuinely different answers: the whole day works, or these specific hours do. The stored form of
 * the first is one `[0, 1440)` window — so `allDay` and `hours` are the same shape underneath, and
 * the distinction exists only so the common case does not make a planner type `00:00`–`24:00`.
 */
export type ExceptionKind = 'holiday' | 'allDay' | 'hours';

/** The visible option labels, in the order they are offered. */
export const EXCEPTION_KIND_LABELS: Record<ExceptionKind, string> = {
  holiday: 'Holiday (non-working)',
  allDay: 'Working day',
  hours: 'Working — specific hours',
};

/** Shown when "specific hours" is chosen and no period was added — see {@link toExceptionHours}. */
export const EMPTY_HOURS_MESSAGE = 'Add the hours this day works, or choose Holiday.';

function isFullDay(windows: readonly CalendarWindow[]): boolean {
  const only = windows.length === 1 ? windows[0] : undefined;
  return only?.startMinute === 0 && only.endMinute === MINUTES_PER_CALENDAR_DAY;
}

/**
 * Which option a stored exception is, so opening one to edit shows the choice it was saved as.
 *
 * A single full-day window reads back as `allDay`, which is the round trip of what the shorthand
 * writes. That is deliberate rather than incidental: were it to read back as `hours`, every worked
 * Saturday would open showing `00:00`–`24:00` in two text fields, and a planner pressing Save
 * without touching them would be re-authoring a value they never chose.
 */
export function exceptionKindOf(
  exception: Pick<CalendarExceptionSummary, 'isWorking' | 'windows'>,
): ExceptionKind {
  if (!exception.isWorking) return 'holiday';
  return isFullDay(exception.windows) ? 'allDay' : 'hours';
}

/** A stored exception's hours as editable rows — empty unless it carries specific hours. */
export function exceptionRowsOf(
  exception: Pick<CalendarExceptionSummary, 'isWorking' | 'windows'>,
): TimeRow[] {
  return exceptionKindOf(exception) === 'hours' ? windowsToRows(exception.windows) : [];
}

/**
 * Either the chosen hours in the spelling the API accepts, or why not.
 *
 * `problems` are row-keyed and land on the offending fields; `message` is the whole-field case,
 * which has no row to land on — the two are separate because a message keyed to row 0 of an empty
 * list would render nowhere at all.
 */
export type ExceptionHoursResult =
  | { ok: true; hours: { windows: CalendarWindow[] } | { isWorking: boolean } }
  | { ok: false; problems: WindowProblem[]; message?: string };

/**
 * Turn the planner's choice into a request body's hours.
 *
 * `holiday`/`allDay` send the `isWorking` shorthand rather than an equivalent window set, so the
 * wire says what was chosen. `hours` parses the rows through the same rules the weekly pattern
 * uses, and refuses an empty list: an exception that overrides a day with nothing is a holiday,
 * and the API rejects an empty `windows` array for exactly that reason.
 */
export function toExceptionHours(
  kind: ExceptionKind,
  rows: readonly TimeRow[],
): ExceptionHoursResult {
  if (kind !== 'hours') return { ok: true, hours: { isWorking: kind === 'allDay' } };
  if (rows.length === 0) return { ok: false, problems: [], message: EMPTY_HOURS_MESSAGE };
  const result = rowsToWindows(rows);
  return result.ok ? { ok: true, hours: { windows: result.windows } } : result;
}
