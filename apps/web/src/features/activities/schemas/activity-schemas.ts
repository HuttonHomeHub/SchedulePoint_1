import {
  PARKED_CONSTRAINT_TYPES,
  SELECTABLE_CONSTRAINT_TYPES,
  type ActivityStatus,
  type ActivityType,
  type ConstraintType,
} from '@repo/types';
import { z } from 'zod';

// The constraint labels live in the shared lib so the form, the table, and the TSLD
// canvas read constraints in one voice; re-exported here for existing form importers.
export { CONSTRAINT_TYPE_LABELS } from '@/lib/constraint-format';

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

/**
 * Every constraint kind the form's Zod schema accepts — the six honoured
 * ({@link SELECTABLE_CONSTRAINT_TYPES}) plus the two parked `MANDATORY_*`, so a
 * legacy/imported parked value round-trips unchanged through an edit. The **selector**
 * offers only the honoured six (plus an honest one-off option for a present parked
 * value); this fuller set is just the validation allow-list.
 */
export const CONSTRAINT_TYPES = [...SELECTABLE_CONSTRAINT_TYPES, ...PARKED_CONSTRAINT_TYPES] as [
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

/**
 * Activity PROGRESS form schema — for the Contributor-capable progress editor.
 * `percentComplete` is a number (registered with `valueAsNumber`); the actual
 * dates are raw `<input type="date">` values (`''` = unset). Cross-field rules
 * mirror the API: you cannot finish before you start, or finish without starting.
 */
export const progressFormSchema = z
  .object({
    percentComplete: z
      .number({ message: 'Enter a percentage from 0 to 100.' })
      .int('Enter a whole percentage.')
      .min(0, 'Percentage cannot be negative.')
      .max(100, 'Percentage cannot exceed 100.'),
    actualStart: z.string().optional(),
    actualFinish: z.string().optional(),
  })
  .refine((v) => !v.actualFinish || Boolean(v.actualStart), {
    message: 'Set an actual start before a finish.',
    path: ['actualFinish'],
  })
  .refine((v) => !v.actualStart || !v.actualFinish || v.actualFinish >= v.actualStart, {
    message: 'Finish cannot be before the start.',
    path: ['actualFinish'],
  });

export type ProgressFormValues = z.infer<typeof progressFormSchema>;

/**
 * Preview the status the API will derive from progress (kept in step with the
 * server's `deriveStatus`): a finish (or 100%) → Complete, a start (or any %) →
 * In progress, else Not started. Used to show the resulting status live in the
 * editor; the server remains the source of truth.
 */
export function deriveStatusLabel(values: ProgressFormValues): string {
  if (values.actualFinish || values.percentComplete >= 100) return ACTIVITY_STATUS_LABELS.COMPLETE;
  if (values.actualStart || values.percentComplete > 0) return ACTIVITY_STATUS_LABELS.IN_PROGRESS;
  return ACTIVITY_STATUS_LABELS.NOT_STARTED;
}
