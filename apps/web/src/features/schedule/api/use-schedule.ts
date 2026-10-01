import type { LevellingApplication, PlanScheduleSummary } from '@repo/types';
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { ApiFetchError, apiFetch } from '@/lib/api/client';
import {
  activityKeys,
  baselineKeys,
  dependencyKeys,
  scheduleKeys,
} from '@/lib/query/hierarchy-keys';

export { scheduleKeys };

/** The reason a recalculation is rejected because the plan has no start date. */
export const PLAN_START_REQUIRED = 'PLAN_START_REQUIRED';

/** Shared guidance shown wherever a plan can't be scheduled for lack of a start date. */
export const NO_START_HINT = 'Set the plan’s start date, then recalculate.';

/** The generic recalc-failure message (anything that isn't the 422 no-start rejection). */
export const RECALC_FAILED_MESSAGE = 'Couldn’t recalculate the schedule. Please try again.';

/** True when the error is the API's 422 "the plan has no start date" rejection. */
function isPlanStartRequired(error: unknown): boolean {
  return (
    error instanceof ApiFetchError &&
    error.status === 422 &&
    (error.error.details as { reason?: string } | undefined)?.reason === PLAN_START_REQUIRED
  );
}

export function scheduleSummaryQueryOptions(orgSlug: string, planId: string) {
  return queryOptions({
    queryKey: scheduleKeys.summary(orgSlug, planId),
    queryFn: () =>
      apiFetch<PlanScheduleSummary>(`/organizations/${orgSlug}/plans/${planId}/schedule/summary`),
    // The summary drives an always-mounted Tier-1 chip (ADR-0031), not a toggle-shown band, so a
    // modest freshness window avoids refetch chatter on every mount / window-refocus. A recalc
    // invalidates this key explicitly, so the number is never stale after the action that changes it.
    staleTime: 30_000,
  });
}

/** A plan's computed schedule summary (data date, project finish, counts). */
export function useScheduleSummary(
  orgSlug: string,
  planId: string,
): UseQueryResult<PlanScheduleSummary> {
  return useQuery(scheduleSummaryQueryOptions(orgSlug, planId));
}

/**
 * What applying the plan's levelled dates would do (`GET …/schedule/levelling-application`) — the
 * rows the batch placement route takes, and the consequences the dialog reads out before anything is
 * written. A pure read over an in-memory solve: it writes nothing and needs no pen.
 *
 * **`enabled` is the whole of the cost story**, as it is for the float paths: the service runs the
 * engine twice per request, so a hook that fetched on mount would run two solves for every plan a
 * planner opens, whether or not they ever pressed the command. The dialog passes its own `open`.
 *
 * **Zero freshness and no retained copy.** The answer is a function of the live plan, so a stale one
 * is a wrong list, not an old one. A recalculation sweeps `scheduleKeys.all(orgSlug)`, which covers
 * this key by construction and re-fetches an open dialog under the planner; `gcTime: 0` drops the
 * result the moment the dialog closes, so reopening never flashes the last opening's list.
 *
 * 422 (no data date, or a calendar horizon exceeded) and 404 are stable statements about the plan,
 * and 429 is the route's own throttle: retrying any of them only delays the sentence that explains it.
 */
export function levellingApplicationQueryOptions(
  orgSlug: string,
  planId: string,
  enabled: boolean,
) {
  return queryOptions({
    queryKey: scheduleKeys.levellingApplication(orgSlug, planId),
    queryFn: () =>
      apiFetch<LevellingApplication>(
        `/organizations/${orgSlug}/plans/${planId}/schedule/levelling-application`,
      ),
    enabled: enabled && orgSlug !== '' && planId !== '',
    staleTime: 0,
    gcTime: 0,
    retry: (failureCount, error) =>
      !(error instanceof ApiFetchError && [404, 422, 429].includes(error.status)) &&
      failureCount < 2,
  });
}

export function useLevellingApplication(
  orgSlug: string,
  planId: string,
  enabled: boolean,
): UseQueryResult<LevellingApplication> {
  return useQuery(levellingApplicationQueryOptions(orgSlug, planId, enabled));
}

