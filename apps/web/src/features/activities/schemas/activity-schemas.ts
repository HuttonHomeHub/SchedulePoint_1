import {
  DURATION_TYPES,
  PARKED_CONSTRAINT_TYPES,
  PERCENT_COMPLETE_TYPES,
  SELECTABLE_CONSTRAINT_TYPES,
  type ActivityStatus,
  type ActivityType,
  type ConstraintType,
  type DurationType,
  type PercentCompleteType,
} from '@repo/types';
import { z } from 'zod';

import { moneyMajorAmount } from '@/lib/money-schema';

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
  WBS_SUMMARY: 'WBS summary',
  RESOURCE_DEPENDENT: 'Resource-dependent',
};

export const ACTIVITY_TYPES = Object.keys(ACTIVITY_TYPE_LABELS) as [
  ActivityType,
  ...ActivityType[],
];

/**
 * The activity-calendar picker's "inherit" option label (ADR-0037): the empty `Select` value maps
 * to a null `calendarId`, i.e. the activity schedules on the plan's default calendar. Used by the
 * form's calendar Select (the table shows a bare em dash for the inherit case, matching its other
 * "nothing to show" columns).
 */
export const INHERIT_CALENDAR_LABEL = 'Plan default (inherit)';

/** Types with no duration (a point in time) — duration is always 0, matching the API. */
export const MILESTONE_TYPES: readonly ActivityType[] = ['START_MILESTONE', 'FINISH_MILESTONE'];

export function isMilestoneType(type: ActivityType): boolean {
  return MILESTONE_TYPES.includes(type);
}

/**
 * Types whose duration is NOT a user-entered number: milestones (a point in time, always 0),
 * **Level of Effort** (the engine derives its span from its SS/FF ties, ADR-0035 §21) and
 * **WBS summary** (dates roll up from the branch it heads, ADR-0035 §24). The form hides the
 * Duration and Expected-finish fields for these, and the request builder stores duration 0.
 */
export function isDurationDerivedType(type: ActivityType): boolean {
  return isMilestoneType(type) || type === 'LEVEL_OF_EFFORT' || type === 'WBS_SUMMARY';
}

/**
 * Human labels for the P6 duration type (M7 rung 4, ADR-0040). Exhaustive
 * `Record<DurationType, …>` so a new type fails to compile until a label is added. The default
 * (`FIXED_DURATION_AND_UNITS_TIME`) is named in the picker's help text, keeping the labels the bare
 * P6 terms (the `&` mirrors P6/ADR-0040 naming, unlike the other label maps).
 */
export const DURATION_TYPE_LABELS: Record<DurationType, string> = {
  FIXED_DURATION_AND_UNITS_TIME: 'Fixed duration & units/time',
  FIXED_DURATION_AND_UNITS: 'Fixed duration & units',
  FIXED_UNITS: 'Fixed units',
  FIXED_UNITS_TIME: 'Fixed units/time',
};

/**
 * Human labels + one-line descriptions for the **%-complete type** (EV4b, ADR-0042) — the measure
 * that earns an activity's value in the Earned-Value read. Exhaustive `Record<PercentCompleteType, …>`
 * so a new measure fails to compile until it is described. The default (`DURATION`) is
 * behaviour-preserving — today's schedule %-complete already drives it. This selects the EV
 * performance measure ONLY; it never changes a CPM date.
 */
export const PERCENT_COMPLETE_TYPE_LABELS: Record<
  PercentCompleteType,
  { label: string; description: string }
> = {
  DURATION: {
    label: 'Duration',
    description: 'Earns value from elapsed vs total working time (the schedule %-complete).',
  },
  UNITS: {
    label: 'Units',
    description: 'Earns value from actual vs budgeted work (actual units ÷ budgeted units).',
  },
  PHYSICAL: {
    label: 'Physical',
    description: 'Earns value from a hand-entered physical %-complete, independent of dates.',
  },
};

/** %-complete types, in order — derived from the labels so it stays exhaustive. */
export const PERCENT_COMPLETE_TYPE_OPTIONS = Object.keys(PERCENT_COMPLETE_TYPE_LABELS) as [
  PercentCompleteType,
  ...PercentCompleteType[],
];

/** The activity types the form's Type picker always offers — the three with full engine support. */
export const BASE_ACTIVITY_TYPES: readonly ActivityType[] = [
  'TASK',
  'START_MILESTONE',
  'FINISH_MILESTONE',
];

