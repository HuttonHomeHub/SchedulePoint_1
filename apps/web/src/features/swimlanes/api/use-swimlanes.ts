import type { SwimlaneSummary } from '@repo/types';
import { queryOptions, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiFetchAllPages } from '@/lib/api/client';
import { swimlaneKeys } from '@/lib/query/hierarchy-keys';

export { swimlaneKeys };

export function swimlanesQueryOptions(orgSlug: string, planId: string) {
  return queryOptions({
    queryKey: swimlaneKeys.byPlan(orgSlug, planId),
    // Every page, not the first: the endpoint's default page is the 100-swimlane cap so it is one
    // request today, but a list that silently dropped its tail would put the dropped swimlanes'
    // members under "No swimlane" with nothing saying so.
    queryFn: () =>
      apiFetchAllPages<SwimlaneSummary>(`/organizations/${orgSlug}/plans/${planId}/swimlanes`),
  });
}

/**
 * The plan's active swimlanes in `position` order (the API's `ORDER BY position, id`).
 *
 * `enabled` is how the caller keeps it idle: a plan that never shows swimlanes should not fetch a
 * list nobody reads.
 */
export function useSwimlanes(
  orgSlug: string,
  planId: string,
  enabled = true,
): UseQueryResult<SwimlaneSummary[]> {
  return useQuery({ ...swimlanesQueryOptions(orgSlug, planId), enabled });
}
