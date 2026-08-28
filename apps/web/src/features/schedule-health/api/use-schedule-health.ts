import type { HealthMetricResult, ScheduleHealthReport } from '@repo/types';
import {
  queryOptions,
  useMutation,
  useQuery,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { scheduleKeys } from '@/lib/query/hierarchy-keys';

export { scheduleKeys };

export function scheduleHealthQueryOptions(orgSlug: string, planId: string, enabled = true) {
  return queryOptions({
    queryKey: scheduleKeys.health(orgSlug, planId),
    queryFn: () =>
      apiFetch<ScheduleHealthReport>(
        `/organizations/${orgSlug}/plans/${planId}/schedule/health-check`,
      ),
    enabled,
    // A snapshot over the persisted rows. Keyed under the schedule namespace, so the existing
    // recalculation invalidation (`scheduleKeys.all`) sweeps it — no new invalidation site exists
    // to be forgotten. The freshness window mirrors the summary/EV reads.
    staleTime: 30_000,
  });
}

/**
 * A plan's DCMA 14-point health report (health M1): always exactly fourteen metric rows, in
 * ordinal order — a metric that could not be computed arrives as `NOT_ASSESSABLE` with a typed
 * reason, never as a missing row and never as an error status. A pure read: it schedules nothing,
 * locks nothing and shows no cost to anybody (`schedule:read`, role-invariant by construction).
 */
export function useScheduleHealth(
  orgSlug: string,
  planId: string,
  enabled = true,
): UseQueryResult<ScheduleHealthReport> {
  return useQuery(scheduleHealthQueryOptions(orgSlug, planId, enabled));
}

/**
 * **DCMA metric 12, run on demand** (health M6) — the read-only what-if that upgrades the report's
 * one placeholder row. A mutation hook for an explicit BUTTON press, not a query: the server runs
 * the CPM engine twice per call, so nothing may fire it on mount, on focus, or on a stale timer —
 * only a planner asking. The result is the metric-12 row in the report's own shape; the caller
 * merges it over the placeholder (the report contract never changes).
 *
 * The route persists nothing — proved server-side by the non-mutation e2e — so there is
 * deliberately no cache invalidation here: no stored row changed, and sweeping `scheduleKeys`
 * would refetch a report that is byte-identical.
 */
export function useCriticalPathTest(
  orgSlug: string,
  planId: string,
): UseMutationResult<HealthMetricResult, Error, void> {
  return useMutation({
    mutationFn: () =>
      apiFetch<HealthMetricResult>(
        `/organizations/${orgSlug}/plans/${planId}/schedule/health-check/critical-path-test`,
      ),
  });
}
