import type { PlanSummary } from '@repo/types';
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import type { PlanFormValues } from '../schemas/plan-schemas';

import { apiFetch } from '@/lib/api/client';
import { planKeys, scheduleKeys } from '@/lib/query/hierarchy-keys';

export { planKeys };

/** A blank optional field is sent as absent. */
function optional(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function createBody(input: PlanFormValues) {
  return {
    name: input.name,
    description: optional(input.description),
    status: input.status,
    plannedStart: optional(input.plannedStart),
  };
}

function updateBody(input: PlanFormValues & { version: number }) {
  return {
    name: input.name,
    description: optional(input.description) ?? null,
    status: input.status,
    plannedStart: optional(input.plannedStart) ?? null,
    version: input.version,
  };
}

export function plansQueryOptions(orgSlug: string, projectId: string) {
  return queryOptions({
    queryKey: planKeys.listByProject(orgSlug, projectId),
    queryFn: () => apiFetch<PlanSummary[]>(`/organizations/${orgSlug}/projects/${projectId}/plans`),
  });
}

export function usePlans(orgSlug: string, projectId: string): UseQueryResult<PlanSummary[]> {
  return useQuery(plansQueryOptions(orgSlug, projectId));
}

export function planQueryOptions(orgSlug: string, planId: string) {
  return queryOptions({
    queryKey: planKeys.detail(orgSlug, planId),
    queryFn: () => apiFetch<PlanSummary>(`/organizations/${orgSlug}/plans/${planId}`),
    retry: false,
  });
}

/** A single plan — used by the plan-detail screen (handles deep-links / 404). */
export function usePlan(orgSlug: string, planId: string): UseQueryResult<PlanSummary> {
  return useQuery(planQueryOptions(orgSlug, planId));
}

export function useCreatePlan(orgSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PlanFormValues) =>
      apiFetch<PlanSummary>(`/organizations/${orgSlug}/projects/${projectId}/plans`, {
        method: 'POST',
        body: JSON.stringify(createBody(input)),
      }),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: planKeys.listByProject(orgSlug, projectId) }),
  });
}

export function useUpdatePlan(orgSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { planId: string; version: number } & PlanFormValues) =>
      apiFetch<PlanSummary>(`/organizations/${orgSlug}/plans/${input.planId}`, {
        method: 'PATCH',
        body: JSON.stringify(updateBody(input)),
      }),
    onSettled: (_data, _error, input) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: planKeys.listByProject(orgSlug, projectId) }),
        queryClient.invalidateQueries({ queryKey: planKeys.detail(orgSlug, input.planId) }),
      ]),
  });
}

/**
 * Set (or clear) a plan's default working-day calendar (M5, ADR-0024) — a targeted
 * PATCH of just `calendarId` + `version`, so it doesn't need the plan form. `null`
 * clears the calendar (all-days-work). On success the returned plan is written
 * straight into the detail cache, so the picker sees the new `calendarId` **and the
 * fresh `version`** at once (a following change can't send a stale version); the
 * schedule summary is invalidated so a later recalculation reflects the new calendar.
 */
export function useSetPlanCalendar(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { planId: string; version: number; calendarId: string | null }) =>
      apiFetch<PlanSummary>(`/organizations/${orgSlug}/plans/${input.planId}`, {
        method: 'PATCH',
        body: JSON.stringify({ calendarId: input.calendarId, version: input.version }),
      }),
    onSuccess: (updated, input) => {
      queryClient.setQueryData(planKeys.detail(orgSlug, input.planId), updated);
    },
    onSettled: (_data, _error, input) =>
      queryClient.invalidateQueries({ queryKey: scheduleKeys.summary(orgSlug, input.planId) }),
  });
}

export function useDeletePlan(orgSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) =>
      apiFetch<void>(`/organizations/${orgSlug}/plans/${planId}`, { method: 'DELETE' }),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: planKeys.listByProject(orgSlug, projectId) }),
  });
}
