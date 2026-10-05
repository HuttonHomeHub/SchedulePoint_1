import type { ActivityStep, ReplaceActivityStepsRequest } from '@repo/types';
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { activityKeys, stepKeys } from '@/lib/query/hierarchy-keys';

export { stepKeys };

export function activityStepsQueryOptions(orgSlug: string, activityId: string) {
  return queryOptions({
    queryKey: stepKeys.listByActivity(orgSlug, activityId),
    queryFn: () =>
      apiFetch<ActivityStep[]>(`/organizations/${orgSlug}/activities/${activityId}/steps`),
    // Don't fire without an activity (e.g. the dialog is mounted but closed).
    enabled: Boolean(activityId),
  });
}

export function useActivitySteps(
  orgSlug: string,
  activityId: string,
): UseQueryResult<ActivityStep[]> {
  return useQuery(activityStepsQueryOptions(orgSlug, activityId));
}

function putSteps(orgSlug: string, activityId: string, input: ReplaceActivityStepsRequest) {
  return apiFetch<ActivityStep[]>(`/organizations/${orgSlug}/activities/${activityId}/steps`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

function invalidateAfterReplace(
  queryClient: ReturnType<typeof useQueryClient>,
  orgSlug: string,
  planId: string,
  activityId: string,
): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: stepKeys.listByActivity(orgSlug, activityId) }),
    queryClient.invalidateQueries({ queryKey: activityKeys.listByPlan(orgSlug, planId) }),
    queryClient.invalidateQueries({ queryKey: activityKeys.detail(orgSlug, activityId) }),
  ]);
}

/**
 * Bulk-replace an activity's weighted steps (ADR-0044 §2): one all-or-nothing
 * `PUT …/activities/:activityId/steps` carrying the full desired ordered list plus the parent
 * activity's optimistic-lock `version` (the replace bumps it). The write re-derives the activity's
 * PHYSICAL %-complete rollup, so it invalidates the step list AND the plan's activities list + this
 * activity's detail (its rolled-up % may have moved). Refetches on settle (not just success) so a 409
 * stale-version conflict refreshes the cached activity, and the retry carries the current version.
 */
export function useReplaceActivitySteps(orgSlug: string, planId: string, activityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReplaceActivityStepsRequest) => putSteps(orgSlug, activityId, input),
    onSettled: () => invalidateAfterReplace(queryClient, orgSlug, planId, activityId),
  });
}

/**
 * The same replace, addressed at an activity at call time — the undo history replays a step recorded
 * on any activity, and a hook cannot be called per activity (`useCreateAssignmentOn`'s reason).
 */
export function useReplaceActivityStepsOn(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ activityId, ...input }: ReplaceActivityStepsRequest & { activityId: string }) =>
      putSteps(orgSlug, activityId, input),
    onSettled: (_data, _error, input) =>
      invalidateAfterReplace(queryClient, orgSlug, planId, input.activityId),
  });
}
