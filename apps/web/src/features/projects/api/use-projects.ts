import type { ProjectSummary } from '@repo/types';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import type { ProjectFormValues } from '../schemas/project-schemas';

import { apiFetch } from '@/lib/api/client';
import { projectKeys } from '@/lib/query/hierarchy-keys';
import { projectQueryOptions, projectsQueryOptions } from '@/lib/query/hierarchy-queries';

// The read-queries live in `lib` (shared) so the navigator rail can consume them
// without a feature → feature import; re-exported here so existing call sites are
// unchanged.
export { projectKeys, projectQueryOptions, projectsQueryOptions };

/** Normalise a form's optional description: a blank field is sent as absent. */
function descriptionField(description?: string): string | undefined {
  const trimmed = description?.trim();
  return trimmed ? trimmed : undefined;
}

/** A single project — used by the project-detail screen (handles deep-links / 404). */
export function useProject(orgSlug: string, projectId: string): UseQueryResult<ProjectSummary> {
  return useQuery(projectQueryOptions(orgSlug, projectId));
}

export function useProjects(orgSlug: string, clientId: string): UseQueryResult<ProjectSummary[]> {
  return useQuery(projectsQueryOptions(orgSlug, clientId));
}

export function useCreateProject(orgSlug: string, clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProjectFormValues) =>
      apiFetch<ProjectSummary>(`/organizations/${orgSlug}/clients/${clientId}/projects`, {
        method: 'POST',
        body: JSON.stringify({
          name: input.name,
          description: descriptionField(input.description),
        }),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: projectKeys.listByClient(orgSlug, clientId) }),
  });
}

export function useUpdateProject(orgSlug: string, clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { projectId: string; version: number } & ProjectFormValues) =>
      apiFetch<ProjectSummary>(`/organizations/${orgSlug}/projects/${input.projectId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: input.name,
          description: descriptionField(input.description) ?? null,
          version: input.version,
        }),
      }),
    // Refetch on settle (not just success) so a 409 conflict refreshes the
    // cached row's version — the retry then carries the current version.
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: projectKeys.listByClient(orgSlug, clientId) }),
  });
}

export function useDeleteProject(orgSlug: string, clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) =>
      apiFetch<void>(`/organizations/${orgSlug}/projects/${projectId}`, { method: 'DELETE' }),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: projectKeys.listByClient(orgSlug, clientId) }),
  });
}
