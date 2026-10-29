import type { CodeTypeSummary } from '@repo/types';
import { queryOptions, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiFetchAllPages } from '@/lib/api/client';
import { codeKeys } from '@/lib/query/hierarchy-keys';

const typesPath = (orgSlug: string, planId: string): string =>
  `/organizations/${orgSlug}/plans/${planId}/code-types`;

/**
 * The plan's live code types in order, **without their values** (`values=none`).
 *
 * The route's default nests every live value of every type in the page, and at the caps that is
 * 100,000 rows (measured 2.6 s, `docs/API.md` "Codes"): a screen must not bind to it. A type's values
 * are read when that type is opened (`useCodeValues`), and `valueCount` rides on the type so a pane
 * can say "4 values" before they arrive. Every page, because a list that silently dropped its tail
 * would hide types the planner made; the cap is 100, so it is one request today.
 */
export function codeTypesQueryOptions(orgSlug: string, planId: string) {
  return queryOptions({
    queryKey: codeKeys.types(orgSlug, planId),
    // One retry, not the default three: a dialog held on this list should reach its error state in
    // seconds (the swimlane list's choice).
    retry: 1,
    queryFn: () => apiFetchAllPages<CodeTypeSummary>(`${typesPath(orgSlug, planId)}?values=none`),
  });
}

/** The plan's live code types in `position` order. `enabled` keeps it idle for a screen that is shut. */
export function useCodeTypes(
  orgSlug: string,
  planId: string,
  enabled = true,
): UseQueryResult<CodeTypeSummary[]> {
  return useQuery({ ...codeTypesQueryOptions(orgSlug, planId), enabled });
}

/**
 * The plan's **deleted** code types, for the restore list. Read only while the disclosure is open and
 * the reader holds `code:restore` (the server answers 403 otherwise). `include=deleted` adds the
 * deleted rows to the live ones, so the live ones are filtered out here.
 */
export function useDeletedCodeTypes(
  orgSlug: string,
  planId: string,
  enabled: boolean,
  staleTime?: number,
): UseQueryResult<CodeTypeSummary[]> {
  return useQuery({
    queryKey: codeKeys.typesDeleted(orgSlug, planId),
    retry: 1,
    enabled,
    ...(staleTime === undefined ? {} : { staleTime }),
    queryFn: async () =>
      (
        await apiFetchAllPages<CodeTypeSummary>(
          `${typesPath(orgSlug, planId)}?values=none&include=deleted`,
        )
      ).filter((type) => type.deletedAt !== null),
  });
}