/**
 * Recalculate a plan's CPM schedule (Planner/Org Admin). On success, the API has
 * rewritten the engine-owned columns, so refetch the summary and the activities list to
 * show the new dates, float and critical path — the baseline variance, which is
 * measured against those recomputed dates and would otherwise go stale — and the
 * dependencies, whose engine-owned `isDriving` flag the recalc also rewrites (M3). The
 * dependency refetch is what keeps the driving-arrow styling live after a
 * reposition-in-time or create edit, which recalc but don't otherwise touch the
 * dependency cache (link mutations invalidate it themselves).
 */
export function useRecalculate(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<PlanScheduleSummary>(
        `/organizations/${orgSlug}/plans/${planId}/schedule/recalculate`,
        { method: 'POST' },
      ),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: scheduleKeys.summary(orgSlug, planId) }),
        // Cross-plan staleness (ADR-0045 §5) is pull-computed in each plan's summary: recalculating a
        // plan can make its DOWNSTREAM cross-plan plans stale (their persisted dates now predate this
        // one). Those live under other plans' summary keys, so sweep the whole org schedule namespace
        // — inactive summaries just refetch when next viewed, so the downstream stale banner appears.
        queryClient.invalidateQueries({ queryKey: scheduleKeys.all(orgSlug) }),
        queryClient.invalidateQueries({ queryKey: activityKeys.listByPlan(orgSlug, planId) }),
        queryClient.invalidateQueries({ queryKey: baselineKeys.variance(orgSlug, planId) }),
        queryClient.invalidateQueries({ queryKey: dependencyKeys.byPlan(orgSlug, planId) }),
        // The resource histogram (M7 rung 5, ADR-0044 §3) reads the recomputed activity spans, so a
        // recalc moves each assignment's units-over-time — refresh every bucket size (prefix, no
        // granularity) so whichever the user is viewing reflects the new dates.
        queryClient.invalidateQueries({
          queryKey: scheduleKeys.resourceHistogram(orgSlug, planId),
        }),
      ]),
  });
}

/**
 * The single **recalculate command** shared by every trigger of a CPM recalc (the header
 * {@link RecalculateButton} and the ADR-0031 toolbar item). It owns the mutation and the failure
 * taxonomy so neither caller re-derives it: `run()` fires the POST (a no-op while one is in flight,
 * so the trigger can stay focusable) and reports the outcome through resolved-message callbacks —
 * the actionable {@link NO_START_HINT} for the 422 no-start rejection, {@link RECALC_FAILED_MESSAGE}
 * otherwise — leaving each surface to present it its own way (inline alert vs. live-region announce).
 * `isPending` lets a trigger show/convey the in-flight (busy) state.
 */
export function useRecalculateCommand(orgSlug: string, planId: string) {
  // Read the stable pieces out rather than closing over the mutation object: `useMutation` returns
  // a fresh `{ ...result, mutate }` literal every render, so depending on it (or calling
  // `recalculate.mutate`, which makes the lint rule demand it) re-identified `run` — and with it this
  // whole command and the TSLD toolbar context that lists it — on every render.
  const { isPending, mutate } = useRecalculate(orgSlug, planId);
  const run = useCallback(
    (handlers: { onSuccess?: () => void; onError?: (message: string) => void } = {}): void => {
      if (isPending) return;
      mutate(undefined, {
        onSuccess: () => handlers.onSuccess?.(),
        onError: (error) =>
          handlers.onError?.(isPlanStartRequired(error) ? NO_START_HINT : RECALC_FAILED_MESSAGE),
      });
    },
    [isPending, mutate],
  );
  // Memoise the returned command so its identity only changes when `isPending` flips — callers put it
  // in memo dep arrays (the TSLD toolbar context), and an unmemoised literal here defeats their
  // stability guarantee, churning the `<Toolbar>` measure cycle on every unrelated render (perf review).
  return useMemo(() => ({ isPending, run }), [isPending, run]);
}
