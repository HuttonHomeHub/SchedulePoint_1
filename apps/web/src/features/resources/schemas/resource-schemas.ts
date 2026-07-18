import { RESOURCE_KINDS, type ResourceKind, type ResourceSummary } from '@repo/types';
import { z } from 'zod';

/** Human labels for the resource kinds — used by the table and the form's kind select. */
export const RESOURCE_KIND_LABELS: Record<ResourceKind, string> = {
  LABOUR: 'Labour',
  EQUIPMENT: 'Equipment',
  MATERIAL: 'Material',
};

/**
 * A MATERIAL resource may never be the driving resource of an activity's dates
 * (ADR-0039). The single source of that predicate, so the driving-toggle gating in
 * the assignment dialog reads the invariant from one place, not a scattered literal.
 */
export function isMaterialResource(resource: ResourceSummary | undefined): boolean {
  return resource?.kind === 'MATERIAL';
}

/**
 * Resource create/edit form schema — mirrors the API DTO (ADR-0039). `name` is
 * required; `code`/`description` are optional natural-key / free-text fields;
 * `kind` is one of {@link RESOURCE_KINDS}; `calendarId` is optional (blank inherits
 * the plan calendar at schedule time). Name ≤ 120, code ≤ 60, description ≤ 2000.
 */
export const resourceFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(120, 'Name is too long.'),
  code: z.string().trim().max(60, 'Code is too long.').optional(),
  description: z.string().trim().max(2000, 'Description is too long.').optional(),
  kind: z.enum(RESOURCE_KINDS),
  // A blank select value is "inherit the plan calendar"; a chosen id round-trips.
  calendarId: z.string().optional(),
  // Levelling capacity — the max units/hour the resource can supply at once (ADR-0041; the reserved
  // `max_units_per_hour` the levelling pass reads as its ceiling). Optional (blank = uncapped, the
  // triad stays capless); `>= 0` (N21) with at most 4 decimal places (DECIMAL(18,4)). Registered
  // with a `setValueAs` that maps a blank field to `undefined`, so an empty capacity is "absent",
  // not `NaN`.
  maxUnitsPerHour: z
    .number({ message: 'Enter a number.' })
    .min(0, 'Capacity cannot be negative.')
    .refine(
      (value) => Number.isFinite(value) && Math.round(value * 10000) === value * 10000,
      'Use at most 4 decimal places.',
    )
    .optional(),
  // Cost rate — money per unit of work (EV4b, ADR-0042). Entered here in MAJOR units (e.g. 12.50);
  // the form ×100 → minor units on submit and ÷100 to seed on edit. Optional (blank = no rate); `>= 0`
  // with at most 2 major decimal places (the 2-decimal money assumption, `lib/format-money`).
  // Registered with a `setValueAs` that maps a blank field to `undefined`, so an empty rate is
  // "absent", not `NaN`. Only editable behind `VITE_EARNED_VALUE`, but always seeded from the row so a
  // stored value round-trips even with the field hidden.
  costPerUnit: z
    .number({ message: 'Enter an amount.' })
    .min(0, 'Cost cannot be negative.')
    .refine(
      (value) => Number.isFinite(value) && Math.round(value * 100) === value * 100,
      'Use at most 2 decimal places.',
    )
    .optional(),
});

export type ResourceFormValues = z.infer<typeof resourceFormSchema>;

/**
 * Resource-assignment form schema — mirrors the assignment API DTO (ADR-0039).
 * `resourceId` is required; `budgetedUnits` is an exact quantity ≥ 0 with at most
 * 4 decimal places (the DB stores `DECIMAL(18,4)`, N14) and defaults to 0;
 * `isDriving` designates the driving resource (a MATERIAL resource may never drive
 * — enforced in the dialog and by the API's 422 `MATERIAL_CANNOT_DRIVE`).
 */
