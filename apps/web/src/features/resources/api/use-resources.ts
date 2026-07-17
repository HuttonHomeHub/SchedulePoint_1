import type { EditedField, ResourceAssignmentSummary, ResourceSummary } from '@repo/types';
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import type { AssignmentFormValues, ResourceFormValues } from '../schemas/resource-schemas';

import { apiFetch } from '@/lib/api/client';
import { activityKeys, assignmentKeys, resourceKeys } from '@/lib/query/hierarchy-keys';

export { assignmentKeys, resourceKeys };

/** A blank optional field is sent as absent. */
function optional(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function createResourceBody(input: ResourceFormValues) {
  return {
    name: input.name,
    kind: input.kind,
    code: optional(input.code),
    description: optional(input.description),
    calendarId: optional(input.calendarId),
    // Levelling capacity (ADR-0041): omit when blank so an uncapped resource stays uncapped.
    ...(input.maxUnitsPerHour === undefined ? {} : { maxUnitsPerHour: input.maxUnitsPerHour }),
  };
}

function updateResourceBody(input: ResourceFormValues & { version: number }) {
  return {
    name: input.name,
    kind: input.kind,
    code: optional(input.code) ?? null,
    description: optional(input.description) ?? null,
    calendarId: optional(input.calendarId) ?? null,
    // Levelling capacity (ADR-0041): a blank field clears the ceiling → null (uncapped). The form
    // always seeds this from the row (even with the field hidden), so an edit round-trips the stored
    // value rather than silently clearing it.
    maxUnitsPerHour: input.maxUnitsPerHour === undefined ? null : input.maxUnitsPerHour,
    version: input.version,
  };
}

export function resourcesQueryOptions(orgSlug: string) {
  return queryOptions({
    queryKey: resourceKeys.list(orgSlug),
    queryFn: () => apiFetch<ResourceSummary[]>(`/organizations/${orgSlug}/resources`),
  });
}

export function useResources(orgSlug: string): UseQueryResult<ResourceSummary[]> {
  return useQuery(resourcesQueryOptions(orgSlug));
}

export function resourceQueryOptions(orgSlug: string, resourceId: string) {
  return queryOptions({
    queryKey: resourceKeys.detail(orgSlug, resourceId),
    queryFn: () => apiFetch<ResourceSummary>(`/organizations/${orgSlug}/resources/${resourceId}`),
    // Don't fire for an absent id — avoids a bad `/resources/` GET.
    enabled: Boolean(resourceId),
    retry: false,
  });
}

export function useResource(orgSlug: string, resourceId: string): UseQueryResult<ResourceSummary> {
  return useQuery(resourceQueryOptions(orgSlug, resourceId));
}

export function useCreateResource(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ResourceFormValues) =>
      apiFetch<ResourceSummary>(`/organizations/${orgSlug}/resources`, {
        method: 'POST',
        body: JSON.stringify(createResourceBody(input)),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: resourceKeys.list(orgSlug) }),
  });
}

export function useUpdateResource(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { resourceId: string; version: number } & ResourceFormValues) =>
      apiFetch<ResourceSummary>(`/organizations/${orgSlug}/resources/${input.resourceId}`, {
        method: 'PATCH',
        body: JSON.stringify(updateResourceBody(input)),
      }),
    // Refetch on settle (not just success) so a 409 conflict refreshes the cached
    // row's version — the retry then carries the current version.
    onSettled: (_data, _error, input) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: resourceKeys.list(orgSlug) }),
        queryClient.invalidateQueries({ queryKey: resourceKeys.detail(orgSlug, input.resourceId) }),
      ]),
  });
}

export function useDeleteResource(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (resourceId: string) =>
      apiFetch<void>(`/organizations/${orgSlug}/resources/${resourceId}`, { method: 'DELETE' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: resourceKeys.list(orgSlug) }),
  });
}

export function assignmentsQueryOptions(orgSlug: string, activityId: string) {
  return queryOptions({
    queryKey: assignmentKeys.listByActivity(orgSlug, activityId),
    queryFn: () =>
      apiFetch<ResourceAssignmentSummary[]>(
        `/organizations/${orgSlug}/activities/${activityId}/assignments`,
      ),
    // Don't fire without an activity (e.g. the dialog is mounted but closed).
    enabled: Boolean(activityId),
  });
}

export function useAssignments(
  orgSlug: string,
  activityId: string,
): UseQueryResult<ResourceAssignmentSummary[]> {
  return useQuery(assignmentsQueryOptions(orgSlug, activityId));
}

export function useCreateAssignment(orgSlug: string, activityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AssignmentFormValues) =>
      apiFetch<ResourceAssignmentSummary>(
        `/organizations/${orgSlug}/activities/${activityId}/assignments`,
        {
          method: 'POST',
          body: JSON.stringify({
            resourceId: input.resourceId,
            budgetedUnits: input.budgetedUnits,
            // Set an initial rate when given (ADR-0040); no `editedField` on create, so the triad stays
            // inert — a plain store. The duration derivation happens later, on an explicit units/rate
            // edit in the row editor, where the "edited field" is unambiguous.
            ...(input.unitsPerHour !== undefined ? { unitsPerHour: input.unitsPerHour } : {}),
            isDriving: input.isDriving,
          }),
        },
      ),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: assignmentKeys.listByActivity(orgSlug, activityId),
      }),
  });
}

export function useUpdateAssignment(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      assignmentId: string;
      activityId: string;
      version: number;
      budgetedUnits: number;
      isDriving: boolean;
      /** Set/change the driving assignment's rate (ADR-0040); omit to leave it unchanged. */
      unitsPerHour?: number;
      /**
       * Which triad quantity the planner edited (ADR-0040) — sent only for a units/rate edit on the
       * driving assignment, so the server holds it and recomputes the dependent (a same-row Units/Rate,
       * or the owning activity's duration for a units-driven type). Omitted = a plain store.
       */
      editedField?: EditedField;
    }) =>
      apiFetch<ResourceAssignmentSummary>(
        `/organizations/${orgSlug}/assignments/${input.assignmentId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            budgetedUnits: input.budgetedUnits,
            ...(input.unitsPerHour !== undefined ? { unitsPerHour: input.unitsPerHour } : {}),
            ...(input.editedField ? { editedField: input.editedField } : {}),
            isDriving: input.isDriving,
            version: input.version,
          }),
        },
      ),
    // Refetch on settle so a 409 refreshes the row's version — setting one driving
    // resource also moves the flag off another, so the whole activity list refetches.
    onSettled: (_data, _error, input) =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: assignmentKeys.listByActivity(orgSlug, input.activityId),
        }),
        // A duration-type recompute (editedField present) can derive a new activity duration server-side
        // (ADR-0040), moving the activity's dates/version — refresh the org's activity lists/details so
        // the table + any open activity view aren't stale. Scoped to `activities` and only when a
        // recompute was actually requested, so a plain units edit keeps its existing behaviour.
        ...(input.editedField
          ? [queryClient.invalidateQueries({ queryKey: activityKeys.all(orgSlug) })]
          : []),
      ]),
  });
}

export function useDeleteAssignment(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { assignmentId: string; activityId: string }) =>
      apiFetch<void>(`/organizations/${orgSlug}/assignments/${input.assignmentId}`, {
        method: 'DELETE',
      }),
    onSettled: (_data, _error, input) =>
      queryClient.invalidateQueries({
        queryKey: assignmentKeys.listByActivity(orgSlug, input.activityId),
      }),
  });
}
