import { z } from 'zod';

import { ApiFetchError } from '@/lib/api/client';

/**
 * The furthest-out expiry the picker allows, in days (~1 year). ADR-0051 §5 / the F-M2 security
 * review (CQ-4) deliberately keeps **no forced server-side max TTL** — revocation is the primary
 * control — but an effectively-permanent external bearer credential shouldn't be a one-click mistake,
 * so the date-picker BOUNDS the selectable expiry a sane span out. A planner who genuinely wants a
 * longer-lived link makes it explicitly (and can always re-issue); the common case is nudged short.
 */
export const MAX_EXPIRY_DAYS = 365;

/** A local `YYYY-MM-DD` (today) for the picker's `min`/`max` bounds and the schema's floor. */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** `today + days` as a local `YYYY-MM-DD` — the picker's `max` and the schema's ceiling. */
export function isoDaysFromToday(days: number, now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  return todayIso(d);
}

/**
 * Create-a-share-link form schema. Both fields are optional (an unlabelled, non-expiring link is
 * valid — revocation is the primary control). `label` trims to ≤ 200 (the API DTO's `@MaxLength`);
 * `expiryDate` is an optional `YYYY-MM-DD` from a bounded `<input type="date">`, validated to sit in
 * the future and within {@link MAX_EXPIRY_DAYS} so an absurd date entered by hand is caught too.
 */
export function makeCreateShareSchema(now: Date = new Date()) {
  const min = todayIso(now);
  const max = isoDaysFromToday(MAX_EXPIRY_DAYS, now);
  return z.object({
    label: z.string().trim().max(200, 'Label is too long.'),
    // An empty string means "no expiry"; a set value must be a real day, in the future, ≤ 1 year out.
    expiryDate: z
      .string()
      .trim()
      .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Enter a valid date.')
      .refine((v) => v === '' || v > min, 'Expiry must be in the future.')
      .refine((v) => v === '' || v <= max, 'Expiry can be at most a year out.'),
  });
}

export type CreateShareValues = z.infer<ReturnType<typeof makeCreateShareSchema>>;

/**
 * Turn the form's `YYYY-MM-DD` expiry day into the ISO-8601 instant the API expects, at the END of the
 * chosen local day (so a link "expires on the 5th" is valid through all of the 5th). Empty ⇒ undefined
 * (no expiry). Local-time end-of-day, serialised as UTC — the same convention as the rest of the app.
 */
export function expiryDateToInstant(expiryDate: string): string | undefined {
  if (expiryDate === '') return undefined;
  const [year, month, day] = expiryDate.split('-').map(Number);
  // End of the local day (23:59:59.999) so the whole chosen day is still valid.
  return new Date(year!, month! - 1, day, 23, 59, 59, 999).toISOString();
}

/** 422 reason: the requested expiry was not a future instant (should be caught client-side first). */
export const SHARE_EXPIRY_IN_PAST = 'SHARE_EXPIRY_IN_PAST';

function reasonOf(error: unknown): string | undefined {
  if (error instanceof ApiFetchError) {
    return (error.error.details as { reason?: string } | undefined)?.reason;
  }
  return undefined;
}

/** Map a create failure to a friendly message; the past-expiry 422 gets bespoke guidance. */
export function createShareErrorMessage(error: unknown): string {
  if (reasonOf(error) === SHARE_EXPIRY_IN_PAST) {
    return 'The expiry date must be in the future.';
  }
  return error instanceof Error
    ? error.message
    : 'Couldn’t create the share link. Please try again.';
}
