import type { DependencySummary } from '@repo/types';
import { queryOptions, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { dependencyKeys } from '@/lib/query/hierarchy-keys';

export { dependencyKeys };

export function predecessorsQueryOptions(orgSlug: string, activityId: string) {
  return queryOptions({
    queryKey: dependencyKeys.predecessors(orgSlug, activityId),
    queryFn: () =>
      apiFetch<DependencySummary[]>(
        `/organizations/${orgSlug}/activities/${activityId}/predecessors`,
      ),
  });
}

/** An activity's predecessors — the links where it is the successor (what comes before it).
 * `enabled` lets a host keep the query mounted but idle (e.g. a closed dialog). */
export function usePredecessors(
  orgSlug: string,
  activityId: string,
  enabled = true,
): UseQueryResult<DependencySummary[]> {
  return useQuery({ ...predecessorsQueryOptions(orgSlug, activityId), enabled });
}

export function successorsQueryOptions(orgSlug: string, activityId: string) {
  return queryOptions({
    queryKey: dependencyKeys.successors(orgSlug, activityId),
    queryFn: () =>
      apiFetch<DependencySummary[]>(
        `/organizations/${orgSlug}/activities/${activityId}/successors`,
      ),
  });
}

/** An activity's successors — the links where it is the predecessor (what it drives).
 * `enabled` lets a host keep the query mounted but idle (e.g. a closed dialog). */
export function useSuccessors(
  orgSlug: string,
  activityId: string,
  enabled = true,
): UseQueryResult<DependencySummary[]> {
  return useQuery({ ...successorsQueryOptions(orgSlug, activityId), enabled });
}
