import { z } from 'zod';

import { ApiFetchError } from '@/lib/api/client';

/**
 * Baseline capture form schema — mirrors the API DTO. The only input is the name;
 * the snapshot itself is taken server-side (ADR-0025). Name 1–120, trimmed.
 */
export const captureBaselineSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(120, 'Name is too long.'),
});

export type CaptureBaselineValues = z.infer<typeof captureBaselineSchema>;

/** 409 conflict reason: a baseline with this name already exists for the plan. */
export const DUPLICATE_BASELINE = 'DUPLICATE_BASELINE';
/** 422 reason: the plan has no computed schedule to freeze (empty / never calculated). */
export const SCHEDULE_NOT_CALCULATED = 'SCHEDULE_NOT_CALCULATED';

/** The `reason` code carried in an {@link ApiFetchError}'s details, if any. */
function reasonOf(error: unknown): string | undefined {
  if (error instanceof ApiFetchError) {
    return (error.error.details as { reason?: string } | undefined)?.reason;
  }
  return undefined;
}

/**
 * Map a capture failure to a friendly, actionable message. A duplicate name and a
 * never-calculated plan get bespoke guidance; anything else falls back to the API
 * message (or a generic retry).
 */
export function captureErrorMessage(error: unknown): string {
  const reason = reasonOf(error);
  if (reason === DUPLICATE_BASELINE) {
    return 'A baseline with this name already exists. Choose a different name.';
  }
  if (reason === SCHEDULE_NOT_CALCULATED) {
    return 'Recalculate the schedule before capturing a baseline.';
  }
  return error instanceof Error
    ? error.message
    : 'Couldn’t capture the baseline. Please try again.';
}
