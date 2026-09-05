import type { RevisionCompare } from '@repo/types';
import { queryOptions, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { scheduleKeys } from '@/lib/query/hierarchy-keys';

export { scheduleKeys };

/** The literal the API takes for `to` to mean the plan as it stands now. */
export const LIVE_REVISION = 'live';

export function revisionCompareQueryOptions(
  orgSlug: string,
  planId: string,
  from: string | null,
  to: string,
  enabled = true,
) {
  return queryOptions({
    queryKey: scheduleKeys.revisionCompare(orgSlug, planId, from ?? '', to),
    queryFn: () =>
      apiFetch<RevisionCompare>(
        `/organizations/${orgSlug}/plans/${planId}/schedule/revision-compare` +
          `?from=${encodeURIComponent(from ?? '')}&to=${encodeURIComponent(to)}`,
      ),
    // `from` is REQUIRED by the route, so a null one is not a request to make — it is the state
    // before the planner has chosen. Gating here rather than rendering an error keeps "you have
    // not picked yet" and "the server refused" as two different facts on screen.
    enabled: enabled && from !== null && from !== to,
    staleTime: 30_000,
  });
}

/**
 * A plan's revision comparison (ADR-0125): what entered and left the critical path between two
 * computed schedules, and how far the completion moved.
 *
 * A pure read — the server invokes no engine, takes no lock and writes nothing. **It reports what
 * moved and never what caused it**, so nothing downstream of this hook may present a row as a
 * cause; the payload carries no field that would let it.
 */
export function useRevisionCompare(
  orgSlug: string,
  planId: string,
  from: string | null,
  to: string,
  enabled = true,
): UseQueryResult<RevisionCompare> {
  return useQuery(revisionCompareQueryOptions(orgSlug, planId, from, to, enabled));
}
