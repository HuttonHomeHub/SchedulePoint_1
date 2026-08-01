import type { CalendarShift } from '@repo/types';

import { WEEKDAY_LONG_LABELS } from '../schemas/calendar-schemas';

import { FormSection } from '@/components/ui/form-layout';
import { WindowListEditor } from '@/components/ui/window-list-editor';
import { rowsToWindows, windowsToRows, type TimeRow } from '@/features/calendars/model/window-rows';
import type { WindowProblem } from '@/features/calendars/model/window-rules';

/** The week as editable text rows — index 0 = Monday … 6 = Sunday, matching storage. */
export type WeekRows = TimeRow[][];

/** Seven empty days: the starting point for a calendar with no stored shifts. */
export function emptyWeek(): WeekRows {
  return Array.from({ length: 7 }, () => []);
}

/** A calendar's stored shifts as a week of editable rows, in weekday order. */
export function shiftsToWeekRows(shifts: readonly CalendarShift[]): WeekRows {
  const week = emptyWeek();
  const byDay = new Map<number, { startMinute: number; endMinute: number }[]>();
  for (const shift of shifts) {
    byDay.set(shift.weekday, [
      ...(byDay.get(shift.weekday) ?? []),
      { startMinute: shift.startMinute, endMinute: shift.endMinute },
    ]);
  }
  for (const [weekday, windows] of byDay) {
    // Sorted for display only. Storage order is the author's and is validated, not corrected —
    // but a calendar loaded from the API has already passed that validation, so this cannot
    // reorder anything a planner would recognise as wrong.
    week[weekday] = windowsToRows([...windows].sort((a, b) => a.startMinute - b.startMinute));
  }
  return week;
}

/** A day's problems, tagged with the weekday so the form can report which day failed. */
export interface WeekProblem extends WindowProblem {
  weekday: number;
}

/** Either the whole week as storable shifts, or every problem across it. */
export type WeekResult =
  { ok: true; shifts: CalendarShift[] } | { ok: false; problems: WeekProblem[] };

/**
 * Parse the whole week. Reports **every** day's problems rather than stopping at the first: a
 * planner correcting Monday should not have to press Save again to discover Thursday.
 */
export function weekRowsToShifts(week: WeekRows): WeekResult {
  const shifts: CalendarShift[] = [];
  const problems: WeekProblem[] = [];

  week.forEach((rows, weekday) => {
    const result = rowsToWindows(rows);
    if (!result.ok) {
      problems.push(...result.problems.map((problem) => ({ ...problem, weekday })));
      return;
    }
    shifts.push(...result.windows.map((window) => ({ weekday, ...window })));
  });

  return problems.length > 0 ? { ok: false, problems } : { ok: true, shifts };
}

/**
 * The weekly working pattern, as the hours each day actually works (ADR-0036 §2, ADR-0067).
 *
 * Seven `WindowListEditor`s — the same primitive the dated-exception editor uses. A day with no
 * periods is non-working, which is what the seven checkboxes this replaces could express; a day
 * with two is a split shift, which they could not.
 *
 * A **night shift crossing midnight is two rows on two days** (20:00–24:00 on one, 00:00–06:00 on
 * the next). The editor says so in the section description rather than inferring it on read, which
 * would be indistinguishable from a genuine 24-hour calendar.
 */
export function WeeklyShiftEditor({
  week,
  onChange,
  problems = [],
  readOnly = false,
}: {
  week: WeekRows;
  onChange: (week: WeekRows) => void;
  problems?: readonly WeekProblem[];
  readOnly?: boolean;
}): React.ReactElement {
  return (
    <FormSection
      title="Working week"
      description="The hours each day works. A day with no periods doesn’t work at all. A shift running past midnight is two periods on two days — 20:00–24:00, then 00:00–06:00 the next day."
    >
      <div className="flex flex-col gap-4">
        {WEEKDAY_LONG_LABELS.map((label, weekday) => (
          <div key={label} className="flex flex-col gap-1.5">
            <h4 className="text-sm font-medium">{label}</h4>
            <WindowListEditor
              legend={`${label} hours`}
              rows={week[weekday] ?? []}
              readOnly={readOnly}
              problems={problems.filter((problem) => problem.weekday === weekday)}
              onChange={(rows) =>
                onChange(week.map((day, index) => (index === weekday ? rows : day)))
              }
            />
          </div>
        ))}
      </div>
    </FormSection>
  );
}
