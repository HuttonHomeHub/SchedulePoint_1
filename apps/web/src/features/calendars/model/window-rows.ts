import type { CalendarWindow } from '@repo/types';

import { formatTimeOfDay, parseTimeOfDay, TIME_PARSE_MESSAGE } from './time-of-day';
import { findWindowProblems, type WindowProblem } from './window-rules';

/**
 * One row as the planner is typing it. **Text, not minutes** — a half-typed `8:` must not destroy
 * the value, and a field that silently rewrites what you typed as you type is worse than one that
 * waits. Text is the single source of truth in the editor; minutes are derived at the boundary.
 */
export interface TimeRow {
  start: string;
  end: string;
}

/** A day's stored windows as editable rows. */
export function windowsToRows(windows: readonly CalendarWindow[]): TimeRow[] {
  return windows.map((window) => ({
    start: formatTimeOfDay(window.startMinute),
    end: formatTimeOfDay(window.endMinute),
  }));
}

/** A day's rows, parsed — either every row is a window, or the reasons they are not. */
export type RowsResult =
  { ok: true; windows: CalendarWindow[] } | { ok: false; problems: WindowProblem[] };

/**
 * Parse a day's rows and apply the ordering rules in one pass.
 *
 * Parse failures short-circuit the set rules: there is no useful "these overlap" to say about a
 * row reading `8am`, and reporting both at once would have the planner fixing an overlap that may
 * not exist once the row parses.
 */
export function rowsToWindows(rows: readonly TimeRow[]): RowsResult {
  const problems: WindowProblem[] = [];
  const windows: CalendarWindow[] = [];

  rows.forEach((row, index) => {
    const start = parseTimeOfDay(row.start);
    const end = parseTimeOfDay(row.end);
    if (!start.ok) {
      problems.push({ index, message: TIME_PARSE_MESSAGE[start.reason] });
      return;
    }
    if (!end.ok) {
      problems.push({ index, message: TIME_PARSE_MESSAGE[end.reason] });
      return;
    }
    windows.push({ startMinute: start.minutes, endMinute: end.minutes });
  });

  if (problems.length > 0) return { ok: false, problems };

  const ordering = findWindowProblems(windows);
  return ordering.length > 0 ? { ok: false, problems: ordering } : { ok: true, windows };
}

/** A new row, seeded with the working day most planners start from. */
export function blankRow(): TimeRow {
  return { start: '08:00', end: '17:00' };
}

/**
 * The two rows a midnight-crossing shift really is (spec Q0/ADR-0067 §4).
 *
 * 20:00–06:00 is `20:00–24:00` on the chosen day plus `00:00–06:00` on the next — the editor
 * writes BOTH and shows them, because that is what storage holds and nothing pairs them back
 * together on read. Returned as a pair so the caller can place each on its own weekday.
 */
export function splitAcrossMidnight(
  start: string,
  end: string,
): { today: TimeRow; nextDay: TimeRow } {
  return { today: { start, end: '24:00' }, nextDay: { start: '00:00', end } };
}
