import type { ActivityStatus, ActivityType, ConstraintType } from '@repo/types';
import { z } from 'zod';

/**
 * Human labels for the activity type. Exhaustive `Record<ActivityType, …>` so a
 * new type fails to compile until a label is added.
 */
export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  TASK: 'Task',
  START_MILESTONE: 'Start milestone',
  FINISH_MILESTONE: 'Finish milestone',
  HAMMOCK: 'Hammock',
  LEVEL_OF_EFFORT: 'Level of effort',
};

export const ACTIVITY_TYPES = Object.keys(ACTIVITY_TYPE_LABELS) as [
  ActivityType,
  ...ActivityType[],
];

/** Types with no duration (a point in time) — duration is always 0, matching the API. */
export const MILESTONE_TYPES: readonly ActivityType[] = ['START_MILESTONE', 'FINISH_MILESTONE'];

export function isMilestoneType(type: ActivityType): boolean {
  return MILESTONE_TYPES.includes(type);
}

/** Human labels for schedule constraints (with the planning-tool shorthand). */
export const CONSTRAINT_TYPE_LABELS: Record<ConstraintType, string> = {
  SNET: 'Start no earlier than',
  SNLT: 'Start no later than',
  FNET: 'Finish no earlier than',
  FNLT: 'Finish no later than',
  MSO: 'Must start on',
  MFO: 'Must finish on',
  MANDATORY_START: 'Mandatory start',
  MANDATORY_FINISH: 'Mandatory finish',
};

export const CONSTRAINT_TYPES = Object.keys(CONSTRAINT_TYPE_LABELS) as [
  ConstraintType,
  ...ConstraintType[],
];

/** Human labels for progress status (derived server-side from the numbers). */
export const ACTIVITY_STATUS_LABELS: Record<ActivityStatus, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  COMPLETE: 'Complete',
};

/**
 * Activity DEFINITION create/edit form schema — mirrors the API's DTO (progress
 * fields live in a separate editor). `constraintType` is `''` for "none";
 * `constraintDate` / `code` are raw `<input>` values. Cross-field rules: a
 * constraint needs a type and a date together (the API enforces this too).
 * `durationDays` is a number; the dialog forces it to 0 for milestone types.
 */
export const activityFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required.').max(200, 'Name is too long.'),
    code: z.string().trim().max(32, 'Code is too long.').optional(),
    type: z.enum(ACTIVITY_TYPES),
    // Registered with `valueAsNumber`, so this is a number (NaN for an empty
    // field, which `.int()` rejects with the message below).
    durationDays: z
      .number({ message: 'Enter a whole number of days.' })
      .int('Enter a whole number of days.')
      .min(0, 'Duration cannot be negative.')
      .max(100000, 'Duration is too large.'),
    constraintType: z.union([z.enum(CONSTRAINT_TYPES), z.literal('')]).optional(),
    constraintDate: z.string().optional(),
    description: z.string().trim().max(2000, 'Description is too long.').optional(),
  })
  // Only the type→date direction needs a rule: the dialog hides the date field
  // until a type is chosen, so a "date without a type" is unreachable, and the
  // request builder drops any stale date once the type is cleared.
  .refine((v) => !v.constraintType || Boolean(v.constraintDate), {
    message: 'Choose a date for this constraint.',
    path: ['constraintDate'],
  });

export type ActivityFormValues = z.infer<typeof activityFormSchema>;
