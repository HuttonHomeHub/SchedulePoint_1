import type { TimeRow } from './window-rows';

/** A week of editable rows — index 0 = Monday … 6 = Sunday, matching storage (ADR-0036 §2). */
export type PresetWeek = TimeRow[][];

/** The preset identifiers. Deliberately local to the editor: see {@link WEEK_PRESETS}. */
export type WeekPresetId = 'standard' | 'two-shift' | 'continental-days' | 'always' | 'window-only';

/**
 * A named starting week.
 *
 * **A preset is a verb, not a noun.** Choosing one writes windows and then has no further
 * existence: nothing persists the id, no DTO carries it, and a hand-edited day is not "a modified
 * Standard week" — a calendar simply *is* its windows. Storing the id would let the two disagree,
 * and the row a planner edited would be the one the label was lying about.
 *
 * Every label carries its hours, because a preset whose hours are invisible is a guess.
 */
export interface WeekPreset {
  id: WeekPresetId;
  /** The full menu label, hours included — what a planner reads before committing to a week. */
  label: string;
  /** One line naming what the week does, announced after it is applied. */
  summary: string;
  /** The rows it writes, Monday-first. Seven entries, always — an absent day is a non-working day. */
  week: PresetWeek;
}

/** A week from a per-weekday lookup; days not named work no hours at all. */
function weekOf(byWeekday: Readonly<Record<number, readonly TimeRow[]>>): PresetWeek {
  return Array.from({ length: 7 }, (_, weekday) => [...(byWeekday[weekday] ?? [])]);
}

/** The same hours on the given weekdays (0 = Monday). */
function sameHours(weekdays: readonly number[], ...rows: readonly TimeRow[]): PresetWeek {
  return weekOf(Object.fromEntries(weekdays.map((weekday) => [weekday, rows])));
}

const MON_TO_FRI = [0, 1, 2, 3, 4];
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

/**
 * The presets offered in the Working-week section, in menu order.
 *
 * **`continental-days` is the day half of a continental rota, and is named so.** A true continental
 * pattern rotates crews across a multi-week cycle; a weekly shift table cannot express a cycle
 * longer than seven days, so a preset called plainly "Continental" would promise something the
 * storage model has no way to hold. What it does write — twelve-hour days, every day — is the
 * calendar a planner scheduling *work* on a continental site actually needs, since the rota decides
 * which crew, not which hours the site is open.
 */
export const WEEK_PRESETS: readonly WeekPreset[] = [
  {
    id: 'standard',
    label: 'Standard week — Mon–Fri, 08:00–17:00',
    summary: 'Monday to Friday, 08:00 to 17:00.',
    week: sameHours(MON_TO_FRI, { start: '08:00', end: '17:00' }),
  },
  {
    id: 'two-shift',
    label: 'Two shift — Mon–Fri, 06:00–14:00 and 14:00–22:00',
    summary: 'Monday to Friday, two shifts: 06:00 to 14:00 and 14:00 to 22:00.',
    week: sameHours(MON_TO_FRI, { start: '06:00', end: '14:00' }, { start: '14:00', end: '22:00' }),
  },
  {
    id: 'continental-days',
    label: 'Continental days — every day, 06:00–18:00',
    summary: 'Every day, 06:00 to 18:00.',
    week: sameHours(EVERY_DAY, { start: '06:00', end: '18:00' }),
  },
  {
    id: 'always',
    label: '24/7 — every day, all day',
    summary: 'Every day, all day.',
    week: sameHours(EVERY_DAY, { start: '00:00', end: '24:00' }),
  },
  {
    id: 'window-only',
    label: 'Window-only — no working week',
    summary:
      'No working week. Only dated exceptions work — the shape for a shutdown or a turnaround.',
    week: weekOf({}),
  },
];

/** The rows a preset writes. Returns a fresh week each call, so the caller can mutate it freely. */
export function presetWeek(id: WeekPresetId): PresetWeek {
  const preset = WEEK_PRESETS.find((candidate) => candidate.id === id);
  // Unreachable through the menu, which is built from the same list; an unknown id is an empty
  // week rather than a throw, because losing the dialog is worse than losing one click.
  if (preset === undefined) return weekOf({});
  return preset.week.map((rows) => rows.map((row) => ({ ...row })));
}
