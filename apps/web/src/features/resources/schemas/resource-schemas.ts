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

/** 409 conflict reason: the resource is assigned to one or more active activities. */
export const RESOURCE_IN_USE = 'RESOURCE_IN_USE';
