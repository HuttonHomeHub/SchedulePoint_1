import type { PlanEarnedValue } from '@repo/types';
import { queryOptions, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { ApiFetchError, apiFetch } from '@/lib/api/client';
import { scheduleKeys } from '@/lib/query/hierarchy-keys';

export { scheduleKeys };

/**
 * True when the error is the API's **403 cost-read forbidden** — the caller may read the plan but not
 * its cost/Earned-Value figures (only Planner + Org Admin hold `cost:read`, ADR-0042 EV4a). The panel
 * branches on this to render a friendly "restricted" state instead of a generic failure.
 */
export function isCostReadForbidden(error: unknown): boolean {
  return error instanceof ApiFetchError && error.status === 403;
}

export function earnedValueQueryOptions(orgSlug: string, planId: string) {
  return queryOptions({
    queryKey: scheduleKeys.earnedValue(orgSlug, planId),
    queryFn: () =>
      apiFetch<PlanEarnedValue>(`/organizations/${orgSlug}/plans/${planId}/schedule/earned-value`),
    // The EV read is a snapshot over the live schedule + cost inputs; a recalc / cost edit invalidates
    // its key explicitly, so a modest freshness window avoids refetch chatter on mount/refocus (mirrors
    // the schedule summary). A 403 (non-cost-reader) is a stable authorization outcome — never retry it.
    staleTime: 30_000,
    retry: (failureCount, error) => !isCostReadForbidden(error) && failureCount < 3,
  });
}

/**
 * A plan's Earned-Value analysis (EV4b, ADR-0042): the plan-total + per-activity/WBS metric set read
 * from `GET …/schedule/earned-value`. A pure read — it schedules nothing. A **403** means the caller
 * lacks `cost:read` (a non-Planner); callers detect it with {@link isCostReadForbidden} and show the
 * restricted state rather than a generic error.
 */
export function useEarnedValue(orgSlug: string, planId: string): UseQueryResult<PlanEarnedValue> {
  return useQuery(earnedValueQueryOptions(orgSlug, planId));
}
