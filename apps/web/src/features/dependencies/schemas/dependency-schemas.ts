import { LAG_CALENDAR_SOURCES, type DependencyType, type LagCalendarSource } from '@repo/types';
import { z } from 'zod';

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
 * Format a signed working-day lag for display: `0d`, `+3d` (lag), `−2d` (lead,
 * with a real minus sign). Kept tiny and pure so tables and dialogs agree.
 */
export function formatLag(lagDays: number): string {
  if (lagDays === 0) return '0d';
  return lagDays > 0 ? `+${lagDays}d` : `−${Math.abs(lagDays)}d`;
}

/**
 * The mutable fields shared by add and edit — a dependency's type and signed lag
 * (registered with `valueAsNumber`). Single source of truth for the bounds so the
 * two dialogs can't drift.
 */
export const typeAndLagSchema = z.object({
  type: z.enum(DEPENDENCY_TYPES),
  lagDays: z
    .number({ message: 'Enter a whole number of days.' })
    .int('Enter a whole number of days.')
    .min(-3650, 'Lag is too large.')
    .max(3650, 'Lag is too large.'),
  lagCalendar: z.enum(LAG_CALENDAR_OPTIONS),
});

export type TypeAndLagValues = z.infer<typeof typeAndLagSchema>;

/**
 * Add-dependency form schema. `otherActivityId` is the far endpoint chosen from
 * the plan's activities; the predecessor/successor roles are decided by which
 * direction the dialog is opened in, not by the form.
 */
export const dependencyFormSchema = typeAndLagSchema.extend({
  otherActivityId: z.string().min(1, 'Choose an activity.'),
});

export type DependencyFormValues = z.infer<typeof dependencyFormSchema>;
