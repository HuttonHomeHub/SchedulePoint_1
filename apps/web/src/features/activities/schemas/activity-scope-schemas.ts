import { ACCRUAL_TYPES, DURATION_TYPES, PERCENT_COMPLETE_TYPES } from '@repo/types';
import { z } from 'zod';

import { ACTIVITY_TYPES, CONSTRAINT_TYPES } from './activity-schemas';

import { moneyMajorAmount } from '@/lib/money-schema';

/**
 * The activity definition form, split by **write scope** (ADR-0060 §2–§3).
 *
 * `activityFormSchema` validates all 22 definition fields as one submit, because the dialog it
 * serves is one submit. The tabbed editor saves per scope, so each scope needs its own schema —
 * otherwise saving the Cost tab would run (and report) the Scheduling tab's cross-field rules.
 *
 * **Every rule here is moved, not rewritten.** The four shapes partition
 * `activityFormSchema`'s keys exactly — no key in two scopes, none dropped — and
 * `activity-scope-schemas.structural.test.ts` computes that union and fails if it ever drifts.
 * That test is the point of this file: a silent field drop would weaken validation invisibly,
 * which is the worst thing this refactor could do.
 *
 * A refinement lives with the scope that owns **both** its fields — which is why the primary and
 * secondary constraint pairs, and the N26 external-date ordering, are all in Scheduling. If a rule
 * ever needs two scopes, it belongs on the server, not here.
 *
 * `activityFormSchema` stays in place and unmodified: the flag-off path still uses it.
 */

/** Identity, duration, hierarchy and free text — the "what is this activity" scope. */
export const activityGeneralShape = {
  name: z.string().trim().min(1, 'Name is required.').max(200, 'Name is too long.'),
  code: z.string().trim().max(32, 'Code is too long.').optional(),
  type: z.enum(ACTIVITY_TYPES),
  durationType: z.enum(DURATION_TYPES),
  durationDays: z
    .number({ message: 'Enter a whole number of days.' })
    .int('Enter a whole number of days.')
    .min(0, 'Duration cannot be negative.')
    .max(100000, 'Duration is too large.'),
  parentId: z.string().optional(),
  description: z.string().trim().max(2000, 'Description is too long.').optional(),
};

export const activityGeneralSchema = z.object(activityGeneralShape);
export type ActivityGeneralValues = z.infer<typeof activityGeneralSchema>;

/**
 * Calendar, constraints, placement targets, external dates and the levelling tie-break — everything
 * that tells the engine *when* the activity may sit. The primary constraint joins the secondary
 * here; in the single-submit dialog they were in different grouping states, which is one of the
 * defects this epic set out to fix.
 */
export const activitySchedulingShape = {
  calendarId: z.string().optional(),
  constraintType: z.union([z.enum(CONSTRAINT_TYPES), z.literal('')]).optional(),
  constraintDate: z.string().optional(),
  secondaryConstraintType: z.union([z.enum(CONSTRAINT_TYPES), z.literal('')]).optional(),
  secondaryConstraintDate: z.string().optional(),
  scheduleAsLateAsPossible: z.boolean().optional(),
  expectedFinish: z.string().optional(),
  externalEarlyStart: z.string().optional(),
  externalLateFinish: z.string().optional(),
  levelingPriority: z
    .number({ message: 'Enter a whole number.' })
    .int('Enter a whole number.')
    .min(0, 'Priority cannot be negative.')
    .max(1000000, 'Priority is too large.')
    .optional(),
};

/** The un-refined object, so the structural test can read `.shape` through the refinements. */
export const activitySchedulingObject = z.object(activitySchedulingShape);

export const activitySchedulingSchema = activitySchedulingObject
  .refine((v) => !v.constraintType || Boolean(v.constraintDate), {
    message: 'Choose a date for this constraint.',
    path: ['constraintDate'],
  })
  .refine((v) => !v.secondaryConstraintType || Boolean(v.secondaryConstraintDate), {
    message: 'Choose a date for the secondary constraint.',
    path: ['secondaryConstraintDate'],
  })
  // N26 (ADR-0035 §30) — mirrors the API's EXTERNAL_FINISH_BEFORE_START 422 client-side.
  .refine(
    (v) =>
      !v.externalEarlyStart ||
      !v.externalLateFinish ||
      v.externalLateFinish >= v.externalEarlyStart,
    {
      message: 'External late finish can’t be before the external early start.',
      path: ['externalLateFinish'],
    },
  );

export type ActivitySchedulingValues = z.infer<typeof activitySchedulingSchema>;

/** Lump-sum activity expense and how it time-phases. Money is entered in MAJOR units. */
export const activityCostShape = {
  budgetedExpense: moneyMajorAmount.optional(),
  actualExpense: moneyMajorAmount.optional(),
  accrualType: z.enum(ACCRUAL_TYPES),
};

export const activityCostSchema = z.object(activityCostShape);
export type ActivityCostValues = z.infer<typeof activityCostSchema>;

/**
 * How value is measured — the EV performance source and its manual physical %. These are activity
 * columns (so a pen-gated `PATCH :id`), but they belong on the **Progress** tab beside the measures
 * they select between: the whole point of the co-location is that the chooser and the choices stop
 * living on different screens.
 */
export const activityMeasureShape = {
  percentCompleteType: z.enum(PERCENT_COMPLETE_TYPES),
  physicalPercentComplete: z
    .number({ message: 'Enter a percentage from 0 to 100.' })
    .int('Enter a whole percentage.')
    .min(0, 'Percentage cannot be negative.')
    .max(100, 'Percentage cannot exceed 100.')
    .optional(),
};

export const activityMeasureSchema = z.object(activityMeasureShape);
export type ActivityMeasureValues = z.infer<typeof activityMeasureSchema>;

/**
 * The scopes in tab order. `measure` is deliberately absent from any *tab* id list — it shares the
 * Progress tab with the two non-definition writes — so scope and tab are kept as separate ideas.
 */
export const ACTIVITY_SCOPES = ['general', 'scheduling', 'measure', 'cost'] as const;
export type ActivityScope = (typeof ACTIVITY_SCOPES)[number];
