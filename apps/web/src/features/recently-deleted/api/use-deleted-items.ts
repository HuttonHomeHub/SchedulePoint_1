import type { DeletedItem, DeletedItemsMeta } from '@repo/types';
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { apiFetch, apiFetchAllPagesWithMeta } from '@/lib/api/client';
import {
  calendarKeys,
  clientKeys,
  deletedItemKeys,
  planKeys,
  projectKeys,
  resourceKeys,
} from '@/lib/query/hierarchy-keys';

/** The soft-deleted clients, projects, plans, resources and calendars in an org, newest-deleted first. */
export function deletedItemsQueryOptions(orgSlug: string) {
  return queryOptions({
    queryKey: deletedItemKeys.list(orgSlug),
    // The recycle bin shows everything restorable, not the endpoint's default 20-row page — past 20
    // deletions the older rows became unrestorable from the UI.
    // `WithMeta`, because the retention period rides in `meta` and the screen's countdown must be
    // the SERVER's number — a client constant is silently wrong on any host that overrode it
    // (ADR-0096 D2). The rows are unchanged; only the envelope's tail is kept.
    queryFn: () =>
      apiFetchAllPagesWithMeta<DeletedItem, DeletedItemsMeta>(`/organizations/${orgSlug}/deleted`),
  });
}

/** The bin's rows, plus the retention facts the screen has to state truthfully. */
export interface DeletedItemsPage {
  rows: DeletedItem[];
  meta: DeletedItemsMeta | null;
}

export function useDeletedItems(orgSlug: string): UseQueryResult<DeletedItemsPage> {
  return useQuery(deletedItemsQueryOptions(orgSlug));
}

/** The subset of a deleted item needed to address its per-entity restore route. */
export type RestorableItem = Pick<DeletedItem, 'kind' | 'id'>;

/**
 * Restore a soft-deleted row via its own entity's writer-only restore route
 * (selected by `kind`, which is the route's singular: `clients`, `resources`, `calendars`…).
 * Restoring a client also brings back its projects/plans, a project its calendars, and a resource
 * group its members, so on settle we refresh the deleted list and every list a restore can change —
 * the hierarchy's and both libraries'. A 409 (`PARENT_DELETED`, `CALENDAR_DELETED`, `NAME_TAKEN`)
 * or a 422 is surfaced by the caller from the thrown `ApiFetchError`.
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
      void queryClient.invalidateQueries({ queryKey: resourceKeys.all(orgSlug) });
      void queryClient.invalidateQueries({ queryKey: calendarKeys.all(orgSlug) });
    },
  });
}
