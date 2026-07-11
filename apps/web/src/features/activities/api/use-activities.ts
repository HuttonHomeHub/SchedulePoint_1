import type { ActivitySummary } from '@repo/types';
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import {
  isMilestoneType,
  type ActivityFormValues,
  type ProgressFormValues,
} from '../schemas/activity-schemas';

import { apiFetch } from '@/lib/api/client';
import { activityKeys, baselineKeys } from '@/lib/query/hierarchy-keys';

export { activityKeys };

/** A blank optional field is sent as absent. */
function optional(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function createBody(input: ActivityFormValues) {
  const hasConstraint = Boolean(input.constraintType);
  return {
    name: input.name,
    code: optional(input.code),
    type: input.type,
    // A milestone has no duration — the API rejects a non-zero one.
    durationDays: isMilestoneType(input.type) ? 0 : input.durationDays,
    description: optional(input.description),
    ...(hasConstraint
      ? { constraintType: input.constraintType, constraintDate: input.constraintDate }
      : {}),
  };
}

function updateBody(input: ActivityFormValues & { version: number }) {
  const hasConstraint = Boolean(input.constraintType);
  return {
    name: input.name,
    code: optional(input.code) ?? null,
    type: input.type,
    durationDays: isMilestoneType(input.type) ? 0 : input.durationDays,
    description: optional(input.description) ?? null,
    // Clear both sides together when the constraint is removed (API pairs them).
    constraintType: hasConstraint ? input.constraintType : null,
    constraintDate: hasConstraint ? input.constraintDate : null,
    version: input.version,
  };
}

export function activitiesQueryOptions(orgSlug: string, planId: string) {
  return queryOptions({
    queryKey: activityKeys.listByPlan(orgSlug, planId),
    queryFn: () =>
      apiFetch<ActivitySummary[]>(`/organizations/${orgSlug}/plans/${planId}/activities`),
  });
}

export function useActivities(orgSlug: string, planId: string): UseQueryResult<ActivitySummary[]> {
  return useQuery(activitiesQueryOptions(orgSlug, planId));
}

export function useCreateActivity(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ActivityFormValues) =>
      apiFetch<ActivitySummary>(`/organizations/${orgSlug}/plans/${planId}/activities`, {
        method: 'POST',
        body: JSON.stringify(createBody(input)),
      }),
    // Adding an activity introduces a new "Added" row in the baseline variance, so refresh it too.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: activityKeys.listByPlan(orgSlug, planId) }),
        queryClient.invalidateQueries({ queryKey: baselineKeys.variance(orgSlug, planId) }),
      ]),
  });
}

export function useUpdateActivity(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { activityId: string; version: number } & ActivityFormValues) =>
      apiFetch<ActivitySummary>(`/organizations/${orgSlug}/activities/${input.activityId}`, {
        method: 'PATCH',
        body: JSON.stringify(updateBody(input)),
      }),
    onSettled: (_data, _error, input) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: activityKeys.listByPlan(orgSlug, planId) }),
        queryClient.invalidateQueries({ queryKey: activityKeys.detail(orgSlug, input.activityId) }),
      ]),
  });
}

function progressBody(input: ProgressFormValues & { version: number }) {
  return {
    percentComplete: input.percentComplete,
    // A blank date field clears the value (null), matching the API.
    actualStart: input.actualStart ? input.actualStart : null,
    actualFinish: input.actualFinish ? input.actualFinish : null,
    version: input.version,
  };
}

export function useUpdateActivityProgress(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { activityId: string; version: number } & ProgressFormValues) =>
      apiFetch<ActivitySummary>(
        `/organizations/${orgSlug}/activities/${input.activityId}/progress`,
        {
          method: 'PATCH',
          body: JSON.stringify(progressBody(input)),
        },
      ),
    onSettled: (_data, _error, input) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: activityKeys.listByPlan(orgSlug, planId) }),
        queryClient.invalidateQueries({ queryKey: activityKeys.detail(orgSlug, input.activityId) }),
      ]),
  });
}

export function useDeleteActivity(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (activityId: string) =>
      apiFetch<void>(`/organizations/${orgSlug}/activities/${activityId}`, { method: 'DELETE' }),
    // Removing an activity changes the baseline variance (it reads as "Removed" or drops out).
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: activityKeys.listByPlan(orgSlug, planId) }),
        queryClient.invalidateQueries({ queryKey: baselineKeys.variance(orgSlug, planId) }),
      ]),
  });
}
