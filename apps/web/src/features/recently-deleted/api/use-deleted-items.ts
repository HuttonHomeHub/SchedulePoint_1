import type { DeletedHierarchyItem } from '@repo/types';
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { clientKeys, planKeys, projectKeys } from '@/lib/query/hierarchy-keys';

export const deletedItemKeys = {
  all: (orgSlug: string) => ['deleted-items', orgSlug] as const,
  list: (orgSlug: string) => [...deletedItemKeys.all(orgSlug), 'list'] as const,
};

/** The soft-deleted clients/projects/plans in an org, newest-deleted first. */
export function deletedItemsQueryOptions(orgSlug: string) {
  return queryOptions({
    queryKey: deletedItemKeys.list(orgSlug),
    queryFn: () => apiFetch<DeletedHierarchyItem[]>(`/organizations/${orgSlug}/deleted`),
  });
}

export function useDeletedItems(orgSlug: string): UseQueryResult<DeletedHierarchyItem[]> {
  return useQuery(deletedItemsQueryOptions(orgSlug));
}

/** The subset of a deleted item needed to address its per-entity restore route. */
export type RestorableItem = Pick<DeletedHierarchyItem, 'kind' | 'id'>;

/**
 * Restore a soft-deleted row via its own entity's writer-only restore route
 * (selected by `kind`). Restoring a client also brings back its projects/plans,
 * so on settle we refresh the deleted list and every hierarchy list — a 409
 * (`PARENT_DELETED`/`NAME_TAKEN`) is surfaced by the caller from the thrown
 * `ApiFetchError`.
 */
export function useRestoreItem(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: RestorableItem) =>
      apiFetch<unknown>(`/organizations/${orgSlug}/${item.kind}s/${item.id}/restore`, {
        method: 'POST',
      }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: deletedItemKeys.all(orgSlug) });
      void queryClient.invalidateQueries({ queryKey: clientKeys.all(orgSlug) });
      void queryClient.invalidateQueries({ queryKey: projectKeys.all(orgSlug) });
      void queryClient.invalidateQueries({ queryKey: planKeys.all(orgSlug) });
    },
  });
}