export const assignmentFormSchema = z.object({
  resourceId: z.string().min(1, 'Choose a resource.'),
  budgetedUnits: z
    .number({ message: 'Enter a number.' })
    .min(0, 'Budgeted units cannot be negative.')
    .refine(
      (value) => Number.isFinite(value) && Math.round(value * 10000) === value * 10000,
      'Use at most 4 decimal places.',
    ),
  // Planned rate — the Units/Time term of the triad (M7 rung 4, ADR-0040), on the DRIVING assignment.
  // Optional (blank = no rate, the triad stays inert); `>= 0` (N19) with at most 4 decimal places
  // (DECIMAL(18,4)). Registered with a `setValueAs` that maps a blank field to `undefined`, so an
  // empty rate is "absent", not `NaN`.
  unitsPerHour: z
    .number({ message: 'Enter a number.' })
    .min(0, 'Rate cannot be negative.')
    .refine(
      (value) => Number.isFinite(value) && Math.round(value * 10000) === value * 10000,
      'Use at most 4 decimal places.',
    )
    .optional(),
  isDriving: z.boolean(),
  // Assignment cost & actuals (EV4b, ADR-0042). `budgetedCost` is an optional override (blank = derive
  // from budgetedUnits × the resource's costPerUnit at EV read time); `actualCost` is the booked cost.
  // Both entered in MAJOR units (×100 → minor on submit, ÷100 to seed). `actualUnits` is the quantity of
  // work done (a plain quantity like budgetedUnits, `>= 0`, at most 4 dp). All optional, `>= 0`. Only
  // editable behind `VITE_EARNED_VALUE`.
  budgetedCost: z
    .number({ message: 'Enter an amount.' })
    .min(0, 'Cost cannot be negative.')
    .refine(
      (value) => Number.isFinite(value) && Math.round(value * 100) === value * 100,
      'Use at most 2 decimal places.',
    )
    .optional(),
  actualCost: z
    .number({ message: 'Enter an amount.' })
    .min(0, 'Cost cannot be negative.')
    .refine(
      (value) => Number.isFinite(value) && Math.round(value * 100) === value * 100,
      'Use at most 2 decimal places.',
    )
    .optional(),
  actualUnits: z
    .number({ message: 'Enter a number.' })
    .min(0, 'Actual units cannot be negative.')
    .refine(
      (value) => Number.isFinite(value) && Math.round(value * 10000) === value * 10000,
      'Use at most 4 decimal places.',
    )
    .optional(),
});

export type AssignmentFormValues = z.infer<typeof assignmentFormSchema>;

/**
 * Validate a raw budgeted-units string from the inline row editor against the same
 * rule as {@link assignmentFormSchema} (≥ 0, ≤ 4 decimal places) so the "edit assigned"
 * path enforces exactly what the "assign" form does. Returns the parsed number or a
 * human error message — never silently drops an invalid entry.
 */
export function validateBudgetedUnits(raw: string): { value: number } | { error: string } {
  const trimmed = raw.trim();
  if (trimmed === '') return { error: 'Enter a number.' };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { error: 'Enter a number.' };
  if (value < 0) return { error: 'Budgeted units cannot be negative.' };
  if (Math.round(value * 10000) !== value * 10000)
    return { error: 'Use at most 4 decimal places.' };
  return { value };
}

/**
 * Validate a raw units/time (rate) string from the inline row editor against the same rule as the
 * assign form's `unitsPerHour` (`>= 0`, `<= 4` decimal places, N19). A rate is required to Save here
 * (the API cannot clear a rate to null, ADR-0040), so a blank field is an error — never a silent skip.
 * Returns the parsed number or a human message.
 */
export function validateUnitsPerHour(raw: string): { value: number } | { error: string } {
  const trimmed = raw.trim();
  if (trimmed === '') return { error: 'Enter a number.' };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { error: 'Enter a number.' };
  if (value < 0) return { error: 'Rate cannot be negative.' };
  if (Math.round(value * 10000) !== value * 10000)
    return { error: 'Use at most 4 decimal places.' };
  return { value };
}

/**
 * Validate a raw MAJOR-unit money string from the inline assignment cost editor (EV4b, ADR-0042),
 * returning the amount in **minor units** (×100, float-noise rounded like `majorInputToMinor`) or a
 * human message. `>= 0`, at most 2 major decimal places (the 2-decimal money assumption). A blank
 * field is `{ value: null }` — the caller decides what null means (clear an override vs. zero).
 */
export function validateMoneyMajor(raw: string): { value: number | null } | { error: string } {
  const trimmed = raw.trim();
  if (trimmed === '') return { value: null };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { error: 'Enter an amount.' };
  if (value < 0) return { error: 'Cost cannot be negative.' };
  if (Math.round(value * 100) !== value * 100) return { error: 'Use at most 2 decimal places.' };
  return { value: Math.round(value * 100) };
}

/**
 * Validate a raw actual-units string from the inline assignment cost editor (EV4b, ADR-0042) against
 * the same rule as `budgetedUnits` (`>= 0`, `<= 4` decimal places). A blank field is `{ value: 0 }`
 * (actual work defaults to none). Returns the parsed number or a human message.
 */
export function validateActualUnits(raw: string): { value: number } | { error: string } {
  const trimmed = raw.trim();
  if (trimmed === '') return { value: 0 };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { error: 'Enter a number.' };
  if (value < 0) return { error: 'Actual units cannot be negative.' };
  if (Math.round(value * 10000) !== value * 10000)
    return { error: 'Use at most 4 decimal places.' };
  return { value };
}

/** 409 conflict reason: the resource is assigned to one or more active activities. */
export const RESOURCE_IN_USE = 'RESOURCE_IN_USE';
