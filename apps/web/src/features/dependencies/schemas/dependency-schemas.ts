import { LAG_CALENDAR_SOURCES, type DependencyType, type LagCalendarSource } from '@repo/types';
import { z } from 'zod';

import { lagTextField } from '../model/lag-field';

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
 * Format a signed working-day lag for display: `0d`, `+3d` (lag), `−2d` (lead,
 * with a real minus sign). Kept tiny and pure so tables and dialogs agree.
 */
export function formatLag(lagDays: number): string {
  if (lagDays === 0) return '0d';
  return lagDays > 0 ? `+${lagDays}d` : `−${Math.abs(lagDays)}d`;
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
