import { z } from 'zod';

/**
 * A Zod schema for a **MAJOR-unit money amount** entered in a form (EV4b, ADR-0042): a non-negative
 * number with at most two decimal places (the 2-decimal money assumption — see {@link ./format-money}).
 * Chain `.optional()` at the use site where a blank field means "absent".
 *
 * A single shared schema so the money fields across the resource and activity forms (`costPerUnit`,
 * `budgetedCost`, `actualCost`, `budgetedExpense`, `actualExpense`) enforce one rule from one place, not
 * five copies of the same `.min(0).refine(…)` fragment. Exported as a value (not a factory) so its exact
 * inferred type flows into `zodResolver` unchanged.
 */
export const moneyMajorAmount = z
  .number({ message: 'Enter an amount.' })
  .min(0, 'Cost cannot be negative.')
  .refine(
    (value) => Number.isFinite(value) && Math.round(value * 100) === value * 100,
    'Use at most 2 decimal places.',
  );
