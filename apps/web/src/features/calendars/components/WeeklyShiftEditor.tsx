import type { CalendarShift } from '@repo/types';
import { ChevronDown, Copy, Moon } from 'lucide-react';

import { WEEKDAY_LONG_LABELS } from '../schemas/calendar-schemas';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { FormSection } from '@/components/ui/form-layout';
import { Menu, MenuItem, useMenuTrigger } from '@/components/ui/menu';
import { WindowListEditor } from '@/components/ui/window-list-editor';
import { COPY_TARGET_GROUPS, copyDay } from '@/features/calendars/model/copy-day';
import { presetWeek, WEEK_PRESETS } from '@/features/calendars/model/presets';
import {
  rowsToWindows,
  splitAcrossMidnight,
  windowsToRows,
  type TimeRow,
} from '@/features/calendars/model/window-rows';
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
 *
 * The trigger is the shared `Button`, not a hand-rolled one. The first cut re-declared the outline
 * recipe by hand and silently dropped `text-foreground` from it — the exact omission that made a
 * variant's ink vanish on a dark surface once already (ADR-0055 D3), reintroduced by copying the
 * classes rather than the component.
 */
function PresetMenu({ onApply }: { onApply: (id: (typeof WEEK_PRESETS)[number]['id']) => void }) {
  const { triggerRef, open, anchor, toggle, close } = useMenuTrigger();
  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        size="sm"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        className="gap-1.5"
      >
        Start from a preset
        <ChevronDown aria-hidden className="size-4" />
      </Button>
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

/**
 * "Add a night shift" — the assisted entry for a period running past midnight.
 *
 * Storage measures minutes from local midnight and 1440 is 24:00, never a wrap (ADR-0036 §3), so
 * 20:00–06:00 **is** two windows on two adjacent days. The editor writes both and shows both,
 * rather than inferring the pair on read: a genuine 24-hour day and a night shift would look
 * identical to any such inference, and the planner would have no way to tell which they had.
 *
 * The instruction sentence in the section description is not a substitute — it told a planner how
 * to do this arithmetic themselves, which is what `splitAcrossMidnight` exists to avoid, and it
 * left that helper with no callers at all.
 */
function AddNightShift({ dayLabel, onAdd }: { dayLabel: string; onAdd: () => void }) {
  return (
    <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={onAdd}>
      <Moon aria-hidden className="size-4" />
      Night shift from {dayLabel}
    </Button>
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
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="sm"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        className="gap-1.5"
      >
        <Copy aria-hidden className="size-4" />
        Copy {dayLabel} to…
      </Button>
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

  /** Write both halves of a night shift — this day's evening and the next day's morning. */
  const addNightShift = (source: number): void => {
    const { today, nextDay } = splitAcrossMidnight('20:00', '06:00');
    const next = (source + 1) % 7;
    onChange(
      week.map((day, index) => {
        if (index === source) return [...day, today];
        if (index === next) return [...day, nextDay];
        return day;
      }),
    );
    // BOTH rows named. This is the one place a planner could believe something else was stored.
    announce(
      `Night shift added: ${WEEKDAY_LONG_LABELS[source]} ${today.start}–${today.end}, and ` +
        `${WEEKDAY_LONG_LABELS[next]} ${nextDay.start}–${nextDay.end}. Adjust either period to suit.`,
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
                <div className="flex items-center gap-1">
                  <AddNightShift dayLabel={label} onAdd={() => addNightShift(weekday)} />
                  <CopyDayMenu
                    dayLabel={label}
                    onCopy={(targetId) => applyCopy(weekday, targetId)}
                  />
                </div>
              )}
            </div>
            <WindowListEditor
              legend={`${label} hours`}
              rows={week[weekday] ?? []}
              readOnly={readOnly}
              // Stated, not just implied by absent buttons: a reader otherwise sees a list of
              // times where an editor was, with nothing saying whether it is shut or broken.
              {...(readOnly
                ? { readOnlyReason: 'You don’t have permission to change this calendar’s hours.' }
                : {})}
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
