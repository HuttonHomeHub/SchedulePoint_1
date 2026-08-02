import { LAG_CALENDAR_SOURCES, type DependencyType, type LagCalendarSource } from '@repo/types';
import { z } from 'zod';

import { lagTextField } from '../model/lag-field';

import { SUB_DAY_DURATIONS_ENABLED } from '@/config/env';
import { formatDurationText } from '@/lib/duration-text';

/**
 * Human labels for the four dependency types (CPM/GPM tradition). Exhaustive
 * `Record<DependencyType, …>` so a new type fails to compile until labelled.
 */
export const DEPENDENCY_TYPE_LABELS: Record<DependencyType, string> = {
  FS: 'Finish → Start',
  SS: 'Start → Start',
  FF: 'Finish → Finish',
  SF: 'Start → Finish',
};

/** Dependency types, in order — derived from the labels so it stays exhaustive. */
export const DEPENDENCY_TYPES = Object.keys(DEPENDENCY_TYPE_LABELS) as [
  DependencyType,
  ...DependencyType[],
];

/**
 * Human labels for the lag-calendar sources (ADR-0036 §6). Exhaustive
 * `Record<LagCalendarSource, …>` so a new source fails to compile until labelled.
 * Today only **24-hour** behaves distinctly; Predecessor/Successor coincide with the
 * project calendar until per-activity calendars land (M5) — the editor says so.
 */
export const LAG_CALENDAR_LABELS: Record<LagCalendarSource, string> = {
  PROJECT_DEFAULT: 'Project calendar',
  TWENTY_FOUR_HOUR: '24-hour (elapsed)',
  PREDECESSOR: 'Predecessor calendar',
  SUCCESSOR: 'Successor calendar',
};

/** Lag-calendar sources in the shared canonical order (kept in step with `@repo/types`). */
export const LAG_CALENDAR_OPTIONS = LAG_CALENDAR_SOURCES;

/**
 * Display order for the lag-calendar `<select>` — the storage constant lists
 * `PROJECT_DEFAULT` last, but the default (and by far the most common) choice should
 * surface first, followed by the one behaviourally-distinct option (24-hour). Derived
 * from `LAG_CALENDAR_LABELS` so it stays exhaustive if a source is ever added.
 */
export const LAG_CALENDAR_DISPLAY_ORDER: readonly LagCalendarSource[] = [
  'PROJECT_DEFAULT',
  'TWENTY_FOUR_HOUR',
  'PREDECESSOR',
  'SUCCESSOR',
];

/**
 * The one lag-calendar hint, shared so the add and edit dialogs can never drift on
 * what the field means (mirrors why `formatLag`/`typeAndLagSchema` are centralised).
 */
export const LAG_CALENDAR_HINT =
  'Choose 24-hour (elapsed) for waits that run around the clock — a concrete cure of ' +
  '7 days is 7 calendar days, not 7 working days. Predecessor and Successor match the ' +
  'project calendar until per-activity calendars arrive.';

/**
 * Format a signed lag for display: `0d`, `+3d` (lag), `−2d` (lead, with a real minus sign).
 *
 * With the lag calendar's working-hours factor in hand it renders the **exact** stored value —
 * `+4h`, `−1d 30m` — and falls back to the day count without one (ADR-0070 M4). A whole-day lag
 * keeps the shape it has always had, so nothing churns on a plan with no sub-day logic in it; the
 * finer text appears only when the lag actually is finer, which is the case that previously read
 * back as `0d` and was indistinguishable from no lag at all.
 *
 * The minus is the typographic U+2212, not an ASCII hyphen: this is read-only display. The *field*
 * writes a hyphen, because a planner has to be able to retype what it shows.
 */
export function formatLag(
  dependency: { lagDays: number; lagMinutes: number },
  hoursPerDay?: number,
): string {
  const minutesPerDay = hoursPerDay === undefined ? 0 : Math.round(hoursPerDay * 60);
  if (
    SUB_DAY_DURATIONS_ENABLED &&
    hoursPerDay !== undefined &&
    minutesPerDay > 0 &&
    dependency.lagMinutes % minutesPerDay !== 0
  ) {
    const magnitude = formatDurationText(Math.abs(dependency.lagMinutes), hoursPerDay);
    return dependency.lagMinutes > 0 ? `+${magnitude}` : `−${magnitude}`;
  }
  // The whole-day branch prints the row's OWN `lagDays` rather than re-deriving it from minutes.
  // The server computed that on the relationship's lag calendar (ADR-0068 §4); re-dividing here
  // would round a sub-day lag UP whenever the exact branch is not taken — which is exactly what
  // happens flag-off, where a four-hour lag would have started reading as "+1d" on a path whose
  // whole job is to be byte-identical to what shipped. (Found by this epic's own parity test.)
  const { lagDays } = dependency;
  if (lagDays === 0) return '0d';
  return lagDays > 0 ? `+${String(lagDays)}d` : `−${String(Math.abs(lagDays))}d`;
}

/**
 * The mutable fields shared by add and edit — a dependency's type and signed lag. Single source of
 * truth so the two dialogs can't drift.
 *
 * `lag` is **text**, read by the `d`/`h`/`m` grammar (ADR-0070 §5): a bare number still means days,
 * so every value a planner has learnt to type keeps its meaning, and `-4h` becomes expressible for
 * the first time. The rule here is deliberately **syntax only** — the one calendar-dependent
 * question is answered at submit by `lagWriteFields`, where the lag calendar's working-hours factor
 * is in hand. See `model/lag-field.ts` for why that split exists.
 */
export const typeAndLagSchema = z.object({
  type: z.enum(DEPENDENCY_TYPES),
  lag: lagTextField(),
  lagCalendar: z.enum(LAG_CALENDAR_OPTIONS),
});

export type TypeAndLagValues = z.infer<typeof typeAndLagSchema>;

/** Which side of the new link the activity being edited sits on. */
export const LINK_DIRECTIONS = ['predecessor', 'successor'] as const;

export type LinkDirection = (typeof LINK_DIRECTIONS)[number];

/**
 * Human labels for the direction selector. `predecessor` means "the activity I choose comes
 * **before** this one" — the same reading as the Predecessors table above the form.
 */
export const LINK_DIRECTION_LABELS: Record<LinkDirection, string> = {
  predecessor: 'A predecessor — it comes before this activity',
  successor: 'A successor — this activity drives it',
};

/**
 * Add-dependency form schema. `otherActivityId` is the far endpoint chosen from the plan's
 * activities and `direction` decides which of the two is the predecessor — it was carried by
 * *which button you pressed* while adding opened a dialog, and is a field now that the form is
 * inline (ADR-0061's list/manage archetype).
 */
export const dependencyFormSchema = typeAndLagSchema.extend({
  otherActivityId: z.string().min(1, 'Choose an activity.'),
  direction: z.enum(LINK_DIRECTIONS),
});

export type DependencyFormValues = z.infer<typeof dependencyFormSchema>;
