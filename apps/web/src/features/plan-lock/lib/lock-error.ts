import type { PlanEditLockErrorDetails, PlanEditLockReason } from '@repo/types';

import { ApiFetchError } from '@/lib/api/client';

/**
 * Narrow a caught error to a plan edit-lock **423 (`LOCKED`)** and return its
 * machine-readable `reason` (ADR-0028) — or `null` when it is not a lock error, so
 * a write-handler can branch: a lock reason routes to the `EditLockBanner`'s
 * lost-control state (drop to read-only), while `null` falls through to the
 * existing 409/422 conflict handling. Narrows `error.details` (typed `unknown` at
 * the client boundary) exactly as `RecalculateButton` narrows the 422
 * `PLAN_START_REQUIRED` reason. Defaults to `PLAN_EDIT_LOCK_REQUIRED` if a 423
 * somehow arrives without a reason.
 */
export function classifyLockError(err: unknown): PlanEditLockReason | null {
  if (err instanceof ApiFetchError && err.status === 423) {
    const details = err.error.details as PlanEditLockErrorDetails | undefined;
    return details?.reason ?? 'PLAN_EDIT_LOCK_REQUIRED';
  }
  return null;
}

/** True when the error is a plan edit-lock 423 (any reason). */
export function isLockError(err: unknown): boolean {
  return classifyLockError(err) !== null;
}
