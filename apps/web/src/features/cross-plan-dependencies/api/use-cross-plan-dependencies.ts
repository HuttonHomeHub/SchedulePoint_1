import type {
  ActivitySummary,
  CrossPlanDependencySummary,
  DependencyType,
  LagCalendarSource,
} from '@repo/types';
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { activityKeys, crossPlanDependencyKeys, scheduleKeys } from '@/lib/query/hierarchy-keys';

export { crossPlanDependencyKeys };

/**
 * The activities of ANOTHER plan, for the cross-plan endpoint picker's leaf select. Shares the
 * activities-list cache key (`activityKeys.listByPlan`) with the activities feature so the picker
 * reuses any already-loaded list, without a sideways feature → feature import (the query is declared
 * against the shared key + the shared `apiFetch`). `enabled` gates it until a plan is chosen.
 */
export function useOtherPlanActivities(
  orgSlug: string,
  planId: string,
  enabled = true,
): UseQueryResult<ActivitySummary[]> {
  return useQuery({
    queryKey: activityKeys.listByPlan(orgSlug, planId),
    queryFn: () =>
      apiFetch<ActivitySummary[]>(`/organizations/${orgSlug}/plans/${planId}/activities`),
    enabled: enabled && planId !== '',
  });
}

export function activityCrossPlanLinksQueryOptions(orgSlug: string, activityId: string) {
  return queryOptions({
    queryKey: crossPlanDependencyKeys.byActivity(orgSlug, activityId),
    queryFn: () =>
      apiFetch<CrossPlanDependencySummary[]>(
        `/organizations/${orgSlug}/activities/${activityId}/cross-plan-dependencies`,
      ),
  });
}

/**
 * An activity's live cross-plan links in **both directions** (ADR-0045) — the inter-project edges
 * where it is the successor (an edge from an upstream plan) or the predecessor (an edge into a
 * downstream plan). `enabled` lets a host keep the query mounted but idle (e.g. a closed dialog).
 * The list read is cursor-paginated on the wire, but the panel consumes the first page — a single
 * activity carries a handful of cross-plan interfaces, so paging is deferred (see the report note).
 */
export function useActivityCrossPlanLinks(
  orgSlug: string,
  activityId: string,
  enabled = true,
): UseQueryResult<CrossPlanDependencySummary[]> {
  return useQuery({ ...activityCrossPlanLinksQueryOptions(orgSlug, activityId), enabled });
}

/**
 * A cross-plan link create — an upstream `predecessorActivityId` → a downstream
 * `successorActivityId`, with type + signed lag + lag calendar. The two plan ids are derived
 * server-side from the endpoint activities (never sent), so the create is org-scoped, not nested
 * under a plan (ADR-0045 §1 / docs/API.md).
 */
export interface CreateCrossPlanLinkInput {
  predecessorActivityId: string;
  successorActivityId: string;
  type: DependencyType;
  lagDays: number;
  lagCalendar: LagCalendarSource;
}

// A cross-plan link touches two activities in two plans, so — like the intra-plan dependency editor —
// we invalidate the whole cross-plan namespace for the org (coarse but always correct and cheap here).
// We ALSO sweep the schedule summaries: a plan's summary carries the `scheduleStale`/staleness fields
// only once it has ≥1 cross-plan edge (ADR-0045 §5), so adding/removing the first link flips whether
// the programme surface renders — the summary must refetch for that to show up promptly.
async function invalidateAll(
  queryClient: ReturnType<typeof useQueryClient>,
  orgSlug: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: crossPlanDependencyKeys.all(orgSlug) }),
    queryClient.invalidateQueries({ queryKey: scheduleKeys.all(orgSlug) }),
  ]);
}

export function useCreateCrossPlanLink(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCrossPlanLinkInput) =>
      apiFetch<CrossPlanDependencySummary>(`/organizations/${orgSlug}/cross-plan-dependencies`, {
        method: 'POST',
        body: JSON.stringify({
          predecessorActivityId: input.predecessorActivityId,
          successorActivityId: input.successorActivityId,
          type: input.type,
          lagDays: input.lagDays,
          lagCalendar: input.lagCalendar,
        }),
      }),
    onSettled: () => invalidateAll(queryClient, orgSlug),
  });
}

export function useDeleteCrossPlanLink(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) =>
      apiFetch<void>(`/organizations/${orgSlug}/cross-plan-dependencies/${linkId}`, {
        method: 'DELETE',
      }),
    onSettled: () => invalidateAll(queryClient, orgSlug),
  });
}
