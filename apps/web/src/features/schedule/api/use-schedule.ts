import type { PlanScheduleSummary } from '@repo/types';
import { queryOptions, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { scheduleKeys } from '@/lib/query/hierarchy-keys';

export { scheduleKeys };

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
