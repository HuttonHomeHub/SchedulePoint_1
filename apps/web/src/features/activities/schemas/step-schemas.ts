import { z } from 'zod';

/**
 * One editable **activity step** row (M7 rung 5, ADR-0044 §2 / ADR-0035 §33). Mirrors the API's
 * `ActivityStepInput` DTO: `name` is a required label (≤ 200); `weight` is the step's relative
 * importance in the weighted-mean physical % — an exact quantity `>= 0` with at most 4 decimal places
 * (the DB stores `DECIMAL(18,4)`); `percentComplete` is the step's own completion, an integer 0–100
 * (N28 — the server rejects out-of-range with `STEP_PERCENT_OUT_OF_RANGE`, 422). The editor manages
 * the ordered list; the server assigns each row's contiguous `seq` on the bulk replace.
 */
export const activityStepSchema = z.object({
  name: z.string().trim().min(1, 'Step name is required.').max(200, 'Step name is too long.'),
  weight: z
    .number({ message: 'Enter a number.' })
    .min(0, 'Weight cannot be negative.')
    .refine(
      (value) => Number.isFinite(value) && Math.round(value * 10000) === value * 10000,
      'Use at most 4 decimal places.',
    ),
  percentComplete: z
    .number({ message: 'Enter a number.' })
    .int('Use a whole number.')
    .min(0, 'Percent complete cannot be below 0.')
    .max(100, 'Percent complete cannot exceed 100.'),
});

/**
 * The activity-steps form schema — the full ordered list bulk-replaced in one
 * `PUT …/activities/:activityId/steps` (an empty list clears the steps). The parent activity's
 * optimistic-lock `version` is carried by the mutation, not the form.
 */
export const stepsFormSchema = z.object({
  steps: z.array(activityStepSchema),
});

export type ActivityStepFormValue = z.infer<typeof activityStepSchema>;
export type StepsFormValues = z.infer<typeof stepsFormSchema>;

/** Clamp a number into `[min, max]` (NaN collapses to `min`, matching a blank/invalid draft as 0). */
function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Resolve the physical %-complete the way the API's read-time `rollupPhysicalPercent` resolver does
 * (ADR-0044 §2): when the activity has steps whose weights sum above zero, it is the weighted mean
 * `Σ(wᵢ·clamp(pᵢ,0,100)) / Σ(wᵢ)` clamped to `[0,100]` — which **wins** over the manual field. With no
 * steps, or all-zero (or negative-summing) weights, it falls back to the manual `physicalPercentComplete`
 * (N27), which may itself be `null` (unset). Replicated client-side so the editor previews the same figure
 * the server will compute, before the save round-trips.
 */
export function rollupPhysicalPercent(
  steps: readonly { weight: number; percentComplete: number }[],
  manualPhysicalPercent: number | null,
): number | null {
  const totalWeight = steps.reduce(
    (sum, step) => sum + (Number.isFinite(step.weight) ? step.weight : 0),
    0,
  );
  if (steps.length === 0 || totalWeight <= 0) return manualPhysicalPercent;
  const weighted = steps.reduce(
    (sum, step) => sum + step.weight * clamp(step.percentComplete, 0, 100),
    0,
  );
  return clamp(weighted / totalWeight, 0, 100);
}
