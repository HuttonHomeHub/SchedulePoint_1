import type { DeletedHierarchyItem, DeletedItemsMeta } from '@repo/types';
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { apiFetch, apiFetchAllPagesWithMeta } from '@/lib/api/client';
import { clientKeys, planKeys, projectKeys } from '@/lib/query/hierarchy-keys';

export const deletedItemKeys = {
  all: (orgSlug: string) => ['deleted-items', orgSlug] as const,
  list: (orgSlug: string) => [...deletedItemKeys.all(orgSlug), 'list'] as const,
};

/** The soft-deleted clients/projects/plans in an org, newest-deleted first. */
export function deletedItemsQueryOptions(orgSlug: string) {
  return queryOptions({
    queryKey: deletedItemKeys.list(orgSlug),
    // The recycle bin shows everything restorable, not the endpoint's default 20-row page — past 20
    // deletions the older rows became unrestorable from the UI.
    // `WithMeta`, because the retention period rides in `meta` and the screen's countdown must be
    // the SERVER's number — a client constant is silently wrong on any host that overrode it
    // (ADR-0096 D2). The rows are unchanged; only the envelope's tail is kept.
    queryFn: () =>
      apiFetchAllPagesWithMeta<DeletedHierarchyItem, DeletedItemsMeta>(
        `/organizations/${orgSlug}/deleted`,
      ),
  });
}

/** The bin's rows, plus the retention facts the screen has to state truthfully. */
export interface DeletedItemsPage {
  rows: DeletedHierarchyItem[];
  meta: DeletedItemsMeta | null;
}

export function useDeletedItems(orgSlug: string): UseQueryResult<DeletedItemsPage> {
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