/**
 * Advanced activity types offered only when `VITE_ADVANCED_ACTIVITY_TYPES` is on (M5-epic, ADR-0035).
 * **Level of Effort** (span-derived, §21) and **WBS summary** (branch roll-up, §24) — both with live
 * engine/API/conformance support. `HAMMOCK` is intentionally NOT offered (no engine behaviour yet),
 * though {@link ACTIVITY_TYPE_LABELS} still names every value so a legacy/imported one displays
 * honestly.
 */
export const ADVANCED_ACTIVITY_TYPES: readonly ActivityType[] = ['LEVEL_OF_EFFORT', 'WBS_SUMMARY'];

/**
 * The activity types the Type picker should offer: the always-supported {@link BASE_ACTIVITY_TYPES},
 * plus {@link ADVANCED_ACTIVITY_TYPES} when the flag is on, plus the activity's `current` value if it
 * isn't already in that set — so editing an activity of a not-offered type (a legacy `HAMMOCK`, or an
 * LOE while the flag is off) keeps its own value visible and selected rather than silently coercing it
 * (the honest-selector pattern, cf. the constraint editor). Order-stable and de-duplicated.
 */
export function selectableActivityTypes(
  advancedEnabled: boolean,
  current?: ActivityType,
): ActivityType[] {
  const types = [...BASE_ACTIVITY_TYPES, ...(advancedEnabled ? ADVANCED_ACTIVITY_TYPES : [])];
  if (current && !types.includes(current)) types.push(current);
  return types;
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
    // The P6 duration type (ADR-0040): how a future edit to one of {duration, units, units/time}
    // recomputes the others so `Units = Duration × Units/Time` stays true. A `<select>` over the four
    // values; only editable behind `VITE_DURATION_TYPES`, but always seeded from the row so a stored
    // value round-trips even with the picker hidden. Defaults to the API default.
    durationType: z.enum(DURATION_TYPES),
    // Registered with `valueAsNumber`, so this is a number (NaN for an empty
    // field, which `.int()` rejects with the message below).
    durationDays: z
      .number({ message: 'Enter a whole number of days.' })
      .int('Enter a whole number of days.')
      .min(0, 'Duration cannot be negative.')
      .max(100000, 'Duration is too large.'),
    constraintType: z.union([z.enum(CONSTRAINT_TYPES), z.literal('')]).optional(),
    constraintDate: z.string().optional(),
    // Optional SECONDARY constraint (ADR-0035 §10, M4): the primary drives the forward pass, this the
    // backward pass. Same shape and paired rule as the primary; only editable behind the
    // `VITE_ADVANCED_CONSTRAINTS` flag, but always seeded from the row so a stored value round-trips
    // even with the fields hidden.
    secondaryConstraintType: z.union([z.enum(CONSTRAINT_TYPES), z.literal('')]).optional(),
    secondaryConstraintDate: z.string().optional(),
    // As-late-as-possible (ADR-0035 §11): a display-only placement preference; never changes dates/float.
    scheduleAsLateAsPossible: z.boolean().optional(),
    // Expected-finish target (ADR-0035 §9): a calendar day the engine resizes remaining work to when the
    // plan's `useExpectedFinishDates` is on. A raw `<input type="date">` value (`''` = none).
    expectedFinish: z.string().optional(),
    // The activity's own working-time calendar (ADR-0037): `''` = inherit the plan default.
    // A raw `<select>` value; the choices are the org's calendar ids (+ inherit), so the id is
    // never free-typed — validation of the UUID/in-org is the API's job (mirrors `constraintDate`).
    calendarId: z.string().optional(),
    // The WBS-summary this activity is grouped under (ADR-0038, M5-epic F8): `''` = top-level (no
    // parent). A raw `<select>` value picked from the plan's existing summaries; the API validates it
    // is an active `WBS_SUMMARY` in the same plan and that re-parenting introduces no cycle.
    parentId: z.string().optional(),
    // Resource-levelling tie-break (ADR-0041): a lower number wins the resource when two activities
    // contend for a capacity-constrained resource. Optional (blank = lowest priority — placed after
    // any prioritised peer); a whole number 0–1,000,000 (bounded to match the API). Only editable
    // behind `VITE_RESOURCE_LEVELLING`, but always seeded from the row so a stored value round-trips
    // even with the field hidden. Registered with a `setValueAs` that maps a blank field to
    // `undefined`, so an empty priority is "absent", not `NaN`.
    levelingPriority: z
      .number({ message: 'Enter a whole number.' })
      .int('Enter a whole number.')
      .min(0, 'Priority cannot be negative.')
      .max(1000000, 'Priority is too large.')
      .optional(),
    // Earned-Value inputs (EV4b, ADR-0042). `percentCompleteType` selects the EV performance measure
    // (default `DURATION`, behaviour-preserving — it NEVER changes a CPM date); a plain enum attribute
    // like `durationType`, always seeded from the row. `physicalPercentComplete` feeds the `PHYSICAL`
    // measure only — an integer 0–100, blank → `undefined` (unset). `budgetedExpense` / `actualExpense`
    // are lump-sum activity costs entered in MAJOR units (×100 → minor on submit, ÷100 to seed); optional,
    // `>= 0`, at most 2 major decimals (the 2-decimal money assumption, `lib/format-money`). All only
    // editable behind `VITE_EARNED_VALUE`, but always seeded from the row so a stored value round-trips
    // even when the fields are hidden.
    percentCompleteType: z.enum(PERCENT_COMPLETE_TYPES),
    physicalPercentComplete: z
      .number({ message: 'Enter a percentage from 0 to 100.' })
      .int('Enter a whole percentage.')
      .min(0, 'Percentage cannot be negative.')
      .max(100, 'Percentage cannot exceed 100.')
      .optional(),
    budgetedExpense: moneyMajorAmount.optional(),
    actualExpense: moneyMajorAmount.optional(),
    description: z.string().trim().max(2000, 'Description is too long.').optional(),
  })
  // Only the type→date direction needs a rule: the dialog hides the date field
  // until a type is chosen, so a "date without a type" is unreachable, and the
  // request builder drops any stale date once the type is cleared.
  .refine((v) => !v.constraintType || Boolean(v.constraintDate), {
    message: 'Choose a date for this constraint.',
    path: ['constraintDate'],
  })
  // The secondary constraint pairs the same way (the API enforces it too).
  .refine((v) => !v.secondaryConstraintType || Boolean(v.secondaryConstraintDate), {
    message: 'Choose a date for the secondary constraint.',
    path: ['secondaryConstraintDate'],
  });

