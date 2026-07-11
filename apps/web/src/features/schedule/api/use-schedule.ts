import type { PlanScheduleSummary } from '@repo/types';
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { activityKeys, baselineKeys, scheduleKeys } from '@/lib/query/hierarchy-keys';

export { scheduleKeys };

/** The reason a recalculation is rejected because the plan has no start date. */
export const PLAN_START_REQUIRED = 'PLAN_START_REQUIRED';

/** Shared guidance shown wherever a plan can't be scheduled for lack of a start date. */
export const NO_START_HINT = 'Set the plan’s start date, then recalculate.';

export function scheduleSummaryQueryOptions(orgSlug: string, planId: string) {
  return queryOptions({
    queryKey: scheduleKeys.summary(orgSlug, planId),
    queryFn: () =>
      apiFetch<PlanScheduleSummary>(`/organizations/${orgSlug}/plans/${planId}/schedule/summary`),
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
 * Recalculate a plan's CPM schedule (Planner/Org Admin). On success, the API has
 * rewritten the engine-owned columns, so refetch the summary and the activities list to
 * show the new dates, float and critical path — and the baseline variance, which is
 * measured against those recomputed dates and would otherwise go stale.
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
        queryClient.invalidateQueries({ queryKey: activityKeys.listByPlan(orgSlug, planId) }),
        queryClient.invalidateQueries({ queryKey: baselineKeys.variance(orgSlug, planId) }),
      ]),
  });
}
