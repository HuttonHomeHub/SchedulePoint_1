import type { ScheduleHealthReport } from '@repo/types';
import { queryOptions, useQuery, type UseQueryResult } from '@tanstack/react-query';

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
