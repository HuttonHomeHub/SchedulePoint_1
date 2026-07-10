import type { DependencyType } from '@repo/types';
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
 * Format a signed working-day lag for display: `0d`, `+3d` (lag), `−2d` (lead,
 * with a real minus sign). Kept tiny and pure so tables and dialogs agree.
 */
export function formatLag(lagDays: number): string {
  if (lagDays === 0) return '0d';
  return lagDays > 0 ? `+${lagDays}d` : `−${Math.abs(lagDays)}d`;
}

/**
 * Add/edit dependency form schema — mirrors the API DTO. `otherActivityId` is the
 * far endpoint chosen from the plan's activities; `lagDays` is a signed integer
 * (registered with `valueAsNumber`). The predecessor/successor roles are decided
 * by which direction the dialog is opened in, not by the form.
 */
export const dependencyFormSchema = z.object({
  otherActivityId: z.string().min(1, 'Choose an activity.'),
  type: z.enum(DEPENDENCY_TYPES),
  lagDays: z
    .number({ message: 'Enter a whole number of days.' })
    .int('Enter a whole number of days.')
    .min(-3650, 'Lag is too large.')
    .max(3650, 'Lag is too large.'),
});

export type DependencyFormValues = z.infer<typeof dependencyFormSchema>;
