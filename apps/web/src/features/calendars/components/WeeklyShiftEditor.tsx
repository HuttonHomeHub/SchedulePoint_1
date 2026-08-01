import type { CalendarShift } from '@repo/types';
import { ChevronDown, Copy } from 'lucide-react';

import { WEEKDAY_LONG_LABELS } from '../schemas/calendar-schemas';

import { useAnnounce } from '@/components/ui/announcer';
import { FormSection } from '@/components/ui/form-layout';
import { Menu, MenuItem, useMenuTrigger } from '@/components/ui/menu';
import { WindowListEditor } from '@/components/ui/window-list-editor';
import { COPY_TARGET_GROUPS, copyDay } from '@/features/calendars/model/copy-day';
import { presetWeek, WEEK_PRESETS } from '@/features/calendars/model/presets';
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

/** A day's rows read aloud — "08:00–17:00", "06:00–14:00 and 14:00–22:00", or "no hours". */
function describeRows(rows: readonly TimeRow[]): string {
  if (rows.length === 0) return 'no hours';
  const periods = rows.map((row) => `${row.start}–${row.end}`);
  const last = periods.pop()!;
  return periods.length === 0 ? last : `${periods.join(', ')} and ${last}`;
}

/**
 * The preset menu for the whole week. A preset is a verb: it replaces every day and then has no
 * further existence (`model/presets.ts`), so there is no selected state to show here.
 */
function PresetMenu({ onApply }: { onApply: (id: (typeof WEEK_PRESETS)[number]['id']) => void }) {
  const { triggerRef, open, anchor, toggle, close } = useMenuTrigger();
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        className="border-input hover:bg-accent focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
      >
        Start from a preset
        <ChevronDown aria-hidden className="size-4" />
      </button>
      <Menu
        open={open}
        onClose={close}
        anchor={anchor}
        label="Working-week presets"
        restoreFocusRef={triggerRef}
      >
        {WEEK_PRESETS.map((preset) => (
          <MenuItem key={preset.id} onSelect={() => onApply(preset.id)}>
            {preset.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

/** One day's "Copy hours to…" menu. Each target replaces those days and is announced. */
function CopyDayMenu({
  dayLabel,
  onCopy,
}: {
  dayLabel: string;
  onCopy: (targetId: string) => void;
}) {
  const { triggerRef, open, anchor, toggle, close } = useMenuTrigger();
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        className="text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:outline-none"
      >
        <Copy aria-hidden className="size-3.5" />
        Copy {dayLabel} to…
      </button>
      <Menu
        open={open}
        onClose={close}
        anchor={anchor}
        label={`Copy ${dayLabel} hours to`}
        restoreFocusRef={triggerRef}
      >
        {COPY_TARGET_GROUPS.map((group) => (
          <MenuItem key={group.id} onSelect={() => onCopy(group.id)}>
            Copy to {group.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
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
  const announce = useAnnounce();

  const applyPreset = (id: (typeof WEEK_PRESETS)[number]['id']): void => {
    const preset = WEEK_PRESETS.find((candidate) => candidate.id === id);
    onChange(presetWeek(id));
    // Announced rather than left to the eye: a preset rewrites all seven days at once, and the
    // days it emptied are exactly the ones that no longer draw anything to notice.
    announce(`Working week set to ${preset?.summary ?? 'the chosen preset'}`);
  };

  const applyCopy = (source: number, targetId: string): void => {
    const group = COPY_TARGET_GROUPS.find((candidate) => candidate.id === targetId);
    if (group === undefined) return;
    const targets = group.weekdays(source);
    onChange(copyDay(week, source, targets));
    // Names the days it OVERWROTE, because that is the half a planner cannot see afterwards.
    announce(
      `${WEEKDAY_LONG_LABELS[source]} hours — ${describeRows(week[source] ?? [])} — copied to ${targets
        .map((weekday) => WEEKDAY_LONG_LABELS[weekday])
        .join(', ')}, replacing what those days held`,
    );
  };

  return (
    <FormSection
      title="Working week"
      description="The hours each day works. A day with no periods doesn’t work at all. A shift running past midnight is two periods on two days — 20:00–24:00, then 00:00–06:00 the next day."
    >
      <div className="flex flex-col gap-4">
        {readOnly ? null : (
          <div className="flex justify-start">
            <PresetMenu onApply={applyPreset} />
          </div>
        )}
        {WEEKDAY_LONG_LABELS.map((label, weekday) => (
          <div key={label} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-medium">{label}</h4>
              {readOnly ? null : (
                <CopyDayMenu dayLabel={label} onCopy={(targetId) => applyCopy(weekday, targetId)} />
              )}
            </div>
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
