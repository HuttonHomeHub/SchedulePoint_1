import { CODE_TYPE_LIMIT, type CodeValueSummary } from '@repo/types';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { codeKeys } from '@/lib/query/hierarchy-keys';

/**
 * A value named by id (`GET …/code-values?id=`): the value, plus its type's name and whether that type
 * has been deleted. Deleted values and values of deleted types are named, not hidden — the caller
 * already holds the id, from an activity's `codes` or a history line.
 */
export interface ResolvedCodeValue extends CodeValueSummary {
  codeTypeName: string;
  codeTypeDeletedAt: string | null;
}

/**
 * The names behind a set of value ids, as a map. One request per {@link CODE_TYPE_LIMIT} ids (the
 * route's ceiling, which is what one activity can hold), so an editor opening costs **one** request
 * however many types the plan has. An id the server does not know (purged, foreign) is simply absent
 * from the map: the caller treats absent as unknown and never falls back to showing the id.
 */
export async function resolveCodeValues(
  orgSlug: string,
  planId: string,
  ids: readonly string[],
): Promise<Map<string, ResolvedCodeValue>> {
  const found = new Map<string, ResolvedCodeValue>();
  for (let start = 0; start < ids.length; start += CODE_TYPE_LIMIT) {
    const chunk = ids.slice(start, start + CODE_TYPE_LIMIT);
    // Repeated, not comma-joined: a comma-joined list is one string that is not a UUID (422).
    const query = chunk.map((id) => `id=${encodeURIComponent(id)}`).join('&');
    const rows = await apiFetch<ResolvedCodeValue[]>(
      `/organizations/${orgSlug}/plans/${planId}/code-values?${query}`,
    );
    for (const row of rows) found.set(row.id, row);
  }
  return found;
}

/**
 * Name a set of value ids. Disabled while there are none to name (the route refuses an empty list), and
 * keyed by the sorted ids so the same set is one cache entry however it was assembled.
 */
export function useCodeValueNames(
  orgSlug: string,
  planId: string,
  ids: readonly string[],
  enabled = true,
): UseQueryResult<Map<string, ResolvedCodeValue>> {
  const unique = [...new Set(ids)].sort();
  return useQuery({
    queryKey: codeKeys.names(orgSlug, planId, unique),
    retry: 1,
    // A history panel's ids grow as older pages load; the names already read stay on screen meanwhile.
    placeholderData: (previous) => previous,
    enabled: enabled && unique.length > 0,
    queryFn: () => resolveCodeValues(orgSlug, planId, unique),
  });
}
