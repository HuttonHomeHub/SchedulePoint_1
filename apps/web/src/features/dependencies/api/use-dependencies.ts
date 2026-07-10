import type { DependencySummary, DependencyType } from '@repo/types';
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

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

/** A dependency create — predecessor → successor within a plan, with type + lag. */
export interface CreateDependencyInput {
  planId: string;
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  lagDays: number;
}

// Editing any link changes what an activity's predecessors/successors lists show
// (and the other endpoint's opposite list), so we invalidate the whole
// dependency key space for the org — coarse but always correct and cheap here.
function invalidateAll(
  queryClient: ReturnType<typeof useQueryClient>,
  orgSlug: string,
): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: dependencyKeys.all(orgSlug) });
}

export function useCreateDependency(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDependencyInput) =>
      apiFetch<DependencySummary>(`/organizations/${orgSlug}/plans/${input.planId}/dependencies`, {
        method: 'POST',
        body: JSON.stringify({
          predecessorId: input.predecessorId,
          successorId: input.successorId,
          type: input.type,
          lagDays: input.lagDays,
        }),
      }),
    onSettled: () => invalidateAll(queryClient, orgSlug),
  });
}

export function useUpdateDependency(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      dependencyId: string;
      type: DependencyType;
      lagDays: number;
      version: number;
    }) =>
      apiFetch<DependencySummary>(`/organizations/${orgSlug}/dependencies/${input.dependencyId}`, {
        method: 'PATCH',
        body: JSON.stringify({ type: input.type, lagDays: input.lagDays, version: input.version }),
      }),
    onSettled: () => invalidateAll(queryClient, orgSlug),
  });
}

export function useDeleteDependency(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dependencyId: string) =>
      apiFetch<void>(`/organizations/${orgSlug}/dependencies/${dependencyId}`, {
        method: 'DELETE',
      }),
    onSettled: () => invalidateAll(queryClient, orgSlug),
  });
}
