import type { DependencySummary, DependencyType, LagCalendarSource } from '@repo/types';
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { apiFetch, apiFetchAllPages } from '@/lib/api/client';
import { dependencyKeys } from '@/lib/query/hierarchy-keys';

export { dependencyKeys };

export function planDependenciesQueryOptions(orgSlug: string, planId: string) {
  return queryOptions({
    queryKey: dependencyKeys.byPlan(orgSlug, planId),
    // The canvas draws the whole logic network, so page through EVERY edge rather than the endpoint's
    // default 20-row page — a truncated list leaves most links undrawn on a large plan.
    queryFn: () =>
      apiFetchAllPages<DependencySummary>(`/organizations/${orgSlug}/plans/${planId}/dependencies`),
  });
}

/** Every dependency (logic edge) in a plan — used by the TSLD canvas to draw the network. */
export function usePlanDependencies(
  orgSlug: string,
  planId: string,
): UseQueryResult<DependencySummary[]> {
  return useQuery(planDependenciesQueryOptions(orgSlug, planId));
}

export function predecessorsQueryOptions(orgSlug: string, activityId: string) {
  return queryOptions({
    queryKey: dependencyKeys.predecessors(orgSlug, activityId),
    // The logic editor lists an activity's links in full — a heavily-tied activity past the endpoint's
    // default 20-row page would show an incomplete (and so un-editable) set of predecessors.
    queryFn: () =>
      apiFetchAllPages<DependencySummary>(
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
    // As above — the successor list is shown in full, not just its first page.
    queryFn: () =>
      apiFetchAllPages<DependencySummary>(
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

/**
 * The signed lag, in exactly one of the two units the API accepts. Sending both is a 422 by design
 * (`@IsMutuallyExclusiveWith`), so this is a union rather than two optional fields — the compiler
 * refuses the call that would have been rejected at the boundary.
 *
 * `lagMinutes` is the exact unit (ADR-0036); `lagDays` is a convenience the server converts on the
 * relationship's lag calendar (ADR-0068 §4). A caller that knows the working-hours factor sends
 * minutes; one that does not sends days, which needs no factor.
 */
export type LagInput = { lagDays: number } | { lagMinutes: number };

/** A dependency create — predecessor → successor within a plan, with type + lag + lag calendar. */
export type CreateDependencyInput = {
  planId: string;
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  lagCalendar: LagCalendarSource;
} & LagInput;

/** A dependency update — the mutable fields plus the row's optimistic `version`. */
export type UpdateDependencyInput = {
  dependencyId: string;
  type: DependencyType;
  lagCalendar: LagCalendarSource;
  version: number;
} & LagInput;

/** Whichever of the two lag units this input carries — spread into the request body verbatim. */
function lagBody(input: LagInput): LagInput {
  return 'lagMinutes' in input ? { lagMinutes: input.lagMinutes } : { lagDays: input.lagDays };
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
          ...lagBody(input),
          lagCalendar: input.lagCalendar,
        }),
      }),
    onSettled: () => invalidateAll(queryClient, orgSlug),
  });
}

export function useUpdateDependency(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateDependencyInput) =>
      apiFetch<DependencySummary>(`/organizations/${orgSlug}/dependencies/${input.dependencyId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          type: input.type,
          ...lagBody(input),
          lagCalendar: input.lagCalendar,
          version: input.version,
        }),
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
