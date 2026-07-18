import type { ProgrammeScheduleLockedDetails, ProgrammeScheduleResult } from '@repo/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { ApiFetchError, apiFetch } from '@/lib/api/client';
import {
  activityKeys,
  baselineKeys,
  dependencyKeys,
  scheduleKeys,
} from '@/lib/query/hierarchy-keys';

/** The generic programme-recalc failure message (anything that isn't a typed 422/423 rejection). */
export const PROGRAMME_RECALC_FAILED_MESSAGE =
  'Couldn’t recalculate the programme. Please try again.';

/**
 * The typed `details` on the **423 Locked** a programme recalculation raises when peer editors hold
 * plans in the closure (ADR-0045 §4, CQ-3 — fail-fast, nothing written). Returns the blocked-plan
 * list so the UI can offer the pen request/override per plan, or `null` for any other error.
 */
export function programmeLockedDetails(error: unknown): ProgrammeScheduleLockedDetails | null {
  if (
    error instanceof ApiFetchError &&
    error.status === 423 &&
    (error.error.details as { reason?: string } | undefined)?.reason === 'PROGRAMME_PLANS_LOCKED'
  ) {
    const details = error.error.details as ProgrammeScheduleLockedDetails;
    return { reason: 'PROGRAMME_PLANS_LOCKED', blockedPlanIds: details.blockedPlanIds ?? [] };
  }
  return null;
}

/** True when the closure exceeds the synchronous cap (422 `PROGRAMME_TOO_LARGE`, ADR-0045). */
export function isProgrammeTooLarge(error: unknown): boolean {
  return (
    error instanceof ApiFetchError &&
    error.status === 422 &&
    (error.error.details as { reason?: string } | undefined)?.reason === 'PROGRAMME_TOO_LARGE'
  );
}

/**
 * Resolve a programme-recalc error to a message for the generic (non-lock) surfaces. The 422
 * too-large and the 422 no-start rejections carry an actionable server message; everything else
 * gets the generic retry copy. The **423 blocked-plans** case is handled structurally by the caller
 * (via {@link programmeLockedDetails}), not here.
 */
export function programmeErrorMessage(error: unknown): string {
  if (error instanceof ApiFetchError && error.status === 422) return error.message;
  return PROGRAMME_RECALC_FAILED_MESSAGE;
}

/**
 * Recalculate a plan's **programme** — its upstream cross-plan closure, upstream-first (ADR-0045 §4):
 * `POST …/schedule/recalculate-programme`. On success the API has rewritten every plan in the closure
 * (so the derived inter-project bounds are fresh and staleness clears), so refetch the target plan's
 * schedule summary (dates + `scheduleStale`), activities, baseline variance and dependencies — the
 * same set the single-plan recalc invalidates. Upstream plans' summaries are swept via the schedule
 * namespace so any other open plan view refreshes too.
 */
export function useRecalculateProgramme(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<ProgrammeScheduleResult>(
        `/organizations/${orgSlug}/plans/${planId}/schedule/recalculate-programme`,
        { method: 'POST' },
      ),
    onSuccess: () =>
      Promise.all([
        // Every plan in the closure had its schedule rewritten — sweep the whole schedule namespace
        // for the org so upstream summaries (and staleness) refresh, not just the target's.
        queryClient.invalidateQueries({ queryKey: scheduleKeys.all(orgSlug) }),
        queryClient.invalidateQueries({ queryKey: activityKeys.listByPlan(orgSlug, planId) }),
        queryClient.invalidateQueries({ queryKey: baselineKeys.variance(orgSlug, planId) }),
        queryClient.invalidateQueries({ queryKey: dependencyKeys.byPlan(orgSlug, planId) }),
      ]),
  });
}