export type ActivityFormValues = z.infer<typeof activityFormSchema>;

/**
 * Activity PROGRESS form schema — for the Contributor-capable progress editor.
 * `percentComplete` is a number (registered with `valueAsNumber`); the actual
 * dates are raw `<input type="date">` values (`''` = unset). The M2 progress-ingestion
 * fields (ADR-0035) — an explicit `remainingDurationDays` (blank derives it from
 * percent) plus `suspendDate` / `resumeDate` for a paused activity — are optional and
 * only editable behind the `VITE_PROGRESS_INGESTION` flag; the dialog seeds them from
 * the row either way so a stored value round-trips unchanged. Cross-field rules mirror
 * the API: you cannot finish before you start, finish without starting, or resume
 * before you suspend.
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
    // A blank field registers as `undefined` (via the input's `setValueAs`), which means "absent →
    // the API derives remaining from percent complete"; a value is a whole number of days.
    remainingDurationDays: z
      .number({ message: 'Enter a whole number of days.' })
      .int('Enter a whole number of days.')
      .min(0, 'Remaining cannot be negative.')
      .max(10000, 'Remaining is too large.')
      .optional(),
    suspendDate: z.string().optional(),
    resumeDate: z.string().optional(),
  })
  .refine((v) => !v.actualFinish || Boolean(v.actualStart), {
    message: 'Set an actual start before a finish.',
    path: ['actualFinish'],
  })
  .refine((v) => !v.actualStart || !v.actualFinish || v.actualFinish >= v.actualStart, {
    message: 'Finish cannot be before the start.',
    path: ['actualFinish'],
  })
  .refine((v) => !v.resumeDate || Boolean(v.suspendDate), {
    message: 'Set a suspend date before a resume.',
    path: ['resumeDate'],
  })
  .refine((v) => !v.suspendDate || !v.resumeDate || v.resumeDate >= v.suspendDate, {
    message: 'Resume cannot be before the suspend.',
    path: ['resumeDate'],
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
