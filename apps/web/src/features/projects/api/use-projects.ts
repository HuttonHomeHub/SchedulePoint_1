import type { ProjectSummary } from '@repo/types';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import type { ProjectFormValues } from '../schemas/project-schemas';

import { apiFetch } from '@/lib/api/client';
import { deletedItemKeys, projectKeys } from '@/lib/query/hierarchy-keys';
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

/**
 * A single project — used by the project-detail screen (handles deep-links / 404).
 *
 * **An empty id disables the query rather than requesting it.** Callers chain these reads —
 * `useProject(orgSlug, plan.data?.projectId ?? '')` — so on the first render, before the parent
 * has resolved, the id is `''` and the URL degrades to `…/projects/`, which the API answers 404.
 * That fired on every plan-workspace load, and it is visible in production: it was found in the
 * browser console during the ADR-0074 M1 CSP observation window, not by any test.
 *
 * The guard lives here rather than at each call site because the `?? ''` idiom is the natural way
 * to write the caller, and one that forgets `enabled` is indistinguishable from one that does not
 * — `use-hierarchy-tree.ts:151-154` remembers, `use-plan-workspace-model.ts:268` did not. A route
 * param is never empty, so the detail screens are unaffected.
 */
export function useProject(orgSlug: string, projectId: string): UseQueryResult<ProjectSummary> {
  return useQuery({ ...projectQueryOptions(orgSlug, projectId), enabled: Boolean(projectId) });
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
    // …and the recycle bin, which the row arrives in. See `deletedItemKeys`.
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: projectKeys.listByClient(orgSlug, clientId),
      });
      await queryClient.invalidateQueries({ queryKey: deletedItemKeys.all(orgSlug) });
    },
  });
}
